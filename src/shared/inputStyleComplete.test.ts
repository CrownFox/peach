import { describe, expect, it } from 'vitest'
import { inputStyleCompletions } from './inputStyleComplete'

describe('input style completions', () => {
  it('suggests properties and the three states', () => {
    const items = inputStyleCompletions('', '')
    expect(items.find((item) => item.label === 'color')?.insertText).toBe('color: $0;')
    expect(items.find((item) => item.label === '&:hover')?.insertText).toContain('$0')
    expect(items.map((item) => item.label)).toEqual(expect.arrayContaining(['&:focus', '&:disabled', 'color-scheme']))
    expect(items.some((item) => item.insertText.includes('!important'))).toBe(false)
    expect(items.some((item) => item.label.includes('option'))).toBe(false)
  })

  it('suggests values after a colon and adds a semicolon when the line has none', () => {
    const open = inputStyleCompletions('color: ', '')
    expect(open.find((item) => item.label === 'white')?.insertText).toBe('white;')
    expect(open.some((item) => item.kind === 'block')).toBe(false)
    expect(inputStyleCompletions('color: ', ';').find((item) => item.label === 'white')?.insertText).toBe('white')
    expect(inputStyleCompletions('color-scheme: ', '').map((item) => item.label)).toContain('dark')
    expect(inputStyleCompletions('&:hover {\n  background: ', '').map((item) => item.label)).toContain('none')
  })

  it('stays quiet inside a comment and offers properties inside a state', () => {
    expect(inputStyleCompletions('color: white; /* still', '')).toEqual([])
    expect(inputStyleCompletions('/* done */\n', '').some((item) => item.label === 'color')).toBe(true)
    expect(inputStyleCompletions('&:hover {\n  ', '').some((item) => item.label === 'background')).toBe(true)
  })
})