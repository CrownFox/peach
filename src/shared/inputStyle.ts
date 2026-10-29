import type { PageInputStyle } from './types'

export type { PageInputStyle }
export type InputKind = 'text' | 'dropdown'
export type StyleState = 'hover' | 'focus' | 'disabled'

export type StyleParts = {
  base: string
  hover: string
  focus: string
  disabled: string
}

export type InputViewerSheet = { id: string; style: PageInputStyle }
export type InputInsertSheet = { id: string; kind: InputKind; source: string }
export type InputSceneSheet = { viewers: InputViewerSheet[]; inserts: InputInsertSheet[] }

type Parsed = { ok: true; parts: StyleParts } | { ok: false; error: string }

const PROPERTY = /^(?:--|-)?[a-zA-Z_][a-zA-Z0-9_-]*$/
const STATES = new Set<StyleState>(['hover', 'focus', 'disabled'])

let previewSerial = 0
const sceneSheets = new Map<HTMLElement, InputSceneSheet>()
let globalStyle: PageInputStyle = emptyInputStyle()
let styleEl: HTMLStyleElement | null = null

export function nextPreviewId(): string {
  previewSerial += 1
  return `p${previewSerial}`
}

export function emptyInputStyle(): PageInputStyle {
  return { text: '', dropdown: '' }
}

export function readInputStyle(value: unknown): PageInputStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyInputStyle()
  const record = value as { text?: unknown; dropdown?: unknown }
  return {
    text: typeof record.text === 'string' ? record.text : '',
    dropdown: typeof record.dropdown === 'string' ? record.dropdown : ''
  }
}

export function parseInputStyle(source: string): Parsed {
  const stripped = stripComments(source)
  if (typeof stripped !== 'string') return { ok: false, error: stripped.error }
  const parts: StyleParts = { base: '', hover: '', focus: '', disabled: '' }
  const seen = new Set<StyleState>()
  const base: string[] = []
  let index = 0
  while (index < stripped.length) {
    index = skipSpace(stripped, index)
    if (index >= stripped.length) break
    const state = matchState(stripped, index)
    if (state) {
      if (seen.has(state.state)) return { ok: false, error: `There is already an &:${state.state} block.` }
      seen.add(state.state)
      const body = readBlock(stripped, state.end)
      if ('error' in body) return { ok: false, error: body.error }
      const declarations = parseDeclarationList(body.text, true)
      if (!declarations.ok) return declarations
      parts[state.state] = declarations.css
      index = body.end
      continue
    }
    if (stripped[index] === '&' || stripped[index] === '{' || stripped[index] === '}') {
      return { ok: false, error: 'Only &:hover, &:focus, and &:disabled blocks are allowed.' }
    }
    const declaration = readDeclaration(stripped, index, false)
    if (!declaration.ok) return declaration
    base.push(declaration.css)
    index = declaration.end
  }
  parts.base = base.join(' ')
  return { ok: true, parts }
}

export function compileInputStyles(input: {
  root: string
  global: PageInputStyle
  viewers: InputViewerSheet[]
  inserts: InputInsertSheet[]
}): string {
  const rules: string[] = []
  emit(rules, selector(input.root, 'text', ''), partsOf(input.global.text))
  emit(rules, selector(input.root, 'dropdown', ''), partsOf(input.global.dropdown))
  for (const viewer of input.viewers) {
    emit(rules, selector(input.root, 'text', '', viewer.id), partsOf(viewer.style.text))
    emit(rules, selector(input.root, 'dropdown', '', viewer.id), partsOf(viewer.style.dropdown))
  }
  for (const insert of input.inserts) {
    emit(rules, selector(input.root, insert.kind, insert.id), partsOf(insert.source))
  }
  return rules.join('\n')
}

export function previewInputCss(root: string, sheet: {
  layer: 'global' | 'viewer' | 'insert'
  kind: InputKind
  source: string
  other: string
  under: PageInputStyle | null
}): string {
  const mine = sheet.kind === 'dropdown'
    ? { text: sheet.other, dropdown: sheet.source }
    : { text: sheet.source, dropdown: sheet.other }
  const under = sheet.under ?? emptyInputStyle()
  const css = compileInputStyles({
    root,
    global: sheet.layer === 'global' ? mine : under,
    viewers: sheet.layer === 'viewer' ? [{ id: 'peach-preview', style: mine }] : [],
    inserts: sheet.layer === 'insert' ? [{ id: 'peach-preview', kind: sheet.kind, source: sheet.source }] : []
  })
  return `${previewBase(root)}\n${css}`.trim()
}

export function setGlobalInputStyle(style: PageInputStyle | null | undefined): void {
  globalStyle = style ?? emptyInputStyle()
  publishInputStyles()
}

export function setSceneInputStyles(container: HTMLElement, sheet: InputSceneSheet): void {
  sceneSheets.set(container, sheet)
  publishInputStyles()
}

function publishInputStyles(): void {
  if (typeof document === 'undefined') return
  const viewers: InputViewerSheet[] = []
  const inserts: InputInsertSheet[] = []
  for (const [container, sheet] of sceneSheets) {
    if (!container.isConnected) {
      sceneSheets.delete(container)
      continue
    }
    viewers.push(...sheet.viewers)
    inserts.push(...sheet.inserts)
  }
  const css = compileInputStyles({ root: '.scene-node', global: globalStyle, viewers, inserts })
  if (!styleEl || !styleEl.isConnected) {
    styleEl = document.createElement('style')
    styleEl.dataset.peachInput = 'true'
  }
  styleEl.textContent = css
  document.head.append(styleEl)
}

