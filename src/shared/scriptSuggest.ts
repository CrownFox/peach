import type { MenuComponent } from './types'
import { KEYS } from './keys'
import { propertiesInScope, type ScriptProperty } from './scriptProperties'
import { canvasSurface, componentSurface, type ApiEntry } from './runtime'

export type ScriptHandle = {
  name: string
  type: MenuComponent['type']
  children?: ScriptHandle[]
}

export type ScriptHost = 'menu' | 'scene' | 'composite' | MenuComponent['type']

export type ScriptHints = {
  handles: ScriptHandle[]
  self: ScriptHost | 'any'
  hosts?: ScriptHost[]
  children?: ScriptHandle[]
  parent?: 'pageViewer'
  suggestProperties?: boolean
  propertySources?: string[]
  outerProperties?: ScriptProperty[]
}

export type Suggestion = {
  label: string
  insertText: string
  kind: 'field' | 'function' | 'snippet' | 'keyword'
  detail: string
}

const componentTypes = [
  'button', 'image', 'panel', 'label', 'meter', 'text', 'textarea', 'toggle', 'toggleGroup', 'slider', 'dropdown',
  'pageViewer', 'composite', 'sceneViewer', 'tile', 'tilemap', 'collider', 'zField'
] as const satisfies readonly MenuComponent['type'][]

const libraries: Record<string, Suggestion[]> = {
  string: fields(['byte', 'char', 'find', 'format', 'gmatch', 'gsub', 'len', 'lower', 'match', 'rep', 'reverse', 'sub', 'upper']),
  math: fields(['abs', 'ceil', 'floor', 'huge', 'max', 'min', 'pi', 'random', 'randomseed', 'sqrt']),
  table: fields(['concat', 'insert', 'remove', 'sort', 'unpack']),
  utf8: fields(['char', 'codepoint', 'codes', 'len', 'offset'])
}

const globals: Suggestion[] = [
  { label: 'game', insertText: 'game', kind: 'field', detail: 'The game API' },
  { label: 'self', insertText: 'self', kind: 'field', detail: 'The menu during onLoad and onUpdate, the scene or composite during onLoad, onShow, and onUpdate, or this component in onChange and onInteract' },
  { label: 'print', insertText: 'print(', kind: 'function', detail: 'Write to the game console' },
  { label: 'onLoad', insertText: 'onLoad', kind: 'function', detail: 'Called when a menu, scene, or composite opens' },
  { label: 'onShow', insertText: 'onShow', kind: 'function', detail: 'Called when a scene or composite is shown on this visit' },
  { label: 'onUpdate', insertText: 'onUpdate', kind: 'function', detail: 'Called every frame while a menu, scene, or composite is on screen' },
  { label: 'onInteract', insertText: 'onInteract', kind: 'function', detail: 'Called when a button or image is clicked' },
  { label: 'onChange', insertText: 'onChange', kind: 'function', detail: 'Called when the player edits an input' },
  { label: 'onMouseDown', insertText: 'onMouseDown', kind: 'function', detail: 'Called when the pointer presses this component or canvas' },
  { label: 'onMouseUp', insertText: 'onMouseUp', kind: 'function', detail: 'Called when the pointer is released over this component or canvas' },
  { label: 'onMouseEnter', insertText: 'onMouseEnter', kind: 'function', detail: 'Called when the pointer enters this component or canvas' },
  { label: 'onMouseLeave', insertText: 'onMouseLeave', kind: 'function', detail: 'Called when the pointer leaves this component or canvas' },
  { label: 'function', insertText: 'function ${1:name}()\n\t$0\nend', kind: 'snippet', detail: 'Define a function' },
  { label: 'if', insertText: 'if ${1:condition} then\n\t$0\nend', kind: 'snippet', detail: 'If statement' },
  { label: 'for', insertText: 'for ${1:i} = ${2:1}, ${3:n} do\n\t$0\nend', kind: 'snippet', detail: 'Counted loop' },
  { label: 'while', insertText: 'while ${1:condition} do\n\t$0\nend', kind: 'snippet', detail: 'While loop' },
  { label: 'tostring', insertText: 'tostring(', kind: 'function', detail: 'Convert a value to a string' },
  { label: 'tonumber', insertText: 'tonumber(', kind: 'function', detail: 'Convert a value to a number' },
  { label: 'type', insertText: 'type(', kind: 'function', detail: 'Type name of a value' },
  { label: 'pairs', insertText: 'pairs(', kind: 'function', detail: 'Walk the keys of a table' },
  { label: 'ipairs', insertText: 'ipairs(', kind: 'function', detail: 'Walk a list in order' },
  { label: 'pcall', insertText: 'pcall(', kind: 'function', detail: 'Call a function and catch an error' },
  { label: 'error', insertText: 'error(', kind: 'function', detail: 'Raise an error' },
  { label: 'string', insertText: 'string', kind: 'field', detail: 'String library' },
  { label: 'math', insertText: 'math', kind: 'field', detail: 'Math library' },
  { label: 'table', insertText: 'table', kind: 'field', detail: 'Table library' },
  { label: 'utf8', insertText: 'utf8', kind: 'field', detail: 'UTF-8 library' },
  { label: 'nil', insertText: 'nil', kind: 'keyword', detail: 'Clear a value' },
  { label: 'true', insertText: 'true', kind: 'keyword', detail: 'Boolean' },
  { label: 'false', insertText: 'false', kind: 'keyword', detail: 'Boolean' },
  ...KEYS.map((key) => ({ label: key.name, insertText: key.name, kind: 'field' as const, detail: key.code }))
]

