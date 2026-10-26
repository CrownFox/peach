import { contextBridge, ipcRenderer } from 'electron'
import type { PeachApi } from '@shared/api'
import { encodeRelative } from '@shared/paths'

const api: PeachApi = {
  chooseDirectory: () => ipcRenderer.invoke('dialog:directory'),
  chooseImage: () => ipcRenderer.invoke('dialog:image'),
  chooseExportDirectory: (defaultPath) => ipcRenderer.invoke('dialog:export', defaultPath),
  readTextFile: () => ipcRenderer.invoke('dialog:readText'),
  writeTextFile: (name, text) => ipcRenderer.invoke('dialog:writeText', name, text),
  createProject: (parentDir, name) => ipcRenderer.invoke('project:create', parentDir, name),
  openProject: (dir) => ipcRenderer.invoke('project:open', dir),
  createFolder: (projectDir, parentRelative) => ipcRenderer.invoke('project:createFolder', projectDir, parentRelative),
  createAsset: (projectDir, parentRelative, type) =>
    ipcRenderer.invoke('project:createAsset', projectDir, parentRelative, type),
  renameNode: (projectDir, relativePath, nextName) =>
    ipcRenderer.invoke('project:rename', projectDir, relativePath, nextName),
  moveNode: (projectDir, relativePath, destFolder) =>
    ipcRenderer.invoke('project:move', projectDir, relativePath, destFolder),
  duplicateNode: (projectDir, relativePath) => ipcRenderer.invoke('project:duplicate', projectDir, relativePath),
  deleteNode: (projectDir, relativePath) => ipcRenderer.invoke('project:delete', projectDir, relativePath),
  saveAsset: (projectDir, asset) => ipcRenderer.invoke('project:saveAsset', projectDir, asset),
  saveMeta: (projectDir, meta) => ipcRenderer.invoke('project:saveMeta', projectDir, meta),
  saveWorkspace: (projectDir, workspace) => ipcRenderer.invoke('project:saveWorkspace', projectDir, workspace),
  importImage: (projectDir, relativePath, sourcePath) =>
    ipcRenderer.invoke('project:importImage', projectDir, relativePath, sourcePath),
  importGameIcon: (projectDir, sourcePath) => ipcRenderer.invoke('project:importIcon', projectDir, sourcePath),
  clearGameIcon: (projectDir) => ipcRenderer.invoke('project:clearIcon', projectDir),
  exportGame: (projectDir, destination) => ipcRenderer.invoke('project:export', projectDir, destination),
  listRecentProjects: () => ipcRenderer.invoke('recent:list'),
  forgetRecentProject: (projectPath) => ipcRenderer.invoke('recent:forget', projectPath),
  assetUrl: (relativePath) => `peach-asset://local/${encodeRelative(relativePath)}`
}

contextBridge.exposeInMainWorld('peach', api)