function partsOf(source: string): StyleParts | null {
  const parsed = parseInputStyle(source)
  if (!parsed.ok) return null
  if (!parsed.parts.base && !parsed.parts.hover && !parsed.parts.focus && !parsed.parts.disabled) return null
  return parsed.parts
}

function emit(rules: string[], selectorText: string, parts: StyleParts | null): void {
  if (!parts) return
  if (parts.base) rules.push(`${selectorText} { ${parts.base} }`)
  if (parts.hover) rules.push(`${selectorText}:hover { ${parts.hover} }`)
  if (parts.focus) rules.push(`${selectorText}:focus { ${parts.focus} }`)
  if (parts.disabled) rules.push(`${selectorText}:disabled { ${parts.disabled} }`)
}

function selector(root: string, kind: InputKind, insertId: string, viewerId = ''): string {
  const cls = kind === 'dropdown' ? '.page-drop' : '.page-input'
  const scope = viewerId ? attr('data-input-scope', viewerId) : ''
  const field = insertId ? attr('data-input-style', insertId) : ''
  return `${root} .page-view${scope} ${cls}${field}`
}

function attr(name: string, value: string): string {
  return `[${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
}

function previewBase(root: string): string {
  return `${root} .page-view .page-input, ${root} .page-view .page-drop {
  display: inline-block; min-width: 6em; margin: 0 0.15em; padding: 0.05em 0.35em;
  border: 1px solid currentColor; border-radius: 0.3em; background: rgba(0,0,0,0.18); color: inherit; font: inherit;
}`
}

function stripComments(source: string): string | { error: string } {
  let out = ''
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      if (end < 0) return { error: 'A comment is missing its end.' }
      out += ' '
      index = end + 1
      continue
    }
    out += source[index]
  }
  return out
}

function matchState(text: string, index: number): { state: StyleState; end: number } | null {
  if (!text.startsWith('&:', index)) return null
  const match = /^(hover|focus|disabled)\s*\{/.exec(text.slice(index + 2))
  if (!match) return null
  const state = match[1]
  if (!STATES.has(state as StyleState)) return null
  return { state: state as StyleState, end: index + 2 + match[0].length }
}

function readBlock(text: string, start: number): { text: string; end: number } | { error: string } {
  for (let index = start; index < text.length; index++) {
    if (text[index] === '{') return { error: 'A state cannot contain another block.' }
    if (text[index] === '}') return { text: text.slice(start, index), end: index + 1 }
  }
  return { error: 'This block is missing its end.' }
}

function parseDeclarationList(text: string, nested: boolean): { ok: true; css: string } | { ok: false; error: string } {
  const declarations: string[] = []
  let index = 0
  while (index < text.length) {
    index = skipSpace(text, index)
    if (index >= text.length) break
    if (text[index] === '&' || text[index] === '{' || text[index] === '}') {
      return { ok: false, error: nested ? 'A state cannot contain another block.' : 'Only &:hover, &:focus, and &:disabled blocks are allowed.' }
    }
    const declaration = readDeclaration(text, index, nested)
    if (!declaration.ok) return declaration
    declarations.push(declaration.css)
    index = declaration.end
  }
  return { ok: true, css: declarations.join(' ') }
}

function readDeclaration(text: string, start: number, nested: boolean): { ok: true; css: string; end: number } | { ok: false; error: string } {
  let index = skipSpace(text, start)
  const nameStart = index
  while (index < text.length && text[index] !== ':' && text[index] !== '{' && text[index] !== ';' && !/\s/.test(text[index])) index++
  const name = text.slice(nameStart, index)
  index = skipSpace(text, index)
  if (text[index] !== ':') {
    return { ok: false, error: nested ? 'A state cannot contain another block.' : 'Only &:hover, &:focus, and &:disabled blocks are allowed.' }
  }
  if (!PROPERTY.test(name)) return { ok: false, error: `"${name}" is not a property name.` }
  index += 1
  const valueStart = index
  while (index < text.length && text[index] !== ';') {
    if (text[index] === '{' || text[index] === '}') {
      return { ok: false, error: nested ? 'A state cannot contain another block.' : 'Only &:hover, &:focus, and &:disabled blocks are allowed.' }
    }
    index += 1
  }
  if (text[index] !== ';') return { ok: false, error: 'Each property needs a semicolon.' }
  const value = text.slice(valueStart, index).replace(/\s+/g, ' ').trim()
  if (!value) return { ok: false, error: `"${name}" needs a value.` }
  const refused = refusedValue(value)
  if (refused) return { ok: false, error: refused }
  return { ok: true, css: `${name}: ${value};`, end: index + 1 }
}

function refusedValue(value: string): string | null {
  const lower = value.toLowerCase()
  if (lower.includes('!important')) return 'important is not allowed.'
  if (lower.includes('url(') || lower.includes('expression(') || lower.includes('javascript:') || lower.includes('@')) return 'That value is not allowed.'
  if (/[<>{}\\]/.test(value)) return 'That value is not allowed.'
  return null
}

function skipSpace(text: string, index: number): number {
  while (index < text.length && /\s/.test(text[index])) index += 1
  return index
}
