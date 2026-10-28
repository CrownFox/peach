import { describe, expect, it } from 'vitest'
import { alignMove, alignResize } from './align'

describe('alignMove', () => {
  it('lines a left edge up with another right edge and leaves the other axis', () => {
    const result = alignMove({ x: 48, y: 10, width: 20, height: 20 }, [{ x: 0, y: 80, width: 40, height: 10 }], 8, 8)
    expect(result.box).toEqual({ x: 40, y: 10, width: 20, height: 20 })
    expect(result.guide).toEqual({ x: 40, y: null })
  })

  it('lines centers up', () => {
    const result = alignMove({ x: 40, y: 200, width: 20, height: 20 }, [{ x: 0, y: 0, width: 104, height: 20 }], 8, 8)
    expect(result.box.x).toBe(42)
    expect(result.guide.x).toBe(52)
    expect(result.guide.y).toBeNull()
  })

  it('lines a center up with the canvas center', () => {
    const result = alignMove({ x: 38, y: 0, width: 20, height: 10 }, [{ x: 0, y: 0, width: 100, height: 50 }], 8, 8)
    expect(result.box).toEqual({ x: 40, y: 0, width: 20, height: 10 })
    expect(result.guide.x).toBe(50)
  })

  it('picks the closest line on that axis', () => {
    const result = alignMove(
      { x: 10, y: 0, width: 10, height: 10 },
      [
        { x: 0, y: 0, width: 12, height: 10 },
        { x: 16, y: 0, width: 10, height: 10 }
      ],
      8,
      8
    )
    expect(result.box.x).toBe(11)
    expect(result.guide.x).toBe(16)
  })

  it('stays with the pointer once the line is farther than the range', () => {
    const moved = { x: 20, y: 30, width: 10, height: 10 }
    const result = alignMove(moved, [{ x: 0, y: 0, width: 10, height: 10 }], 8, 8)
    expect(result.box).toEqual(moved)
    expect(result.guide).toEqual({ x: null, y: null })
  })

  it('snaps each axis on its own range', () => {
    const result = alignMove({ x: 18, y: 26, width: 10, height: 10 }, [{ x: 0, y: 0, width: 20, height: 20 }], 4, 8)
    expect(result.box).toEqual({ x: 20, y: 20, width: 10, height: 10 })
    expect(result.guide).toEqual({ x: 20, y: 20 })
  })
})

describe('alignResize', () => {
  it('snaps the moving edge and keeps the opposite edge', () => {
    const start = { x: 10, y: 20, width: 100, height: 50 }
    const next = { x: 10, y: 20, width: 120, height: 50 }
    const result = alignResize(start, next, 'e', [{ x: 128, y: 0, width: 10, height: 10 }], 8, 8, false, false)
    expect(result.box).toEqual({ x: 10, y: 20, width: 118, height: 50 })
    expect(result.guide).toEqual({ x: 128, y: null })
  })

  it('snaps from the center when alt is held', () => {
    const start = { x: 10, y: 20, width: 100, height: 50 }
    const next = { x: 0, y: 20, width: 120, height: 50 }
    const result = alignResize(start, next, 'e', [{ x: 128, y: 0, width: 10, height: 10 }], 8, 8, false, true)
    expect(result.box).toEqual({ x: -8, y: 20, width: 136, height: 50 })
    expect(result.guide.x).toBe(128)
  })

  it('keeps the aspect ratio while snapping from the center', () => {
    const start = { x: 10, y: 20, width: 100, height: 50 }
    const next = { x: 0, y: 11, width: 120, height: 60 }
    const result = alignResize(start, next, 'e', [{ x: 128, y: 200, width: 10, height: 10 }], 8, 8, true, true)
    expect(result.box).toEqual({ x: -8, y: 11, width: 136, height: 68 })
    expect(result.guide).toEqual({ x: 128, y: null })
  })

  it('snaps both edges of a corner', () => {
    const start = { x: 0, y: 0, width: 40, height: 40 }
    const next = { x: 0, y: 0, width: 50, height: 46 }
    const result = alignResize(start, next, 'se', [{ x: 47, y: 40, width: 20, height: 8 }], 8, 8, false, false)
    expect(result.box).toEqual({ x: 0, y: 0, width: 47, height: 44 })
    expect(result.guide).toEqual({ x: 47, y: 44 })
  })
})
