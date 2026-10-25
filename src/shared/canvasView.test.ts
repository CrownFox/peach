import { describe, expect, it } from 'vitest'
import { clientToWorld, isMiddleDoubleClick, layoutPoint, panBy, zoomAt } from './canvasView'

describe('canvas view', () => {
  it('keeps the point under the cursor fixed while zooming', () => {
    const view = { panX: 40, panY: -20, zoom: 1 }
    const cursor = { x: 180, y: 90 }
    const before = clientToWorld(view, cursor.x, cursor.y)
    const next = zoomAt(view, cursor.x, cursor.y, 2)
    const after = clientToWorld(next, cursor.x, cursor.y)
    expect(next.zoom).toBe(2)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    const restored = zoomAt(next, cursor.x, cursor.y, 1)
    const restoredPoint = clientToWorld(restored, cursor.x, cursor.y)
    expect(restored.zoom).toBe(1)
    expect(restoredPoint.x).toBeCloseTo(before.x)
    expect(restoredPoint.y).toBeCloseTo(before.y)
  })

  it('stops at the zoom limits and pans by screen pixels', () => {
    expect(zoomAt({ panX: 0, panY: 0, zoom: 1 }, 10, 10, 100).zoom).toBe(16)
    expect(zoomAt({ panX: 0, panY: 0, zoom: 1 }, 10, 10, 0.01).zoom).toBe(0.1)
    expect(panBy({ panX: 1, panY: 2, zoom: 1 }, -5, 3)).toMatchObject({ panX: -4, panY: 5, zoom: 1 })
  })

  it('maps a pointer through an outer zoom back into layout pixels', () => {
    expect(layoutPoint(40, 20, 200, 100, 100, 50)).toEqual({ x: 20, y: 10 })
  })

  it('treats a second middle press as a double-click when it lands with the first', () => {
    const first = { time: 1000, x: 40, y: 50 }
    expect(isMiddleDoubleClick(null, 1200, 40, 50)).toBe(false)
    expect(isMiddleDoubleClick(first, 1400, 44, 54)).toBe(true)
    expect(isMiddleDoubleClick(first, 1500, 40, 50)).toBe(true)
    expect(isMiddleDoubleClick(first, 1501, 40, 50)).toBe(false)
    expect(isMiddleDoubleClick(first, 1200, 49, 50)).toBe(false)
  })
})
