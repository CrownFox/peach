import { componentColor } from './color'
import type { ComponentOverride, ScriptValue } from './overrides'
import { viewerSize } from './sceneCamera'
import { mapSize, pruneCells, tilemapCellSize } from './tiles'
import { isCanvas, type Asset, type BookAsset, type MenuComponent } from './types'

export type ApiKind = 'property' | 'call' | 'event'

export type ApiEntry = {
  name: string
  kind: ApiKind
  detail: string
  insertText?: string
  label?: string
}

export type ApiBlock = { label: string; entries: ApiEntry[] }

export type ScriptDoc = {
  title: string
  note: string
  blocks: ApiBlock[]
}

const typeEntry: ApiEntry = { name: 'type', kind: 'property', detail: 'What this is, such as "button" or "menu". It cannot be changed.' }
const nameEntry: ApiEntry = { name: 'name', kind: 'property', detail: 'The name from the editor. It cannot be changed.' }
const pathEntry: ApiEntry = { name: 'path', kind: 'property', detail: 'The asset path. It cannot be changed.' }

const boxEntries: ApiEntry[] = [
  { name: 'x', kind: 'property', detail: 'Horizontal position, in the same pixels as the editor.' },
  { name: 'y', kind: 'property', detail: 'Vertical position, in the same pixels as the editor.' },
  { name: 'width', kind: 'property', detail: 'Width of this component. A negative width flips it.' },
  { name: 'height', kind: 'property', detail: 'Height of this component. A negative height flips it.' }
]

const presenceEntries: ApiEntry[] = [
  { name: 'visible', kind: 'property', detail: 'True or false. False hides this component.' },
  { name: 'color', kind: 'property', detail: 'A color such as "#ff8800". White leaves it unchanged.' },
  { name: 'enabled', kind: 'property', detail: 'True or false. False means the player cannot use this. A composite or Z field also skips what is inside.' },
  { name: 'z', kind: 'property', detail: 'Draw order inside a Z field. Higher draws in front.' }
]

const collisionAt: ApiEntry = {
  name: 'collisionAt',
  label: 'collisionAt(x, y, tags)',
  kind: 'call',
  insertText: 'collisionAt(${1:x}, ${2:y}, {${3:"solid"}})',
  detail: 'Colliders on this canvas that contain the point and have any of these tags.'
}

const onLoad: ApiEntry = { name: 'onLoad', label: 'onLoad()', kind: 'event', detail: 'Runs when this opens.' }
const onShow: ApiEntry = { name: 'onShow', label: 'onShow()', kind: 'event', detail: 'Runs when this is shown on the visit. Back does not run it again.' }
const onUpdate: ApiEntry = { name: 'onUpdate', label: 'onUpdate(dt)', kind: 'event', detail: 'Runs every frame while this is on screen. dt is seconds.' }
const onInteract: ApiEntry = { name: 'onInteract', label: 'onInteract()', kind: 'event', detail: 'Runs when this is clicked.' }
const onChange: ApiEntry = { name: 'onChange', label: 'onChange()', kind: 'event', detail: 'Runs when the player edits the value.' }
const onMouseDown: ApiEntry = { name: 'onMouseDown', label: 'onMouseDown()', kind: 'event', detail: 'Runs when the pointer presses this.' }
const onMouseUp: ApiEntry = { name: 'onMouseUp', label: 'onMouseUp()', kind: 'event', detail: 'Runs when the pointer is released over this.' }
const onMouseEnter: ApiEntry = { name: 'onMouseEnter', label: 'onMouseEnter()', kind: 'event', detail: 'Runs when the pointer enters this.' }
const onMouseLeave: ApiEntry = { name: 'onMouseLeave', label: 'onMouseLeave()', kind: 'event', detail: 'Runs when the pointer leaves this.' }
const newEntry: ApiEntry = {
  name: 'new',
  kind: 'property',
  detail: 'Constructors that add a component to this canvas for the visit. The saved file stays as it is.'
}

const removeEntry: ApiEntry = {
  name: 'remove',
  label: 'remove()',
  kind: 'call',
  insertText: 'remove()',
  detail: 'Takes this component off the canvas. It has to be one a script added.'
}

