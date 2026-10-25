import { nativeImage } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import {
  assetDocument,
  createAsset,
  entryClearedByDelete,
  parseAsset,
  parseMeta,
  planDuplicate,
  retargetImageFiles
} from '@shared/assets'
import { assetFileName, joinPath, parentPath, sanitizeFileStem, stemOfAssetFile, uniqueName } from '@shared/paths'
import { planTreeMove, remapMovedPaths } from '@shared/tree'
import type { Asset, MutationResult, ProjectSnapshot } from '@shared/types'
import { FORMAT_VERSION } from '@shared/types'
import { defaultWorkspace, parseWorkspace } from '@shared/workspace'

const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', '.git'])

function pageTabAlive(tab: string, assets: Asset[]): boolean {
  const slash = tab.indexOf('/')
  if (slash <= 0) return false
  const book = assets.find((asset) => asset.id === tab.slice(0, slash))
  if (book?.type !== 'book') return false
  const pageId = tab.slice(slash + 1)
  return book.chapters.some((chapter) => chapter.pages.some((page) => page.id === pageId))
}

export async function createProject(parentDir: string, name: string): Promise<ProjectSnapshot> {
  const stem = sanitizeFileStem(name)
  const dir = path.join(parentDir, stem)
  try {
    await fs.mkdir(dir)
  } catch (error) {
    if (isErrno(error) && error.code === 'EEXIST') {
      throw new Error('A folder with that name already exists.')
    }
    throw error
  }
  const meta = { formatVersion: FORMAT_VERSION, name: stem, entryMenuId: null }
  await writeJson(path.join(dir, 'project.json'), meta)
  await writeJson(path.join(dir, 'workspace.json'), defaultWorkspace())
  return readProject(dir)
}

export async function readProject(projectDir: string): Promise<ProjectSnapshot> {
  const metaPath = path.join(projectDir, 'project.json')
  let metaRaw: unknown
  try {
    metaRaw = JSON.parse(await fs.readFile(metaPath, 'utf8'))
  } catch {
    throw new Error('This folder is not a Peach project.')
  }
  const meta = parseMeta(metaRaw, path.basename(projectDir))
  const warnings: string[] = []
  if (meta.formatVersion > FORMAT_VERSION) {
    warnings.push('This project was saved by a newer version of Peach. Some data may be ignored.')
  }
  const folders: string[] = []
  const assets: Asset[] = []
  await walk(projectDir, '', folders, assets, warnings)
  let workspace = defaultWorkspace()
  try {
    workspace = parseWorkspace(JSON.parse(await fs.readFile(path.join(projectDir, 'workspace.json'), 'utf8')))
  } catch {
    warnings.push('The editor workspace was reset.')
  }
  const known = new Set(assets.map((asset) => asset.id))
  workspace = {
    ...workspace,
    windows: workspace.windows.filter((window) => known.has(window.assetId)),
    openMenuIds: workspace.openMenuIds.filter((id) => known.has(id)),
    openCollectionIds: workspace.openCollectionIds.filter((id) => known.has(id)),
    openBookIds: workspace.openBookIds.filter((id) => assets.some((asset) => asset.id === id && asset.type === 'book')),
    openPageTabs: workspace.openPageTabs.filter((tab) => pageTabAlive(tab, assets)),
    expanded: workspace.expanded.length > 0 ? workspace.expanded : ['']
  }
  if (workspace.activeTab.startsWith('menu:') && !known.has(workspace.activeTab.slice(5))) {
    workspace.activeTab = 'editor'
  }
  if (workspace.activeTab.startsWith('collection:') && !known.has(workspace.activeTab.slice('collection:'.length))) {
    workspace.activeTab = 'editor'
  }
  if (workspace.activeTab.startsWith('book:') && !workspace.openBookIds.includes(workspace.activeTab.slice('book:'.length))) {
    workspace.activeTab = 'editor'
  }
  if (workspace.activeTab.startsWith('page:') && !workspace.openPageTabs.includes(workspace.activeTab.slice('page:'.length))) {
    workspace.activeTab = 'editor'
  }
  if (meta.entryMenuId && !known.has(meta.entryMenuId)) meta.entryMenuId = null
  return { projectDir, meta, folders, assets, workspace, warnings }
}

