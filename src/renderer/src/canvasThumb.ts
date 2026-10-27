import { reactive } from 'vue'
import { buildScene, nineSliceLayout, snapNineSlice, type SceneNode } from '@shared/scene'
import { isCanvas, type Asset, type CanvasAsset } from '@shared/types'
import type { PageDisplay } from '@shared/books'
import { fileUrl, thumbnailFile } from './thumbs'

const LONG_SIDE = 168
const slots = reactive<Record<string, { stamp: string; url: string }>>({})
const wanted = new Map<string, string>()
const queued = new Set<string>()
const images = new Map<string, Promise<HTMLImageElement | null>>()
let latestAssets: Asset[] = []
const jobs: Array<() => Promise<void>> = []
let pumping = false

export function canvasThumbStamp(canvas: CanvasAsset, assets: Asset[]): string {
  const nodes = buildScene(canvas, assets, { showColliders: false, displayScale: 1 })
  return hash(`${canvas.width}x${canvas.height}:${JSON.stringify(nodes)}`)
}

export function thumbnailUrl(assets: Asset[], id: string | null): string {
  const file = thumbnailFile(assets, id)
  if (file) return fileUrl(file)
  if (!id) return ''
  const asset = assets.find((item) => item.id === id)
  if (!asset || !isCanvas(asset)) return ''
  const stamp = canvasThumbStamp(asset, assets)
  const slot = slots[id]
  if (slot?.stamp === stamp) return slot.url
  if (wanted.get(id) !== stamp) schedule(asset, assets, stamp)
  return ''
}

function schedule(canvas: CanvasAsset, assets: Asset[], stamp: string): void {
  latestAssets = assets
  wanted.set(canvas.id, stamp)
  if (queued.has(canvas.id)) return
  queued.add(canvas.id)
  jobs.push(() => renderQueued(canvas.id))
  void pump()
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    while (jobs.length > 0) {
      const job = jobs.shift()
      if (job) await job()
    }
  } finally {
    pumping = false
    if (jobs.length > 0) void pump()
  }
}

async function renderQueued(id: string): Promise<void> {
  queued.delete(id)
  const stamp = wanted.get(id)
  const asset = latestAssets.find((item) => item.id === id)
  if (!stamp || !asset || !isCanvas(asset)) return
  const url = await renderCanvasThumb(asset, latestAssets)
  if (wanted.get(id) !== stamp) {
    const next = latestAssets.find((item) => item.id === id)
    const nextStamp = wanted.get(id)
    if (next && isCanvas(next) && nextStamp) schedule(next, latestAssets, nextStamp)
    return
  }
  slots[id] = { stamp, url }
}

async function renderCanvasThumb(canvas: CanvasAsset, assets: Asset[]): Promise<string> {
  if (typeof document === 'undefined' || !(canvas.width > 0) || !(canvas.height > 0)) return ''
  const scale = Math.min(LONG_SIDE / canvas.width, LONG_SIDE / canvas.height)
  const cssWidth = Math.max(1, Math.round(canvas.width * scale))
  const cssHeight = Math.max(1, Math.round(canvas.height * scale))
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const view = document.createElement('canvas')
  view.width = Math.max(1, Math.round(cssWidth * dpr))
  view.height = Math.max(1, Math.round(cssHeight * dpr))
  const ctx = view.getContext('2d')
  if (!ctx) return ''
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#14110f'
  ctx.fillRect(0, 0, cssWidth, cssHeight)
  const nodes = buildScene(canvas, assets, { showColliders: false, displayScale: 1 }).filter((node) => node.visible)
  const loaded = await loadImages(nodes)
  for (const node of nodes) {
    const x = (node.x / 100) * cssWidth
    const y = (node.y / 100) * cssHeight
    const w = (node.width / 100) * cssWidth
    const h = (node.height / 100) * cssHeight
    if (!(w > 0.5) || !(h > 0.5)) continue
    drawNode(ctx, node, loaded, x, y, w, h, scale, dpr)
  }
  try {
    return view.toDataURL('image/png')
  } catch {
    return ''
  }
}

