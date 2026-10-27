import type { Asset, MenuComponent } from './types'

function imageSize(assets: Iterable<Asset>, id: string | null): { width: number; height: number } | null {
  if (!id) return null
  for (const asset of assets) {
    if (asset.type === 'image' && asset.id === id && asset.width > 0 && asset.height > 0) {
      return { width: asset.width, height: asset.height }
    }
  }
  return null
}

export function intrinsicSize(component: MenuComponent, assets: Iterable<Asset>): { width: number; height: number } | null {
  if (component.type === 'image') return imageSize(assets, component.imageId)
  if (component.type === 'button') {
    let imageId: string | null = null
    for (const asset of assets) {
      if (asset.type === 'button' && asset.id === component.buttonId) imageId = asset.states.default
    }
    return imageSize(assets, imageId)
  }
  if (component.type === 'panel') {
    let imageId: string | null = null
    for (const asset of assets) {
      if (asset.type === 'panel' && asset.id === component.panelId) imageId = asset.imageId
    }
    return imageSize(assets, imageId)
  }
  if (component.type === 'tile') {
    for (const asset of assets) {
      if (asset.type === 'tileset' && asset.id === component.tilesetId && asset.tileWidth > 0 && asset.tileHeight > 0) {
        return { width: asset.tileWidth, height: asset.tileHeight }
      }
    }
  }
  if (component.type === 'composite') {
    for (const asset of assets) {
      if (asset.type === 'composite' && asset.id === component.compositeId && asset.width > 0 && asset.height > 0) {
        return { width: asset.width, height: asset.height }
      }
    }
  }
  return null
}

export function applyIntrinsicSize(component: MenuComponent, assets: Iterable<Asset>): boolean {
  const size = intrinsicSize(component, assets)
  if (!size) return false
  component.width = Math.round(size.width)
  component.height = Math.round(size.height)
  return true
}
