import type { Workspace } from './types'

export const GAME_PROPERTIES_WINDOW = 'game-properties'
export const INPUT_STYLE_WINDOW = 'input-style'

export function defaultWorkspace(): Workspace {
  return {
    expanded: [''],
    windows: [],
    editorGrid: 16,
    editorSnap: false,
    openMenuIds: [],
    openCompositeIds: [],
    openSceneIds: [],
    openCollectionIds: [],
    openBookIds: [],
    openPageTabs: [],
    openScriptTabs: [],
    activeTab: 'game'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function parseWorkspace(value: unknown): Workspace {
  const fallback = defaultWorkspace()
  if (!isRecord(value)) return fallback
  const windows = Array.isArray(value.windows)
    ? value.windows.flatMap((item) => {
        if (!isRecord(item) || typeof item.assetId !== 'string') return []
        return [
          {
            assetId: item.assetId,
            x: numberOr(item.x, 48),
            y: numberOr(item.y, 48),
            width: numberOr(item.width, 460),
            height: numberOr(item.height, 420),
            z: numberOr(item.z, 1)
          }
        ]
      })
    : []
  const activeTab = typeof value.activeTab === 'string' ? value.activeTab : fallback.activeTab
  return {
    expanded: stringList(value.expanded).length > 0 ? stringList(value.expanded) : [''],
    windows,
    editorGrid: Math.max(1, Math.round(numberOr(value.editorGrid, 16))),
    editorSnap: value.editorSnap === true,
    openMenuIds: stringList(value.openMenuIds),
    openCompositeIds: stringList(value.openCompositeIds),
    openSceneIds: stringList(value.openSceneIds),
    openCollectionIds: stringList(value.openCollectionIds),
    openBookIds: stringList(value.openBookIds),
    openPageTabs: stringList(value.openPageTabs),
    openScriptTabs: stringList(value.openScriptTabs),
    activeTab
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
