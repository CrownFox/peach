import { describe, expect, it } from 'vitest'
import { scriptSuggestions, type ScriptHints } from './scriptSuggest'

const menu: ScriptHints = {
  self: 'menu',
  handles: [
    { name: 'play', type: 'button' },
    { name: 'portrait', type: 'image' }
  ]
}

const button: ScriptHints = { self: 'button', handles: menu.handles }

describe('script suggestions', () => {
  it('suggests the game API at the start of a line', () => {
    const labels = scriptSuggestions('', menu).map((item) => item.label)
    expect(labels).toContain('game')
    expect(labels).toContain('self')
    expect(labels).toContain('onInteract')
    expect(labels).toContain('string')
  })

  it('suggests menu handles and then that component’s fields', () => {
    expect(scriptSuggestions('game.currentMenu.', menu).map((item) => item.label)).toEqual(['play', 'portrait'])
    const play = scriptSuggestions('game.currentMenu.play.', button).map((item) => item.label)
    expect(play).toContain('text')
    expect(play).toContain('enabled')
    expect(play).not.toContain('image')
    expect(scriptSuggestions('game.currentMenu.portrait.', menu).map((item) => item.label)).toEqual(['image', 'click', 'visible', 'color'])
  })

  it('suggests value on a text component and not a click', () => {
    const text: ScriptHints = { self: 'text', handles: [] }
    expect(scriptSuggestions('self.', text).map((item) => item.label)).toEqual(['value', 'panel', 'visible', 'color'])
    expect(scriptSuggestions('self:', text)).toEqual([])
  })

  it('suggests self from the script’s point of view', () => {
    expect(scriptSuggestions('self.', menu).map((item) => item.label)).toEqual(['play', 'portrait'])
    expect(scriptSuggestions('self.', button).map((item) => item.label)).toContain('defaultImage')
    expect(scriptSuggestions('self:', button).map((item) => item.label)).toEqual(['click'])
    expect(scriptSuggestions('self:', menu)).toEqual([])
  })

  it('suggests openMenu as a call and string library functions', () => {
    const openMenu = scriptSuggestions('game.', menu).find((item) => item.label === 'openMenu')
    const loadCollection = scriptSuggestions('game.', menu).find((item) => item.label === 'loadCollection')
    const loadBook = scriptSuggestions('game.', menu).find((item) => item.label === 'loadBook')
    expect(openMenu?.insertText).toBe('openMenu("${1}")')
    expect(loadCollection?.insertText).toBe('loadCollection("${1}")')
    expect(loadBook?.insertText).toBe('loadBook("${1}")')
    const loadPage = scriptSuggestions('game.', menu).find((item) => item.label === 'loadPage')
    expect(loadPage?.insertText).toBe('loadPage(${1:viewer}, ${2:bookPage})')
    const openModal = scriptSuggestions('game.', menu).find((item) => item.label === 'openModal')
    expect(openModal?.insertText).toBe('openModal("${1}")')
    const closeModal = scriptSuggestions('game.', menu).find((item) => item.label === 'closeModal')
    expect(closeModal?.insertText).toBe('closeModal(game.currentModal)')
    const registerKey = scriptSuggestions('game.', menu).find((item) => item.label === 'registerKey')
    expect(registerKey?.insertText).toBe('registerKey(${1:BTN_A}, "${2:down}", ${3:onKey})')
    const saveSlot = scriptSuggestions('game.', menu).find((item) => item.label === 'saveSlot')
    expect(saveSlot?.insertText).toBe('saveSlot(${1:1})')
    expect(scriptSuggestions('game.', menu).map((item) => item.label)).toContain('importCustomSaves')
    expect(scriptSuggestions('', menu).map((item) => item.label)).toContain('BTN_SPACE')
    expect(scriptSuggestions('', menu).map((item) => item.label)).not.toContain('closeModal')
    expect(scriptSuggestions('game.currentModal.', menu).map((item) => item.label)).toEqual(['play', 'portrait'])
    expect(scriptSuggestions('string.', menu).map((item) => item.label)).toContain('upper')
  })

  it('suggests the page viewer for parent in a page script', () => {
    const page: ScriptHints = { self: 'any', handles: [], parent: 'pageViewer' }
    expect(scriptSuggestions('', page).map((item) => item.label)).toContain('parent')
    expect(scriptSuggestions('', menu).map((item) => item.label)).not.toContain('parent')
    const fields = scriptSuggestions('parent.', page).map((item) => item.label)
    expect(fields).toContain('loadPage')
    expect(fields).toContain('getInput')
    expect(fields).toContain('page')
    expect(fields).toContain('finished')
    expect(fields).toContain('scrollable')
    expect(scriptSuggestions('parent:', page).map((item) => item.label)).toContain('start')
    expect(scriptSuggestions('parent:', page).map((item) => item.label)).toContain('finish')
  })

  it('stays quiet inside comments and strings', () => {
    expect(scriptSuggestions('-- game.', menu)).toEqual([])
    expect(scriptSuggestions('print("game.', menu)).toEqual([])
  })
})