export async function saveMeta(projectDir: string, meta: ProjectSnapshot['meta']): Promise<void> {
  await writeJson(path.join(projectDir, 'project.json'), meta)
}

export async function saveWorkspace(projectDir: string, workspace: ProjectSnapshot['workspace']): Promise<void> {
  await writeJson(path.join(projectDir, 'workspace.json'), workspace)
}

export async function saveAsset(projectDir: string, asset: Asset): Promise<void> {
  await writeJson(resolveInside(projectDir, asset.relativePath), assetDocument(asset))
}

export async function createFolder(projectDir: string, parentRelative: string): Promise<MutationResult> {
  const parentAbs = resolveInside(projectDir, parentRelative)
  const stem = uniqueName(await siblingStems(parentAbs), 'Folder')
  const relative = joinPath(parentRelative, stem)
  await fs.mkdir(resolveInside(projectDir, relative))
  return { snapshot: await readProject(projectDir), createdPath: relative }
}

export async function createAssetFile(
  projectDir: string,
  parentRelative: string,
  type: Asset['type']
): Promise<MutationResult> {
  const parentAbs = resolveInside(projectDir, parentRelative)
  const label =
    type === 'menu'
      ? 'Menu'
      : type === 'button'
        ? 'Button'
        : type === 'script'
          ? 'Script'
          : type === 'panel'
            ? 'Panel'
            : type === 'collection'
              ? 'Collection'
              : type === 'book'
                ? 'Book'
                : 'Image'
  const stem = uniqueName(await siblingStems(parentAbs), label)
  const relative = joinPath(parentRelative, assetFileName(stem, type))
  const asset = createAsset(type, stem, relative)
  await writeJson(resolveInside(projectDir, relative), assetDocument(asset))
  return { snapshot: await readProject(projectDir), createdPath: relative, createdId: asset.id }
}

export async function renameNode(projectDir: string, relativePath: string, nextName: string): Promise<ProjectSnapshot> {
  if (!relativePath) throw new Error('Root cannot be renamed.')
  const snapshot = await readProject(projectDir)
  const stem = sanitizeFileStem(nextName)
  const parent = parentPath(relativePath)
  const siblings = (await siblingStems(resolveInside(projectDir, parent))).filter(
    (name) => name.toLowerCase() !== currentStem(relativePath).toLowerCase()
  )
  if (siblings.some((name) => name.toLowerCase() === stem.toLowerCase())) {
    throw new Error('That name is already used in this folder.')
  }
  const abs = resolveInside(projectDir, relativePath)
  const stat = await fs.stat(abs)
  if (stat.isDirectory()) {
    const destination = joinPath(parent, stem)
    for (const image of retargetImageFiles(snapshot.assets, relativePath, destination)) {
      await saveAsset(projectDir, image)
    }
    await renamePath(abs, resolveInside(projectDir, destination))
    return readProject(projectDir)
  }
  const asset = snapshot.assets.find((item) => item.relativePath === relativePath)
  if (!asset) throw new Error('That file is not a project asset.')
  const destination = joinPath(parent, assetFileName(stem, asset.type))
  const sameFile = destination.toLowerCase() === relativePath.toLowerCase()
  const next = { ...asset, name: stem, relativePath: sameFile ? relativePath : destination }
  await writeJson(resolveInside(projectDir, next.relativePath), assetDocument(next))
  if (!sameFile) await fs.rm(abs)
  else await renamePath(abs, resolveInside(projectDir, destination))
  return readProject(projectDir)
}

