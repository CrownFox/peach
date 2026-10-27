import { coercePageValue, emptyPage, pageFieldType, pageValue, plainMarks, valueScript, visibleScript } from './books'
import { coerceFieldValue } from './collections'
import { componentColor } from './color'
import { DEFAULT_FONT_FAMILY } from './fonts'
import { isScriptHandle } from './handles'
import { createId } from './ids'
import {
  assetFileName,
  isInside,
  joinPath,
  parentPath,
  replacePrefix,
  sanitizeFileStem,
  uniqueName
} from './paths'
import { FORMAT_VERSION, DEFAULT_MENU_HEIGHT, DEFAULT_MENU_WIDTH, MIN_COMPOSITE_SIZE, MIN_MENU_HEIGHT, MIN_MENU_WIDTH, type Asset, type AssetType, type ButtonAsset, type ButtonComponent, type ButtonSlices, type SliceFill, type ChoiceOption, type ColliderComponent, type ZFieldComponent, type CollectionAsset, type CollectionEntry, type CollectionField, type ComponentBase, type CompositeAsset, type CompositeComponent, type DropdownComponent, type ImageAsset, type ImageComponent, type LabelAlignX, type LabelAlignY, type LabelComponent, type MenuAsset, type MenuComponent, type MeterComponent, type PanelAsset, type PanelComponent, type ProjectMeta, type SceneAsset, type SceneViewerComponent, type ScriptAsset, type TileCell, type TileComponent, type TilemapComponent, type TileSpan, type TilesetAsset, type SliderComponent, type TextAreaComponent, type TextComponent, type ToggleComponent, type ToggleGroupComponent } from './types'
import { DEFAULT_TEXT_RATE, type BookAsset, type BookChapter, type BookPage, type PageBlock, type PageField, type PageMarks, type PageParagraph, type PageRun, type PageViewerComponent } from './types'
import { canvasComponents } from './zField'

export function defaultSlices(): ButtonSlices {
  return { left: 8, right: 8, top: 8, bottom: 8 }
}

export function createImageAsset(id: string, name: string, relativePath: string): ImageAsset {
  return {
    id,
    type: 'image',
    name,
    relativePath,
    file: null,
    width: 0,
    height: 0,
    format: null
  }
}

export function createButtonAsset(id: string, name: string, relativePath: string): ButtonAsset {
  return {
    id,
    type: 'button',
    name,
    relativePath,
    mode: 'static',
    slices: defaultSlices(),
    edgeFill: 'stretch',
    centerFill: 'stretch',
    states: { default: null, pressed: null, disabled: null }
  }
}

export function createMenuAsset(id: string, name: string, relativePath: string): MenuAsset {
  return {
    id,
    type: 'menu',
    name,
    relativePath,
    width: DEFAULT_MENU_WIDTH,
    height: DEFAULT_MENU_HEIGHT,
    gridSize: 16,
    snapToGrid: false,
    scriptId: null,
    script: '',
    components: []
  }
}

export function createCompositeAsset(id: string, name: string, relativePath: string): CompositeAsset {
  return {
    id,
    type: 'composite',
    name,
    relativePath,
    width: DEFAULT_MENU_WIDTH,
    height: DEFAULT_MENU_HEIGHT,
    originX: 0,
    originY: 0,
    gridSize: 16,
    snapToGrid: false,
    scriptId: null,
    script: 'function onLoad()\nend\n\nfunction onShow()\nend\n\nfunction onUpdate(dt)\nend\n',
    components: []
  }
}

export function createSceneAsset(id: string, name: string, relativePath: string): SceneAsset {
  return {
    id,
    type: 'scene',
    name,
    relativePath,
    width: DEFAULT_MENU_WIDTH,
    height: DEFAULT_MENU_HEIGHT,
    gridSize: 16,
    snapToGrid: false,
    scriptId: null,
    script: 'function onLoad()\nend\n\nfunction onShow()\nend\n\nfunction onUpdate(dt)\nend\n',
    components: [],
    persistent: false
  }
}

export function createScriptAsset(id: string, name: string, relativePath: string): ScriptAsset {
  return {
    id,
    type: 'script',
    name,
    relativePath,
    source: '-- Shared script. Functions here are available to the menu or component that uses this script.\n'
  }
}

export function createPanelAsset(id: string, name: string, relativePath: string): PanelAsset {
  return {
    id,
    type: 'panel',
    name,
    relativePath,
    imageId: null,
    slices: defaultSlices(),
    edgeFill: 'stretch',
    centerFill: 'stretch'
  }
}

export function createCollectionAsset(id: string, name: string, relativePath: string): CollectionAsset {
  const fieldId = createId()
  return {
    id,
    type: 'collection',
    name,
    relativePath,
    masterKeyId: fieldId,
    fields: [{ id: fieldId, name: 'Name', type: 'text', presets: [], enforcePresets: false }],
    entries: []
  }
}

export function createBookAsset(id: string, name: string, relativePath: string): BookAsset {
  return {
    id,
    type: 'book',
    name,
    relativePath,
    fields: [],
    chapters: [{ id: createId(), name: 'Chapter', pages: [emptyPage(createId(), 'Page', [])] }]
  }
}

export function createAsset(type: AssetType, name: string, relativePath: string, id = createId()): Asset {
  if (type === 'image') return createImageAsset(id, name, relativePath)
  if (type === 'button') return createButtonAsset(id, name, relativePath)
  if (type === 'script') return createScriptAsset(id, name, relativePath)
  if (type === 'panel') return createPanelAsset(id, name, relativePath)
  if (type === 'collection') return createCollectionAsset(id, name, relativePath)
  if (type === 'book') return createBookAsset(id, name, relativePath)
  if (type === 'composite') return createCompositeAsset(id, name, relativePath)
  if (type === 'scene') return createSceneAsset(id, name, relativePath)
  if (type === 'tileset') return createTilesetAsset(id, name, relativePath)
  return createMenuAsset(id, name, relativePath)
}

