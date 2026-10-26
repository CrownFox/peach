import { describe, expect, it } from 'vitest'
import { componentProperties, scriptProperties } from './scriptProperties'

describe('script properties', () => {
  it('reads property lines from the top of a script', () => {
    const source = `-- a note
---@property targetPage bookPage "Next Page"
---@property caption text "Caption"

function onLoad()
end
---@property later boolean "Too late"
`
    expect(scriptProperties(source)).toEqual([
      { name: 'targetPage', type: 'bookPage', label: 'Next Page' },
      { name: 'caption', type: 'text', label: 'Caption' }
    ])
  })

  it('keeps the first name in one script and lets the local script replace it', () => {
    const shared = '---@property targetPage bookPage "Shared"\n---@property targetPage text "Again"\n'
    const local = '---@property targetPage bookPage "Local"\n---@property extra boolean "Extra"\n'
    expect(componentProperties(shared, local)).toEqual([
      { name: 'targetPage', type: 'bookPage', label: 'Local' },
      { name: 'extra', type: 'boolean', label: 'Extra' }
    ])
  })

  it('ignores a property type the editor does not know', () => {
    expect(scriptProperties('---@property speed number "Speed"\n')).toEqual([])
  })

  it('reads string, integer, and float properties', () => {
    expect(scriptProperties('---@property title string "Title"\n---@property count integer "Count"\n---@property scale float "Scale"\n')).toEqual([
      { name: 'title', type: 'string', label: 'Title' },
      { name: 'count', type: 'integer', label: 'Count' },
      { name: 'scale', type: 'float', label: 'Scale' }
    ])
  })
})
