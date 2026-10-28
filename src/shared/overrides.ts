import { ownsZ, resolvePiece } from './composites'
import { componentColor } from './color'
import { readShared, writeShared } from './runtime'
import { assetLocation } from './paths'
import { findAssetByLocation } from './refs'
import type { Asset, ButtonAsset, MenuAsset, MenuComponent, TileCell, ToggleGroupComponent } from './types'

export type ScriptValue = string | number | boolean | string[] | null

export type ComponentOverride = {
  text?: string
  enabled?: boolean
  imageRef?: string
  buttonRef?: string
  panelRef?: string
  defaultImage?: string
  pressedImage?: string
  disabledImage?: string
  value?: string | number | boolean | string[]
  min?: number
  max?: number
  bookRef?: string | null
  pagePath?: string
  pageBook?: number
  pageInputs?: Record<string, string>
  tint?: string
  visible?: boolean
  x?: number
  y?: number
  z?: number
  viewX?: number
  viewY?: number
  scale?: number
  width?: number
  height?: number
  sceneRef?: string | null
  tilesetRef?: string | null
  tileX?: number
  tileY?: number
  cells?: TileCell[]
  tags?: string[]
  progressive?: boolean
  rate?: number
  scrollable?: boolean
}

export type SceneOverrides = Record<string, ComponentOverride>

const IMAGE_FIELDS = {
  defaultImage: 'default',
  pressedImage: 'pressed',
  disabledImage: 'disabled'
} as const

type ImageField = keyof typeof IMAGE_FIELDS

export function clampNumber(value: number, min: number, max: number, step: number): number {
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  const snapped = step > 0 ? low + Math.round((value - low) / step) * step : value
  const bounded = Math.min(high, Math.max(low, snapped))
  return step > 0 ? Math.round(bounded * 1000) / 1000 : bounded
}

export function rangeNumbers(
  component: { min: number; max: number; value: number; step?: number },
  override: ComponentOverride | undefined
): { min: number; max: number; value: number; step: number } {
  const min = typeof override?.min === 'number' ? override.min : component.min
  const max = typeof override?.max === 'number' ? override.max : component.max
  const step = component.step === undefined ? 0 : component.step > 0 ? component.step : 1
  const raw = typeof override?.value === 'number' ? override.value : component.value
  return { min, max, step, value: clampNumber(raw, min, max, step) }
}

export function dropdownSelection(component: { value: string }, override: ComponentOverride | undefined): string {
  return typeof override?.value === 'string' ? override.value : component.value
}

export function groupSelection(component: ToggleGroupComponent, override: ComponentOverride | undefined): string[] {
  if (component.mode === 'one') {
    const id = typeof override?.value === 'string' ? override.value : (component.selected[0] ?? '')
    return id ? [id] : []
  }
  if (Array.isArray(override?.value)) return override.value.filter((item): item is string => typeof item === 'string')
  return component.selected
}

