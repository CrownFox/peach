export const MIN_CANVAS_ZOOM = 0.1
export const MAX_CANVAS_ZOOM = 16
export const CANVAS_GRID = 22
export const MIDDLE_DOUBLE_CLICK_MS = 500
export const MIDDLE_DOUBLE_CLICK_SLOP = 8

export function isMiddleDoubleClick(
  previous: { time: number; x: number; y: number } | null,
  time: number,
  x: number,
  y: number
): boolean {
  if (!previous) return false
  const elapsed = time - previous.time
  if (elapsed < 0 || elapsed > MIDDLE_DOUBLE_CLICK_MS) return false
  return Math.hypot(x - previous.x, y - previous.y) <= MIDDLE_DOUBLE_CLICK_SLOP
}

export type CanvasView = {
  panX: number
  panY: number
  zoom: number
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom))
}

export function zoomFromWheel(zoom: number, deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  return clampZoom(zoom * Math.exp(-pixels * 0.0015))
}

export function zoomAt(view: CanvasView, cursorX: number, cursorY: number, nextZoom: number): CanvasView {
  const zoom = clampZoom(nextZoom)
  const scale = view.zoom === 0 ? 1 : zoom / view.zoom
  return {
    zoom,
    panX: cursorX - (cursorX - view.panX) * scale,
    panY: cursorY - (cursorY - view.panY) * scale
  }
}

export function panBy(view: CanvasView, dx: number, dy: number): CanvasView {
  return { ...view, panX: view.panX + dx, panY: view.panY + dy }
}

export function clientToWorld(view: CanvasView, localX: number, localY: number): { x: number; y: number } {
  const zoom = view.zoom || 1
  return { x: (localX - view.panX) / zoom, y: (localY - view.panY) / zoom }
}

export function layoutPoint(
  offsetX: number,
  offsetY: number,
  screenWidth: number,
  screenHeight: number,
  layoutWidth: number,
  layoutHeight: number
): { x: number; y: number } {
  const scaleX = screenWidth > 0 ? layoutWidth / screenWidth : 1
  const scaleY = screenHeight > 0 ? layoutHeight / screenHeight : 1
  return { x: offsetX * scaleX, y: offsetY * scaleY }
}

export function centerContent(viewWidth: number, viewHeight: number, contentWidth: number, contentHeight: number, zoom = 1): CanvasView {
  const scale = clampZoom(zoom)
  return {
    zoom: scale,
    panX: (viewWidth - contentWidth * scale) / 2,
    panY: (viewHeight - contentHeight * scale) / 2
  }
}

export function fitContent(viewWidth: number, viewHeight: number, contentWidth: number, contentHeight: number): CanvasView {
  const innerWidth = Math.max(1, viewWidth - 48)
  const innerHeight = Math.max(1, viewHeight - 48)
  const zoom = clampZoom(Math.min(innerWidth / Math.max(1, contentWidth), innerHeight / Math.max(1, contentHeight)))
  return centerContent(viewWidth, viewHeight, contentWidth, contentHeight, zoom)
}
