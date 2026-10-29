import { describe, expect, it } from 'vitest'
import { defaultWorkspace, parseWorkspace } from './workspace'

describe('editor window grid', () => {
  it('starts at 16 pixels with snap off, and keeps an older workspace that way', () => {
    expect(defaultWorkspace().editorGrid).toBe(16)
    expect(defaultWorkspace().editorSnap).toBe(false)
    const older = parseWorkspace({ windows: [], activeTab: 'editor' })
    expect(older.editorGrid).toBe(16)
    expect(older.editorSnap).toBe(false)
  })

  it('reads a custom grid and snap', () => {
    const workspace = parseWorkspace({ editorGrid: 24.4, editorSnap: true })
    expect(workspace.editorGrid).toBe(24)
    expect(workspace.editorSnap).toBe(true)
    expect(parseWorkspace({ editorGrid: 0 }).editorGrid).toBe(1)
  })
})