const getMousePosition: ApiEntry = {
  name: 'getMousePosition',
  label: 'getMousePosition()',
  kind: 'call',
  insertText: 'getMousePosition()',
  detail: 'The pointer in this canvas\'s pixels, with x and y. Nil when the pointer is outside the game.'
}

const clickCall: ApiEntry = { name: 'click', label: 'click()', kind: 'call', insertText: 'click()', detail: 'Runs onInteract.' }
const panelEntry: ApiEntry = { name: 'panel', kind: 'property', detail: 'A panel path.' }
const valueEntry: ApiEntry = { name: 'value', kind: 'property', detail: 'The current value.' }
const textEntry: ApiEntry = { name: 'text', kind: 'property', detail: 'The label.' }
const rangeEntries: ApiEntry[] = [
  valueEntry,
  { name: 'min', kind: 'property', detail: 'The lowest number.' },
  { name: 'max', kind: 'property', detail: 'The highest number.' },
  panelEntry
]

const canvasSize: ApiEntry[] = [
  { name: 'width', kind: 'property', detail: 'Width of this canvas, in pixels. It cannot be changed.' },
  { name: 'height', kind: 'property', detail: 'Height of this canvas, in pixels. It cannot be changed.' }
]

class Root {
  static own: ApiEntry[] = [typeEntry, nameEntry]
  static box = true

  static chain(): ApiEntry[] {
    const levels: ApiEntry[][] = []
    let current: object | null = this
    while (current && current !== Function.prototype) {
      if (Object.hasOwn(current, 'own')) {
        const own = (current as { own: ApiEntry[] }).own
        levels.unshift(own)
      }
      current = Object.getPrototypeOf(current)
    }
    return levels.flat()
  }
}

class Component extends Root {
  static override own = [...boxEntries, ...presenceEntries, onMouseDown, onMouseUp, onMouseEnter, onMouseLeave, removeEntry]
}

class FileAsset extends Root {
  static override own = [pathEntry]
}

class Canvas extends Root {
  static override own = [...canvasSize, collisionAt, getMousePosition, onLoad, onUpdate, onMouseDown, onMouseUp, onMouseEnter, onMouseLeave, newEntry]
}

class Menu extends Canvas {}

class Scene extends Canvas {
  static override own = [onShow]
}

class Button extends Component {
  static override own: ApiEntry[] = [
    textEntry,
    { name: 'button', kind: 'property', detail: 'A button path.' },
    { name: 'defaultImage', kind: 'property', detail: 'Image path for the usual state.' },
    { name: 'pressedImage', kind: 'property', detail: 'Image path while pressed.' },
    { name: 'disabledImage', kind: 'property', detail: 'Image path while disabled.' },
    clickCall,
    onInteract
  ]
}

class Image extends Component {
  static override own: ApiEntry[] = [{ name: 'image', kind: 'property', detail: 'An image path.' }, clickCall, onInteract]
}

class Panel extends Component {
  static override own = [panelEntry]
}

class Label extends Component {
  static override own = [textEntry, panelEntry]
}

class Meter extends Component {
  static override own = rangeEntries
}

class TextField extends Component {
  static override own = [valueEntry, panelEntry, onChange]
}

class TextArea extends Component {
  static override own = [valueEntry, panelEntry, onChange]
}

class Toggle extends Component {
  static override own = [valueEntry, textEntry, panelEntry, onChange]
}

class ToggleGroup extends Component {
  static override own = [valueEntry, panelEntry, onChange]
}

class Slider extends Component {
  static override own = [...rangeEntries, onChange]
}

class Dropdown extends Component {
  static override own = [valueEntry, panelEntry, onChange]
}

