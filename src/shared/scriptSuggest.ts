import type { MenuComponent } from './types'
import { KEYS } from './keys'
import { propertiesInScope, type ScriptProperty } from './scriptProperties'

export type ScriptHandle = {
  name: string
  type: MenuComponent['type']
}

export type ScriptHints = {
  handles: ScriptHandle[]
  self: 'menu' | 'scene' | MenuComponent['type'] | 'any'
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
  composite: [{ label: 'enabled', insertText: 'enabled', kind: 'field', detail: 'true or false. False leaves the pieces inside unclickable' }],
  sceneViewer: [
    { label: 'viewX', insertText: 'viewX', kind: 'field', detail: 'Left edge of the view, in scene pixels' },
    { label: 'viewY', insertText: 'viewY', kind: 'field', detail: 'Top edge of the view, in scene pixels' },
    { label: 'scale', insertText: 'scale', kind: 'field', detail: 'Whole number. 2 draws each scene pixel as 2 by 2' },
    { label: 'width', insertText: 'width', kind: 'field', detail: 'Scene pixels visible across the view. It follows the scale' },
    { label: 'height', insertText: 'height', kind: 'field', detail: 'Scene pixels visible down the view. It follows the scale' },
    { label: 'scene', insertText: 'scene', kind: 'field', detail: 'Scene path' }
  ],
  tile: [
    { label: 'setTile', insertText: 'setTile(${1:tileset}, ${2:x}, ${3:y})', kind: 'function', detail: 'Show one tile from a tileset. The chosen cell lands on this tile, and a merged picture hangs off it' },
    { label: 'tileset', insertText: 'tileset', kind: 'field', detail: 'Tileset path' },
    { label: 'tileX', insertText: 'tileX', kind: 'field', detail: 'Column in the tileset. 0 is the left column' },
    { label: 'tileY', insertText: 'tileY', kind: 'field', detail: 'Row in the tileset. 0 is the top row' }
  ],
  tilemap: [
    { label: 'getTile', insertText: 'getTile(${1:x}, ${2:y})', kind: 'function', detail: 'Tileset path, column, and row at a cell. Nil when that cell is empty' },
    { label: 'setTile', insertText: 'setTile(${1:x}, ${2:y}, ${3:tileset}, ${4:column}, ${5:row})', kind: 'function', detail: 'Paint a tile from a tileset onto this cell. The chosen cell lands on the map cell' }
  ],
  collider: [
    { label: 'collisionWith', insertText: 'collisionWith({${1:"solid"}})', kind: 'function', detail: 'Other colliders on this canvas that overlap and have any of these tags' },
    { label: 'tags', insertText: 'tags', kind: 'field', detail: 'Names on this collider, such as solid or hurt' },
    { label: 'shape', insertText: 'shape', kind: 'field', detail: '"square" or "circle"' },
    { label: 'enabled', insertText: 'enabled', kind: 'field', detail: 'true or false. False skips this collider' }
  ]
}

const collisionAtField: Suggestion = {
  label: 'collisionAt',
  insertText: 'collisionAt(${1:x}, ${2:y}, {${3:"solid"}})',
  kind: 'function',
  detail: 'Colliders on this canvas that contain the point and have any of these tags'
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
  { label: 'self', insertText: 'self', kind: 'field', detail: 'The menu, scene, or composite during onLoad and onUpdate, or this component in onChange and onInteract' },
  { label: 'print', insertText: 'print(', kind: 'function', detail: 'Write to the game console' },
  { label: 'onLoad', insertText: 'onLoad', kind: 'function', detail: 'Called when a menu, scene, or composite opens' },
  { label: 'onUpdate', insertText: 'onUpdate', kind: 'function', detail: 'Called every frame while a menu, scene, or composite is on screen' },
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
  if (chain[0] === 'game' && chain[1] === 'currentMenu' && chain.length === 2) return colon ? [collisionAtField] : handleSuggestions(hints)
  if (chain[0] === 'game' && chain[1] === 'currentMenu' && chain.length === 3) {
    return componentFields(typesFor(chain[2] ?? '', hints), colon)
  }
  if (chain[0] === 'game' && chain[1] === 'currentModal' && chain.length === 2) return colon ? [collisionAtField] : handleSuggestions(hints)
  if (chain[0] === 'game' && chain[1] === 'currentModal' && chain.length === 3) {
    return componentFields(typesFor(chain[2] ?? '', hints), colon)
  }
  if (chain.length === 1 && chain[0] === 'parent' && hints.parent) return componentFields([hints.parent], colon)
  if (chain.length === 1 && chain[0] === 'self') {
    if (hints.self === 'menu' || hints.self === 'scene') return colon ? [collisionAtField] : handleSuggestions(hints)
    if (hints.self === 'composite') {
      if (colon) return []
      const children = handleSuggestions(hints)
      const own = componentFields(['composite'], false).filter((item) => !children.some((child) => child.label === item.label))
      return [...children, ...own]
    }
    const types = hints.self === 'any' ? componentTypes : [hints.self]
    return componentFields(types, colon)
  }
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
    chosen.push({ label: 'x', insertText: 'x', kind: 'field', detail: 'Horizontal position, in the same pixels as the editor' })
    chosen.push({ label: 'y', insertText: 'y', kind: 'field', detail: 'Vertical position, in the same pixels as the editor' })
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