export async function moveNode(projectDir: string, relativePath: string, destFolder: string): Promise<ProjectSnapshot> {
  if (!relativePath) throw new Error('Root cannot be moved.')
  const snapshot = await readProject(projectDir)
  const abs = resolveInside(projectDir, relativePath)
  const stat = await fs.stat(abs)
  const sourceIsFolder = stat.isDirectory()
  const plan = planTreeMove({
    sourcePath: relativePath,
    sourceIsFolder,
    destFolder,
    folders: snapshot.folders,
    assetPaths: snapshot.assets.map((asset) => asset.relativePath)
  })
  if (!plan) return snapshot
  if (sourceIsFolder) {
    for (const image of retargetImageFiles(snapshot.assets, relativePath, plan.destination)) {
      await saveAsset(projectDir, image)
    }
    await fs.mkdir(resolveInside(projectDir, destFolder), { recursive: true })
    await renamePath(abs, resolveInside(projectDir, plan.destination))
  } else {
    const asset = snapshot.assets.find((item) => item.relativePath === relativePath)
    if (!asset) throw new Error('That file is not a project asset.')
    let next: Asset = { ...asset, relativePath: plan.destination }
    let movedFile: { from: string; to: string } | null = null
    if (next.type === 'image' && next.file && parentPath(next.file) === parentPath(relativePath)) {
      const currentFile = next.file
      const shared = snapshot.assets.some((item) => item.type === 'image' && item.id !== next.id && item.file === currentFile)
      if (!shared) {
        const extension = path.extname(next.file)
        const stem = path.basename(next.file, extension)
        await fs.mkdir(resolveInside(projectDir, destFolder), { recursive: true })
        const filename = await uniqueFilename(resolveInside(projectDir, destFolder), stem, extension)
        const file = joinPath(destFolder, filename)
        if (file !== next.file) movedFile = { from: next.file, to: file }
        next = { ...next, file }
      }
    }
    await writeJson(resolveInside(projectDir, next.relativePath), assetDocument(next))
    try {
      if (movedFile) await renamePath(resolveInside(projectDir, movedFile.from), resolveInside(projectDir, movedFile.to))
    } catch (error) {
      await fs.rm(resolveInside(projectDir, next.relativePath), { force: true })
      throw error
    }
    await fs.rm(abs)
  }
  await saveWorkspace(projectDir, {
    ...snapshot.workspace,
    expanded: remapMovedPaths(snapshot.workspace.expanded, relativePath, plan.destination, sourceIsFolder)
  })
  return readProject(projectDir)
}

export async function duplicateNode(projectDir: string, relativePath: string): Promise<ProjectSnapshot> {
  if (!relativePath) throw new Error('Root cannot be duplicated.')
  const snapshot = await readProject(projectDir)
  const parent = parentPath(relativePath)
  const plan = planDuplicate({
    assets: snapshot.assets,
    folders: snapshot.folders,
    targetPath: relativePath,
    siblingStems: await siblingStems(resolveInside(projectDir, parent))
  })
  for (const folder of plan.folders) {
    await fs.mkdir(resolveInside(projectDir, folder), { recursive: true })
  }
  for (const copy of plan.copies) {
    const from = resolveInside(projectDir, copy.fromRelative)
    const to = resolveInside(projectDir, copy.toRelative)
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.copyFile(from, to)
  }
  for (const asset of plan.assets) await saveAsset(projectDir, asset)
  return readProject(projectDir)
}

export async function deleteNode(projectDir: string, relativePath: string): Promise<ProjectSnapshot> {
  if (!relativePath) throw new Error('Root cannot be deleted.')
  const snapshot = await readProject(projectDir)
  const abs = resolveInside(projectDir, relativePath)
  const asset = snapshot.assets.find((item) => item.relativePath === relativePath)
  if (asset?.type === 'image' && asset.file) await deleteImageFileIfUnused(projectDir, snapshot.assets, asset.file, asset.id)
  await fs.rm(abs, { recursive: true, force: true })
  if (entryClearedByDelete(snapshot.meta.entryMenuId, snapshot.assets, relativePath)) {
    await saveMeta(projectDir, { ...snapshot.meta, entryMenuId: null })
  }
  return readProject(projectDir)
}