class PageViewer extends Component {
  static override own: ApiEntry[] = [
    { name: 'book', kind: 'property', detail: 'A book path.' },
    { name: 'page', kind: 'property', detail: 'A chapter and page, written "Chapter/Page".' },
    panelEntry,
    { name: 'loadPage', label: 'loadPage(book, path)', kind: 'call', insertText: 'loadPage(${1:book}, "${2:Chapter/Page}")', detail: 'Shows that page.' },
    { name: 'get', label: 'get(field)', kind: 'call', insertText: 'get("${1:field}")', detail: 'Page data for the loaded page.' },
    { name: 'getInput', label: 'getInput(key)', kind: 'call', insertText: 'getInput("${1:key}")', detail: 'Text in a field or dropdown on the page.' },
    { name: 'progressive', kind: 'property', detail: 'True streams the page in. False shows it all at once.' },
    { name: 'scrollable', kind: 'property', detail: 'True scrolls. False hides the rest of the page.' },
    { name: 'rate', kind: 'property', detail: 'Characters per second while streaming.' },
    { name: 'finished', kind: 'property', detail: 'True when streaming has finished. It cannot be set.' },
    { name: 'start', label: 'start()', kind: 'call', insertText: 'start()', detail: 'Turns streaming on and starts from the first character.' },
    { name: 'stop', label: 'stop()', kind: 'call', insertText: 'stop()', detail: 'Pauses the stream.' },
    { name: 'resume', label: 'resume()', kind: 'call', insertText: 'resume()', detail: 'Continues after stop.' },
    { name: 'finish', label: 'finish()', kind: 'call', insertText: 'finish()', detail: 'Shows the rest of the page immediately.' },
    onChange
  ]
}

class CompositeSlot extends Component {
  static override own: ApiEntry[] = [collisionAt, getMousePosition, onLoad, onShow, onUpdate, newEntry]
}

class SceneViewer extends Component {
  static override own: ApiEntry[] = [
    { name: 'viewX', kind: 'property', detail: 'Left edge of the view, in scene pixels.' },
    { name: 'viewY', kind: 'property', detail: 'Top edge of the view, in scene pixels.' },
    { name: 'viewWidth', kind: 'property', detail: 'Scene pixels visible across the view. It follows the scale and cannot be set.' },
    { name: 'viewHeight', kind: 'property', detail: 'Scene pixels visible down the view. It follows the scale and cannot be set.' },
    { name: 'scale', kind: 'property', detail: 'A whole number. 2 draws each scene pixel as 2 by 2.' },
    { name: 'scene', kind: 'property', detail: 'A scene path.' },
    newEntry
  ]
}

export function spawnSurface(): ApiEntry[] {
  return [
    { name: 'composite', kind: 'call', insertText: 'composite("${1:Composites/Player}")', detail: 'Adds a composite. A second argument sets the script id.' },
    { name: 'image', kind: 'call', insertText: 'image("${1:characters/Hero}")', detail: 'Adds an image. A second argument sets the script id.' },
    { name: 'button', kind: 'call', insertText: 'button("${1:Buttons/Play}")', detail: 'Adds a button. A second argument sets the script id.' },
    { name: 'panel', kind: 'call', insertText: 'panel("${1:Panels/Frame}")', detail: 'Adds a panel. A second argument sets the script id.' },
    { name: 'scene', kind: 'call', insertText: 'scene("${1:Scenes/Town}")', detail: 'Adds a scene viewer. A second argument sets the script id.' },
    { name: 'label', kind: 'call', insertText: 'label("${1:Hello}")', detail: 'Adds a label. A second argument sets the script id.' },
    { name: 'text', kind: 'call', insertText: 'text("${1}")', detail: 'Adds a text field. A second argument sets the script id.' },
    { name: 'collider', kind: 'call', insertText: 'collider("${1:square}")', detail: 'Adds a collider. "square" or "circle". A second argument sets the script id.' }
  ]
}

class Tile extends Component {
  static override own: ApiEntry[] = [
    { name: 'setTile', label: 'setTile(path, column, row)', kind: 'call', insertText: 'setTile(${1:tileset}, ${2:0}, ${3:0})', detail: 'Chooses the tileset cell.' },
    { name: 'tileset', kind: 'property', detail: 'A tileset path.' },
    { name: 'tileX', kind: 'property', detail: 'Column in the tileset. 0 is the left column.' },
    { name: 'tileY', kind: 'property', detail: 'Row in the tileset. 0 is the top row.' }
  ]
}

