import { assetLocation } from './paths'
import type { Asset, AssetType } from './types'

export function findAssetByLocation(assets: Iterable<Asset>, location: string, type?: AssetType): Asset | null {
  for (const asset of assets) {
    if (type && asset.type !== type) continue
    if (assetLocation(asset.relativePath) === location) return asset
  }
  return null
}

export function assetLocationOf(assets: Iterable<Asset>, id: string | null): string | null {
  if (!id) return null
  for (const asset of assets) {
    if (asset.id === id) return assetLocation(asset.relativePath)
  }
  return null
}