export function createTilesetAsset(id: string, name: string, relativePath: string): TilesetAsset {
  return { id, type: 'tileset', name, relativePath, imageId: null, tileWidth: 16, tileHeight: 16, merges: [] }
}

export function assetDocument(asset: Asset): Record<string, unknown> {
  const body = { ...asset } as Partial<Asset>
  delete body.relativePath
  return { formatVersion: FORMAT_VERSION, ...body }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function wholeScale(value: unknown): number {
  const parsed = num(value, 1)
  const whole = Math.floor(parsed)
  return whole >= 1 ? whole : 1
}

function idOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function parseSlices(value: unknown): ButtonSlices {
  const fallback = defaultSlices()
  if (!isRecord(value)) return fallback
  return {
    left: Math.max(0, num(value.left, fallback.left)),
    right: Math.max(0, num(value.right, fallback.right)),
    top: Math.max(0, num(value.top, fallback.top)),
    bottom: Math.max(0, num(value.bottom, fallback.bottom))
  }
}

function parseSliceFill(value: unknown): SliceFill {
  return value === 'tile' ? 'tile' : 'stretch'
}

function binding(value: Record<string, unknown>): Pick<ComponentBase, 'handle' | 'scriptId' | 'script' | 'properties'> {
  const handle = str(value.handle).trim()
  return {
    handle: isScriptHandle(handle) ? handle : '',
    scriptId: idOrNull(value.scriptId),
    script: str(value.script),
    properties: parseProperties(value.properties)
  }
}

function parseProperties(value: unknown): Record<string, string | boolean | number> {
  if (!isRecord(value)) return {}
  const properties: Record<string, string | boolean | number> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    if (typeof item === 'string' || typeof item === 'boolean') properties[key] = item
    else if (typeof item === 'number' && Number.isFinite(item)) properties[key] = item
  }
  return properties
}

const COMPONENT_NAMES: Record<MenuComponent['type'], string> = {
  image: 'Image',
  button: 'Button',
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

function textStyle(value: Record<string, unknown>): { fontFamily: string; fontSize: number; color: string } {
  return {
    fontFamily: str(value.fontFamily, DEFAULT_FONT_FAMILY),
    fontSize: num(value.fontSize, 40),
    color: str(value.color, '#ffffff')
  }
}

function parseOptions(value: unknown): ChoiceOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = str(item.id)
    if (!id) return []
    return [{ id, label: str(item.label, 'Option') }]
  })
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function isComponentType(value: unknown): value is MenuComponent['type'] {
  return typeof value === 'string' && value in COMPONENT_NAMES
}

function parseComponent(value: unknown): MenuComponent | null {
  if (!isRecord(value) || !isComponentType(value.type)) return null
  const type = value.type
  const base = {
    id: str(value.id, createId()),
    name: str(value.name, COMPONENT_NAMES[type]),
    x: num(value.x, 0),
    y: num(value.y, 0),
    width: num(value.width, 20),
    height: num(value.height, 12),
    ...binding(value),
    tint: componentColor(value.tint),
    visible: value.visible !== false
  }
  const panelId = idOrNull(value.panelId)
  if (type === 'image') return { ...base, type, imageId: idOrNull(value.imageId), fit: value.fit === 'tile' ? 'tile' : 'stretch' }
  if (type === 'button') {
    return {
      ...base,
      type,
      buttonId: idOrNull(value.buttonId),
      enabled: value.enabled !== false,
      text: str(value.text),
      ...textStyle(value)
    }
  }
  if (type === 'panel') return { ...base, type, panelId }
  if (type === 'label') {
    return { ...base, type, text: str(value.text), ...textStyle(value), alignX: labelAlignX(value.alignX), alignY: labelAlignY(value.alignY), panelId }
  }
  if (type === 'meter') {
    return {
      ...base,
      type,
      min: num(value.min, 0),
      max: num(value.max, 100),
      value: num(value.value, 0),
      fillColor: str(value.fillColor, '#e8946a'),
      panelId
    }
  }
  if (type === 'text' || type === 'textarea') {
    return { ...base, type, value: str(value.value), placeholder: str(value.placeholder), ...textStyle(value), panelId }
  }
  if (type === 'toggle') {
    return { ...base, type, value: value.value === true, text: str(value.text), ...textStyle(value), panelId }
  }
  if (type === 'toggleGroup') {
    return {
      ...base,
      type,
      mode: value.mode === 'any' ? 'any' : 'one',
      options: parseOptions(value.options),
      selected: parseStringList(value.selected),
      ...textStyle(value),
      panelId
    }
  }
  if (type === 'slider') {
    return {
      ...base,
      type,
      min: num(value.min, 0),
      max: num(value.max, 100),
      step: num(value.step, 1),
      value: num(value.value, 0),
      fillColor: str(value.fillColor, '#e8946a'),
      panelId
    }
  }
  if (type === 'pageViewer') {
    return {
      ...base,
      type,
      bookId: idOrNull(value.bookId),
      pagePath: str(value.pagePath),
      ...textStyle(value),
      fontSize: Math.max(1, num(value.fontSize, 4)),
      panelId,
      progressive: value.progressive === true,
      rate: Math.max(1, num(value.rate, DEFAULT_TEXT_RATE)),
      scrollable: value.scrollable !== false
    }
  }
  if (type === 'composite') {
    return { ...base, type, compositeId: idOrNull(value.compositeId), enabled: value.enabled !== false }
  }
  if (type === 'sceneViewer') {
    return {
      ...base,
      type,
      sceneId: idOrNull(value.sceneId),
      viewX: num(value.viewX, 0),
      viewY: num(value.viewY, 0),
      scale: wholeScale(value.scale),
      scaleWithViewer: value.scaleWithViewer !== false
    }
  }
  if (type === 'tile') {
    return { ...base, type, tilesetId: idOrNull(value.tilesetId), tileX: Math.max(0, Math.floor(num(value.tileX, 0))), tileY: Math.max(0, Math.floor(num(value.tileY, 0))) }
  }
  if (type === 'tilemap') {
    const tilesetId = idOrNull(value.tilesetId)
    const cells = Array.isArray(value.cells) ? value.cells.flatMap((item) => {
      const cell = parseTileCell(item, tilesetId)
      return cell ? [cell] : []
    }) : []
    return {
      ...base,
      type,
      tilesetId,
      tileWidth: Math.max(0, Math.floor(num(value.tileWidth, 0))),
      tileHeight: Math.max(0, Math.floor(num(value.tileHeight, 0))),
      cells
    }
  }
  if (type === 'collider') {
    return {
      ...base,
      type,
      shape: value.shape === 'circle' ? 'circle' : 'square',
      tags: parseStringList(value.tags).flatMap((tag) => {
        const trimmed = tag.trim()
        return trimmed ? [trimmed] : []
      }),
      enabled: value.enabled !== false
    }
  }
  if (type === 'zField') {
    const children = Array.isArray(value.children)
      ? value.children.flatMap((child) => {
          const parsed = parseComponent(child)
          if (!parsed || parsed.type === 'zField') return []
          const record = isRecord(child) ? child : {}
          parsed.z = typeof record.z === 'number' && Number.isFinite(record.z) ? record.z : 0
          return [parsed]
        })
      : []
    return { ...base, type, x: 0, y: 0, width: 0, height: 0, children }
  }
  return { ...base, type, options: parseOptions(value.options), value: str(value.value), ...textStyle(value), panelId }
}

