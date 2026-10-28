import { describe, expect, it } from 'vitest'
import { createAsset, createMenuComponent } from './assets'
import { pointInComposite, pointInScene, surveyPointer } from './pointer'
import type { CompositeAsset, MenuAsset, SceneAsset } from './types'

describe('pointer position', () => {
  it('puts a composite point back in that canvas, including origin, scale, and letterbox', () => {
    const slot = { x: 40, y: 30, width: 200, height: 100 }
    const origin = pointInComposite({ x: 40, y: 30 }, slot, 100, 50, 10, 0, false, false)
    expect(origin).toEqual({ x: 10, y: 0 })
    const letterbox = pointInComposite({ x: 0, y: 25 }, { x: 0, y: 0, width: 100, height: 100 }, 100, 50, 0, 0, false, false)
    expect(letterbox).toEqual({ x: 0, y: 0 })
  })

  it('puts a scene point back through the viewer scale', () => {
    const scene = pointInScene({ x: 14, y: 24 }, { x: 10, y: 20, width: 100, height: 50 }, 5, 7, 2, false, false)
    expect(scene).toEqual({ x: 7, y: 9 })
  })

  it('sends the pointer to the piece, then its composite, then the menu', () => {
    const mark = createMenuComponent('label', [])
    mark.id = 'mark'
    mark.x = 10
    mark.y = 10
    mark.width = 5
    mark.height = 5
    const card = createAsset('composite', 'Card', 'Card.composite.json', 'card') as CompositeAsset
    card.width = 40
    card.height = 20
    card.components = [mark]
    const slot = createMenuComponent('composite', [])
    if (slot.type !== 'composite') throw new Error('slot')
    slot.id = 'card'
    slot.handle = 'card'
    slot.compositeId = 'card'
    slot.x = 100
    slot.y = 50
    slot.width = 40
    slot.height = 20
    const menu = createAsset('menu', 'Main', 'Main.menu.json', 'main') as MenuAsset
    menu.components = [slot]
    const overPiece = surveyPointer(menu, [menu, card], {}, { x: 110, y: 60 })
    expect(overPiece.targets.map((target) => target.kind + ':' + target.id)).toEqual(['component:card/mark', 'composite:card', 'menu:main'])
    expect(overPiece.compositePoint.get('card')).toEqual({ x: 10, y: 10 })
    const overSlot = surveyPointer(menu, [menu, card], {}, { x: 130, y: 60 })
    expect(overSlot.targets.map((target) => target.kind)).toEqual(['composite', 'menu'])
  })

  it('reads a scene through the viewer the pointer is over', () => {
    const hero = createMenuComponent('label', [])
    hero.id = 'hero'
    hero.x = 6
    hero.y = 8
    hero.width = 4
    hero.height = 4
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.components = [hero]
    const camera = createMenuComponent('sceneViewer', [])
    if (camera.type !== 'sceneViewer') throw new Error('viewer')
    camera.id = 'camera'
    camera.sceneId = 'town'
    camera.x = 10
    camera.y = 20
    camera.width = 100
    camera.height = 50
    camera.scale = 2
    camera.viewX = 5
    camera.viewY = 7
    const menu = createAsset('menu', 'Main', 'Main.menu.json', 'main') as MenuAsset
    menu.components = [camera]
    const survey = surveyPointer(menu, [menu, town], {}, { x: 14, y: 24 })
    expect(survey.scenePoint.get('town')).toEqual({ x: 7, y: 9 })
    expect(survey.targets.map((target) => `${target.kind}:${target.id}`)).toEqual(['component:scene:town/hero', 'scene:town', 'menu:main'])
  })
})
