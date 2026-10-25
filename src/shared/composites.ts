import type { Asset, CanvasAsset, CompositeAsset, MenuAsset, MenuComponent } from './types'

export type Box = { x: number; y: number; width: number; height: number }

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

export function fittedContent(slot: Box, frameWidth: number, frameHeight: number): Box {
  if (slot.width <= 0 || slot.height <= 0 || frameWidth <= 0 || frameHeight <= 0) {
    return { x: slot.x, y: slot.y, width: 0, height: 0 }
  }
  const scale = Math.min(slot.width / frameWidth, slot.height / frameHeight)
  const width = frameWidth * scale
  const height = frameHeight * scale
  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height
  }
}

export function resolvePiece(menu: MenuAsset, assets: Iterable<Asset>, id: string): Piece | null {
  const parts = id.split('/').filter(Boolean)
  if (parts.length === 0) return null
  let components = menu.components
  let component: MenuComponent | undefined
  for (let index = 0; index < parts.length; index += 1) {
    component = components.find((item) => item.id === parts[index])
    if (!component) return null
    if (index === parts.length - 1) break
    if (component.type !== 'composite') return null
    const asset = compositeById(assets, component.compositeId)
    if (!asset) return null
    components = asset.components
  }
  return component ? { instanceId: id, component } : null
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
