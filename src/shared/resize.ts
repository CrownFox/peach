export type Rect = { x: number; y: number; width: number; height: number }

export function resizeRect(start: Rect, dx: number, dy: number, handle: string, shift: boolean): Rect {
  if (!handle) return { x: start.x + dx, y: start.y + dy, width: start.width, height: start.height }
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  let width = start.width
  let height = start.height
  if (handle.includes('e')) width = start.width + dx
  if (handle.includes('w')) width = start.width - dx
  if (handle.includes('s')) height = start.height + dy
  if (handle.includes('n')) height = start.height - dy
  if (shift && start.width > 0 && start.height > 0 && (horizontal || vertical)) {
    const aspect = start.width / start.height
    if (horizontal && vertical) {
      const sx = width / start.width
      const sy = height / start.height
      const scale = Math.abs(sx) >= Math.abs(sy) ? sx : sy
      width = start.width * scale
      height = start.height * scale
    } else if (horizontal) {
      height = width / aspect
    } else {
      width = height * aspect
    }
  }
  return anchor(start, handle, width, height, shift)
}

function snapStep(value: number, step: number): number {
  if (!(step > 0)) return value
  return Math.round(value / step) * step
}

function wholeTiles(size: number, step: number): number {
  if (!(step > 0)) return size
  const tiles = Math.round(size / step)
  if (tiles === 0) return size < 0 ? -step : step
  return tiles * step
}

function keepStep(span: number, step: number): number {
  if (!(step > 0)) return span
  if (span < 0) return Math.min(span, -step)
  return Math.max(span, step)
}

function anchor(start: Rect, handle: string, width: number, height: number, shift: boolean): Rect {
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  const x = handle.includes('w') ? start.x + start.width - width : start.x
  const y = handle.includes('n') ? start.y + start.height - height : start.y
  return {
    x: shift && vertical && !horizontal ? start.x + (start.width - width) / 2 : x,
    y: shift && horizontal && !vertical ? start.y + (start.height - height) / 2 : y,
    width,
    height
  }
}

export function snapToGrid(start: Rect, next: Rect, handle: string, stepX: number, stepY: number, shift: boolean): Rect {
  if (!(stepX > 0) || !(stepY > 0)) return next
  if (!handle) return { ...next, x: snapStep(next.x, stepX), y: snapStep(next.y, stepY) }
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  if (!shift) {
    let x = next.x
    let y = next.y
    let width = next.width
    let height = next.height
    if (handle.includes('e')) width = keepStep(snapStep(next.x + next.width, stepX) - next.x, stepX)
    if (handle.includes('w')) {
      const right = next.x + next.width
      x = snapStep(next.x, stepX)
      width = keepStep(right - x, stepX)
    }
    if (handle.includes('s')) height = keepStep(snapStep(next.y + next.height, stepY) - next.y, stepY)
    if (handle.includes('n')) {
      const bottom = next.y + next.height
      y = snapStep(next.y, stepY)
      height = keepStep(bottom - y, stepY)
    }
    if (!horizontal) {
      x = start.x
      width = start.width
    }
    if (!vertical) {
      y = start.y
      height = start.height
    }
    return { x, y, width, height }
  }
  const aspect = start.width > 0 && start.height > 0 ? start.width / start.height : 1
  const xEdge = handle.includes('w') ? next.x : next.x + next.width
  const yEdge = handle.includes('n') ? next.y : next.y + next.height
  const xDelta = horizontal ? Math.abs(snapStep(xEdge, stepX) - xEdge) : Number.POSITIVE_INFINITY
  const yDelta = vertical ? Math.abs(snapStep(yEdge, stepY) - yEdge) : Number.POSITIVE_INFINITY
  if (horizontal && xDelta <= yDelta) {
    const edge = snapStep(xEdge, stepX)
    const width = keepStep(handle.includes('w') ? start.x + start.width - edge : edge - start.x, stepX)
    return anchor(start, handle, width, keepStep(width / aspect, stepY), true)
  }
  const edge = snapStep(yEdge, stepY)
  const height = keepStep(handle.includes('n') ? start.y + start.height - edge : edge - start.y, stepY)
  return anchor(start, handle, keepStep(height * aspect, stepX), height, true)
}

export function snapTilemapSize(start: Rect, next: Rect, handle: string, tileWidth: number, tileHeight: number, shift: boolean): Rect {
  if (!handle || !(tileWidth > 0) || !(tileHeight > 0)) return next
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  const widthStep = horizontal ? wholeTiles(next.width, tileWidth) : start.width
  const heightStep = vertical ? wholeTiles(next.height, tileHeight) : start.height
  const aspect = start.width > 0 && start.height > 0 ? start.width / start.height : 1
  if (shift && horizontal && vertical) {
    const xDelta = Math.abs(widthStep - next.width)
    const yDelta = Math.abs(heightStep - next.height)
    if (xDelta <= yDelta) return anchor(start, handle, widthStep, wholeTiles(widthStep / aspect, tileHeight), true)
    return anchor(start, handle, wholeTiles(heightStep * aspect, tileWidth), heightStep, true)
  }
  if (shift && horizontal) return anchor(start, handle, widthStep, wholeTiles(widthStep / aspect, tileHeight), true)
  if (shift && vertical) return anchor(start, handle, wholeTiles(heightStep * aspect, tileWidth), heightStep, true)
  return anchor(start, handle, horizontal ? widthStep : start.width, vertical ? heightStep : start.height, false)
}
