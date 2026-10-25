import { describe, expect, it } from 'vitest'
import { forgetProject, parseRecentProjects, rememberProject, RECENT_PROJECT_LIMIT } from './recent'

describe('recent projects', () => {
  it('puts the latest project first and folds case-insensitive duplicates', () => {
    const first = rememberProject([], { path: 'C:\\Games\\Peach', name: 'Peach' })
    const next = rememberProject(first, { path: 'C:\\Games\\Other', name: 'Other' })
    const again = rememberProject(next, { path: 'c:/games/peach', name: 'Peach Renamed' })
    expect(again.map((item) => item.name)).toEqual(['Peach Renamed', 'Other'])
    expect(again[0]?.path).toBe('c:/games/peach')
  })

  it('keeps a short list', () => {
    let list = [] as { path: string; name: string }[]
    for (let index = 0; index < RECENT_PROJECT_LIMIT + 2; index += 1) {
      list = rememberProject(list, { path: `C:\\Games\\Project ${index}`, name: `Project ${index}` })
    }
    expect(list).toHaveLength(RECENT_PROJECT_LIMIT)
    expect(list[0]?.name).toBe(`Project ${RECENT_PROJECT_LIMIT + 1}`)
  })

  it('drops a project and ignores broken records', () => {
    const list = parseRecentProjects([
      { path: 'C:\\Games\\Peach', name: 'Peach' },
      { path: '  ', name: 'Blank' },
      { name: 'Missing path' },
      { path: 'C:\\Games\\Other' }
    ])
    expect(list.map((item) => item.name)).toEqual(['Peach', 'C:\\Games\\Other'])
    expect(forgetProject(list, 'c:\\games\\peach').map((item) => item.name)).toEqual(['C:\\Games\\Other'])
  })
})
