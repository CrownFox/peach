import type { Asset, AssetType } from '@shared/types'

const THUMBNAIL_TYPES = new Set<AssetType>(['image', 'button', 'panel', 'tileset', 'menu', 'scene', 'composite'])

export function hasThumbnail(type: AssetType): boolean {
  return THUMBNAIL_TYPES.has(type)
}

function imageFile(assets: Asset[], id: string | null): string | null {
  if (!id) return null
  const image = assets.find((item) => item.id === id && item.type === 'image')
  return image?.type === 'image' ? image.file : null
}

export function thumbnailFile(assets: Asset[], id: string | null): string | null {
  const asset = assets.find((item) => item.id === id)
  if (!asset || !hasThumbnail(asset.type)) return null
  if (asset.type === 'image') return asset.file
  if (asset.type === 'button') return imageFile(assets, asset.states.default)
  if (asset.type === 'panel') return imageFile(assets, asset.imageId)
  if (asset.type === 'tileset') return imageFile(assets, asset.imageId)
  return null
}

export function fileUrl(file: string | null): string {
  return file ? window.peach.assetUrl(file) : ''
}