function parseTileCell(value: unknown, fallbackTilesetId: string | null): TileCell | null {
  if (!isRecord(value)) return null
  const x = Math.floor(num(value.x, -1))
  const y = Math.floor(num(value.y, -1))
  const tileX = Math.floor(num(value.tileX, -1))
  const tileY = Math.floor(num(value.tileY, -1))
  if (x < 0 || y < 0 || tileX < 0 || tileY < 0) return null
  return { x, y, tileX, tileY, tilesetId: idOrNull(value.tilesetId) ?? fallbackTilesetId }
}

function parseTileSpan(value: unknown): TileSpan | null {
  if (!isRecord(value)) return null
  const x = Math.floor(num(value.x, -1))
  const y = Math.floor(num(value.y, -1))
  const width = Math.floor(num(value.width, 0))
  const height = Math.floor(num(value.height, 0))
  if (x < 0 || y < 0 || width < 1 || height < 1) return null
  return { x, y, width, height }
}

function parseCollectionField(value: unknown): CollectionField | null {
  if (!isRecord(value)) return null
  const id = str(value.id)
  if (!id) return null
  const type = value.type === 'boolean' ? 'boolean' : 'text'
  const presets = Array.isArray(value.presets)
    ? value.presets.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
  return {
    id,
    name: str(value.name, 'Field'),
    type,
    presets: type === 'boolean' ? [] : presets,
    enforcePresets: type === 'text' && value.enforcePresets === true
  }
}

function parseCollectionEntry(value: unknown, fields: CollectionField[]): CollectionEntry | null {
  if (!isRecord(value)) return null
  const raw = isRecord(value.values) ? value.values : {}
  const values: Record<string, string | boolean> = {}
  for (const field of fields) values[field.id] = coerceFieldValue(field, raw[field.id])
  return { id: str(value.id) || createId(), values }
}

function parseCollectionAsset(value: Record<string, unknown>, id: string, name: string, relativePath: string): CollectionAsset {
  const fields = Array.isArray(value.fields)
    ? value.fields.flatMap((item) => {
        const field = parseCollectionField(item)
        return field ? [field] : []
      })
    : []
  if (fields.length === 0) {
    const fieldId = createId()
    fields.push({ id: fieldId, name: 'Name', type: 'text', presets: [], enforcePresets: false })
  }
  const requested = idOrNull(value.masterKeyId)
  const entries = Array.isArray(value.entries)
    ? value.entries.flatMap((item) => {
        const entry = parseCollectionEntry(item, fields)
        return entry ? [entry] : []
      })
    : []
  return {
    id,
    type: 'collection',
    name,
    relativePath,
    fields,
    masterKeyId: fields.some((field) => field.id === requested) ? requested : (fields[0]?.id ?? null),
    entries
  }
}

function parseMarks(value: unknown): PageMarks {
  const marks = isRecord(value) ? value : {}
  const size = num(marks.fontSize, 0)
  return {
    bold: marks.bold === true,
    italic: marks.italic === true,
    underline: marks.underline === true,
    strike: marks.strike === true,
    color: typeof marks.color === 'string' && marks.color ? marks.color : null,
    fontSize: size >= 8 ? size : null,
    fontFamily: typeof marks.fontFamily === 'string' && marks.fontFamily ? marks.fontFamily : null
  }
}

function parseRun(value: unknown): PageRun | null {
  if (!isRecord(value)) return null
  if (value.type === 'text') return { type: 'text', text: str(value.text), marks: parseMarks(value.marks) }
  const id = str(value.id) || createId()
  if (value.type === 'image') return { type: 'image', id, imageId: idOrNull(value.imageId) }
  if (value.type === 'evaluate') return { type: 'evaluate', id, script: str(value.script, valueScript) }
  if (value.type === 'textInput') return { type: 'textInput', id, key: str(value.key), placeholder: str(value.placeholder) }
  if (value.type === 'dropdown') {
    const options = Array.isArray(value.options) ? value.options.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
    return { type: 'dropdown', id, key: str(value.key), options }
  }
  return null
}

