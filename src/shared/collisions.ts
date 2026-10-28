import { compositeById, fittedContent, instanceId, normalizeBox, shiftOrigin, type Box } from './composites'
import type { SceneOverrides } from './overrides'
import { componentSpan, readEnabled } from './runtime'
import type { Asset, ColliderComponent, MenuComponent } from './types'

export type WorldCollider = {
  id: string
  component: ColliderComponent
  shape: 'square' | 'circle'
  tags: string[]
  left: number
  top: number
  width: number
  height: number
  x: number
  y: number
}

type CollectInput = {
  components: readonly MenuComponent[]
  width: number
  height: number
  assets: Iterable<Asset>
  overrides: SceneOverrides
  prefix: string
}

export function canvasColliders(input: CollectInput): WorldCollider[] {
  const found: WorldCollider[] = []
  walk(
    input.components,
    input.width,
    input.height,
    { x: 0, y: 0, width: input.width, height: input.height },
    input.prefix,
    [],
    true,
    false,
    false,
    input.assets,
    input.overrides,
    found
  )
  return found
}

export function overlapping(colliders: readonly WorldCollider[], selfId: string, tags: readonly string[]): WorldCollider[] {
  const wanted = tagSet(tags)
  if (wanted.size === 0) return []
  const self = colliders.find((collider) => collider.id === selfId)
  if (!self) return []
  return colliders.filter((other) => other.id !== selfId && sharesTag(other, wanted) && shapesOverlap(self, other))
}

export function containingPoint(colliders: readonly WorldCollider[], x: number, y: number, tags: readonly string[]): WorldCollider[] {
  const wanted = tagSet(tags)
  if (wanted.size === 0) return []
  return colliders.filter((collider) => sharesTag(collider, wanted) && pointInside(collider, x, y))
}

export function cleanTags(tags: readonly string[] | undefined): string[] {
  if (!tags) return []
  return tags.flatMap((tag) => {
    const trimmed = tag.trim()
    return trimmed ? [trimmed] : []
  })
}

function tagSet(tags: readonly string[]): Set<string> {
  return new Set(cleanTags(tags))
}

function sharesTag(collider: WorldCollider, wanted: Set<string>): boolean {
  return collider.tags.some((tag) => wanted.has(tag))
}

function walk(
  components: readonly MenuComponent[],
  canvasWidth: number,
  canvasHeight: number,
  content: Box,
  parent: string,
  stack: string[],
  ancestorEnabled: boolean,
  flipX: boolean,
  flipY: boolean,
  assets: Iterable<Asset>,
  overrides: SceneOverrides,
  found: WorldCollider[]
): void {
  const scaleX = canvasWidth > 0 ? content.width / canvasWidth : 0
  const scaleY = canvasHeight > 0 ? content.height / canvasHeight : 0
  for (const component of components) {
    const id = instanceId(parent, component.id)
    const placed = overrides[id]
    const span = componentSpan(component, placed)
    const signed = {
      x: content.x + span.x * scaleX,
      y: content.y + span.y * scaleY,
      width: span.width * scaleX,
      height: span.height * scaleY
    }
    const drawFlipX = flipX !== span.width < 0
    const drawFlipY = flipY !== span.height < 0
    if (component.type === 'zField') {
      const fieldEnabled = ancestorEnabled && readEnabled(component, placed)
      walk(component.children, canvasWidth, canvasHeight, content, parent, stack, fieldEnabled, flipX, flipY, assets, overrides, found)
      continue
    }
    if (component.type === 'sceneViewer') continue
    if (component.type === 'composite') {
      const composite = compositeById(assets, component.compositeId)
      const enabled = ancestorEnabled && readEnabled(component, placed)
      if (!composite || !enabled || stack.includes(composite.id)) continue
      const placedSlot = reflectBox(
        shiftOrigin(signed, composite.originX, composite.originY, composite.width, composite.height),
        content,
        flipX,
        flipY
      )
      walk(
        composite.components,
        composite.width,
        composite.height,
        fittedContent(placedSlot, composite.width, composite.height),
        id,
        [...stack, composite.id],
        enabled,
        drawFlipX,
        drawFlipY,
        assets,
        overrides,
        found
      )
      continue
    }
    if (component.type !== 'collider') continue
    const enabled = ancestorEnabled && readEnabled(component, placed)
    if (!enabled) continue
    const box = reflectBox(normalizeBox(signed), content, flipX, flipY)
    if (!(box.width > 0) || !(box.height > 0)) continue
    const anchor = reflectPoint({ x: signed.x, y: signed.y }, content, flipX, flipY)
    found.push({
      id,
      component,
      shape: component.shape,
      tags: cleanTags(placed?.tags ?? component.tags),
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
      x: anchor.x,
      y: anchor.y
    })
  }
}

