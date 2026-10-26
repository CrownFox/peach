import type { RecentProject } from './recent'
import type { AssetType, ExportResult, MutationResult, ProjectSnapshot, Workspace } from './types'
import type { Asset } from './types'

export type PeachApi = {
  chooseDirectory: () => Promise<string | null>
  chooseImage: () => Promise<string | null>
  chooseExportDirectory: (defaultPath: string) => Promise<string | null>
  readTextFile: () => Promise<string | null>
  writeTextFile: (name: string, text: string) => Promise<boolean>
  createProject: (parentDir: string, name: string) => Promise<ProjectSnapshot>
  openProject: (dir: string) => Promise<ProjectSnapshot>
  createFolder: (projectDir: string, parentRelative: string) => Promise<MutationResult>
  createAsset: (projectDir: string, parentRelative: string, type: AssetType) => Promise<MutationResult>
  renameNode: (projectDir: string, relativePath: string, nextName: string) => Promise<ProjectSnapshot>
  moveNode: (projectDir: string, relativePath: string, destFolder: string) => Promise<ProjectSnapshot>
  duplicateNode: (projectDir: string, relativePath: string) => Promise<ProjectSnapshot>
  deleteNode: (projectDir: string, relativePath: string) => Promise<ProjectSnapshot>
  saveAsset: (projectDir: string, asset: Asset) => Promise<void>
  saveMeta: (projectDir: string, meta: ProjectSnapshot['meta']) => Promise<void>
  saveWorkspace: (projectDir: string, workspace: Workspace) => Promise<void>
  importImage: (projectDir: string, relativePath: string, sourcePath: string) => Promise<ProjectSnapshot>
  importGameIcon: (projectDir: string, sourcePath: string) => Promise<ProjectSnapshot>
  clearGameIcon: (projectDir: string) => Promise<ProjectSnapshot>
  exportGame: (projectDir: string, destination: string) => Promise<ExportResult>
  listRecentProjects: () => Promise<RecentProject[]>
  forgetRecentProject: (projectPath: string) => Promise<RecentProject[]>
  assetUrl: (relativePath: string) => string
}
