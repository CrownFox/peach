import { readFile } from 'fs/promises'
import type { Plugin } from 'esbuild'

const STUBBED = new Set(['fs', 'os', 'path', 'child_process', 'readline-sync', 'tmp'])

function browserFengari(source: string): string {
  return source
    .replaceAll('typeof process === "undefined"', 'true')
    .replaceAll('typeof process !== "undefined"', 'false')
    .replaceAll('process.env.FENGARICONF', 'undefined')
}

function fengariSource(id: string): boolean {
  const file = id.split('?')[0] ?? id
  return file.includes('fengari') && file.endsWith('.js')
}

export function fengariStubPlugin(): Plugin {
  return {
    name: 'fengari-node-stubs',
    setup(build) {
      build.onResolve({ filter: /^(fs|os|path|child_process|readline-sync|tmp)$/ }, (args) => {
        if (!args.importer.includes('fengari')) return undefined
        return { path: args.path, namespace: 'fengari-stub' }
      })
      build.onLoad({ filter: /.*/, namespace: 'fengari-stub' }, (args) => ({
        contents: args.path === 'os' ? 'module.exports = { platform() { return "browser" } }' : 'module.exports = {}',
        loader: 'js'
      }))
      build.onLoad({ filter: /[\\/]fengari[\\/].+\.js$/ }, async (args) => ({
        contents: browserFengari(await readFile(args.path, 'utf8')),
        loader: 'js'
      }))
    }
  }
}

export function fengariViteStub(): {
  name: string
  enforce: 'pre'
  resolveId: (id: string, importer?: string) => string | undefined
  load: (id: string) => string | undefined
  transform: (code: string, id: string) => string | undefined
} {
  return {
    name: 'fengari-vite-stubs',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer?.includes('fengari') || !STUBBED.has(id)) return undefined
      return `\0fengari-stub:${id}`
    },
    load(id) {
      if (!id.startsWith('\0fengari-stub:')) return undefined
      if (id.endsWith(':os')) return 'export function platform() { return "browser" }\nexport default { platform }'
      return 'export default {}'
    },
    transform(code, id) {
      if (!fengariSource(id)) return undefined
      return browserFengari(code)
    }
  }
}
