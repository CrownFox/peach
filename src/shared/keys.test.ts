import { describe, expect, it } from 'vitest'
import { KEYS, keyAction } from './keys'

describe('keys', () => {
  it('names physical keys', () => {
    expect(KEYS.find((key) => key.name === 'BTN_A')?.code).toBe('KeyA')
    expect(KEYS.find((key) => key.name === 'BTN_SPACE')?.code).toBe('Space')
    expect(KEYS.find((key) => key.name === 'BTN_LEFT')?.code).toBe('ArrowLeft')
    expect(KEYS.find((key) => key.name === 'BTN_1')?.code).toBe('Digit1')
  })

  it('fires down once and still reports a repeat without firing', () => {
    expect(keyAction('keydown', false, 'KeyA', false)).toEqual({ code: 'KeyA', edge: 'down', fire: true })
    expect(keyAction('keydown', true, 'KeyA', false)).toEqual({ code: 'KeyA', edge: 'down', fire: false })
    expect(keyAction('keyup', false, 'Space', false)).toEqual({ code: 'Space', edge: 'up', fire: true })
    expect(keyAction('keydown', false, 'KeyA', true)).toBeNull()
  })
})
