import { describe, expect, it } from 'vitest'
import type { Asset, ButtonAsset, ImageAsset, PanelAsset, TilesetAsset } from '@shared/types'
import { hasThumbnail, thumbnailFile } from './thumbs'

function image(id: string, file: string | null): ImageAsset {
  return { id, type: 'image', name: id, relativePath: `${id}.image.json`, file, width: 32, height: 16, format: 'png' }
}

describe('thumbnails', () => {
  const picture = image('picture', 'picture.png')
  const button: ButtonAsset = {
    id: 'plate',
    type: 'button',
    name: 'Plate',
    relativePath: 'Plate.button.json',
    mode: 'static',
    slices: { left: 0, right: 0, top: 0, bottom: 0 },
    edgeFill: 'stretch',
    centerFill: 'stretch',
    states: { default: 'picture', pressed: null, disabled: null }
  }
  const panel: PanelAsset = {
    id: 'frame',
    type: 'panel',
    name: 'Frame',
    relativePath: 'Frame.panel.json',
    imageId: 'picture',
    slices: { left: 0, right: 0, top: 0, bottom: 0 },
    edgeFill: 'stretch',
    centerFill: 'stretch'
  }
  const tileset: TilesetAsset = {
    id: 'dungeon',
    type: 'tileset',
    name: 'Dungeon',
    relativePath: 'Dungeon.tileset.json',
    imageId: 'picture',
    tileWidth: 16,
    tileHeight: 16,
    merges: []
  }
  const assets: Asset[] = [picture, button, panel, tileset]

  it('uses the picture for an image, button, panel, and tileset', () => {
    expect(hasThumbnail('image')).toBe(true)
    expect(hasThumbnail('button')).toBe(true)
    expect(hasThumbnail('panel')).toBe(true)
    expect(hasThumbnail('tileset')).toBe(true)
    expect(thumbnailFile(assets, 'picture')).toBe('picture.png')
    expect(thumbnailFile(assets, 'plate')).toBe('picture.png')
    expect(thumbnailFile(assets, 'frame')).toBe('picture.png')
    expect(thumbnailFile(assets, 'dungeon')).toBe('picture.png')
  })

  it('keeps a thumbnail slot for menus, scenes, and composites, and a name button for the rest', () => {
    expect(hasThumbnail('menu')).toBe(true)
    expect(hasThumbnail('scene')).toBe(true)
    expect(hasThumbnail('composite')).toBe(true)
    for (const type of ['script', 'book', 'collection'] as const) expect(hasThumbnail(type)).toBe(false)
    expect(thumbnailFile(assets, 'missing')).toBeNull()
    expect(thumbnailFile([{ ...tileset, imageId: null }], 'dungeon')).toBeNull()
  })
})
