import { describe, expect, it } from 'vitest'
import { nextTabScroll, tabWheelDelta } from './tabStrip'

describe('tab strip', () => {
  it('turns a vertical wheel into a sideways scroll', () => {
    expect(tabWheelDelta(0, 40)).toBe(40)
    expect(tabWheelDelta(12, 40)).toBe(40)
    expect(tabWheelDelta(50, 10)).toBe(50)
    expect(tabWheelDelta(0, 2, 1)).toBe(32)
  })

  it('keeps the active tab inside the visible strip', () => {
    expect(nextTabScroll(0, 200, 40, 80)).toBe(0)
    expect(nextTabScroll(0, 200, 240, 80)).toBe(120)
    expect(nextTabScroll(180, 200, 20, 80)).toBe(20)
  })
})
