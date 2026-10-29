import { describe, expect, it } from 'vitest'
import { compileInputStyles, emptyInputStyle, parseInputStyle } from './inputStyle'

const example = `color: white;
background: #555;
&:hover {
background: #888;
}`

describe('page input styles', () => {
  it('keeps bare declarations on the field and lets a state replace only its own properties', () => {
    const parsed = parseInputStyle(example)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.parts.base).toBe('color: white; background: #555;')
    expect(parsed.parts.hover).toBe('background: #888;')
    expect(parsed.parts.focus).toBe('')
    expect(parsed.parts.disabled).toBe('')
  })

  it('refuses selectors, important, urls, and markup', () => {
    expect(parseInputStyle('body { color: red; }').ok).toBe(false)
    expect(parseInputStyle('.page-input { color: red; }').ok).toBe(false)
    expect(parseInputStyle('& option { color: red; }').ok).toBe(false)
    expect(parseInputStyle('color: red !important;').ok).toBe(false)
    expect(parseInputStyle('background: url(https://example.test/a.png);').ok).toBe(false)
    expect(parseInputStyle('content: "</style>";').ok).toBe(false)
    expect(parseInputStyle('color: white').ok).toBe(false)
    expect(parseInputStyle('color: white; /*').ok).toBe(false)
  })

  it('emits nothing for an empty sheet and orders the game, the viewer, then the field', () => {
    expect(compileInputStyles({ root: '.scene-node', global: emptyInputStyle(), viewers: [], inserts: [] })).toBe('')
    expect(compileInputStyles({
      root: '.scene-node',
      global: { text: 'body { color: red; }', dropdown: '' },
      viewers: [],
      inserts: []
    })).toBe('')
    const css = compileInputStyles({
      root: '.scene-node',
      global: { text: example, dropdown: '' },
      viewers: [{ id: 'scene:town/hero', style: { text: 'color: black;', dropdown: '' } }],
      inserts: [{ id: 'field"1', kind: 'text', source: 'background: red;' }]
    })
    const globalAt = css.indexOf('.scene-node .page-view .page-input { color: white; background: #555; }')
    const hoverAt = css.indexOf('.scene-node .page-view .page-input:hover { background: #888; }')
    const viewerAt = css.indexOf('.scene-node .page-view[data-input-scope="scene:town/hero"] .page-input { color: black; }')
    const insertAt = css.indexOf('.scene-node .page-view .page-input[data-input-style="field\\"1"] { background: red; }')
    expect(globalAt).toBeGreaterThanOrEqual(0)
    expect(hoverAt).toBeGreaterThan(globalAt)
    expect(viewerAt).toBeGreaterThan(hoverAt)
    expect(insertAt).toBeGreaterThan(viewerAt)
    expect(css).not.toMatch(/:hover \{[^}]*color:/)
  })
})
