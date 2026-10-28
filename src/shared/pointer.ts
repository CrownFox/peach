import { fittedContent, instanceId, normalizeBox, shiftOrigin, type Box } from './composites'
import { componentSpan, readEnabled } from './runtime'
import { fitFrame } from './scene'
import { viewerCamera, viewerScene } from './sceneCamera'
import type { Asset, MenuAsset, MenuComponent } from './types'
import { orderZChildren } from './zField'
import type { SceneOverrides } from './overrides'

export type Point = { x: number; y: number }

export type MouseTarget = {
  kind: 'menu' | 'scene' | 'composite' | 'component'
  id: string
  name: string
}

export function menuPoint(
  viewport: Point,
  viewportSize: { width: number; height: number },
  menuWidth: number,
  menuHeight: number
): Point {
  const fitted = fitFrame(viewportSize.width, viewportSize.height, menuWidth, menuHeight)
  const scaleX = menuWidth > 0 ? fitted.width / menuWidth : 0
  const scaleY = menuHeight > 0 ? fitted.height / menuHeight : 0
  const originX = (viewportSize.width - fitted.width) / 2
  const originY = (viewportSize.height - fitted.height) / 2
  return {
    x: scaleX !== 0 ? (viewport.x - originX) / scaleX : 0,
    y: scaleY !== 0 ? (viewport.y - originY) / scaleY : 0
  }
}

function unflipPoint(point: Point, frame: Box, flipX: boolean, flipY: boolean): Point {
  return {
    x: flipX ? frame.x + frame.width - (point.x - frame.x) : point.x,
    y: flipY ? frame.y + frame.height - (point.y - frame.y) : point.y
  }
}

export function pointInComposite(
  parent: Point,
  slot: Box,
  canvasWidth: number,
  canvasHeight: number,
  originX: number,
  originY: number,
  flipX: boolean,
  flipY: boolean
): Point {
  const placed = shiftOrigin(slot, originX, originY, canvasWidth, canvasHeight)
  const content = fittedContent(placed, canvasWidth, canvasHeight)
  const local = unflipPoint(parent, content, flipX, flipY)
  const scaleX = canvasWidth > 0 ? content.width / canvasWidth : 0
  const scaleY = canvasHeight > 0 ? content.height / canvasHeight : 0
  return {
    x: scaleX !== 0 ? (local.x - content.x) / scaleX : 0,
    y: scaleY !== 0 ? (local.y - content.y) / scaleY : 0
  }
}

export function pointInScene(
  parent: Point,
  view: Box,
  viewX: number,
  viewY: number,
  menuPerScene: number,
  flipX: boolean,
  flipY: boolean
): Point {
  const local = unflipPoint(parent, view, flipX, flipY)
  const span = menuPerScene > 0 ? menuPerScene : 1
  return {
    x: viewX + (local.x - view.x) / span,
    y: viewY + (local.y - view.y) / span
  }
}

function containsPoint(span: Box, point: Point): boolean {
  const box = normalizeBox(span)
  return box.width > 0 && box.height > 0 && point.x >= box.x && point.y >= box.y && point.x < box.x + box.width && point.y < box.y + box.height
}

export type PointerSurvey = {
  targets: MouseTarget[]
  compositePoint: Map<string, Point>
  scenePoint: Map<string, Point>
}

export function surveyPointer(
  menu: MenuAsset,
  assets: Iterable<Asset>,
  overrides: SceneOverrides,
  point: Point,
  displayScale = 1
): PointerSurvey {
  const byId = new Map<string, Asset>()
  for (const asset of assets) byId.set(asset.id, asset)
  const compositePoint = new Map<string, Point>()
  const scenePick = new Map<string, { point: Point; over: boolean }>()
  const hit: { component: MouseTarget | null; chain: MouseTarget[] } = { component: null, chain: [] }
  let region: MouseTarget[] = []

  const visit = (
    components: readonly MenuComponent[],
    parent: string,
    cursor: Point,
    ancestors: MouseTarget[],
    stack: string[],
    interactive: boolean
  ): void => {
    for (const component of components) {
      const id = instanceId(parent, component.id)
      const placed = overrides[id]
      const span = componentSpan(component, placed)
      const shown = placed?.visible ?? component.visible
      const enabled = readEnabled(component, placed)
      const live = interactive && shown && enabled
      if (component.type === 'zField') {
        visit(orderZChildren(component.children, parent, overrides), parent, cursor, ancestors, stack, live)
        continue
      }
      if (component.type === 'composite') {
        const asset = component.compositeId ? byId.get(component.compositeId) : undefined
        if (!asset || asset.type !== 'composite' || stack.includes(asset.id)) continue
        const local = pointInComposite(cursor, span, asset.width, asset.height, asset.originX, asset.originY, span.width < 0, span.height < 0)
        compositePoint.set(id, local)
        const target: MouseTarget = { kind: 'composite', id, name: asset.name }
        const next = [...ancestors, target]
        const visual = shiftOrigin(span, asset.originX, asset.originY, asset.width, asset.height)
        if (live && containsPoint(visual, cursor)) region = next
        visit(asset.components, id, local, next, [...stack, asset.id], live)
        continue
      }
      if (component.type === 'sceneViewer') {
        const view = normalizeBox(span)
        const over = live && containsPoint(view, cursor)
        if (over) {
          hit.component = { kind: 'component', id, name: component.name }
          hit.chain = ancestors
        }
        const scene = viewerScene(component, placed, byId.values())
        if (scene && shown) {
          const camera = viewerCamera(component, placed, displayScale)
          const local = pointInScene(cursor, view, camera.viewX, camera.viewY, camera.menuPerScene, span.width < 0, span.height < 0)
          const prev = scenePick.get(scene.id)
          if (!prev || over || !prev.over) scenePick.set(scene.id, { point: local, over })
          if (over) {
            const target: MouseTarget = { kind: 'scene', id: scene.id, name: scene.name }
            region = [...ancestors, target]
            const marked = hit.component
            visit(scene.components, `scene:${scene.id}`, local, [...ancestors, target], stack, live)
            if (hit.component === marked) hit.chain = [...ancestors, target]
          }
        }
        continue
      }
      if (component.type === 'collider' || !live) continue
      if (containsPoint(span, cursor)) {
        hit.component = { kind: 'component', id, name: component.name }
        hit.chain = ancestors
      }
    }
  }

  visit(menu.components, '', point, [], [], true)
  const scenePoint = new Map<string, Point>()
  for (const [id, picked] of scenePick) scenePoint.set(id, picked.point)
  const targets: MouseTarget[] = []
  if (hit.component) targets.push(hit.component)
  const chain = hit.component ? hit.chain : region
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const target = chain[index]
    if (target) targets.push(target)
  }
  targets.push({ kind: 'menu', id: menu.id, name: menu.name })
  return { targets, compositePoint, scenePoint }
}
