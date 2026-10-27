import { findAssetByLocation } from './refs'
import type { Asset, ImageAsset, TileCell, TileSpan, TilesetAsset } from './types'

export type TileCrop = {
  x: number
  y: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
}

export type TileDraw = {
  key: string
  x: number
  y: number
  width: number
  height: number
  crop: TileCrop
}

export type TileStamp = {
  x: number
  y: number
  width: number
  height: number
  crop: { x: number; y: number; width: number; height: number }
}

export function tileSheet(draws: readonly TileDraw[]): { x: number; y: number; width: number; height: number; stamps: TileStamp[] } | null {
  if (draws.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const draw of draws) {
    minX = Math.min(minX, draw.x)
    minY = Math.min(minY, draw.y)
    maxX = Math.max(maxX, draw.x + draw.width)
    maxY = Math.max(maxY, draw.y + draw.height)
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    stamps: draws.map((draw) => ({
      x: draw.x - minX,
      y: draw.y - minY,
      width: draw.width,
      height: draw.height,
      crop: { x: draw.crop.x, y: draw.crop.y, width: draw.crop.width, height: draw.crop.height }
    }))
  }
}

type CellBox = { x: number; y: number; width: number; height: number }

export function tileGrid(tileWidth: number, tileHeight: number, imageWidth: number, imageHeight: number): { cols: number; rows: number } {
  if (tileWidth < 1 || tileHeight < 1 || imageWidth < 1 || imageHeight < 1) return { cols: 0, rows: 0 }
  return { cols: Math.floor(imageWidth / tileWidth), rows: Math.floor(imageHeight / tileHeight) }
}

export function spanFits(span: TileSpan, cols: number, rows: number): boolean {
  return span.width >= 1 && span.height >= 1 && span.x >= 0 && span.y >= 0 && span.x + span.width <= cols && span.y + span.height <= rows
}

export function spansOverlap(left: TileSpan, right: TileSpan): boolean {
  return left.x < right.x + right.width && right.x < left.x + left.width && left.y < right.y + right.height && right.y < left.y + left.height
}

export function mergeAt(merges: readonly TileSpan[], x: number, y: number): TileSpan {
  return merges.find((span) => x >= span.x && y >= span.y && x < span.x + span.width && y < span.y + span.height) ?? { x, y, width: 1, height: 1 }
}

export function keepMerges(merges: readonly TileSpan[], cols: number, rows: number): TileSpan[] {
  return merges.filter((span) => spanFits(span, cols, rows))
}

export function fittedMerges(merges: readonly TileSpan[], tileWidth: number, tileHeight: number, imageWidth: number, imageHeight: number): TileSpan[] {
  if (imageWidth < 1 || imageHeight < 1) return [...merges]
  const grid = tileGrid(tileWidth, tileHeight, imageWidth, imageHeight)
  return keepMerges(merges, grid.cols, grid.rows)
}

export function mapSize(width: number, height: number, tileWidth: number, tileHeight: number): { cols: number; rows: number } {
  return {
    cols: tileWidth > 0 ? Math.max(1, Math.round(Math.abs(width) / tileWidth)) : 1,
    rows: tileHeight > 0 ? Math.max(1, Math.round(Math.abs(height) / tileHeight)) : 1
  }
}

export function snapTileSize(width: number, height: number, tileWidth: number, tileHeight: number): { width: number; height: number } {
  const size = mapSize(width, height, tileWidth, tileHeight)
  return { width: size.cols * Math.max(1, tileWidth), height: size.rows * Math.max(1, tileHeight) }
}

export function pruneCells(cells: readonly TileCell[], cols: number, rows: number): TileCell[] {
  return cells.filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < cols && cell.y < rows)
}

export function readCell(cells: readonly TileCell[], x: number, y: number): TileCell | null {
  return cells.find((cell) => cell.x === x && cell.y === y) ?? null
}

export function paintCell(cells: readonly TileCell[], x: number, y: number, tileX: number, tileY: number): TileCell[] {
  return [...cells.filter((cell) => cell.x !== x || cell.y !== y), { x, y, tileX, tileY }]
}

export function eraseCell(cells: readonly TileCell[], x: number, y: number): TileCell[] {
  return cells.filter((cell) => cell.x !== x || cell.y !== y)
}

export function paintCells(cells: readonly TileCell[], points: readonly { x: number; y: number }[], tileX: number, tileY: number): TileCell[] {
  return points.reduce((current, point) => paintCell(current, point.x, point.y, tileX, tileY), [...cells])
}

export function eraseCells(cells: readonly TileCell[], points: readonly { x: number; y: number }[]): TileCell[] {
  return points.reduce((current, point) => eraseCell(current, point.x, point.y), [...cells])
}

export function lineCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  for (;;) {
    points.push({ x, y })
    if (x === x1 && y === y1) break
    const doubled = err * 2
    if (doubled > -dy) {
      err -= dy
      x += sx
    }
    if (doubled < dx) {
      err += dx
      y += sy
    }
  }
  return points
}