function loadImages(nodes: SceneNode[]): Promise<Map<string, HTMLImageElement>> {
  const urls = new Set<string>()
  for (const node of nodes) {
    if (node.imagePath) urls.add(fileUrl(node.imagePath))
    for (const stamp of node.sheet ?? []) {
      if (stamp.imagePath) urls.add(fileUrl(stamp.imagePath))
    }
  }
  return Promise.all([...urls].filter((url) => url.length > 0).map(async (url) => [url, await loadImage(url)] as const)).then((pairs) => {
    const ready = new Map<string, HTMLImageElement>()
    for (const [url, image] of pairs) if (image) ready.set(url, image)
    return ready
  })
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  const existing = images.get(url)
  if (existing) return existing
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image.naturalWidth > 0 ? image : null)
    image.onerror = () => resolve(null)
    image.src = url
  })
  images.set(url, pending)
  return pending
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  images: Map<string, HTMLImageElement>,
  x: number,
  y: number,
  w: number,
  h: number,
  layoutScale: number,
  dpr: number
): void {
  const paint = (target: CanvasRenderingContext2D): void => {
    target.save()
    const clip = insetBox(node.clip, w, h)
    target.beginPath()
    target.rect(clip.x, clip.y, clip.w, clip.h)
    target.clip()
    if (node.flipX || node.flipY) {
      target.translate(w / 2, h / 2)
      target.scale(node.flipX ? -1 : 1, node.flipY ? -1 : 1)
      target.translate(-w / 2, -h / 2)
    }
    paintFace(target, node, images, w, h, layoutScale)
    paintMeter(target, node, w, h)
    paintWords(target, node, w, h)
    target.restore()
  }
  if (node.color.toLowerCase() === '#ffffff') {
    ctx.save()
    ctx.translate(x, y)
    paint(ctx)
    ctx.restore()
    return
  }
  const layer = document.createElement('canvas')
  layer.width = Math.max(1, Math.ceil(w * dpr))
  layer.height = Math.max(1, Math.ceil(h * dpr))
  const layerCtx = layer.getContext('2d')
  if (!layerCtx) return
  layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  layerCtx.imageSmoothingEnabled = false
  paint(layerCtx)
  const mask = document.createElement('canvas')
  mask.width = layer.width
  mask.height = layer.height
  mask.getContext('2d')?.drawImage(layer, 0, 0)
  layerCtx.globalCompositeOperation = 'multiply'
  layerCtx.fillStyle = node.color
  layerCtx.fillRect(0, 0, w, h)
  layerCtx.globalCompositeOperation = 'destination-in'
  layerCtx.setTransform(1, 0, 0, 1, 0, 0)
  layerCtx.drawImage(mask, 0, 0)
  ctx.drawImage(layer, x, y, w, h)
}

function paintFace(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  images: Map<string, HTMLImageElement>,
  w: number,
  h: number,
  layoutScale: number
): void {
  const sheet = node.sheet
  if (sheet && sheet.length > 0) {
    let sheetWidth = 1
    let sheetHeight = 1
    for (const stamp of sheet) {
      sheetWidth = Math.max(sheetWidth, stamp.x + stamp.width)
      sheetHeight = Math.max(sheetHeight, stamp.y + stamp.height)
    }
    const scaleX = w / sheetWidth
    const scaleY = h / sheetHeight
    for (const stamp of sheet) {
      const path = stamp.imagePath ?? node.imagePath
      const image = path ? images.get(fileUrl(path)) : undefined
      if (!image || stamp.crop.width <= 0 || stamp.crop.height <= 0) continue
      ctx.drawImage(
        image,
        stamp.crop.x,
        stamp.crop.y,
        stamp.crop.width,
        stamp.crop.height,
        stamp.x * scaleX,
        stamp.y * scaleY,
        stamp.width * scaleX,
        stamp.height * scaleY
      )
    }
    return
  }
  const image = node.imagePath ? images.get(fileUrl(node.imagePath)) : undefined
  if (image && node.slices) {
    const patches = snapNineSlice(
      nineSliceLayout({
        slices: node.slices,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        boxWidth: w,
        boxHeight: h,
        scaleX: layoutScale,
        scaleY: layoutScale,
        edgeFill: node.edgeFill,
        centerFill: node.centerFill
      }),
      Math.round(w),
      Math.round(h)
    )
    let drawn = 0
    for (const patch of patches) {
      const stepX = patch.tileWidth > 0 ? patch.tileWidth : patch.dw
      const stepY = patch.tileHeight > 0 ? patch.tileHeight : patch.dh
      if (stepX <= 0 || stepY <= 0) continue
      for (let py = 0; py < patch.dh && drawn < 2000; py += stepY) {
        for (let px = 0; px < patch.dw && drawn < 2000; px += stepX) {
          const tileW = Math.min(stepX, patch.dw - px)
          const tileH = Math.min(stepY, patch.dh - py)
          const sourceW = patch.sw * (tileW / stepX)
          const sourceH = patch.sh * (tileH / stepY)
          if (sourceW <= 0 || sourceH <= 0) continue
          ctx.drawImage(image, patch.sx, patch.sy, sourceW, sourceH, patch.dx + px, patch.dy + py, tileW, tileH)
          drawn += 1
        }
      }
    }
    return
  }
  if (image && node.imageFit === 'tile') {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    const pattern = ctx.createPattern(image, 'repeat')
    if (pattern) {
      pattern.setTransform(new DOMMatrix().scale(layoutScale, layoutScale))
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, w, h)
    }
    ctx.restore()
    return
  }
  if (image && node.crop && node.crop.width > 0 && node.crop.height > 0) {
    ctx.drawImage(image, node.crop.x, node.crop.y, node.crop.width, node.crop.height, 0, 0, w, h)
    return
  }
  if (image) {
    ctx.drawImage(image, 0, 0, w, h)
    return
  }
  if (node.missing) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#8a7b70'
    ctx.strokeRect(0.5, 0.5, Math.max(0, w - 1), Math.max(0, h - 1))
  }
}

