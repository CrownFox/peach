import { createMenuComponent } from './assets'
import { applyIntrinsicSize } from './intrinsicSize'
import { isScriptHandle } from './handles'
import { findAssetByLocation } from './refs'
import { canvasComponents } from './zField'
import type { Asset, MenuComponent, SceneAsset } from './types'

export type AddedMap = Record<string, MenuComponent[]>

export const spawnKinds = ['composite', 'image', 'button', 'panel', 'scene', 'label', 'text', 'collider'] as const

export type SpawnKind = (typeof spawnKinds)[number]

export function isSpawnKind(value: string): value is SpawnKind {
  return (spawnKinds as readonly string[]).includes(value)
}

export function fieldBin(parent: string, fieldId: string): string {
  return parent ? `${parent}/~${fieldId}` : `~${fieldId}`
}

export function binPlace(key: string): { parent: string; field?: string } {
  if (key.startsWith('~')) return { parent: '', field: key.slice(1) }
  const at = key.lastIndexOf('/~')
  if (at < 0) return { parent: key }
  const field = key.slice(at + 2)
  if (!field || field.includes('/')) return { parent: key }
  return { parent: key.slice(0, at), field }
}

export function canvasList(
  components: readonly MenuComponent[],
  added: AddedMap | undefined,
  parent: string,
  include: boolean
): readonly MenuComponent[] {
  if (!include) return components
  const hosted = components.some((component) => component.type === 'zField' && added?.[fieldBin(parent, component.id)]?.length)
    ? components.map((component) => withFieldAdds(component, added, parent))
    : components
  const extra = added?.[parent]
  if (!extra?.length) return hosted
  return [...hosted, ...extra]
}

function withFieldAdds(component: MenuComponent, added: AddedMap | undefined, parent: string): MenuComponent {
  if (component.type !== 'zField') return component
  const extra = added?.[fieldBin(parent, component.id)]
  if (!extra?.length) return component
  return { ...component, children: [...component.children, ...extra] }
}

export function handleProblem(handle: string): string | null {
  if (handle === 'new') return 'new is reserved.'
  if (!isScriptHandle(handle)) return 'A script id uses letters, numbers, and underscores, and cannot start with a number.'
  return null
}

export function handleFromName(name: string, fallback: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const ident = parts
    .map((part, index) => {
      const lower = part.toLowerCase()
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
  const safe = /^[0-9]/.test(ident) ? `${fallback}${ident}` : ident
  return isScriptHandle(safe) ? safe : fallback
}

export function nextHandle(desired: string, used: ReadonlySet<string>): string {
  const base = isScriptHandle(desired) ? desired : 'piece'
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base}${index}`)) index += 1
  return `${base}${index}`
}

export type SpawnRequest = {
  path?: string | null
  text?: string | null
  shape?: string | null
  handle?: string | null
}

const pathKind = {
  composite: 'composite',
  image: 'image',
  button: 'button',
  panel: 'panel',
  scene: 'scene'
} as const

export function buildSpawned(kind: SpawnKind, request: SpawnRequest, siblings: readonly MenuComponent[], assets: Iterable<Asset>): MenuComponent {
  const used = new Set(canvasComponents(siblings).map((item) => item.handle).filter(Boolean))
  const requested = request.handle
  let handle: string
  if (requested === null || requested === undefined) {
    handle = ''
  } else {
    const problem = handleProblem(requested)
    if (problem) throw new Error(problem)
    if (used.has(requested)) throw new Error('That script id is already used.')
    handle = requested
  }
  if (kind === 'label' || kind === 'text' || kind === 'collider') {
    const component = createMenuComponent(kind, [])
    component.x = 0
    component.y = 0
    if (kind === 'label' && component.type === 'label') component.text = request.text ?? 'Label'
    if (kind === 'text' && component.type === 'text') component.value = request.text ?? ''
    if (kind === 'collider' && component.type === 'collider') {
      const shape = request.shape ?? 'square'
      if (shape !== 'square' && shape !== 'circle') throw new Error('collider expects "square" or "circle".')
      component.shape = shape
    }
    const fallback = kind === 'text' ? 'text' : kind
    component.handle = handle || nextHandle(handleFromName(component.name, fallback), used)
    return component
  }
  const path = request.path
  if (!path) throw new Error(`${kind} expects an asset path.`)
  const asset = findAssetByLocation(assets, path, pathKind[kind])
  if (!asset) throw new Error(`No ${pathKind[kind]} at "${path}".`)
  const type = kind === 'scene' ? 'sceneViewer' : kind
  const component = createMenuComponent(type, [])
  component.x = 0
  component.y = 0
  component.name = asset.name
  if (component.type === 'composite' && asset.type === 'composite') component.compositeId = asset.id
  if (component.type === 'image' && asset.type === 'image') component.imageId = asset.id
  if (component.type === 'button' && asset.type === 'button') component.buttonId = asset.id
  if (component.type === 'panel' && asset.type === 'panel') component.panelId = asset.id
  if (component.type === 'sceneViewer' && asset.type === 'scene') {
    component.sceneId = asset.id
    fitScene(component, asset)
  }
  applyIntrinsicSize(component, assets)
  const fallback = kind === 'scene' ? 'scene' : kind
  component.handle = handle || nextHandle(handleFromName(asset.name, fallback), used)
  return component
}

function fitScene(component: MenuComponent, scene: SceneAsset): void {
  if (component.type !== 'sceneViewer') return
  if (scene.width > 0 && scene.height > 0) {
    component.width = scene.width
    component.height = scene.height
  }
}