export function readComponentProperty(
  component: MenuComponent,
  override: ComponentOverride | undefined,
  assets: Iterable<Asset>,
  key: string,
  displayScale = 1
): ScriptValue {
  const shared = readShared(component, override, key, displayScale)
  if (shared !== undefined) return shared
  if ((component.type === 'button' || component.type === 'label' || component.type === 'toggle') && key === 'text') {
    return override?.text ?? component.text
  }
  if (component.type === 'collider' && key === 'tags') return cleanTags(override?.tags ?? component.tags)
  if (component.type === 'collider' && key === 'shape') return component.shape
  if (component.type === 'image' && key === 'image') {
    if (override && 'imageRef' in override) return override.imageRef ?? null
    return locationOf(assets, component.imageId)
  }
  if (component.type === 'button' && key === 'button') {
    if (override && 'buttonRef' in override) return override.buttonRef ?? null
    return locationOf(assets, component.buttonId)
  }
  if (component.type === 'button' && isImageField(key)) {
    if (override && override[key] !== undefined) return override[key] ?? null
    const button = resolvedButton(component, override, assets)
    return locationOf(assets, button?.states[IMAGE_FIELDS[key]] ?? null)
  }
  if (usesPanel(component) && key === 'panel') {
    if (override && 'panelRef' in override) return override.panelRef ?? null
    return locationOf(assets, component.panelId)
  }
  if (component.type === 'pageViewer' && key === 'page') return override?.pagePath ?? component.pagePath
  if (component.type === 'pageViewer' && key === 'progressive') return override?.progressive ?? component.progressive
  if (component.type === 'pageViewer' && key === 'scrollable') return override?.scrollable ?? component.scrollable
  if (component.type === 'pageViewer' && key === 'rate') {
    const rate = override?.rate ?? component.rate
    return rate > 0 ? rate : 1
  }
  if (component.type === 'pageViewer' && key === 'book') {
    if (override?.pageBook !== undefined) return null
    if (override && 'bookRef' in override) return override.bookRef ?? null
    return locationOf(assets, component.bookId)
  }
  if ((component.type === 'slider' || component.type === 'meter') && (key === 'min' || key === 'max' || key === 'value')) {
    const range = rangeNumbers(component, override)
    return range[key]
  }
  if (key === 'value') return readControlValue(component, override)
  if (component.type === 'sceneViewer' && key === 'viewX') return typeof override?.viewX === 'number' ? override.viewX : component.viewX
  if (component.type === 'sceneViewer' && key === 'viewY') return typeof override?.viewY === 'number' ? override.viewY : component.viewY
  if (component.type === 'sceneViewer' && key === 'scale') {
    return typeof override?.scale === 'number' ? override.scale : component.scale
  }
  if (component.type === 'sceneViewer' && key === 'scene') {
    if (override && 'sceneRef' in override) return override.sceneRef ?? null
    return locationOf(assets, component.sceneId)
  }
  if (component.type === 'tile' && key === 'tileset') {
    if (override && 'tilesetRef' in override) return override.tilesetRef ?? null
    return locationOf(assets, component.tilesetId)
  }
  if (component.type === 'tile' && key === 'tileX') return typeof override?.tileX === 'number' ? override.tileX : component.tileX
  if (component.type === 'tile' && key === 'tileY') return typeof override?.tileY === 'number' ? override.tileY : component.tileY
  return null
}