class Tilemap extends Component {
  static override own: ApiEntry[] = [
    { name: 'getTile', label: 'getTile(x, y)', kind: 'call', insertText: 'getTile(${1:x}, ${2:y})', detail: 'Tileset path, column, and row. Nil when the cell is empty.' },
    { name: 'setTile', label: 'setTile(x, y, path, column, row)', kind: 'call', insertText: 'setTile(${1:x}, ${2:y}, ${3:tileset}, ${4:column}, ${5:row})', detail: 'Paints one cell for this visit.' }
  ]
}

class Collider extends Component {
  static override own: ApiEntry[] = [
    { name: 'collisionWith', label: 'collisionWith(tags)', kind: 'call', insertText: 'collisionWith({${1:"solid"}})', detail: 'Other colliders on this canvas that overlap and have any of these tags.' },
    { name: 'tags', kind: 'property', detail: 'Names on this collider, such as solid or hurt.' },
    { name: 'shape', kind: 'property', detail: '"square" or "circle". It cannot be changed.' }
  ]
}

class ZField extends Component {
  static override box = false
  static override own: ApiEntry[] = [
    { name: 'new', kind: 'property', detail: 'Constructors that add a component to this field for the visit. The saved file stays as it is.' }
  ]
}

const componentClass: Record<MenuComponent['type'], typeof Component> = {
  button: Button,
  image: Image,
  panel: Panel,
  label: Label,
  meter: Meter,
  text: TextField,
  textarea: TextArea,
  toggle: Toggle,
  toggleGroup: ToggleGroup,
  slider: Slider,
  dropdown: Dropdown,
  pageViewer: PageViewer,
  composite: CompositeSlot,
  sceneViewer: SceneViewer,
  tile: Tile,
  tilemap: Tilemap,
  collider: Collider,
  zField: ZField
}

const canvasClass = { menu: Menu, scene: Scene } as const

const boxKeys = new Set(['x', 'y', 'width', 'height', 'z'])

export function componentSurface(type: MenuComponent['type']): { shared: ApiEntry[]; own: ApiEntry[] } {
  const ctor = componentClass[type]
  const own = ctor.own
  const ownNames = new Set(own.map((entry) => entry.name))
  const shared = ctor.chain().filter((entry) => !ownNames.has(entry.name) && (ctor.box || !boxKeys.has(entry.name)))
  return { shared, own }
}

export function canvasSurface(kind: 'menu' | 'scene'): { shared: ApiEntry[]; own: ApiEntry[] } {
  const ctor = canvasClass[kind]
  const own = Object.hasOwn(ctor, 'own') ? ctor.own : []
  const ownNames = new Set(own.map((entry) => entry.name))
  return { shared: ctor.chain().filter((entry) => !ownNames.has(entry.name)), own }
}

export const componentSharedKeys = new Set(['type', 'name', 'x', 'y', 'width', 'height', 'visible', 'color', 'enabled', 'z'])

export function hasBox(component: MenuComponent): boolean {
  return component.type !== 'zField'
}

export function readEnabled(component: MenuComponent, override: { enabled?: boolean } | undefined): boolean {
  if (typeof override?.enabled === 'boolean') return override.enabled
  if (component.type === 'button' || component.type === 'composite' || component.type === 'collider') return component.enabled
  return true
}

export function componentSpan(
  component: { x: number; y: number; width: number; height: number },
  override: { x?: number; y?: number; width?: number; height?: number } | undefined
): { x: number; y: number; width: number; height: number } {
  return {
    x: typeof override?.x === 'number' ? override.x : component.x,
    y: typeof override?.y === 'number' ? override.y : component.y,
    width: typeof override?.width === 'number' ? override.width : component.width,
    height: typeof override?.height === 'number' ? override.height : component.height
  }
}

export function readShared(
  component: MenuComponent,
  override: ComponentOverride | undefined,
  key: string,
  displayScale = 1
): ScriptValue | undefined {
  if (component.type === 'sceneViewer' && (key === 'viewWidth' || key === 'viewHeight')) {
    const size = viewerSize(component, override, displayScale)
    return key === 'viewWidth' ? size.width : size.height
  }
  if (!componentSharedKeys.has(key)) return undefined
  if (!hasBox(component) && boxKeys.has(key)) return null
  if (key === 'type') return component.type
  if (key === 'name') return component.name
  if (key === 'enabled') return readEnabled(component, override)
  if (key === 'visible') return override?.visible ?? component.visible
  if (key === 'color') return override?.tint ?? component.tint
  if (key === 'z') {
    const z = typeof override?.z === 'number' ? override.z : component.z
    return typeof z === 'number' && Number.isFinite(z) ? z : null
  }
  const span = componentSpan(component, override)
  if (key === 'x' || key === 'y' || key === 'width' || key === 'height') return span[key]
  return undefined
}