function parseParagraph(value: unknown): PageParagraph | null {
  if (!isRecord(value)) return null
  const runs = Array.isArray(value.runs) ? value.runs.flatMap((item) => {
    const run = parseRun(item)
    return run ? [run] : []
  }) : []
  return {
    type: 'paragraph',
    align: value.align === 'center' || value.align === 'end' ? value.align : 'start',
    runs: runs.length > 0 ? runs : [{ type: 'text', text: '', marks: plainMarks() }]
  }
}

function parseBlock(value: unknown): PageBlock | null {
  if (!isRecord(value)) return null
  if (value.type === 'conditional') {
    const blocks = Array.isArray(value.blocks) ? value.blocks.flatMap((item) => {
      const paragraph = parseParagraph(item)
      return paragraph ? [paragraph] : []
    }) : []
    return {
      type: 'conditional',
      id: str(value.id) || createId(),
      script: str(value.script, visibleScript),
      blocks: blocks.length > 0 ? blocks : [{ type: 'paragraph', align: 'start', runs: [{ type: 'text', text: '', marks: plainMarks() }] }]
    }
  }
  return parseParagraph(value)
}

function parsePageField(value: unknown): PageField | null {
  if (!isRecord(value)) return null
  const id = str(value.id)
  if (!id) return null
  const type = pageFieldType(value.type)
  return { id, name: str(value.name, 'Field'), type, default: coercePageValue(type, value.default) }
}

function parseBookPage(value: unknown, fields: PageField[]): BookPage | null {
  if (!isRecord(value)) return null
  const blocks = Array.isArray(value.blocks) ? value.blocks.flatMap((item) => {
    const block = parseBlock(item)
    return block ? [block] : []
  }) : []
  const raw = isRecord(value.values) ? value.values : {}
  const values: Record<string, string | boolean> = {}
  for (const field of fields) values[field.id] = pageValue(field, raw)
  return {
    id: str(value.id) || createId(),
    name: str(value.name, 'Page'),
    values,
    script: str(value.script),
    blocks: blocks.length > 0 ? blocks : [{ type: 'paragraph', align: 'start', runs: [{ type: 'text', text: '', marks: plainMarks() }] }]
  }
}

function parseChapter(value: unknown, fields: PageField[]): BookChapter | null {
  if (!isRecord(value)) return null
  const pages = Array.isArray(value.pages) ? value.pages.flatMap((item) => {
    const page = parseBookPage(item, fields)
    return page ? [page] : []
  }) : []
  return { id: str(value.id) || createId(), name: str(value.name, 'Chapter'), pages }
}

function parseBookAsset(value: Record<string, unknown>, id: string, name: string, relativePath: string): BookAsset {
  const fields = Array.isArray(value.fields) ? value.fields.flatMap((item) => {
    const field = parsePageField(item)
    return field ? [field] : []
  }) : []
  const chapters = Array.isArray(value.chapters) ? value.chapters.flatMap((item) => {
    const chapter = parseChapter(item, fields)
    return chapter ? [chapter] : []
  }) : []
  return {
    id,
    type: 'book',
    name,
    relativePath,
    fields,
    chapters: chapters.length > 0 ? chapters : [{ id: createId(), name: 'Chapter', pages: [emptyPage(createId(), 'Page', fields)] }]
  }
}

export function parseAsset(value: unknown, relativePath: string): Asset {
  if (!isRecord(value)) throw new Error(`${relativePath || 'Asset'} is not an asset file.`)
  if (!relativePath && typeof value.location === 'string' && typeof value.type === 'string') {
    relativePath = `${value.location}.${value.type}.json`
  }
  const type = value.type
  const id = str(value.id)
  const name = str(value.name, 'Untitled')
  if (!id) throw new Error(`${relativePath} is missing an id.`)
  if (type === 'image') {
    const file = idOrNull(value.file)
    return {
      id,
      type: 'image',
      name,
      relativePath,
      file: file ? file.replace(/\\/g, '/') : null,
      width: num(value.width, 0),
      height: num(value.height, 0),
      format: idOrNull(value.format)
    }
  }
  if (type === 'button') {
    const states = isRecord(value.states) ? value.states : {}
    return {
      id,
      type: 'button',
      name,
      relativePath,
      mode: value.mode === 'nine-panel' ? 'nine-panel' : 'static',
      slices: parseSlices(value.slices),
      edgeFill: parseSliceFill(value.edgeFill),
      centerFill: parseSliceFill(value.centerFill),
      states: {
        default: idOrNull(states.default),
        pressed: idOrNull(states.pressed),
        disabled: idOrNull(states.disabled)
      }
    }
  }
  if (type === 'script') {
    return { id, type: 'script', name, relativePath, source: str(value.source) }
  }
  if (type === 'panel') {
    return {
      id,
      type: 'panel',
      name,
      relativePath,
      imageId: idOrNull(value.imageId),
      slices: parseSlices(value.slices),
      edgeFill: parseSliceFill(value.edgeFill),
      centerFill: parseSliceFill(value.centerFill)
    }
  }
  if (type === 'collection') return parseCollectionAsset(value, id, name, relativePath)
  if (type === 'book') return parseBookAsset(value, id, name, relativePath)
  if (type === 'menu' || type === 'composite' || type === 'scene') return parseCanvasAsset(type, value, id, name, relativePath)
  if (type === 'tileset') {
    const merges = Array.isArray(value.merges) ? value.merges.flatMap((item) => {
      const span = parseTileSpan(item)
      return span ? [span] : []
    }) : []
    return {
      id,
      type,
      name,
      relativePath,
      imageId: idOrNull(value.imageId),
      tileWidth: Math.max(1, Math.floor(num(value.tileWidth, 16))),
      tileHeight: Math.max(1, Math.floor(num(value.tileHeight, 16))),
      merges
    }
  }
  throw new Error(`${relativePath} has an unknown type.`)
}

