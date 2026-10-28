import { placedRect, type Rect } from './resize'

export type AlignGuide = { x: number | null; y: number | null }

function marks(origin: number, size: number): number[] {
  return [origin, origin + size / 2, origin + size]
}

function snapAxis(
  origin: number,
  size: number,
  targets: readonly Rect[],
  axis: 'x' | 'y',
  threshold: number
): { origin: number; at: number } | null {
  const own = marks(origin, size)
  let best: { dist: number; origin: number; at: number } | null = null
  for (const target of targets) {
    const start = axis === 'x' ? target.x : target.y
    const span = axis === 'x' ? target.width : target.height
    for (const line of marks(start, span)) {
      for (const ownLine of own) {
        const delta = line - ownLine
        const dist = Math.abs(delta)
        if (dist > threshold) continue
        if (best && dist >= best.dist) continue
        best = { dist, origin: origin + delta, at: line }
      }
    }
  }
  return best ? { origin: best.origin, at: best.at } : null
}

type Axis = 'x' | 'y'
type Mark = 0 | 1 | 2

function fixedMode(handle: string, axis: Axis, aspect: boolean, fromCenter: boolean): 'start' | 'end' | 'center' | null {
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  const active = axis === 'x' ? horizontal : vertical
  if (!active && !(aspect && (horizontal || vertical))) return null
  if (fromCenter) return 'center'
  if (active) {
    if (axis === 'x') return handle.includes('w') ? 'end' : 'start'
    return handle.includes('n') ? 'end' : 'start'
  }
  return 'center'
}

function sizeForMark(fixed: 'start' | 'end' | 'center', mark: Mark, line: number, origin: number, size: number): number | null {
  if (fixed === 'center') {
    const center = origin + size / 2
    if (mark === 1) return null
    return mark === 2 ? 2 * (line - center) : 2 * (center - line)
  }
  if (fixed === 'start') {
    if (mark === 0) return null
    return mark === 1 ? 2 * (line - origin) : line - origin
  }
  const end = origin + size
  if (mark === 2) return null
  return mark === 1 ? 2 * (end - line) : end - line
}

function markAt(origin: number, size: number, mark: Mark): number {
  return origin + (size * mark) / 2
}

type Snap = { axis: Axis; size: number; at: number; score: number }

function bestSnap(
  start: Rect,
  next: Rect,
  handle: string,
  targets: readonly Rect[],
  thresholdX: number,
  thresholdY: number,
  aspect: boolean,
  fromCenter: boolean,
  axis: Axis
): Snap | null {
  const fixed = fixedMode(handle, axis, aspect, fromCenter)
  if (!fixed) return null
  const origin = axis === 'x' ? next.x : next.y
  const size = axis === 'x' ? next.width : next.height
  const startOrigin = axis === 'x' ? start.x : start.y
  const startSize = axis === 'x' ? start.width : start.height
  const threshold = axis === 'x' ? thresholdX : thresholdY
  let best: Snap | null = null
  for (const target of targets) {
    const targetOrigin = axis === 'x' ? target.x : target.y
    const targetSize = axis === 'x' ? target.width : target.height
    for (const line of marks(targetOrigin, targetSize)) {
      for (const mark of [0, 1, 2] as const) {
        const solved = sizeForMark(fixed, mark, line, startOrigin, startSize)
        if (solved === null) continue
        const dist = Math.abs(line - markAt(origin, size, mark))
        if (threshold > 0 ? dist > threshold : dist !== 0) continue
        const score = threshold > 0 ? dist / threshold : dist
        if (best && score >= best.score) continue
        best = { axis, size: solved, at: line, score }
      }
    }
  }
  return best
}

export function alignResize(
  start: Rect,
  next: Rect,
  handle: string,
  targets: readonly Rect[],
  thresholdX: number,
  thresholdY: number,
  aspect: boolean,
  fromCenter: boolean
): { box: Rect; guide: AlignGuide } {
  const x = bestSnap(start, next, handle, targets, thresholdX, thresholdY, aspect, fromCenter, 'x')
  const y = bestSnap(start, next, handle, targets, thresholdX, thresholdY, aspect, fromCenter, 'y')
  const ratio = start.width !== 0 && start.height !== 0 ? start.width / start.height : 0
  if (aspect && ratio !== 0) {
    const best = x && y ? (x.score <= y.score ? x : y) : x ?? y
    if (!best) return { box: next, guide: { x: null, y: null } }
    const width = best.axis === 'x' ? best.size : best.size * ratio
    const height = best.axis === 'y' ? best.size : best.size / ratio
    return {
      box: placedRect(start, handle, width, height, true, fromCenter),
      guide: { x: best.axis === 'x' ? best.at : null, y: best.axis === 'y' ? best.at : null }
    }
  }
  const width = x?.size ?? next.width
  const height = y?.size ?? next.height
  if (!x && !y) return { box: next, guide: { x: null, y: null } }
  return {
    box: placedRect(start, handle, width, height, false, fromCenter),
    guide: { x: x?.at ?? null, y: y?.at ?? null }
  }
}

export function alignMove(box: Rect, targets: readonly Rect[], thresholdX: number, thresholdY: number): { box: Rect; guide: AlignGuide } {
  const x = snapAxis(box.x, box.width, targets, 'x', thresholdX)
  const y = snapAxis(box.y, box.height, targets, 'y', thresholdY)
  return {
    box: {
      x: x?.origin ?? box.x,
      y: y?.origin ?? box.y,
      width: box.width,
      height: box.height
    },
    guide: { x: x?.at ?? null, y: y?.at ?? null }
  }
}
