import { describe, expect, it } from 'vitest'
import { createAsset, createMenuComponent, parseAsset } from './assets'
import { canvasColliders, containingPoint, overlapping, type WorldCollider } from './collisions'
import { buildScene } from './scene'
import type { ColliderComponent, CompositeAsset, MenuAsset, MenuComponent, SceneAsset } from './types'

function collider(
  id: string,
  tags: string[],
  rect: { x: number; y: number; width: number; height: number },
  shape: 'square' | 'circle' = 'square'
): ColliderComponent {
  const component = createMenuComponent('collider', [])
  if (component.type !== 'collider') throw new Error('collider')
  component.id = id
  component.handle = id
  component.tags = tags
  component.shape = shape
  component.x = rect.x
  component.y = rect.y
  component.width = rect.width
  component.height = rect.height
  return component
}

function placed(components: MenuComponent[], assets: CompositeAsset[] = [], width = 880, height = 495): WorldCollider[] {
  return canvasColliders({ components, width, height, assets, overrides: {}, prefix: '' })
}

describe('colliders', () => {
  it('parses a circle, its tags, and enabled', () => {
    const parsed = parseAsset(
      {
        formatVersion: 2,
        id: 'room',
        type: 'menu',
        name: 'Room',
        width: 320,
        height: 180,
        components: [{ id: 'hit', type: 'collider', name: 'Hit', x: 3, y: 4, width: 5, height: 6, shape: 'circle', tags: [' solid ', ''], enabled: false }]
      },
      'Room.menu.json'
    )
    const hit = parsed.type === 'menu' ? parsed.components[0] : null
    expect(hit).toMatchObject({ type: 'collider', shape: 'circle', tags: ['solid'], enabled: false, x: 3, y: 4, width: 5, height: 6 })
  })

  it('returns overlapping squares and keeps a collider out of its own result', () => {
    const hero = collider('hero', ['body'], { x: 0, y: 0, width: 40, height: 40 })
    const wall = collider('wall', ['solid'], { x: 20, y: 0, width: 40, height: 40 })
    const apart = collider('apart', ['solid'], { x: 80, y: 0, width: 10, height: 10 })
    const world = placed([hero, wall, apart])
    expect(overlapping(world, 'hero', ['solid']).map((hit) => hit.id)).toEqual(['wall'])
    expect(overlapping(world, 'hero', [])).toEqual([])
    expect(overlapping(world, 'hero', ['missing'])).toEqual([])
    expect(overlapping(world, 'wall', ['solid', 'body']).map((hit) => hit.id)).toEqual(['hero'])
    const touch = placed([
      collider('left', ['a'], { x: 0, y: 0, width: 10, height: 10 }),
      collider('right', ['a'], { x: 10, y: 0, width: 10, height: 10 })
    ])
    expect(overlapping(touch, 'left', ['a'])).toHaveLength(1)
  })

  it('tests circles as the ellipse that fills the box', () => {
    const square = collider('square', ['a'], { x: 0, y: 0, width: 10, height: 10 })
    const touching = collider('ball', ['a'], { x: 10, y: 0, width: 10, height: 10 }, 'circle')
    const clear = collider('clear', ['a'], { x: 11, y: 0, width: 10, height: 10 }, 'circle')
    const corner = collider('corner', ['a'], { x: 10, y: 10, width: 20, height: 20 }, 'circle')
    const reach = collider('reach', ['a'], { x: 4, y: 4, width: 20, height: 20 }, 'circle')
    expect(overlapping(placed([square, touching]), 'square', ['a'])).toHaveLength(1)
    expect(overlapping(placed([square, clear]), 'square', ['a'])).toEqual([])
    expect(overlapping(placed([square, corner]), 'square', ['a'])).toEqual([])
    expect(overlapping(placed([square, reach]), 'square', ['a'])).toHaveLength(1)
    const wide = collider('wide', ['a'], { x: -30, y: -5, width: 60, height: 10 }, 'circle')
    const tall = collider('tall', ['a'], { x: -5, y: -30, width: 10, height: 60 }, 'circle')
    const far = collider('far', ['a'], { x: 40, y: -5, width: 60, height: 10 }, 'circle')
    expect(overlapping(placed([wide, tall]), 'wide', ['a'])).toHaveLength(1)
    expect(overlapping(placed([wide, far]), 'wide', ['a'])).toEqual([])
    const left = collider('left', ['a'], { x: 0, y: 0, width: 20, height: 20 }, 'circle')
    const beside = collider('beside', ['a'], { x: 20, y: 0, width: 20, height: 20 }, 'circle')
    const gap = collider('gap', ['a'], { x: 21, y: 0, width: 20, height: 20 }, 'circle')
    expect(overlapping(placed([left, beside]), 'left', ['a'])).toHaveLength(1)
    expect(overlapping(placed([left, gap]), 'left', ['a'])).toEqual([])
    const world = placed([wide])
    expect(containingPoint(world, 0, 0, ['a'])).toHaveLength(1)
    expect(containingPoint(world, 0, 5, ['a'])).toHaveLength(1)
    expect(containingPoint(world, 0, 6, ['a'])).toEqual([])
  })

  it('uses the mirrored box for a negative size and reports the anchor', () => {
    const hit = collider('hit', ['solid'], { x: 30, y: 5, width: -20, height: 10 })
    const world = placed([hit])
    expect(world[0]).toMatchObject({ left: 10, top: 5, width: 20, height: 10, x: 30, y: 5 })
  })

  it('skips a disabled collider and a collider inside a disabled composite, and keeps a hidden one', () => {
    const hidden = collider('hidden', ['solid'], { x: 0, y: 0, width: 10, height: 10 })
    hidden.visible = false
    const off = collider('off', ['solid'], { x: 0, y: 0, width: 10, height: 10 })
    off.enabled = false
    const child = collider('child', ['solid'], { x: 0, y: 0, width: 10, height: 10 })
    const body = createAsset('composite', 'Body', 'Body.composite.json', 'body') as CompositeAsset
    body.width = 40
    body.height = 40
    body.components = [child]
    const slot = createMenuComponent('composite', [])
    if (slot.type !== 'composite') throw new Error('composite')
    slot.id = 'slot'
    slot.compositeId = 'body'
    slot.enabled = false
    slot.x = 0
    slot.y = 0
    slot.width = 40
    slot.height = 40
    const flat = collider('flat', ['solid'], { x: 0, y: 0, width: 0, height: 10 })
    expect(placed([hidden, off, slot, flat], [body]).map((item) => item.id)).toEqual(['hidden'])
    slot.enabled = true
    const moved = canvasColliders({
      components: [slot],
      width: 880,
      height: 495,
      assets: [body],
      overrides: { 'slot/child': { x: 12 } },
      prefix: ''
    })
    expect(moved[0]).toMatchObject({ id: 'slot/child', x: 12, y: 0, left: 12, top: 0 })
  })

  it('places a nested collider in the menu and mirrors it with a flipped composite', () => {
    const child = collider('hit', ['solid'], { x: 10, y: 20, width: 8, height: 8 })
    const body = createAsset('composite', 'Body', 'Body.composite.json', 'body') as CompositeAsset
    body.width = 100
    body.height = 100
    body.components = [child]
    const slot = createMenuComponent('composite', [])
    if (slot.type !== 'composite') throw new Error('composite')
    slot.id = 'slot'
    slot.compositeId = 'body'
    slot.x = 50
    slot.y = 40
    slot.width = 100
    slot.height = 100
    const menu = createAsset('menu', 'Room', 'Room.menu.json', 'room') as MenuAsset
    menu.components = [slot]
    const world = placed(menu.components, [body], menu.width, menu.height)
    expect(world[0]).toMatchObject({ id: 'slot/hit', x: 60, y: 60, left: 60, top: 60, width: 8, height: 8 })
    const node = buildScene(menu, [body], { showColliders: true }).find((item) => item.id === 'slot/hit')
    expect(node?.kind).toBe('collider')
    expect(node?.colliderShape).toBe('square')
    expect((node?.x ?? 0) * menu.width / 100).toBeCloseTo(world[0]?.left ?? 0)
    expect((node?.y ?? 0) * menu.height / 100).toBeCloseTo(world[0]?.top ?? 0)
    expect(buildScene(menu, [body]).some((item) => item.kind === 'collider')).toBe(false)

    slot.width = -100
    const flipped = placed(menu.components, [body], menu.width, menu.height)
    const flippedNode = buildScene(menu, [body], { showColliders: true }).find((item) => item.id === 'slot/hit')
    expect((flippedNode?.x ?? 0) * menu.width / 100).toBeCloseTo(flipped[0]?.left ?? 0)
    expect((flippedNode?.y ?? 0) * menu.height / 100).toBeCloseTo(flipped[0]?.top ?? 0)
    expect(flipped[0]?.x).not.toBe(world[0]?.x)
  })

  it('keeps menu colliders and scene colliders on separate canvases', () => {
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.components = [collider('wall', ['solid'], { x: 0, y: 0, width: 16, height: 16 })]
    const viewer = createMenuComponent('sceneViewer', [])
    if (viewer.type !== 'sceneViewer') throw new Error('viewer')
    viewer.id = 'camera'
    viewer.sceneId = 'town'
    viewer.width = 80
    viewer.height = 80
    const menuHit = collider('hero', ['solid'], { x: 0, y: 0, width: 16, height: 16 })
    const menu = placed([viewer, menuHit], [], 880, 495)
    const scene = canvasColliders({
      components: town.components,
      width: town.width,
      height: town.height,
      assets: [town],
      overrides: {},
      prefix: `scene:${town.id}`
    })
    expect(menu.map((item) => item.id)).toEqual(['hero'])
    expect(scene.map((item) => item.id)).toEqual(['scene:town/wall'])
    expect(containingPoint(menu, 4, 4, ['solid']).map((item) => item.id)).toEqual(['hero'])
    expect(containingPoint(scene, 4, 4, ['solid']).map((item) => item.id)).toEqual(['scene:town/wall'])
  })
})
