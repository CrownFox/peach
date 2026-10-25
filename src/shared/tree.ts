import { isInside, joinPath, parentPath, replacePrefix, stemOfAssetFile } from './paths'
import type { Asset, TreeNode } from './types'

export function expandFolderPath(expanded: readonly string[], folderPath: string): string[] {
  const next = new Set(expanded)
  let current = folderPath
  while (true) {
    next.add(current)
    if (!current) break
    current = parentPath(current)
  }
  return [...next]
}

export function buildTree(folders: string[], assets: Asset[]): TreeNode {
  const root: TreeNode = { kind: 'folder', name: 'Root', relativePath: '', children: [] }
  const byPath = new Map<string, TreeNode>([['', root]])

  const sortedFolders = [...folders].filter(Boolean).sort((a, b) => a.localeCompare(b))
  for (const folder of sortedFolders) {
    ensureFolder(byPath, folder)
  }

  const sortedAssets = [...assets].sort((a, b) => a.name.localeCompare(b.name) || a.relativePath.localeCompare(b.relativePath))
  for (const asset of sortedAssets) {
    const parent = ensureFolder(byPath, parentPath(asset.relativePath))
    parent.children.push({
      kind: 'asset',
      name: asset.name,
      relativePath: asset.relativePath,
      assetId: asset.id,
      assetType: asset.type,
      children: []
    })
  }

  for (const node of byPath.values()) sortChildren(node)
  return root
}

function ensureFolder(byPath: Map<string, TreeNode>, relativePath: string): TreeNode {
  const existing = byPath.get(relativePath)
  if (existing) return existing
  const parent = ensureFolder(byPath, parentPath(relativePath))
  const name = relativePath.split('/').pop() ?? 'Folder'
  const node: TreeNode = { kind: 'folder', name, relativePath, children: [] }
  parent.children.push(node)
  byPath.set(relativePath, node)
  return node
}

function sortChildren(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function planTreeMove(input: {
  sourcePath: string
  sourceIsFolder: boolean
  destFolder: string
  folders: string[]
  assetPaths: string[]
}): { destination: string } | null {
  const { sourcePath, destFolder } = input
  if (!sourcePath) throw new Error('Root cannot be moved.')
  if (destFolder && !input.folders.some((folder) => samePath(folder, destFolder))) {
    throw new Error('That folder is not in the project.')
  }
  if (input.sourceIsFolder && isInside(sourcePath, destFolder)) {
    throw new Error('A folder cannot be moved into itself.')
  }
  if (samePath(parentPath(sourcePath), destFolder)) return null
  const base = sourcePath.split('/').pop() ?? sourcePath
  const stem = input.sourceIsFolder ? base : (stemOfAssetFile(base)?.stem ?? base)
  const taken = stemsInFolder(destFolder, input.folders, input.assetPaths)
  if (taken.some((name) => name.toLowerCase() === stem.toLowerCase())) {
    throw new Error('That name is already used in this folder.')
  }
  return { destination: joinPath(destFolder, base) }
}

export function remapMovedPaths(paths: readonly string[], from: string, to: string, sourceIsFolder: boolean): string[] {
  const remapped = sourceIsFolder
    ? paths.map((path) => (path === from || isInside(from, path) ? replacePrefix(path, from, to) : path))
    : [...paths]
  return expandFolderPath(remapped, parentPath(to))
}

function stemsInFolder(folder: string, folders: string[], assetPaths: string[]): string[] {
  const stems: string[] = []
  for (const item of folders) {
    if (!samePath(parentPath(item), folder)) continue
    const name = item.split('/').pop()
    if (name) stems.push(name)
  }
  for (const item of assetPaths) {
    if (!samePath(parentPath(item), folder)) continue
    const base = item.split('/').pop() ?? ''
    const parsed = stemOfAssetFile(base)
    if (parsed) stems.push(parsed.stem)
  }
  return stems
}

function samePath(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}
