import { sceneById } from './sceneCamera'
import type { Asset, CanvasAsset, CompositeAsset, MenuAsset, MenuComponent } from './types'

export type Box = { x: number; y: number; width: number; height: number }

export function normalizeBox(box: Box): Box {
  const width = box.width
  const height = box.height
  return {
    x: width < 0 ? box.x + width : box.x,
    y: height < 0 ? box.y + height : box.y,
    width: Math.abs(width),
    height: Math.abs(height)
  }
}

export type Piece = {
  instanceId: string
  component: MenuComponent
}

export function compositeById(assets: Iterable<Asset>, id: string | null): CompositeAsset | null {
  if (!id) return null
  for (const asset of assets) {
    if (asset.type === 'composite' && asset.id === id) return asset
  }
  return null
}

export function instanceId(parent: string, componentId: string): string {
  return parent ? `${parent}/${componentId}` : componentId
}

export function letterboxScale(slotWidth: number, slotHeight: number, frameWidth: number, frameHeight: number): number {
  if (slotWidth <= 0 || slotHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) return 0
  return Math.min(slotWidth / frameWidth, slotHeight / frameHeight)
}

export function fittedContent(slot: Box, frameWidth: number, frameHeight: number): Box {
  const scale = letterboxScale(slot.width, slot.height, frameWidth, frameHeight)
  if (scale <= 0) return { x: slot.x, y: slot.y, width: 0, height: 0 }
  const width = frameWidth * scale
  const height = frameHeight * scale
  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height
  }
}

export function shiftOrigin(slot: Box, originX: number, originY: number, frameWidth: number, frameHeight: number): Box {
  const scale = letterboxScale(Math.abs(slot.width), Math.abs(slot.height), frameWidth, frameHeight)
  return normalizeBox({
    x: slot.x - originX * scale,
    y: slot.y - originY * scale,
    width: slot.width,
    height: slot.height
  })
}

export function visualRect(component: MenuComponent, assets: Iterable<Asset>): Box {
  const rect = { x: component.x, y: component.y, width: component.width, height: component.height }
  if (component.type !== 'composite') return normalizeBox(rect)
  const composite = compositeById(assets, component.compositeId)
  if (!composite) return normalizeBox(rect)
  return shiftOrigin(rect, composite.originX, composite.originY, composite.width, composite.height)
}

export function storedFromVisual(component: MenuComponent, visual: Box, assets: Iterable<Asset>): Box {
  const box = normalizeBox(visual)
  const signed = visual.width < 0 || visual.height < 0 ? visual : box
  if (component.type !== 'composite') return signed
  const composite = compositeById(assets, component.compositeId)
  if (!composite) return signed
  const scale = letterboxScale(box.width, box.height, composite.width, composite.height)
  return {
    x: box.x + composite.originX * scale,
    y: box.y + composite.originY * scale,
    width: box.width,
    height: box.height
  }
}

export function resolvePiece(menu: MenuAsset, assets: Iterable<Asset>, id: string): Piece | null {
  const shared = /^scene:([^/]+)\/(.+)$/.exec(id)
  if (shared?.[1] && shared[2]) {
    const scene = sceneById(assets, shared[1])
    if (!scene) return null
    return walkPiece(scene.components, shared[2], id, assets)
  }
  return walkPiece(menu.components, id, id, assets)
}

function walkPiece(components: MenuComponent[], id: string, instance: string, assets: Iterable<Asset>): Piece | null {
  const parts = id.split('/').filter(Boolean)
  if (parts.length === 0) return null
  let current = components
  let component: MenuComponent | undefined
  for (let index = 0; index < parts.length; index += 1) {
    component = current.find((item) => item.id === parts[index])
    if (!component) return null
    if (index === parts.length - 1) break
    if (component.type !== 'composite') return null
    const asset = compositeById(assets, component.compositeId)
    if (!asset) return null
    current = asset.components
  }
  return component ? { instanceId: instance, component } : null
}

