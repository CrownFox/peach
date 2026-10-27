import { findAssetByLocation } from './refs'
import type { ComponentOverride } from './overrides'
import type { Asset, SceneAsset, SceneViewerComponent } from './types'

export type SceneBox = { x: number; y: number; width: number; height: number }

export function sceneById(assets: Iterable<Asset>, id: string | null): SceneAsset | null {
  if (!id) return null
  for (const asset of assets) {
    if (asset.type === 'scene' && asset.id === id) return asset
  }
  return null
}

export function sharedSceneId(sceneId: string, localId: string): string {
  return `scene:${sceneId}/${localId}`
}

export function sceneNodeId(viewerId: string, localId: string): string {
  return `${viewerId}::${localId}`
}

export function parseSceneNodeId(id: string): { viewerId: string; localId: string } | null {
  const index = id.indexOf('::')
  if (index <= 0) return null
  const viewerId = id.slice(0, index)
  const localId = id.slice(index + 2)
  if (!viewerId || !localId) return null
  return { viewerId, localId }
}

export function parseSharedSceneId(id: string): { sceneId: string; localId: string } | null {
  const match = /^scene:([^/]+)\/(.+)$/.exec(id)
  if (!match?.[1] || !match[2]) return null
  return { sceneId: match[1], localId: match[2] }
}

export function viewerScene(
  component: SceneViewerComponent,
  override: ComponentOverride | undefined,
  assets: Iterable<Asset>
): SceneAsset | null {
  if (override && 'sceneRef' in override) {
    if (!override.sceneRef) return null
    const asset = findAssetByLocation(assets, override.sceneRef, 'scene')
    return asset?.type === 'scene' ? asset : null
  }
  return sceneById(assets, component.sceneId)
}

export function viewerCamera(
  component: SceneViewerComponent,
  override: ComponentOverride | undefined,
  displayScale: number
): { viewX: number; viewY: number; menuPerScene: number } {
  const viewX = typeof override?.viewX === 'number' ? override.viewX : component.viewX
  const viewY = typeof override?.viewY === 'number' ? override.viewY : component.viewY
  const scale = wholeScale(typeof override?.scale === 'number' ? override.scale : component.scale)
  const screen = displayScale > 0 ? displayScale : 1
  return { viewX, viewY, menuPerScene: component.scaleWithViewer ? scale : scale / screen }
}

export function viewerSize(
  component: SceneViewerComponent,
  override: ComponentOverride | undefined,
  displayScale: number
): { width: number; height: number } {
  const span = viewerCamera(component, override, displayScale).menuPerScene
  const scenePerMenu = span > 0 ? span : 1
  return { width: Math.abs(component.width) / scenePerMenu, height: Math.abs(component.height) / scenePerMenu }
}

export function wholeScale(value: number): number {
  if (!Number.isFinite(value)) return 1
  const whole = Math.floor(value)
  return whole >= 1 ? whole : 1
}

export function boxIntersects(box: SceneBox, view: SceneBox): boolean {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.x < view.x + view.width &&
    box.x + box.width > view.x &&
    box.y < view.y + view.height &&
    box.y + box.height > view.y
  )
}

export function clipInset(box: SceneBox, view: SceneBox): string | null {
  if (box.width <= 0 || box.height <= 0) return null
  const left = Math.max(0, view.x - box.x)
  const top = Math.max(0, view.y - box.y)
  const right = Math.max(0, box.x + box.width - (view.x + view.width))
  const bottom = Math.max(0, box.y + box.height - (view.y + view.height))
  if (left === 0 && top === 0 && right === 0 && bottom === 0) return null
  const l = (left / box.width) * 100
  const t = (top / box.height) * 100
  const r = (right / box.width) * 100
  const b = (bottom / box.height) * 100
  return `inset(${t}% ${r}% ${b}% ${l}%)`
}