export function scriptSuggestions(beforeWord: string, hints: ScriptHints, source = ''): Suggestion[] {
  if (inComment(beforeWord) || inString(beforeWord)) return []
  const properties = hints.suggestProperties ? propertiesInScope(hints.propertySources ?? [], source, hints.outerProperties ?? []) : []
  const member = memberContext(beforeWord)
  if (!member) {
    const base = hints.parent ? [...globals, { label: 'parent', insertText: 'parent', kind: 'field' as const, detail: 'The page viewer' }] : globals
    return withProperties(base, properties)
  }
  return members(member, hints, properties)
}

function members(member: { chain: string[]; colon: boolean }, hints: ScriptHints, properties: ScriptProperty[]): Suggestion[] {
  const { chain, colon } = member
  if (chain.length === 1 && chain[0] === 'game' && !colon) {
    return [
      { label: 'currentMenu', insertText: 'currentMenu', kind: 'field', detail: 'The open menu' },
      { label: 'state', insertText: 'state', kind: 'field', detail: 'Values kept across menu changes' },
      { label: 'openMenu', insertText: 'openMenu("${1}")', kind: 'snippet', detail: 'Open a menu by path' },
      { label: 'openModal', insertText: 'openModal("${1}")', kind: 'snippet', detail: 'Open a menu over the current one' },
      { label: 'currentModal', insertText: 'currentModal', kind: 'field', detail: 'The modal on top, or nil' },
      { label: 'closeModal', insertText: 'closeModal(game.currentModal)', kind: 'function', detail: 'Close this modal and any modal above it' },
      { label: 'loadCollection', insertText: 'loadCollection("${1}")', kind: 'snippet', detail: 'Load a collection by path' },
      { label: 'loadBook', insertText: 'loadBook("${1}")', kind: 'snippet', detail: 'Load a book by path' },
      { label: 'loadPage', insertText: 'loadPage(${1:viewer}, ${2:bookPage})', kind: 'function', detail: 'Show a book and page on a page viewer' },
      { label: 'registerKey', insertText: 'registerKey(${1:BTN_A}, "${2:down}", ${3:onKey})', kind: 'function', detail: 'Listen for a key while this menu is on screen' },
      { label: 'keyDown', insertText: 'keyDown(${1:BTN_A})', kind: 'function', detail: 'True while a key is held' },
      { label: 'getMousePosition', insertText: 'getMousePosition()', kind: 'function', detail: 'Pointer position in the open menu, with x and y' },
      { label: 'saveSlot', insertText: 'saveSlot(${1:1})', kind: 'function', detail: 'Save the game into a slot' },
      { label: 'loadSlot', insertText: 'loadSlot(${1:1})', kind: 'function', detail: 'Load a slot and open that menu' },
      { label: 'slotInfo', insertText: 'slotInfo(${1:1})', kind: 'function', detail: 'Icon and time for a slot, or nil' },
      { label: 'customSaveSlot', insertText: 'customSaveSlot(${1:1}, ${2:data}, ${3:info})', kind: 'function', detail: 'Store a table and its details' },
      { label: 'customLoadSlot', insertText: 'customLoadSlot(${1:1})', kind: 'function', detail: 'Return the table stored in a custom slot' },
      { label: 'customSlotInfo', insertText: 'customSlotInfo(${1:1})', kind: 'function', detail: 'Details stored with a custom slot, or nil' },
      { label: 'importSaves', insertText: 'importSaves()', kind: 'function', detail: 'Replace every save slot from a file' },
      { label: 'exportSaves', insertText: 'exportSaves()', kind: 'function', detail: 'Write every save slot to a file' },
      { label: 'importCustomSaves', insertText: 'importCustomSaves()', kind: 'function', detail: 'Replace every custom slot from a file' },
      { label: 'exportCustomSaves', insertText: 'exportCustomSaves()', kind: 'function', detail: 'Write every custom slot to a file' }
    ]
  }
  const resolved = resolveChain(chain, hints)
  if (resolved) return suggestResolved(resolved, colon)
  if (!colon && chain.length === 1) {
    const property = properties.find((item) => item.name === chain[0])
    if (property?.type === 'bookPage') {
      return [
        { label: 'book', insertText: 'book', kind: 'field', detail: 'Book path' },
        { label: 'page', insertText: 'page', kind: 'field', detail: 'Chapter/page path' }
      ]
    }
    if (property) return []
    return libraries[chain[0] ?? ''] ?? []
  }
  return []
}

