import { net, protocol } from 'electron'
import { pathToFileURL } from 'url'
import { resolveInside } from './projectFiles'

let projectDir: string | null = null

export function setProjectDir(dir: string | null): void {
  projectDir = dir
}

export function registerAssetProtocol(): void {
  protocol.handle('peach-asset', (request) => {
    if (!projectDir) return new Response('No project is open.', { status: 404 })
    try {
      const url = new URL(request.url)
      const relative = url.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/')
      const full = resolveInside(projectDir, relative)
      return net.fetch(pathToFileURL(full).toString())
    } catch {
      return new Response('Missing asset.', { status: 404 })
    }
  })
}
