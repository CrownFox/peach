import { describe, expect, it } from 'vitest'
import { createAsset, createMenuComponent } from '@shared/assets'
import type { MenuAsset, SceneAsset } from '@shared/types'
import { canvasThumbStamp } from './canvasThumb'

describe('canvas thumbnails', () => {
  it('keeps the cached picture until the canvas or a scene it shows changes', () => {
    const scene = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    const hero = createMenuComponent('label', [])
    if (hero.type !== 'label') throw new Error('label')
    hero.text = 'Hero'
    scene.components = [hero]
    const viewer = createMenuComponent('sceneViewer', [])
    if (viewer.type !== 'sceneViewer') throw new Error('scene viewer')
    viewer.sceneId = scene.id
    const menu = createAsset('menu', 'Main', 'Main.menu.json', 'main') as MenuAsset
    menu.components = [viewer]
    const assets = [menu, scene]
    const menuStamp = canvasThumbStamp(menu, assets)
    const sceneStamp = canvasThumbStamp(scene, assets)
    menu.script = 'function onLoad()\nend\n'
    expect(canvasThumbStamp(menu, assets)).toBe(menuStamp)
    hero.x = 48
    expect(canvasThumbStamp(menu, assets)).not.toBe(menuStamp)
    expect(canvasThumbStamp(scene, assets)).not.toBe(sceneStamp)
  })
})
