import type { MenuComponent } from './types'
import { KEYS } from './keys'

export type ScriptHandle = {
  name: string
  type: MenuComponent['type']
}

export type ScriptHints = {
  handles: ScriptHandle[]
  self: 'menu' | MenuComponent['type'] | 'any'
  parent?: 'pageViewer'
}

export type Suggestion = {
  label: string
  insertText: string
  kind: 'field' | 'function' | 'snippet' | 'keyword'
  detail: string
}

const buttonFields: Suggestion[] = [
  { label: 'text', insertText: 'text', kind: 'field', detail: 'Label' },
  { label: 'enabled', insertText: 'enabled', kind: 'field', detail: 'true or false. False ignores clicks' },
  { label: 'button', insertText: 'button', kind: 'field', detail: 'Button path' },
  { label: 'defaultImage', insertText: 'defaultImage', kind: 'field', detail: 'Image path' },
  { label: 'pressedImage', insertText: 'pressedImage', kind: 'field', detail: 'Image path' },
  { label: 'disabledImage', insertText: 'disabledImage', kind: 'field', detail: 'Image path' },
  { label: 'click', insertText: 'click()', kind: 'function', detail: 'Run onInteract' }
]

const imageFields: Suggestion[] = [
  { label: 'image', insertText: 'image', kind: 'field', detail: 'Image path' },
  { label: 'click', insertText: 'click()', kind: 'function', detail: 'Run onInteract' }
]

const panelField: Suggestion = { label: 'panel', insertText: 'panel', kind: 'field', detail: 'Panel path' }
const valueField: Suggestion = { label: 'value', insertText: 'value', kind: 'field', detail: 'The current value' }
const textField: Suggestion = { label: 'text', insertText: 'text', kind: 'field', detail: 'Label' }
const rangeFields: Suggestion[] = [
  valueField,
  { label: 'min', insertText: 'min', kind: 'field', detail: 'Lowest number' },
  { label: 'max', insertText: 'max', kind: 'field', detail: 'Highest number' },
  panelField
]

const fieldsByType: Record<MenuComponent['type'], Suggestion[]> = {
  button: buttonFields,
  image: imageFields,
  panel: [panelField],
  label: [textField, panelField],
  meter: rangeFields,
  text: [valueField, panelField],
  textarea: [valueField, panelField],
  toggle: [valueField, textField, panelField],
  toggleGroup: [valueField, panelField],
  slider: rangeFields,
  dropdown: [valueField, panelField],
  pageViewer: [
    { label: 'book', insertText: 'book', kind: 'field', detail: 'Book path' },
    { label: 'page', insertText: 'page', kind: 'field', detail: 'Chapter/page path' },
    panelField,
    { label: 'loadPage', insertText: 'loadPage(${1:book}, "${2:Chapter/Page}")', kind: 'function', detail: 'Show a page from a book' },
    { label: 'get', insertText: 'get("${1:field}")', kind: 'function', detail: 'Read a page data field' },
    { label: 'getInput', insertText: 'getInput("${1:key}")', kind: 'function', detail: 'Read a text field or dropdown' },
    { label: 'progressive', insertText: 'progressive', kind: 'field', detail: 'true streams the page in. false shows it all at once' },
    { label: 'scrollable', insertText: 'scrollable', kind: 'field', detail: 'true scrolls. false hides the rest of the page' },
    { label: 'rate', insertText: 'rate', kind: 'field', detail: 'Characters per second' },
    { label: 'finished', insertText: 'finished', kind: 'field', detail: 'true when the page has finished streaming' },
    { label: 'start', insertText: 'start()', kind: 'function', detail: 'Stream the page again from the first character' },
    { label: 'stop', insertText: 'stop()', kind: 'function', detail: 'Pause the stream' },
    { label: 'resume', insertText: 'resume()', kind: 'function', detail: 'Continue a paused stream' },
    { label: 'finish', insertText: 'finish()', kind: 'function', detail: 'Show the rest of the page immediately' }
  ],
  composite: [{ label: 'enabled', insertText: 'enabled', kind: 'field', detail: 'true or false. False leaves the pieces inside unclickable' }]
}