function parseCanvasAsset(
  type: 'menu' | 'composite' | 'scene',
  value: Record<string, unknown>,
  id: string,
  name: string,
  relativePath: string
): MenuAsset | CompositeAsset | SceneAsset {
  const components = Array.isArray(value.components)
    ? value.components.flatMap((item) => {
        const component = parseComponent(item)
        if (!component || (type === 'scene' && component.type === 'sceneViewer')) return []
        return [component]
      })
    : []
  const min = minimumCanvasSize(type)
  const width = Math.max(min.width, num(value.width, DEFAULT_MENU_WIDTH))
  const height = Math.max(min.height, num(value.height, DEFAULT_MENU_HEIGHT))
  const legacy = type === 'menu' && num(value.formatVersion, 1) < 2
  const placed = components.map((component) => {
    const rect = legacy ? pixelsFromPercent(component, width, height) : roundRect(component)
    return { ...component, ...rect }
  })
  const canvas = {
    id,
    name,
    relativePath,
    width,
    height,
    gridSize: Math.max(1, Math.round(num(value.gridSize, 16))),
    snapToGrid: value.snapToGrid === true,
    scriptId: idOrNull(value.scriptId),
    script: str(value.script),
    components: placed
  }
  if (type === 'composite') {
    return { ...canvas, type, originX: num(value.originX, 0), originY: num(value.originY, 0) }
  }
  if (type === 'scene') return { ...canvas, type, persistent: value.persistent === true }
  return { ...canvas, type: 'menu' }
}

export function parseMeta(value: unknown, fallbackName: string): ProjectMeta {
  if (!isRecord(value)) {
    return { formatVersion: FORMAT_VERSION, name: fallbackName, author: '', icon: null, entryMenuId: null }
  }
  const name = str(value.name, fallbackName).trim() || fallbackName
  const icon = str(value.icon).trim()
  return {
    formatVersion: num(value.formatVersion, FORMAT_VERSION),
    name,
    author: str(value.author).trim(),
    icon: icon || null,
    entryMenuId: idOrNull(value.entryMenuId)
  }
}

export function minimumCanvasSize(type: 'menu' | 'composite' | 'scene'): { width: number; height: number } {
  if (type === 'composite' || type === 'scene') return { width: MIN_COMPOSITE_SIZE, height: MIN_COMPOSITE_SIZE }
  return { width: MIN_MENU_WIDTH, height: MIN_MENU_HEIGHT }
}

function roundRect(rect: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  }
}

export function clampRect(
  rect: { x: number; y: number; width: number; height: number },
  menuWidth: number,
  menuHeight: number
): { x: number; y: number; width: number; height: number } {
  const limitW = Math.max(1, Math.round(menuWidth))
  const limitH = Math.max(1, Math.round(menuHeight))
  const width = Math.min(limitW, Math.max(1, Math.round(rect.width)))
  const height = Math.min(limitH, Math.max(1, Math.round(rect.height)))
  const x = Math.min(limitW - width, Math.max(0, Math.round(rect.x)))
  const y = Math.min(limitH - height, Math.max(0, Math.round(rect.y)))
  return { x, y, width, height }
}

export function rectPercent(
  rect: { x: number; y: number; width: number; height: number },
  menuWidth: number,
  menuHeight: number
): { x: number; y: number; width: number; height: number } {
  const width = menuWidth > 0 ? menuWidth : 1
  const height = menuHeight > 0 ? menuHeight : 1
  return {
    x: (rect.x / width) * 100,
    y: (rect.y / height) * 100,
    width: (rect.width / width) * 100,
    height: (rect.height / height) * 100
  }
}

function pixelsFromPercent(
  rect: { x: number; y: number; width: number; height: number },
  menuWidth: number,
  menuHeight: number
): { x: number; y: number; width: number; height: number } {
  return clampRect(
    {
      x: (rect.x / 100) * menuWidth,
      y: (rect.y / 100) * menuHeight,
      width: (rect.width / 100) * menuWidth,
      height: (rect.height / 100) * menuHeight
    },
    menuWidth,
    menuHeight
  )
}

function defaultPixels(x: number, y: number, width: number, height: number): { x: number; y: number; width: number; height: number } {
  return pixelsFromPercent({ x, y, width, height }, DEFAULT_MENU_WIDTH, DEFAULT_MENU_HEIGHT)
}

function componentNames(components: MenuComponent[]): string[] {
  return components.map((component) => component.name)
}

export function createImageComponent(components: MenuComponent[]): ImageComponent {
  const shift = (components.length % 5) * 3
  return {
    id: createId(),
    type: 'image',
    name: uniqueName(componentNames(components), 'Image'),
    handle: '',
    scriptId: null,
    script: '',
    properties: {},
    ...defaultPixels(8 + shift, 8 + shift, 32, 28),
    imageId: null,
    fit: 'stretch',
    tint: '#ffffff',
    visible: true
  }
}

function componentBase(components: MenuComponent[], label: string, rect: { x: number; y: number; width: number; height: number }): ComponentBase {
  const shift = (components.length % 5) * 3
  return {
    id: createId(),
    name: uniqueName(componentNames(components), label),
    handle: '',
    scriptId: null,
    script: '',
    properties: {},
    tint: '#ffffff',
    visible: true,
    ...defaultPixels(rect.x, rect.y + shift, rect.width, rect.height)
  }
}

