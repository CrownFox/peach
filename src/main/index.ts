import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { Asset, AssetType, ProjectSnapshot, Workspace } from '@shared/types'
import { exportGame } from './exportGame'
import {
  createAssetFile,
  createFolder,
  createProject,
  deleteNode,
  duplicateNode,
  importImage,
  moveNode,
  readProject,
  renameNode,
  saveAsset,
  saveMeta,
  saveWorkspace
} from './projectFiles'
import { forgetRecentProject, listRecentProjects, rememberRecentProject } from './recentProjects'
import { registerAssetProtocol, setProjectDir } from './protocol'

// Vite replaces dependency bundles while this env var is set. Electron's HTTP
// cache otherwise keeps a bundle that crashes before the interface mounts.
if (process.env.ELECTRON_RENDERER_URL) app.commandLine.appendSwitch('disable-http-cache')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'peach-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#1a1714',
    autoHideMenuBar: true,
    title: 'Peach Game Maker',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void mainWindow.loadURL(devUrl)
  else void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  registerAssetProtocol()
  createWindow()
  mainWindow?.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`Renderer failed to load (${code}): ${description}`)
  })
  mainWindow?.webContents.on('render-process-gone', (_event, details) => {
    console.error(`Renderer gone: ${details.reason}`)
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error: unknown) => {
  console.error(error)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (error) => {
  console.error(error)
})

ipcMain.handle('dialog:directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:image', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:export', async (_event, defaultPath: string) => {
  const result = await dialog.showOpenDialog({
    defaultPath,
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:readText', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null
  return readFile(result.filePaths[0], 'utf8')
})

ipcMain.handle('dialog:writeText', async (_event, name: string, text: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: name,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return false
  await writeFile(result.filePath, text, 'utf8')
  return true
})

ipcMain.handle('project:create', async (_event, parentDir: string, name: string) => {
  const snapshot = await createProject(parentDir, name)
  setProjectDir(snapshot.projectDir)
  await rememberRecentProject({ path: snapshot.projectDir, name: snapshot.meta.name })
  return snapshot
})

ipcMain.handle('project:open', async (_event, dir: string) => {
  const snapshot = await readProject(dir)
  setProjectDir(snapshot.projectDir)
  await rememberRecentProject({ path: snapshot.projectDir, name: snapshot.meta.name })
  return snapshot
})

ipcMain.handle('recent:list', () => listRecentProjects())

ipcMain.handle('recent:forget', (_event, projectPath: string) => forgetRecentProject(projectPath))

ipcMain.handle('project:createFolder', (_event, projectDir: string, parentRelative: string) =>
  createFolder(projectDir, parentRelative)
)

ipcMain.handle('project:createAsset', (_event, projectDir: string, parentRelative: string, type: AssetType) =>
  createAssetFile(projectDir, parentRelative, type)
)

ipcMain.handle('project:rename', (_event, projectDir: string, relativePath: string, nextName: string) =>
  renameNode(projectDir, relativePath, nextName)
)

ipcMain.handle('project:move', (_event, projectDir: string, relativePath: string, destFolder: string) =>
  moveNode(projectDir, relativePath, destFolder)
)

ipcMain.handle('project:duplicate', (_event, projectDir: string, relativePath: string) =>
  duplicateNode(projectDir, relativePath)
)

ipcMain.handle('project:delete', (_event, projectDir: string, relativePath: string) =>
  deleteNode(projectDir, relativePath)
)

ipcMain.handle('project:saveAsset', (_event, projectDir: string, asset: Asset) => saveAsset(projectDir, asset))

ipcMain.handle('project:saveMeta', (_event, projectDir: string, meta: ProjectSnapshot['meta']) =>
  saveMeta(projectDir, meta)
)

ipcMain.handle('project:saveWorkspace', (_event, projectDir: string, workspace: Workspace) =>
  saveWorkspace(projectDir, workspace)
)

ipcMain.handle('project:importImage', (_event, projectDir: string, relativePath: string, sourcePath: string) =>
  importImage(projectDir, relativePath, sourcePath)
)

ipcMain.handle('project:export', (_event, projectDir: string, destination: string) =>
  exportGame(projectDir, destination)
)