export function writeShared(
  component: MenuComponent,
  current: ComponentOverride,
  key: string,
  value: ScriptValue,
  assets: Iterable<Asset>
): boolean {
  if (component.type === 'sceneViewer' && (key === 'viewWidth' || key === 'viewHeight')) {
    throw new Error(`${key} cannot be changed.`)
  }
  if (key === 'type' || key === 'name') throw new Error(`${key} cannot be changed.`)
  if (!componentSharedKeys.has(key) || key === 'z') return false
  if (!hasBox(component) && (key === 'x' || key === 'y')) {
    throw new Error('A Z field has no position. Set z on the components inside it.')
  }
  if (!hasBox(component) && (key === 'width' || key === 'height')) throw new Error('A Z field has no size.')
  if (value === null) {
    if (key === 'x' || key === 'y' || key === 'width' || key === 'height' || key === 'visible' || key === 'color' || key === 'enabled') {
      delete current[key === 'color' ? 'tint' : key]
    }
    return true
  }
  if (key === 'visible' || key === 'enabled') {
    if (typeof value !== 'boolean') throw new Error(`${key} expects true or false.`)
    current[key] = value
    return true
  }
  if (key === 'color') {
    if (typeof value !== 'string') throw new Error('color expects a color, such as "#ff8800".')
    const color = componentColor(value, '')
    if (!color) throw new Error('color expects a color, such as "#ff8800".')
    current.tint = color
    return true
  }
  if (key === 'x' || key === 'y' || key === 'width' || key === 'height') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} expects a number.`)
    current[key] = value
    if (component.type === 'tilemap' && (key === 'width' || key === 'height')) {
      const span = componentSpan(component, current)
      const grid = tilemapCellSize(component, assets)
      const size = mapSize(span.width, span.height, grid.tileWidth, grid.tileHeight)
      current.cells = pruneCells(current.cells ?? component.cells.map((cell) => ({ ...cell })), size.cols, size.rows)
    }
    return true
  }
  return false
}

const typeTitle: Record<MenuComponent['type'], string> = {
  button: 'Button',
  image: 'Image',
  panel: 'Panel',
  label: 'Label',
  meter: 'Meter',
  text: 'Text',
  textarea: 'Text area',
  toggle: 'Toggle',
  toggleGroup: 'Toggle group',
  slider: 'Slider',
  dropdown: 'Dropdown',
  pageViewer: 'Page viewer',
  composite: 'Composite',
  sceneViewer: 'Scene viewer',
  tile: 'Tile',
  tilemap: 'Tilemap',
  collider: 'Collider',
  zField: 'Z field'
}

function blocksFrom(shared: ApiEntry[], own: ApiEntry[]): ApiBlock[] {
  const blocks: ApiBlock[] = []
  const labels = { event: 'Events', property: 'Properties', call: 'Calls' } as const
  for (const kind of ['event', 'property', 'call'] as const) {
    const entries = [...shared, ...own].filter((entry) => entry.kind === kind)
    if (entries.length > 0) blocks.push({ label: labels[kind], entries })
  }
  return blocks
}

function componentDoc(type: MenuComponent['type'], note = ''): ScriptDoc {
  const surface = componentSurface(type)
  return {
    title: typeTitle[type],
    note,
    blocks: blocksFrom(surface.shared, surface.own)
  }
}

function canvasDoc(kind: 'menu' | 'scene', note = ''): ScriptDoc {
  const surface = canvasSurface(kind)
  return {
    title: kind === 'menu' ? 'Menu' : 'Scene',
    note,
    blocks: blocksFrom(surface.shared, surface.own)
  }
}

const pageLoad: ApiEntry = { name: 'onLoad', label: 'onLoad(parent)', kind: 'event', detail: 'Runs when the page is shown. parent is the page viewer.' }
const visibleEvent: ApiEntry = { name: 'visible', label: 'visible()', kind: 'event', detail: 'Return true to show the block. self is the page viewer.' }
const valueEvent: ApiEntry = { name: 'value', label: 'value()', kind: 'event', detail: 'The text that replaces the insert. self is the page viewer.' }

function pageViewerParent(): ApiBlock {
  const surface = componentSurface('pageViewer')
  return { label: 'Page viewer', entries: [...surface.own, ...surface.shared.filter((entry) => entry.kind !== 'event')] }
}

export function scriptDocs(assets: readonly Asset[], key: string): ScriptDoc[] {
  if (key.startsWith('menu:')) return [canvasDoc('menu')]
  if (key.startsWith('scene:')) return [canvasDoc('scene')]
  if (key.startsWith('composite:')) return [componentDoc('composite')]
  if (key.startsWith('component:')) {
    const [, canvasId, componentId] = key.split(':')
    const canvas = assets.find((asset) => asset.id === canvasId)
    const component = canvas && isCanvas(canvas) ? findListed(canvas.components, componentId ?? '') : null
    return [componentDoc(component?.type ?? 'label')]
  }
  if (key.startsWith('pagescript:')) {
    return [{ title: 'Page', note: '', blocks: [{ label: 'Page', entries: [pageLoad] }, pageViewerParent()] }]
  }
  if (key.startsWith('doodad:')) {
    const [, bookId, pageId, doodadId] = key.split(':')
    const book = assets.find((asset) => asset.id === bookId && asset.type === 'book')
    const hook = book?.type === 'book' ? doodadHook(book, pageId ?? '', doodadId ?? '') : 'value'
    const event = hook === 'visible' ? visibleEvent : valueEvent
    return [{ title: hook === 'visible' ? 'Condition' : 'Evaluate', note: '', blocks: [{ label: 'Page', entries: [event] }, pageViewerParent()] }]
  }
  if (key.startsWith('asset:')) return scriptAssetDocs(assets, key.slice(6))
  return [unusedScript()]
}

function unusedScript(): ScriptDoc {
  return {
    title: 'Script',
    note: 'This script takes on the hooks of the menu, scene, composite, or component it is assigned to.',
    blocks: [{ label: 'Properties', entries: [typeEntry, nameEntry] }]
  }
}

function scriptAssetDocs(assets: readonly Asset[], scriptId: string): ScriptDoc[] {
  const docs: ScriptDoc[] = []
  const seen = new Set<string>()
  const add = (id: string, doc: ScriptDoc): void => {
    if (seen.has(id)) return
    seen.add(id)
    docs.push(doc)
  }
  for (const asset of assets) {
    if ((asset.type === 'menu' || asset.type === 'scene') && asset.scriptId === scriptId) add(asset.type, canvasDoc(asset.type, asset.name))
    if (asset.type === 'composite' && asset.scriptId === scriptId) add('composite', componentDoc('composite', asset.name))
    if (!isCanvas(asset)) continue
    for (const component of listed(asset.components)) {
      if (component.scriptId !== scriptId) continue
      add(component.type, componentDoc(component.type, component.name))
    }
  }
  return docs.length > 0 ? docs : [unusedScript()]
}

function listed(components: readonly MenuComponent[]): MenuComponent[] {
  const result: MenuComponent[] = []
  for (const component of components) {
    result.push(component)
    if (component.type === 'zField') result.push(...component.children)
  }
  return result
}

function findListed(components: readonly MenuComponent[], id: string): MenuComponent | null {
  return listed(components).find((component) => component.id === id) ?? null
}

export function fileSurface(): ApiEntry[] {
  return FileAsset.chain()
}

function doodadHook(book: BookAsset, pageId: string, doodadId: string): 'visible' | 'value' {
  for (const chapter of book.chapters) {
    const page = chapter.pages.find((item) => item.id === pageId)
    if (!page) continue
    for (const block of page.blocks) {
      if (block.type === 'conditional' && block.id === doodadId) return 'visible'
    }
  }
  return 'value'
}