const componentTypes = Object.keys(fieldsByType) as MenuComponent['type'][]

const libraries: Record<string, Suggestion[]> = {
  string: fields(['byte', 'char', 'find', 'format', 'gmatch', 'gsub', 'len', 'lower', 'match', 'rep', 'reverse', 'sub', 'upper']),
  math: fields(['abs', 'ceil', 'floor', 'huge', 'max', 'min', 'pi', 'random', 'randomseed', 'sqrt']),
  table: fields(['concat', 'insert', 'remove', 'sort', 'unpack']),
  utf8: fields(['char', 'codepoint', 'codes', 'len', 'offset'])
}

const globals: Suggestion[] = [
  { label: 'game', insertText: 'game', kind: 'field', detail: 'The game API' },
  { label: 'self', insertText: 'self', kind: 'field', detail: 'The menu or composite during onLoad, or this component in onChange and onInteract' },
  { label: 'print', insertText: 'print(', kind: 'function', detail: 'Write to the game console' },
  { label: 'onLoad', insertText: 'onLoad', kind: 'function', detail: 'Called when a menu or composite opens' },
  { label: 'onInteract', insertText: 'onInteract', kind: 'function', detail: 'Called when a button or image is clicked' },
  { label: 'onChange', insertText: 'onChange', kind: 'function', detail: 'Called when the player edits an input' },
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

export function scriptSuggestions(beforeWord: string, hints: ScriptHints): Suggestion[] {
  if (inComment(beforeWord) || inString(beforeWord)) return []
  const member = memberContext(beforeWord)
  if (!member) {
    if (!hints.parent) return globals
    return [...globals, { label: 'parent', insertText: 'parent', kind: 'field', detail: 'The page viewer' }]
  }
  return members(member, hints)
}

function members(member: { chain: string[]; colon: boolean }, hints: ScriptHints): Suggestion[] {
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
  if (chain[0] === 'game' && chain[1] === 'currentMenu' && chain.length === 2 && !colon) return handleSuggestions(hints)
  if (chain[0] === 'game' && chain[1] === 'currentMenu' && chain.length === 3) {
    return componentFields(typesFor(chain[2] ?? '', hints), colon)
  }
  if (chain[0] === 'game' && chain[1] === 'currentModal' && chain.length === 2 && !colon) return handleSuggestions(hints)
  if (chain[0] === 'game' && chain[1] === 'currentModal' && chain.length === 3) {
    return componentFields(typesFor(chain[2] ?? '', hints), colon)
  }
  if (chain.length === 1 && chain[0] === 'parent' && hints.parent) return componentFields([hints.parent], colon)
  if (chain.length === 1 && chain[0] === 'self') {
    if (hints.self === 'menu') return colon ? [] : handleSuggestions(hints)
    if (hints.self === 'composite') {
      if (colon) return []
      const children = handleSuggestions(hints)
      const own = componentFields(['composite'], false).filter((item) => !children.some((child) => child.label === item.label))
      return [...children, ...own]
    }
    const types = hints.self === 'any' ? componentTypes : [hints.self]
    return componentFields(types, colon)
  }
  if (!colon && chain.length === 1) return libraries[chain[0] ?? ''] ?? []
  return []
}

function handleSuggestions(hints: ScriptHints): Suggestion[] {
  const byName = new Map<string, Set<string>>()
  for (const handle of hints.handles) {
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

function typesFor(name: string, hints: ScriptHints): MenuComponent['type'][] {
  return hints.handles.filter((handle) => handle.name === name).map((handle) => handle.type)
}

function componentFields(types: readonly MenuComponent['type'][], methodsOnly: boolean): Suggestion[] {
  const items = types.flatMap((type) => fieldsByType[type] ?? [])
  const chosen = methodsOnly ? items.filter((item) => item.kind === 'function') : items
  if (!methodsOnly) {
    chosen.push({ label: 'visible', insertText: 'visible', kind: 'field', detail: 'true or false. False hides this component' })
    chosen.push({ label: 'color', insertText: 'color', kind: 'field', detail: 'A color such as "#ff8800". White leaves the component unchanged' })
  }
  const seen = new Set<string>()
  return chosen.filter((item) => {
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
