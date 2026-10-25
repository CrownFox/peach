const RESERVED_WINDOWS_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9'
])

export function parentPath(relative: string): string {
  const parts = relative.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export function joinPath(...parts: string[]): string {
  return parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')
}

export function isInside(parent: string, child: string): boolean {
  if (parent === '') return child !== ''
  return child === parent || child.startsWith(`${parent}/`)
}

export function replacePrefix(value: string, sourcePrefix: string, destPrefix: string): string {
  if (sourcePrefix === '') return joinPath(destPrefix, value)
  if (value === sourcePrefix) return destPrefix
  if (value.startsWith(`${sourcePrefix}/`)) return destPrefix + value.slice(sourcePrefix.length)
  return value
}

export function encodeRelative(relative: string): string {
  return relative.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

export function sanitizeFileStem(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/[. ]+$/g, '')
  const stem = cleaned || 'Untitled'
  if (RESERVED_WINDOWS_NAMES.has(stem.toLowerCase())) return `${stem}_`
  return stem
}

const ASSET_FILE_TYPES = ['menu', 'button', 'image', 'script', 'panel', 'collection', 'book', 'composite'] as const
export type AssetFileType = (typeof ASSET_FILE_TYPES)[number]

export function assetFileName(stem: string, type: AssetFileType): string {
  return `${sanitizeFileStem(stem)}.${type}.json`
}

export function stemOfAssetFile(filename: string): { stem: string; type: AssetFileType } | null {
  for (const type of ASSET_FILE_TYPES) {
    const suffix = `.${type}.json`
    if (filename.toLowerCase().endsWith(suffix)) {
      return { stem: filename.slice(0, -suffix.length), type }
    }
  }
  return null
}

export function assetLocation(relativePath: string): string {
  const file = relativePath.split('/').pop() ?? ''
  const parsed = stemOfAssetFile(file)
  return joinPath(parentPath(relativePath), parsed?.stem ?? file)
}

export function extensionOf(relative: string): string {
  const base = relative.split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function uniqueName(existing: string[], desired: string): string {
  const used = new Set(existing.map((name) => name.toLowerCase()))
  if (!used.has(desired.toLowerCase())) return desired
  let index = 2
  while (used.has(`${desired} ${index}`.toLowerCase())) index += 1
  return `${desired} ${index}`
}
