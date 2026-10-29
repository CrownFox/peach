import { app } from 'electron'
import { fengariStubPlugin } from '../../fengariStub'
import { build, type BuildOptions } from 'esbuild'
import fs from 'fs/promises'
import path from 'path'
import { assetDocument, exportableAssets } from '@shared/assets'
import { embedGamePage } from '@shared/playerPage'
import { assetLocation } from '@shared/paths'
import type { ExportResult } from '@shared/types'
import { readProject, resolveInside } from './projectFiles'

export async function exportGame(projectDir: string, destination: string): Promise<ExportResult> {
  const snapshot = await readProject(projectDir)
  const warnings = [...snapshot.warnings]
  const copied = new Map<string, string>()
  for (const asset of snapshot.assets) {
    if (asset.type !== 'image' || !asset.file) continue
    const target = `media/${asset.file}`
    if (copied.has(asset.file)) continue
    try {
      const from = resolveInside(projectDir, asset.file)
      const to = path.join(destination, ...target.split('/'))
      await fs.mkdir(path.dirname(to), { recursive: true })
      await fs.copyFile(from, to)
      copied.set(asset.file, target)
    } catch {
      warnings.push(`Could not export image file ${asset.file}.`)
    }
  }
  let icon: string | null = null
  if (snapshot.meta.icon) {
    const target = `media/${snapshot.meta.icon.split('/').pop()}`
    try {
      const from = resolveInside(projectDir, snapshot.meta.icon)
      const to = path.join(destination, ...target.split('/'))
      await fs.mkdir(path.dirname(to), { recursive: true })
      await fs.copyFile(from, to)
      icon = target
    } catch {
      warnings.push('Could not export the game icon.')
    }
  }
  const assets = exportableAssets(snapshot.assets, (file) => copied.get(file) ?? file).map((asset) => {
    const original = snapshot.assets.find((item) => item.id === asset.id)
    return { ...assetDocument(asset), location: assetLocation(original?.relativePath ?? asset.relativePath) }
  })
  await fs.mkdir(destination, { recursive: true })
  const game = {
    formatVersion: snapshot.meta.formatVersion,
    name: snapshot.meta.name,
    author: snapshot.meta.author,
    icon,
    entryMenuId: snapshot.meta.entryMenuId,
    inputStyle: snapshot.meta.inputStyle,
    assets
  }
  await fs.writeFile(path.join(destination, 'game.json'), `${JSON.stringify(game, null, 2)}\n`, 'utf8')
  const appPath = app.getAppPath()
  const playerHtml = path.join(appPath, 'src/player/index.html')
  const playerEntry = path.join(appPath, 'src/player/main.ts')
  const page = embedGamePage(await fs.readFile(playerHtml, 'utf8'), game)
  await fs.writeFile(path.join(destination, 'index.html'), page, 'utf8')
  const options: BuildOptions = {
    entryPoints: [playerEntry],
    bundle: true,
    outfile: path.join(destination, 'player.js'),
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    absWorkingDir: appPath,
    legalComments: 'none',
    plugins: [fengariStubPlugin()]
  }
  await build(options)
  return { directory: destination, warnings }
}
