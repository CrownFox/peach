import type { Asset } from '@shared/types'

export function thumbnailFile(assets: Asset[], id: string | null): string | null {
  const asset = assets.find((item) => item.id === id)
  if (!asset) return null
  if (asset.type === 'image') return asset.file
  if (asset.type === 'button' && asset.states.default) {
    const image = assets.find((item) => item.id === asset.states.default && item.type === 'image')
    return image && image.type === 'image' ? image.file : null
  }
  if (asset.type === 'panel' && asset.imageId) {
    const image = assets.find((item) => item.id === asset.imageId && item.type === 'image')
    return image && image.type === 'image' ? image.file : null
  }
  return null
}

export function fileUrl(file: string | null): string {
  return file ? window.peach.assetUrl(file) : ''
}