export function writeComponentProperty(
  menu: MenuAsset,
  componentId: string,
  overrides: SceneOverrides,
  key: string,
  value: ScriptValue,
  assets: Iterable<Asset>
): void {
  const found = resolvePiece(menu, assets, componentId)
  if (!found) throw new Error('That component is no longer on this menu.')
  const component = found.component
  const current: ComponentOverride = { ...(overrides[componentId] ?? {}) }
  if (writeShared(component, current, key, value, assets)) {
    overrides[componentId] = current
    return
  }
  if (value === null && component.type === 'pageViewer' && key === 'book') {
    delete current.bookRef
    delete current.pageBook
    current.pageInputs = {}
    overrides[componentId] = current
    return
  }
  if (value === null && component.type === 'pageViewer' && key === 'page') {
    delete current.pagePath
    current.pageInputs = {}
    overrides[componentId] = current
    return
  }
  if (key === 'z') {
    if (!ownsZ(menu, assets, componentId)) throw new Error('z is only available on a component inside a Z field.')
    if (value === null) {
      delete current.z
      overrides[componentId] = current
      return
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('z expects a number.')
    current.z = value
    overrides[componentId] = current
    return
  }
  if (value === null) {
    delete current[fieldKey(component, key)]
    overrides[componentId] = current
    return
  }
  assignProperty(component, current, key, value, assets)
  overrides[componentId] = current
}

function readControlValue(component: MenuComponent, override: ComponentOverride | undefined): ScriptValue {
  if (component.type === 'text' || component.type === 'textarea') {
    return typeof override?.value === 'string' ? override.value : component.value
  }
  if (component.type === 'toggle') return typeof override?.value === 'boolean' ? override.value : component.value
  if (component.type === 'dropdown') {
    const selected = dropdownSelection(component, override)
    return selected.length > 0 ? selected : null
  }
  if (component.type === 'toggleGroup') {
    const selected = groupSelection(component, override)
    if (component.mode === 'one') return selected[0] ?? null
    return selected
  }
  return null
}

function assignProperty(
  component: MenuComponent,
  current: ComponentOverride,
  key: string,
  value: Exclude<ScriptValue, null>,
  assets: Iterable<Asset>
): void {
  if (component.type === 'zField' && (key === 'x' || key === 'y')) {
    throw new Error('A Z field has no position. Set z on the components inside it.')
  }
  if ((component.type === 'button' || component.type === 'label' || component.type === 'toggle') && key === 'text') {
    if (typeof value !== 'string') throw new Error('text expects text.')
    current.text = value
    return
  }
  if ((component.type === 'button' || component.type === 'composite' || component.type === 'collider') && key === 'enabled') {
    if (typeof value !== 'boolean') throw new Error('enabled expects true or false.')
    current.enabled = value
    return
  }
  if (component.type === 'collider' && key === 'tags') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error('tags expects a list of text.')
    current.tags = value.flatMap((item) => {
      const trimmed = item.trim()
      return trimmed ? [trimmed] : []
    })
    return
  }
  if (component.type === 'image' && key === 'image') {
    current.imageRef = expectAsset(assets, value, 'image')
    return
  }
  if (component.type === 'button' && key === 'button') {
    current.buttonRef = expectAsset(assets, value, 'button')
    return
  }
  if (component.type === 'button' && isImageField(key)) {
    current[key] = expectAsset(assets, value, 'image')
    return
  }
  if (usesPanel(component) && key === 'panel') {
    current.panelRef = expectAsset(assets, value, 'panel')
    return
  }
  if (component.type === 'pageViewer' && key === 'book') {
    current.bookRef = expectAsset(assets, value, 'book')
    delete current.pageBook
    current.pageInputs = {}
    return
  }
  if (component.type === 'pageViewer' && key === 'page') {
    if (typeof value !== 'string') throw new Error('page expects text.')
    current.pagePath = value
    current.pageInputs = {}
    return
  }
  if (component.type === 'pageViewer' && key === 'progressive') {
    if (typeof value !== 'boolean') throw new Error('progressive expects true or false.')
    current.progressive = value
    return
  }
  if (component.type === 'pageViewer' && key === 'scrollable') {
    if (typeof value !== 'boolean') throw new Error('scrollable expects true or false.')
    current.scrollable = value
    return
  }
  if (component.type === 'pageViewer' && key === 'rate') {
    if (typeof value !== 'number' || !(value > 0)) throw new Error('rate expects a number above 0.')
    current.rate = value
    return
  }
  if ((component.type === 'slider' || component.type === 'meter') && (key === 'min' || key === 'max')) {
    if (typeof value !== 'number') throw new Error(`${key} expects a number.`)
    current[key] = value
    if (typeof current.value === 'number') current.value = rangeNumbers(component, current).value
    return
  }
  if (key === 'value') {
    current.value = controlValue(component, current, value)
    return
  }
  if (key === 'color') {
    if (typeof value !== 'string') throw new Error('color expects a color, such as "#ff8800".')
    const color = componentColor(value, '')
    if (!color) throw new Error('color expects a color, such as "#ff8800".')
    current.tint = color
    return
  }
  if (key === 'visible') {
    if (typeof value !== 'boolean') throw new Error('visible expects true or false.')
    current.visible = value
    return
  }
  if (key === 'x' || key === 'y') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} expects a number.`)
    current[key] = value
    return
  }
  if (component.type === 'sceneViewer' && (key === 'viewX' || key === 'viewY')) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} expects a number.`)
    current[key] = value
    return
  }
  if (component.type === 'sceneViewer' && key === 'scale') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error('scale expects a whole number, 1 or more.')
    current.scale = value
    return
  }
  if (component.type === 'sceneViewer' && key === 'scene') {
    current.sceneRef = expectAsset(assets, value, 'scene')
    return
  }
  throw new Error(`Cannot set ${key} on this ${component.type}.`)
}

function controlValue(component: MenuComponent, current: ComponentOverride, value: Exclude<ScriptValue, null>): string | number | boolean | string[] {
  if (component.type === 'text' || component.type === 'textarea') {
    if (typeof value !== 'string') throw new Error('value expects text.')
    return value
  }
  if (component.type === 'toggle') {
    if (typeof value !== 'boolean') throw new Error('value expects true or false.')
    return value
  }
  if (component.type === 'slider' || component.type === 'meter') {
    if (typeof value !== 'number') throw new Error('value expects a number.')
    const range = rangeNumbers(component, current)
    return clampNumber(value, range.min, range.max, range.step)
  }
  if (component.type === 'dropdown') {
    if (typeof value !== 'string') throw new Error('value expects an option id.')
    if (value && !component.options.some((option) => option.id === value)) throw new Error('That option is not in the list.')
    return value
  }
  if (component.type === 'toggleGroup') return groupWrite(component, value)
  throw new Error(`Cannot set value on this ${component.type}.`)
}