export function fillRegion(
  cells: readonly TileCell[],
  cols: number,
  rows: number,
  x: number,
  y: number,
  paint: { tileX: number; tileY: number } | null
): TileCell[] {
  if (x < 0 || y < 0 || x >= cols || y >= rows) return [...cells]
  const target = readCell(cells, x, y)
  const targetKey = target ? `${target.tileX},${target.tileY}` : ''
  const paintKey = paint ? `${paint.tileX},${paint.tileY}` : ''
  if (targetKey === paintKey) return [...cells]
  const kept = new Map<string, TileCell>()
  for (const cell of cells) {
    if (cell.x >= 0 && cell.y >= 0 && cell.x < cols && cell.y < rows) kept.set(`${cell.x},${cell.y}`, { ...cell })
  }
  const seen = new Set<string>()
  const stack = [{ x, y }]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) break
    const key = `${current.x},${current.y}`
    if (seen.has(key)) continue
    if (current.x < 0 || current.y < 0 || current.x >= cols || current.y >= rows) continue
    const existing = kept.get(key)
    const keyNow = existing ? `${existing.tileX},${existing.tileY}` : ''
    if (keyNow !== targetKey) continue
    seen.add(key)
    if (paint) kept.set(key, { x: current.x, y: current.y, tileX: paint.tileX, tileY: paint.tileY })
    else kept.delete(key)
    stack.push(
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 }
    )
  }
  return [...kept.values()]
}

export function sameTileSize(left: { tileWidth: number; tileHeight: number }, right: { tileWidth: number; tileHeight: number }): boolean {
  return left.tileWidth === right.tileWidth && left.tileHeight === right.tileHeight
}

export function tilesetById(assets: Iterable<Asset>, id: string | null): TilesetAsset | null {
  if (!id) return null
  for (const asset of assets) {
    if (asset.type === 'tileset' && asset.id === id) return asset
  }
  return null
}

export function tilesetFor(tilesetId: string | null, override: { tilesetRef?: string | null } | undefined, assets: Iterable<Asset>): TilesetAsset | null {
  if (override && 'tilesetRef' in override) {
    if (!override.tilesetRef) return null
    const found = findAssetByLocation(assets, override.tilesetRef, 'tileset')
    return found?.type === 'tileset' ? found : null
  }
  return tilesetById(assets, tilesetId)
}

export function imageForTileset(tileset: TilesetAsset, assets: Iterable<Asset>): ImageAsset | null {
  if (!tileset.imageId) return null
  for (const asset of assets) {
    if (asset.type === 'image' && asset.id === tileset.imageId) return asset
  }
  return null
}

export function indexInTileset(tileset: TilesetAsset, image: ImageAsset | null, tileX: number, tileY: number): boolean {
  if (!image) return false
  const grid = tileGrid(tileset.tileWidth, tileset.tileHeight, image.width, image.height)
  return Number.isInteger(tileX) && Number.isInteger(tileY) && tileX >= 0 && tileY >= 0 && tileX < grid.cols && tileY < grid.rows
}

export function placedTile(tileset: TilesetAsset, image: ImageAsset, tileX: number, tileY: number, cell: CellBox): TileDraw | null {
  if (!indexInTileset(tileset, image, tileX, tileY)) return null
  const span = mergeAt(tileset.merges, tileX, tileY)
  return {
    key: `${tileX},${tileY}`,
    x: cell.x + (span.x - tileX) * cell.width,
    y: cell.y + (span.y - tileY) * cell.height,
    width: span.width * cell.width,
    height: span.height * cell.height,
    crop: {
      x: span.x * tileset.tileWidth,
      y: span.y * tileset.tileHeight,
      width: span.width * tileset.tileWidth,
      height: span.height * tileset.tileHeight,
      imageWidth: image.width,
      imageHeight: image.height
    }
  }
}

export function tileDraws(
  tileset: TilesetAsset,
  image: ImageAsset,
  tileX: number,
  tileY: number,
  box: CellBox
): TileDraw[] {
  const draw = placedTile(tileset, image, tileX, tileY, box)
  return draw ? [{ ...draw, key: 'tile' }] : []
}

export function tilemapDraws(tileset: TilesetAsset, image: ImageAsset, cells: readonly TileCell[]): TileDraw[] {
  const ordered = [...cells].sort((left, right) => left.y - right.y || left.x - right.x)
  const draws: TileDraw[] = []
  for (const cell of ordered) {
    const draw = placedTile(tileset, image, cell.tileX, cell.tileY, {
      x: cell.x * tileset.tileWidth,
      y: cell.y * tileset.tileHeight,
      width: tileset.tileWidth,
      height: tileset.tileHeight
    })
    if (draw) draws.push({ ...draw, key: `${cell.x},${cell.y}` })
  }
  return draws
}

function signedTiles(size: number, step: number): number {
  if (!(step > 0)) return Math.round(size)
  const tiles = Math.round(size / step)
  if (tiles === 0) return size < 0 ? -step : step
  return tiles * step
}

export function fitTileSpan(
  rect: { x: number; y: number; width: number; height: number },
  tileWidth: number,
  tileHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: signedTiles(rect.width, tileWidth),
    height: signedTiles(rect.height, tileHeight)
  }
}
