export type Rect = { x: number; y: number; width: number; height: number }

export function placedRect(start: Rect, handle: string, width: number, height: number, aspect: boolean, fromCenter: boolean): Rect {
  if (fromCenter) {
    const cx = start.x + start.width / 2
    const cy = start.y + start.height / 2
    return { x: cx - width / 2, y: cy - height / 2, width, height }
  }
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  const x = handle.includes('w') ? start.x + start.width - width : start.x
  const y = handle.includes('n') ? start.y + start.height - height : start.y
  return {
    x: aspect && vertical && !horizontal ? start.x + (start.width - width) / 2 : x,
    y: aspect && horizontal && !vertical ? start.y + (start.height - height) / 2 : y,
    width,
    height
  }
}

export function resizeRect(start: Rect, dx: number, dy: number, handle: string, aspect: boolean, fromCenter = false): Rect {
  if (!handle) return { x: start.x + dx, y: start.y + dy, width: start.width, height: start.height }
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  const outward = fromCenter ? 2 : 1
  let width = start.width
  let height = start.height
  if (handle.includes('e')) width = start.width + dx * outward
  if (handle.includes('w')) width = start.width - dx * outward
  if (handle.includes('s')) height = start.height + dy * outward
  if (handle.includes('n')) height = start.height - dy * outward
  if (aspect && start.width > 0 && start.height > 0 && (horizontal || vertical)) {
    const ratio = start.width / start.height
    if (horizontal && vertical) {
      const sx = width / start.width
      const sy = height / start.height
      const scale = Math.abs(sx) >= Math.abs(sy) ? sx : sy
      width = start.width * scale
      height = start.height * scale
    } else if (horizontal) {
      height = width / ratio
    } else {
      width = height * ratio
    }
  }
  return placedRect(start, handle, width, height, aspect, fromCenter)
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

function anchor(start: Rect, handle: string, width: number, height: number, aspect: boolean): Rect {
  return placedRect(start, handle, width, height, aspect, false)
}

function spanFromCenter(center: number, origin: number, size: number, step: number): number {
  const end = origin + size
  const startSnap = snapStep(origin, step)
  const endSnap = snapStep(end, step)
  if (Math.abs(startSnap - origin) < Math.abs(endSnap - end)) return (center - startSnap) * 2
  return (endSnap - center) * 2
}

function snapGridFromCenter(start: Rect, next: Rect, handle: string, stepX: number, stepY: number, aspect: boolean): Rect {
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  const cx = start.x + start.width / 2
  const cy = start.y + start.height / 2
  const ratio = start.width > 0 && start.height > 0 ? start.width / start.height : 1
  const widthMoves = horizontal || (aspect && vertical)
  const heightMoves = vertical || (aspect && horizontal)
  let width = widthMoves ? keepStep(spanFromCenter(cx, next.x, next.width, stepX), stepX) : start.width
  let height = heightMoves ? keepStep(spanFromCenter(cy, next.y, next.height, stepY), stepY) : start.height
  if (aspect && widthMoves && heightMoves) {
    const xDist = Math.abs(width - next.width)
    const yDist = Math.abs(height - next.height)
    if (xDist <= yDist) height = keepStep(width / ratio, stepY)
    else width = keepStep(height * ratio, stepX)
  } else if (aspect && widthMoves) {
    height = keepStep(width / ratio, stepY)
  } else if (aspect && heightMoves) {
    width = keepStep(height * ratio, stepX)
  }
  return placedRect(start, handle, width, height, aspect, true)
}

export function snapToGrid(start: Rect, next: Rect, handle: string, stepX: number, stepY: number, aspect: boolean, fromCenter = false): Rect {
  if (!(stepX > 0) || !(stepY > 0)) return next
  if (!handle) return { ...next, x: snapStep(next.x, stepX), y: snapStep(next.y, stepY) }
  if (fromCenter) return snapGridFromCenter(start, next, handle, stepX, stepY, aspect)
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  if (!aspect) {
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
  const ratio = start.width > 0 && start.height > 0 ? start.width / start.height : 1
  const xEdge = handle.includes('w') ? next.x : next.x + next.width
  const yEdge = handle.includes('n') ? next.y : next.y + next.height
  const xDelta = horizontal ? Math.abs(snapStep(xEdge, stepX) - xEdge) : Number.POSITIVE_INFINITY
  const yDelta = vertical ? Math.abs(snapStep(yEdge, stepY) - yEdge) : Number.POSITIVE_INFINITY
  if (horizontal && xDelta <= yDelta) {
    const edge = snapStep(xEdge, stepX)
    const width = keepStep(handle.includes('w') ? start.x + start.width - edge : edge - start.x, stepX)
    return anchor(start, handle, width, keepStep(width / ratio, stepY), true)
  }
  const edge = snapStep(yEdge, stepY)
  const height = keepStep(handle.includes('n') ? start.y + start.height - edge : edge - start.y, stepY)
  return anchor(start, handle, keepStep(height * ratio, stepX), height, true)
}

export function snapTilemapSize(
  start: Rect,
  next: Rect,
  handle: string,
  tileWidth: number,
  tileHeight: number,
  aspect: boolean,
  fromCenter = false
): Rect {
  if (!handle || !(tileWidth > 0) || !(tileHeight > 0)) return next
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  const widthStep = horizontal ? wholeTiles(next.width, tileWidth) : start.width
  const heightStep = vertical ? wholeTiles(next.height, tileHeight) : start.height
  const ratio = start.width > 0 && start.height > 0 ? start.width / start.height : 1
  let placed: Rect
  if (aspect && horizontal && vertical) {
    const xDelta = Math.abs(widthStep - next.width)
    const yDelta = Math.abs(heightStep - next.height)
    placed = xDelta <= yDelta
      ? anchor(start, handle, widthStep, wholeTiles(widthStep / ratio, tileHeight), true)
      : anchor(start, handle, wholeTiles(heightStep * ratio, tileWidth), heightStep, true)
  } else if (aspect && horizontal) {
    placed = anchor(start, handle, widthStep, wholeTiles(widthStep / ratio, tileHeight), true)
  } else if (aspect && vertical) {
    placed = anchor(start, handle, wholeTiles(heightStep * ratio, tileWidth), heightStep, true)
  } else {
    placed = anchor(start, handle, horizontal ? widthStep : start.width, vertical ? heightStep : start.height, false)
  }
  if (!fromCenter) return placed
  const cx = start.x + start.width / 2
  const cy = start.y + start.height / 2
  return { x: cx - placed.width / 2, y: cy - placed.height / 2, width: placed.width, height: placed.height }
}