function styled<T extends { fontFamily: string; fontSize: number; color: string }>(value: Omit<T, 'fontFamily' | 'fontSize' | 'color'>): T {
  return { ...value, fontFamily: DEFAULT_FONT_FAMILY, fontSize: 40, color: '#ffffff' } as T
}

function starterOptions(): ChoiceOption[] {
  return [
    { id: createId(), label: 'First' },
    { id: createId(), label: 'Second' }
  ]
}

export function createMenuComponent(type: MenuComponent['type'], components: MenuComponent[]): MenuComponent {
  if (type === 'image') return createImageComponent(components)
  if (type === 'button') return createButtonComponent(components)
  if (type === 'panel') return createPanelComponent(components)
  if (type === 'label') return createLabelComponent(components)
  if (type === 'meter') return createMeterComponent(components)
  if (type === 'text') return createTextComponent(components)
  if (type === 'textarea') return createTextAreaComponent(components)
  if (type === 'toggle') return createToggleComponent(components)
  if (type === 'toggleGroup') return createToggleGroupComponent(components)
  if (type === 'slider') return createSliderComponent(components)
  if (type === 'pageViewer') return createPageViewerComponent(components)
  if (type === 'composite') return createCompositeComponent(components)
  if (type === 'sceneViewer') return createSceneViewerComponent(components)
  if (type === 'tile') return createTileComponent(components)
  if (type === 'tilemap') return createTilemapComponent(components)
  if (type === 'collider') return createColliderComponent(components)
  if (type === 'zField') return createZFieldComponent(components)
  return createDropdownComponent(components)
}

export function createTileComponent(components: MenuComponent[]): TileComponent {
  return { ...componentBase(components, 'Tile', { x: 8, y: 8, width: 16, height: 16 }), type: 'tile', tilesetId: null, tileX: 0, tileY: 0 }
}

export function createTilemapComponent(components: MenuComponent[]): TilemapComponent {
  return {
    ...componentBase(components, 'Tilemap', { x: 8, y: 8, width: 64, height: 64 }),
    type: 'tilemap',
    tilesetId: null,
    tileWidth: 16,
    tileHeight: 16,
    cells: []
  }
}

export function createColliderComponent(components: MenuComponent[]): ColliderComponent {
  return { ...componentBase(components, 'Collider', { x: 8, y: 8, width: 32, height: 32 }), type: 'collider', shape: 'square', tags: [], enabled: true }
}

export function createZFieldComponent(components: MenuComponent[]): ZFieldComponent {
  return { ...componentBase(components, 'Z field', { x: 0, y: 0, width: 0, height: 0 }), type: 'zField', children: [] }
}

export function createCompositeComponent(components: MenuComponent[]): CompositeComponent {
  return {
    ...componentBase(components, 'Composite', { x: 8, y: 8, width: 48, height: 36 }),
    type: 'composite',
    compositeId: null,
    enabled: true
  }
}

export function createSceneViewerComponent(components: MenuComponent[]): SceneViewerComponent {
  return {
    ...componentBase(components, 'Scene viewer', { x: 8, y: 8, width: 48, height: 32 }),
    type: 'sceneViewer',
    sceneId: null,
    viewX: 0,
    viewY: 0,
    scale: 1,
    scaleWithViewer: true
  }
}

export function createPanelComponent(components: MenuComponent[]): PanelComponent {
  return { ...componentBase(components, 'Panel', { x: 4, y: 4, width: 92, height: 40 }), type: 'panel', panelId: null }
}

export function createLabelComponent(components: MenuComponent[]): LabelComponent {
  return styled({
    ...componentBase(components, 'Label', { x: 8, y: 8, width: 40, height: 10 }),
    type: 'label',
    text: 'Label',
    alignX: 'middle',
    alignY: 'center',
    panelId: null
  })
}

function labelAlignX(value: unknown): LabelAlignX {
  return value === 'left' || value === 'right' ? value : 'middle'
}

function labelAlignY(value: unknown): LabelAlignY {
  return value === 'top' || value === 'bottom' ? value : 'center'
}

export function createMeterComponent(components: MenuComponent[]): MeterComponent {
  return {
    ...componentBase(components, 'Meter', { x: 8, y: 8, width: 40, height: 8 }),
    type: 'meter',
    min: 0,
    max: 100,
    value: 40,
    fillColor: '#e8946a',
    panelId: null
  }
}

export function createTextComponent(components: MenuComponent[]): TextComponent {
  return styled({
    ...componentBase(components, 'Text', { x: 8, y: 8, width: 40, height: 10 }),
    type: 'text',
    value: '',
    placeholder: '',
    panelId: null
  })
}

export function createTextAreaComponent(components: MenuComponent[]): TextAreaComponent {
  return styled({
    ...componentBase(components, 'Text area', { x: 8, y: 8, width: 48, height: 24 }),
    type: 'textarea',
    value: '',
    placeholder: '',
    panelId: null
  })
}

export function createToggleComponent(components: MenuComponent[]): ToggleComponent {
  return styled({
    ...componentBase(components, 'Toggle', { x: 8, y: 8, width: 36, height: 10 }),
    type: 'toggle',
    value: false,
    text: 'Option',
    panelId: null
  })
}

export function createToggleGroupComponent(components: MenuComponent[]): ToggleGroupComponent {
  return styled({
    ...componentBase(components, 'Toggle group', { x: 8, y: 8, width: 36, height: 28 }),
    type: 'toggleGroup',
    mode: 'one',
    options: starterOptions(),
    selected: [],
    panelId: null
  })
}

export function createSliderComponent(components: MenuComponent[]): SliderComponent {
  return {
    ...componentBase(components, 'Slider', { x: 8, y: 8, width: 48, height: 8 }),
    type: 'slider',
    min: 0,
    max: 100,
    step: 1,
    value: 0,
    fillColor: '#e8946a',
    panelId: null
  }
}