export async function importImage(projectDir: string, relativePath: string, sourcePath: string): Promise<ProjectSnapshot> {
  const snapshot = await readProject(projectDir)
  const asset = snapshot.assets.find((item) => item.relativePath === relativePath)
  if (!asset || asset.type !== 'image') throw new Error('Choose an image asset before importing.')
  const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
  const extension = path.extname(sourcePath).toLowerCase()
  if (!allowed.has(extension)) throw new Error('Import a PNG, JPEG, WebP, or GIF file.')
  const parent = parentPath(relativePath)
  const stem = sanitizeFileStem(path.basename(sourcePath, extension))
  const filename = await uniqueFilename(resolveInside(projectDir, parent), stem, extension)
  const file = joinPath(parent, filename)
  const destination = resolveInside(projectDir, file)
  await fs.copyFile(sourcePath, destination)
  const decoded = nativeImage.createFromPath(destination)
  const size = decoded.isEmpty() ? { width: 0, height: 0 } : decoded.getSize()
  if (asset.file && asset.file !== file) await deleteImageFileIfUnused(projectDir, snapshot.assets, asset.file, asset.id)
  const next: Asset = {
    ...asset,
    file,
    width: size.width,
    height: size.height,
    format: extension.slice(1)
  }
  await saveAsset(projectDir, next)
  return readProject(projectDir)
}

export function resolveInside(root: string, relative: string): string {
  const full = path.resolve(root, ...relative.split('/').filter(Boolean))
  const rel = path.relative(root, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path escapes the project.')
  return full
}

async function walk(
  projectDir: string,
  relative: string,
  folders: string[],
  assets: Asset[],
  warnings: string[]
): Promise<void> {
  const abs = resolveInside(projectDir, relative)
  const entries = await fs.readdir(abs, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const child = joinPath(relative, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      folders.push(child)
      await walk(projectDir, child, folders, assets, warnings)
      continue
    }
    if (relative === '' && (entry.name === 'project.json' || entry.name === 'workspace.json')) continue
    if (!stemOfAssetFile(entry.name)) continue
    try {
      const parsed = parseAsset(JSON.parse(await fs.readFile(path.join(abs, entry.name), 'utf8')), child)
      assets.push(parsed)
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Could not read ${child}.`)
    }
  }
}

async function siblingStems(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    if (entry.name.startsWith('.')) return []
    if (entry.isDirectory()) return [entry.name]
    return stemOfAssetFile(entry.name)?.stem ?? []
  })
}

function currentStem(relativePath: string): string {
  const base = relativePath.split('/').pop() ?? ''
  return stemOfAssetFile(base)?.stem ?? base
}

async function deleteImageFileIfUnused(
  projectDir: string,
  assets: Asset[],
  file: string,
  exceptId: string
): Promise<void> {
  const used = assets.some((asset) => asset.type === 'image' && asset.id !== exceptId && asset.file === file)
  if (used) return
  await fs.rm(resolveInside(projectDir, file), { force: true })
}

async function renamePath(from: string, to: string): Promise<void> {
  if (from === to) return
  try {
    await fs.rename(from, to)
  } catch (error) {
    if (from.toLowerCase() === to.toLowerCase()) return
    throw error
  }
}

async function uniqueFilename(directory: string, stem: string, extension: string): Promise<string> {
  const entries = new Set((await fs.readdir(directory)).map((name) => name.toLowerCase()))
  let filename = `${stem}${extension}`
  let index = 2
  while (entries.has(filename.toLowerCase())) {
    filename = `${stem} ${index}${extension}`
    index += 1
  }
  return filename
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  const body = `${JSON.stringify(value, null, 2)}\n`
  await fs.writeFile(tmp, body, 'utf8')
  try {
    await fs.rename(tmp, file)
  } catch (error) {
    if (!isErrno(error) || (error.code !== 'EEXIST' && error.code !== 'EPERM')) {
      await fs.rm(tmp, { force: true })
      throw error
    }
    await fs.rm(file, { force: true })
    await fs.rename(tmp, file)
  }
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