function reflectBox(box: Box, frame: Box, flipX: boolean, flipY: boolean): Box {
  if (!flipX && !flipY) return box
  return {
    x: flipX ? frame.x + frame.width - (box.x - frame.x) - box.width : box.x,
    y: flipY ? frame.y + frame.height - (box.y - frame.y) - box.height : box.y,
    width: box.width,
    height: box.height
  }
}

function reflectPoint(point: { x: number; y: number }, frame: Box, flipX: boolean, flipY: boolean): { x: number; y: number } {
  return {
    x: flipX ? frame.x + frame.width - (point.x - frame.x) : point.x,
    y: flipY ? frame.y + frame.height - (point.y - frame.y) : point.y
  }
}

type Oval = { cx: number; cy: number; rx: number; ry: number }

function shapesOverlap(a: WorldCollider, b: WorldCollider): boolean {
  if (a.shape === 'square' && b.shape === 'square') return boxesTouch(a, b)
  if (a.shape === 'circle' && b.shape === 'circle') return ovalsOverlap(ovalOf(a), ovalOf(b))
  const circle = a.shape === 'circle' ? a : b
  const square = circle === a ? b : a
  return rectContainsOval(square, ovalOf(circle))
}

function pointInside(collider: WorldCollider, x: number, y: number): boolean {
  if (collider.shape === 'square') {
    return x >= collider.left && x <= collider.left + collider.width && y >= collider.top && y <= collider.top + collider.height
  }
  return pointInOval(x, y, ovalOf(collider))
}

function boxesTouch(a: WorldCollider, b: WorldCollider): boolean {
  return a.left <= b.left + b.width && b.left <= a.left + a.width && a.top <= b.top + b.height && b.top <= a.top + a.height
}

function ovalOf(collider: WorldCollider): Oval {
  return {
    cx: collider.left + collider.width / 2,
    cy: collider.top + collider.height / 2,
    rx: collider.width / 2,
    ry: collider.height / 2
  }
}

function pointInOval(x: number, y: number, oval: Oval): boolean {
  if (!(oval.rx > 0) || !(oval.ry > 0)) return false
  const nx = (x - oval.cx) / oval.rx
  const ny = (y - oval.cy) / oval.ry
  return nx * nx + ny * ny <= 1
}

function rectContainsOval(rect: WorldCollider, oval: Oval): boolean {
  const x = Math.min(rect.left + rect.width, Math.max(rect.left, oval.cx))
  const y = Math.min(rect.top + rect.height, Math.max(rect.top, oval.cy))
  return pointInOval(x, y, oval)
}

function ovalsOverlap(a: Oval, b: Oval): boolean {
  if (!(a.rx > 0) || !(a.ry > 0) || !(b.rx > 0) || !(b.ry > 0)) return false
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  if ((dx * dx) / (a.rx * a.rx) + (dy * dy) / (a.ry * a.ry) <= 1) return true
  if ((dx * dx) / (b.rx * b.rx) + (dy * dy) / (b.ry * b.ry) <= 1) return true
  const ux = dx / a.rx
  const uy = dy / a.ry
  return distanceToEllipse(ux, uy, b.rx / a.rx, b.ry / a.ry) <= 1 + 1e-6
}

function distanceToEllipse(px: number, py: number, radiusX: number, radiusY: number): number {
  const x = Math.abs(px)
  const y = Math.abs(py)
  if ((x * x) / (radiusX * radiusX) + (y * y) / (radiusY * radiusY) <= 1) return 0
  const score = (theta: number): number => {
    const ex = radiusX * Math.cos(theta)
    const ey = radiusY * Math.sin(theta)
    const dx = ex - x
    const dy = ey - y
    return dx * dx + dy * dy
  }
  let best = 0
  let bestScore = score(0)
  const steps = 64
  const step = (Math.PI * 2) / steps
  for (let index = 1; index < steps; index += 1) {
    const theta = index * step
    const value = score(theta)
    if (value < bestScore) {
      best = theta
      bestScore = value
    }
  }
  let left = best - step
  let right = best + step
  for (let index = 0; index < 28; index += 1) {
    const span = right - left
    const first = left + span / 3
    const second = right - span / 3
    if (score(first) < score(second)) right = second
    else left = first
  }
  return Math.sqrt(score((left + right) / 2))
}