export function instanceVisible(
  menu: MenuAsset,
  assets: Iterable<Asset>,
  id: string,
  overrides: Record<string, { visible?: boolean } | undefined>
): boolean {
  const parts = id.split('/').filter(Boolean)
  let components = menu.components
  for (let index = 0; index < parts.length; index += 1) {
    const component = components.find((item) => item.id === parts[index])
    if (!component) return false
    const key = parts.slice(0, index + 1).join('/')
    if ((overrides[key]?.visible ?? component.visible) === false) return false
    if (index < parts.length - 1) {
      if (component.type !== 'composite') return false
      const asset = compositeById(assets, component.compositeId)
      if (!asset) return false
      components = asset.components
    }
  }
  return true
}

export function instanceEnabled(
  menu: MenuAsset,
  assets: Iterable<Asset>,
  id: string,
  overrides: Record<string, { enabled?: boolean } | undefined>
): boolean {
  const parts = id.split('/').filter(Boolean)
  let components = menu.components
  let enabled = true
  for (let index = 0; index < parts.length; index += 1) {
    const component = components.find((item) => item.id === parts[index])
    if (!component) return false
    const key = parts.slice(0, index + 1).join('/')
    if (component.type === 'composite' || component.type === 'button') {
      enabled = enabled && (overrides[key]?.enabled ?? component.enabled)
    }
    if (!enabled) return false
    if (index < parts.length - 1) {
      if (component.type !== 'composite') return false
      const asset = compositeById(assets, component.compositeId)
      if (!asset) return false
      components = asset.components
    }
  }
  return enabled
}

export function scenePieceAllows(
  assets: Iterable<Asset>,
  sceneId: string,
  localId: string,
  overrides: Record<string, { visible?: boolean; enabled?: boolean } | undefined>,
  mode: 'visible' | 'enabled'
): boolean {
  const scene = sceneById(assets, sceneId)
  if (!scene) return false
  const parts = localId.split('/').filter(Boolean)
  let components = scene.components
  for (let index = 0; index < parts.length; index += 1) {
    const component = components.find((item) => item.id === parts[index])
    if (!component) return false
    const key = `scene:${sceneId}/${parts.slice(0, index + 1).join('/')}`
    if (mode === 'visible' && (overrides[key]?.visible ?? component.visible) === false) return false
    if (mode === 'enabled' && (component.type === 'button' || component.type === 'composite')) {
      const enabled = component.type === 'button' || component.type === 'composite' ? component.enabled : true
      if ((overrides[key]?.enabled ?? enabled) === false) return false
    }
    if (index < parts.length - 1) {
      if (component.type !== 'composite') return false
      const asset = compositeById(assets, component.compositeId)
      if (!asset) return false
      components = asset.components
    }
  }
  return parts.length > 0
}

export function visitPieces(canvas: CanvasAsset, assets: Iterable<Asset>, visit: (piece: Piece) => void): void {
  const walk = (components: MenuComponent[], parent: string, stack: string[]): void => {
    for (const component of components) {
      const id = instanceId(parent, component.id)
      visit({ instanceId: id, component })
      if (component.type !== 'composite' || !component.compositeId || stack.includes(component.compositeId)) continue
      const asset = compositeById(assets, component.compositeId)
      if (!asset) continue
      walk(asset.components, id, [...stack, component.compositeId])
    }
  }
  walk(canvas.components, '', [])
}

export function compositeBlocked(assets: Iterable<Asset>, hostId: string | null, choiceId: string): boolean {
  if (hostId && (choiceId === hostId || contains(assets, choiceId, hostId, new Set()))) return true
  return hasCycle(assets, choiceId, new Set())
}

function contains(assets: Iterable<Asset>, fromId: string, targetId: string, seen: Set<string>): boolean {
  if (seen.has(fromId)) return false
  seen.add(fromId)
  const asset = compositeById(assets, fromId)
  if (!asset) return false
  for (const component of asset.components) {
    if (component.type !== 'composite' || !component.compositeId) continue
    if (component.compositeId === targetId || contains(assets, component.compositeId, targetId, seen)) return true
  }
  return false
}

function hasCycle(assets: Iterable<Asset>, id: string, seen: Set<string>): boolean {
  if (seen.has(id)) return true
  const asset = compositeById(assets, id)
  if (!asset) return false
  const next = new Set(seen)
  next.add(id)
  for (const component of asset.components) {
    if (component.type === 'composite' && component.compositeId && hasCycle(assets, component.compositeId, next)) return true
  }
  return false
}