function paintMeter(ctx: CanvasRenderingContext2D, node: SceneNode, w: number, h: number): void {
  if (node.fill === null) return
  const x = w * 0.08
  const y = h * 0.3
  const width = w * 0.84
  const height = h * 0.4
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = node.fillColor ?? '#e8946a'
  ctx.fillRect(x, y, width * Math.min(1, Math.max(0, node.fill)), height)
}

function paintWords(ctx: CanvasRenderingContext2D, node: SceneNode, w: number, h: number): void {
  const value = node.text?.value || (node.page ? pageText(node.page) : '') || node.missing || ''
  if (!value.trim()) return
  const size = node.text ? (node.text.fontSize / 100) * h : Math.min(14, Math.max(6, h * 0.16))
  if (size < 3) return
  const style = node.text
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  ctx.fillStyle = style?.color ?? '#f6f1ea'
  ctx.font = `${Math.max(1, size)}px ${style?.fontFamily || 'Segoe UI, sans-serif'}`
  ctx.textBaseline = 'top'
  const align = style?.alignX ?? 'left'
  ctx.textAlign = align === 'right' ? 'right' : align === 'middle' ? 'center' : 'left'
  const pad = Math.max(1, w * 0.04)
  const x = align === 'right' ? w - pad : align === 'middle' ? w / 2 : pad
  const lines = value.split('\n').slice(0, 6)
  const lineHeight = size * 1.15
  const block = lineHeight * lines.length
  const alignY = style?.alignY ?? 'top'
  let y = alignY === 'bottom' ? h - block - pad : alignY === 'center' ? (h - block) / 2 : pad
  const limit = Math.max(4, w - pad * 2)
  for (const line of lines) {
    ctx.fillText(fitLine(ctx, line, limit), x, y)
    y += lineHeight
  }
  ctx.restore()
}

function pageText(page: PageDisplay): string {
  if (page.missing) return page.missing
  const lines: string[] = []
  for (const block of page.blocks) {
    const paragraphs = block.type === 'conditional' ? block.blocks : [block]
    for (const paragraph of paragraphs) {
      lines.push(
        paragraph.runs
          .map((run) => (run.type === 'text' ? run.text : run.type === 'input' ? run.value || run.placeholder : ''))
          .join('')
      )
    }
  }
  return lines.join('\n').slice(0, 400)
}

function fitLine(ctx: CanvasRenderingContext2D, line: string, width: number): string {
  if (ctx.measureText(line).width <= width) return line
  let end = line.length
  while (end > 1 && ctx.measureText(`${line.slice(0, end)}…`).width > width) end -= 1
  return `${line.slice(0, end)}…`
}

function insetBox(clip: string | null, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const match = clip ? /^inset\(([-\d.]+)%\s+([-\d.]+)%\s+([-\d.]+)%\s+([-\d.]+)%\)$/.exec(clip) : null
  if (!match) return { x: 0, y: 0, w, h }
  const top = (Number(match[1]) / 100) * h
  const right = (Number(match[2]) / 100) * w
  const bottom = (Number(match[3]) / 100) * h
  const left = (Number(match[4]) / 100) * w
  return { x: left, y: top, w: Math.max(0, w - left - right), h: Math.max(0, h - top - bottom) }
}

function hash(text: string): string {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  return (value >>> 0).toString(16)
}