export function createDropdownComponent(components: MenuComponent[]): DropdownComponent {
  const options = starterOptions()
  return styled({
    ...componentBase(components, 'Dropdown', { x: 8, y: 8, width: 36, height: 10 }),
    type: 'dropdown',
    options,
    value: options[0]?.id ?? '',
    panelId: null
  })
}

export function createPageViewerComponent(components: MenuComponent[]): PageViewerComponent {
  return {
    ...componentBase(components, 'Page viewer', { x: 6, y: 6, width: 88, height: 78 }),
    type: 'pageViewer',
    bookId: null,
    pagePath: '',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: 4,
    color: '#f4efe8',
    panelId: null,
    progressive: false,
    rate: DEFAULT_TEXT_RATE,
    scrollable: true
  }
}

export function duplicateMenuComponent(
  source: MenuComponent,
  siblings: MenuComponent[],
  menuWidth = DEFAULT_MENU_WIDTH,
  menuHeight = DEFAULT_MENU_HEIGHT,
  handlePool?: readonly MenuComponent[]
): MenuComponent {
  const copy = JSON.parse(JSON.stringify(source)) as MenuComponent
  const handles = canvasComponents(handlePool ?? siblings).map((item) => item.handle)
  copy.id = createId()
  copy.name = uniqueName(
    siblings.map((item) => item.name),
    `${source.name} copy`
  )
  copy.handle = copy.handle ? uniqueScriptHandle(copy.handle, handles) : ''
  if (copy.handle) handles.push(copy.handle)
  copy.x = source.x + 16
  copy.y = source.y + 16
  copy.width = source.width
  copy.height = source.height
  if (copy.type === 'zField') {
    copy.x = 0
    copy.y = 0
    copy.width = 0
    copy.height = 0
    copy.children = copy.children.flatMap((child) => {
      if (child.type === 'zField') return []
      const next = { ...child, id: createId() }
      if (next.handle) {
        next.handle = uniqueScriptHandle(next.handle, handles)
        handles.push(next.handle)
      }
      return [next]
    })
  }
  return copy
}

function uniqueScriptHandle(desired: string, existing: string[]): string {
  const used = new Set(existing.filter(Boolean))
  if (!used.has(desired) && isScriptHandle(desired)) return desired
  let index = 2
  while (used.has(`${desired}${index}`)) index += 1
  const next = `${desired}${index}`
  return isScriptHandle(next) ? next : ''
}

export function createButtonComponent(components: MenuComponent[]): ButtonComponent {
  const shift = (components.length % 5) * 3
  return {
    id: createId(),
    type: 'button',
    name: uniqueName(componentNames(components), 'Button'),
    handle: '',
    scriptId: null,
    script: '',
    properties: {},
    ...defaultPixels(30, 70 - shift, 40, 12),
    buttonId: null,
    enabled: true,
    text: '',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: 40,
    color: '#ffffff',
    tint: '#ffffff',
    visible: true
  }
}

export type FileCopy = { fromRelative: string; toRelative: string }

export type DuplicatePlan = {
  folders: string[]
  assets: Asset[]
  copies: FileCopy[]
}

function cloneComponents(components: MenuComponent[], ids: () => string): MenuComponent[] {
  return components.map((component) => ({ ...component, id: ids() }))
}

function remapId(id: string | null, idMap: Map<string, string>): string | null {
  if (!id) return null
  return idMap.get(id) ?? id
}

function remapBook(asset: BookAsset, idMap: Map<string, string>): BookAsset {
  const mapRun = (run: PageRun): PageRun => (run.type === 'image' ? { ...run, imageId: remapId(run.imageId, idMap) } : run)
  const mapParagraph = (paragraph: PageParagraph): PageParagraph => ({ ...paragraph, runs: paragraph.runs.map(mapRun) })
  const mapBlock = (block: PageBlock): PageBlock =>
    block.type === 'conditional' ? { ...block, blocks: block.blocks.map(mapParagraph) } : mapParagraph(block)
  return {
    ...asset,
    chapters: asset.chapters.map((chapter) => ({
      ...chapter,
      pages: chapter.pages.map((page) => ({ ...page, blocks: page.blocks.map(mapBlock) }))
    }))
  }
}

export function planDuplicate(input: {
  assets: Asset[]
  folders?: string[]
  targetPath: string
  siblingStems: string[]
  ids?: () => string
}): DuplicatePlan {
  const ids = input.ids ?? createId
  const asset = input.assets.find((item) => item.relativePath === input.targetPath)
  if (!asset) {
    return planFolderDuplicate(input.assets, input.folders ?? [], input.targetPath, input.siblingStems, ids)
  }
  const parent = parentPath(asset.relativePath)
  const stem = uniqueName(input.siblingStems, `${sanitizeFileStem(asset.name)} copy`)
  const next = duplicateAsset(asset, stem, parent, new Map([[asset.id, ids()]]), ids, true)
  const copies: FileCopy[] = []
  if (asset.type === 'image' && asset.file && next.type === 'image' && next.file) {
    copies.push({ fromRelative: asset.file, toRelative: next.file })
  }
  return { folders: [], assets: [next], copies }
}