function withProperties(items: Suggestion[], properties: ScriptProperty[]): Suggestion[] {
  if (properties.length === 0) return items
  const names = new Set(properties.map((property) => property.name))
  return [...properties.map(propertySuggestion), ...items.filter((item) => !names.has(item.label))]
}

function propertySuggestion(property: ScriptProperty): Suggestion {
  const type =
    property.type === 'text' || property.type === 'string'
      ? 'string'
      : property.type === 'bookPage'
        ? 'book and page'
        : property.type === 'boolean'
          ? 'true or false'
          : property.type === 'integer' || property.type === 'float'
            ? property.type
            : `${property.type} path`
  return {
    label: property.name,
    insertText: property.name,
    kind: 'field',
    detail: property.label === property.name ? type : `${property.label}. ${type}`
  }
}

function resolveChain(chain: string[], hints: ScriptHints): { kinds: Array<ScriptHost | 'any'>; handles: ScriptHandle[] } | null {
  if (chain[0] === 'parent' && hints.parent) return walkHandles('pageViewer', [], chain.slice(1))
  if (chain[0] === 'game' && (chain[1] === 'currentMenu' || chain[1] === 'currentModal')) return walkHandles('menu', hints.handles, chain.slice(2))
  if (chain[0] !== 'self') return null
  if (chain.length === 1 && hints.hosts && hints.hosts.length > 1) return { kinds: hints.hosts, handles: hints.handles }
  if (hints.self === 'any') {
    if (chain.length !== 1) return null
    return { kinds: ['any'], handles: [] }
  }
  const handles =
    hints.self === 'menu' || hints.self === 'scene' || hints.self === 'composite'
      ? hints.handles
      : hints.self === 'sceneViewer'
        ? hints.children ?? []
        : []
  return walkHandles(hints.self, handles, chain.slice(1))
}

function walkHandles(kind: ScriptHost, handles: readonly ScriptHandle[], names: string[]): { kinds: ScriptHost[]; handles: ScriptHandle[] } | null {
  let kinds: ScriptHost[] = [kind]
  let current = handles
  for (const name of names) {
    const matches = current.filter((handle) => handle.name === name)
    if (matches.length === 0) return null
    kinds = [...new Set(matches.map((handle) => handle.type))]
    current = matches.flatMap((handle) => handle.children ?? [])
  }
  return { kinds, handles: [...current] }
}