function groupWrite(component: ToggleGroupComponent, value: Exclude<ScriptValue, null>): string | string[] {
  const known = (id: string): boolean => component.options.some((option) => option.id === id)
  if (component.mode === 'one') {
    if (typeof value !== 'string') throw new Error('value expects the id of one option.')
    if (value && !known(value)) throw new Error('That option is not in the list.')
    return value
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error('value expects a list of option ids.')
  for (const id of value) {
    if (!known(id)) throw new Error('That option is not in the list.')
  }
  return [...value]
}

function fieldKey(component: MenuComponent, key: string): keyof ComponentOverride {
  if (component.type === 'image' && key === 'image') return 'imageRef'
  if (component.type === 'button' && key === 'button') return 'buttonRef'
  if (usesPanel(component) && key === 'panel') return 'panelRef'
  if (component.type === 'pageViewer' && key === 'book') return 'bookRef'
  if (component.type === 'pageViewer' && key === 'page') return 'pagePath'
  if (component.type === 'pageViewer' && key === 'progressive') return 'progressive'
  if (component.type === 'pageViewer' && key === 'scrollable') return 'scrollable'
  if (component.type === 'pageViewer' && key === 'rate') return 'rate'
  if (key === 'text' && (component.type === 'button' || component.type === 'label' || component.type === 'toggle')) return 'text'
  if (key === 'enabled' && (component.type === 'button' || component.type === 'composite' || component.type === 'collider')) return 'enabled'
  if (component.type === 'collider' && key === 'tags') return 'tags'
  if (isImageField(key) && component.type === 'button') return key
  if (key === 'value' && acceptsValue(component)) return 'value'
  if ((key === 'min' || key === 'max') && (component.type === 'slider' || component.type === 'meter')) return key
  if (key === 'color') return 'tint'
  if (key === 'visible') return 'visible'
  if (key === 'x' || key === 'y') return key
  if (component.type === 'sceneViewer' && (key === 'viewX' || key === 'viewY' || key === 'scale')) return key
  if (component.type === 'sceneViewer' && key === 'scene') return 'sceneRef'
  throw new Error(`Cannot set ${key} on this ${component.type}.`)
}

function acceptsValue(component: MenuComponent): boolean {
  return (
    component.type === 'text' ||
    component.type === 'textarea' ||
    component.type === 'toggle' ||
    component.type === 'toggleGroup' ||
    component.type === 'slider' ||
    component.type === 'dropdown' ||
    component.type === 'meter'
  )
}

function usesPanel(component: MenuComponent): component is Exclude<MenuComponent, { type: 'image' | 'button' | 'composite' | 'sceneViewer' | 'tile' | 'tilemap' | 'collider' | 'zField' }> {
  return component.type !== 'image' && component.type !== 'button' && component.type !== 'composite' && component.type !== 'sceneViewer' && component.type !== 'tile' && component.type !== 'tilemap' && component.type !== 'collider' && component.type !== 'zField'
}

function cleanTags(tags: readonly string[]): string[] {
  return tags.flatMap((tag) => {
    const trimmed = tag.trim()
    return trimmed ? [trimmed] : []
  })
}

function isImageField(key: string): key is ImageField {
  return key === 'defaultImage' || key === 'pressedImage' || key === 'disabledImage'
}

function expectAsset(assets: Iterable<Asset>, value: Exclude<ScriptValue, null>, type: 'image' | 'button' | 'panel' | 'book' | 'scene'): string {
  if (typeof value !== 'string' || !value) throw new Error(`A ${type} path is required.`)
  if (!findAssetByLocation(assets, value, type)) throw new Error(`No ${type} at "${value}".`)
  return value
}

function locationOf(assets: Iterable<Asset>, id: string | null): string | null {
  if (!id) return null
  for (const asset of assets) {
    if (asset.id === id) return assetLocation(asset.relativePath)
  }
  return null
}

function resolvedButton(
  component: Extract<MenuComponent, { type: 'button' }>,
  override: ComponentOverride | undefined,
  assets: Iterable<Asset>
): ButtonAsset | null {
  if (override?.buttonRef !== undefined) {
    const asset = findAssetByLocation(assets, override.buttonRef, 'button')
    return asset?.type === 'button' ? asset : null
  }
  return buttonAsset(assets, component.buttonId)
}

function buttonAsset(assets: Iterable<Asset>, id: string | null): ButtonAsset | null {
  if (!id) return null
  for (const asset of assets) {
    if (asset.id === id && asset.type === 'button') return asset
  }
  return null
}