function planFolderDuplicate(
  assets: Asset[],
  sourceFolders: string[],
  targetPath: string,
  siblingStems: string[],
  ids: () => string
): DuplicatePlan {
  const folderName = targetPath.split('/').pop() ?? 'Folder'
  const parent = parentPath(targetPath)
  const stem = uniqueName(siblingStems, `${sanitizeFileStem(folderName)} copy`)
  const destPrefix = joinPath(parent, stem)
  const contained = assets.filter((asset) => isInside(targetPath, asset.relativePath))
  const idMap = new Map(contained.map((asset) => [asset.id, ids()]))
  const copies: FileCopy[] = []
  const cloned = contained.map((asset) => {
    const relative = replacePrefix(asset.relativePath, targetPath, destPrefix)
    const nextParent = parentPath(relative)
    const nextStem = asset.relativePath.split('/').pop()?.replace(/\.(menu|button|image|script|panel|collection|book|composite|scene|tileset)\.json$/i, '') ?? asset.name
    const next = duplicateAsset(asset, nextStem, nextParent, idMap, ids, false)
    next.relativePath = relative
    next.name = asset.name
    if (asset.type === 'image' && asset.file && next.type === 'image') {
      const inside = isInside(targetPath, asset.file)
      const filename = asset.file.split('/').pop() ?? 'image'
      const file = inside ? replacePrefix(asset.file, targetPath, destPrefix) : joinPath(nextParent, filename)
      next.file = file
      if (file !== asset.file) copies.push({ fromRelative: asset.file, toRelative: file })
    }
    return remapAssetReferences(next, idMap)
  })
  const folders = new Set<string>([destPrefix])
  for (const folder of sourceFolders) {
    if (isInside(targetPath, folder)) folders.add(replacePrefix(folder, targetPath, destPrefix))
  }
  for (const asset of cloned) {
    let current = parentPath(asset.relativePath)
    while (current && (current === destPrefix || isInside(destPrefix, current))) {
      folders.add(current)
      current = parentPath(current)
    }
  }
  return { folders: [...folders], assets: cloned, copies }
}

function duplicateAsset(
  asset: Asset,
  stem: string,
  parent: string,
  idMap: Map<string, string>,
  ids: () => string,
  rename: boolean
): Asset {
  const id = idMap.get(asset.id) ?? ids()
  const name = rename ? stem : asset.name
  const relativePath = joinPath(parent, assetFileName(stem, asset.type))
  if (asset.type === 'image') {
    const extension = asset.file?.includes('.') ? asset.file.slice(asset.file.lastIndexOf('.')) : ''
    return {
      ...asset,
      id,
      name,
      relativePath,
      file: extension ? joinPath(parent, `${sanitizeFileStem(stem)}${extension}`) : null
    }
  }
  if (asset.type === 'book') return { ...JSON.parse(JSON.stringify(asset)) as BookAsset, id, name, relativePath }
  if (asset.type === 'button' || asset.type === 'script' || asset.type === 'panel' || asset.type === 'collection' || asset.type === 'tileset') {
    return { ...asset, id, name, relativePath }
  }
  return {
    ...asset,
    id,
    name,
    relativePath,
    components: cloneComponents(asset.components, ids)
  }
}

function remapAssetReferences(asset: Asset, idMap: Map<string, string>): Asset {
  if (asset.type === 'button') {
    return {
      ...asset,
      states: {
        default: remapId(asset.states.default, idMap),
        pressed: remapId(asset.states.pressed, idMap),
        disabled: remapId(asset.states.disabled, idMap)
      }
    }
  }
  if (asset.type === 'panel' || asset.type === 'tileset') return { ...asset, imageId: remapId(asset.imageId, idMap) }
  if (asset.type === 'book') return remapBook(asset, idMap)
  if (asset.type === 'menu' || asset.type === 'composite' || asset.type === 'scene') {
    return {
      ...asset,
      scriptId: remapId(asset.scriptId, idMap),
      components: asset.components.map((component) => remapComponent(component, idMap))
    }
  }
  return asset
}

function remapComponent(component: MenuComponent, idMap: Map<string, string>): MenuComponent {
  const scriptId = remapId(component.scriptId, idMap)
  if (component.type === 'image') return { ...component, scriptId, imageId: remapId(component.imageId, idMap) }
  if (component.type === 'button') return { ...component, scriptId, buttonId: remapId(component.buttonId, idMap) }
  if (component.type === 'composite') return { ...component, scriptId, compositeId: remapId(component.compositeId, idMap) }
  if (component.type === 'sceneViewer') return { ...component, scriptId, sceneId: remapId(component.sceneId, idMap) }
  if (component.type === 'tile') return { ...component, scriptId, tilesetId: remapId(component.tilesetId, idMap) }
  if (component.type === 'tilemap') {
    return {
      ...component,
      scriptId,
      tilesetId: remapId(component.tilesetId, idMap),
      cells: component.cells.map((cell) => ({ ...cell, tilesetId: remapId(cell.tilesetId, idMap) }))
    }
  }
  if (component.type === 'collider') return { ...component, scriptId }
  if (component.type === 'zField') {
    return {
      ...component,
      scriptId,
      children: component.children.flatMap((child) => (child.type === 'zField' ? [] : [remapComponent(child, idMap)]))
    }
  }
  return { ...component, scriptId, panelId: remapId(component.panelId, idMap) }
}

export function retargetImageFiles(assets: Asset[], fromFolder: string, toFolder: string): ImageAsset[] {
  return assets.flatMap((asset) => {
    if (asset.type !== 'image' || !asset.file || !isInside(fromFolder, asset.file)) return []
    return [{ ...asset, file: replacePrefix(asset.file, fromFolder, toFolder) }]
  })
}

export function exportableAssets(assets: Asset[], mediaPath: (file: string) => string): Asset[] {
  return assets.map((asset) => {
    if (asset.type !== 'image' || !asset.file) return { ...asset, relativePath: '' }
    return { ...asset, relativePath: '', file: mediaPath(asset.file) }
  })
}

export function entryClearedByDelete(entryMenuId: string | null, assets: Asset[], targetPath: string): boolean {
  if (!entryMenuId) return false
  return assets.some(
    (asset) =>
      asset.type === 'menu' &&
      asset.id === entryMenuId &&
      (asset.relativePath === targetPath || isInside(targetPath, asset.relativePath))
  )
}