function suggestResolved(resolved: { kinds: Array<ScriptHost | 'any'>; handles: ScriptHandle[] }, methodsOnly: boolean): Suggestion[] {
  if (resolved.kinds.length === 1 && resolved.kinds[0] === 'any') return componentFields(componentTypes, methodsOnly)
  return dedupe(
    resolved.kinds.flatMap((kind) => {
      if (kind === 'any') return componentFields(componentTypes, methodsOnly)
      const handles = kind === 'menu' || kind === 'scene' || kind === 'composite' || kind === 'sceneViewer' ? resolved.handles : []
      return suggestHost(kind, handles, methodsOnly)
    })
  )
}

function suggestHost(kind: ScriptHost, handles: readonly ScriptHandle[], methodsOnly: boolean): Suggestion[] {
  if (kind === 'menu' || kind === 'scene') {
    const fields = canvasFields(kind, methodsOnly)
    if (methodsOnly) return fields
    return [...handleSuggestions(handles), ...fields]
  }
  const children = methodsOnly ? [] : handleSuggestions(handles)
  const own = componentFields([kind], methodsOnly).filter((item) => !children.some((child) => child.label === item.label))
  return [...children, ...own]
}

function dedupe(items: Suggestion[]): Suggestion[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.label)) return false
    seen.add(item.label)
    return true
  })
}

function handleSuggestions(handles: readonly ScriptHandle[]): Suggestion[] {
  const byName = new Map<string, Set<string>>()
  for (const handle of handles) {
    const types = byName.get(handle.name) ?? new Set<string>()
    types.add(handle.type)
    byName.set(handle.name, types)
  }
  return [...byName].map(([name, types]) => ({
    label: name,
    insertText: name,
    kind: 'field' as const,
    detail: [...types].map(capitalize).join(', ')
  }))
}

function apiSuggestion(entry: ApiEntry): Suggestion {
  return {
    label: entry.name,
    insertText: entry.insertText ?? entry.name,
    kind: entry.kind === 'call' ? 'function' : 'field',
    detail: entry.detail
  }
}

function canvasFields(kind: 'menu' | 'scene', methodsOnly: boolean): Suggestion[] {
  const surface = canvasSurface(kind)
  return [...surface.shared, ...surface.own].filter((entry) => !methodsOnly || entry.kind === 'call').map(apiSuggestion)
}

function componentFields(types: readonly MenuComponent['type'][], methodsOnly: boolean): Suggestion[] {
  const items = types.flatMap((type) => {
    const surface = componentSurface(type)
    const entries = [...surface.own, ...surface.shared]
    return entries.filter((entry) => !methodsOnly || entry.kind === 'call').map(apiSuggestion)
  })
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.label)) return false
    seen.add(item.label)
    return true
  })
}

function fields(names: string[]): Suggestion[] {
  return names.map((name) => ({ label: name, insertText: `${name}(`, kind: 'function' as const, detail: '' }))
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function memberContext(beforeWord: string): { chain: string[]; colon: boolean } | null {
  const match = /([A-Za-z_][A-Za-z0-9_]*(?:[.:][A-Za-z_][A-Za-z0-9_]*)*)([.:])$/.exec(beforeWord)
  if (!match?.[1] || !match[2]) return null
  return { chain: match[1].split(/[.:]/), colon: match[2] === ':' }
}

function inComment(beforeWord: string): boolean {
  let quote: '"' | "'" | null = null
  for (let index = 0; index < beforeWord.length; index += 1) {
    const char = beforeWord[index]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '-' && beforeWord[index + 1] === '-') return true
  }
  return false
}

function inString(beforeWord: string): boolean {
  let quote: '"' | "'" | null = null
  for (let index = 0; index < beforeWord.length; index += 1) {
    const char = beforeWord[index]
    if (!quote) {
      if (char === '"' || char === "'") quote = char
      else if (char === '-' && beforeWord[index + 1] === '-') return false
      continue
    }
    if (char === '\\') index += 1
    else if (char === quote) quote = null
  }
  return quote !== null
}
