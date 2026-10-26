import { isAssetPageField, PAGE_VALUE_TYPES } from './books'
import type { AssetType, PageFieldType } from './types'

export type ScriptPropertyType = PageFieldType | 'string' | 'integer' | 'float'

export type ScriptProperty = {
  name: string
  type: ScriptPropertyType
  label: string
}

const propertyTypes = new Set<string>([...PAGE_VALUE_TYPES.map((item) => item.type), 'string', 'integer', 'float'])
const propertyLine = /^\s*---@property\s+([A-Za-z_][A-Za-z0-9_]*)\s+(\S+)\s+"([^"]*)"\s*$/

export function scriptProperties(source: string): ScriptProperty[] {
  const found: ScriptProperty[] = []
  const seen = new Set<string>()
  for (const line of source.split(/\r?\n/)) {
    if (line.trim() === '') continue
    if (!line.trimStart().startsWith('--')) break
    const match = propertyLine.exec(line)
    if (!match) continue
    const [, name, type, label] = match
    if (!name || !type || !propertyTypes.has(type) || seen.has(name)) continue
    seen.add(name)
    found.push({ name, type: type as ScriptPropertyType, label: label || name })
  }
  return found
}

export function isAssetScriptProperty(type: ScriptPropertyType): type is AssetType {
  return type !== 'string' && type !== 'integer' && type !== 'float' && isAssetPageField(type)
}

export function scriptPropertyNumber(value: unknown, integer: boolean): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return 0
  return integer ? Math.trunc(parsed) : parsed
}

function mergeProperties(base: ScriptProperty[], extra: readonly ScriptProperty[]): ScriptProperty[] {
  const ordered = [...base]
  const index = new Map(ordered.map((property, position) => [property.name, position]))
  for (const property of extra) {
    const existing = index.get(property.name)
    if (existing === undefined) {
      index.set(property.name, ordered.length)
      ordered.push(property)
      continue
    }
    ordered[existing] = property
  }
  return ordered
}

export function componentProperties(shared: string, local: string): ScriptProperty[] {
  return mergeProperties(scriptProperties(shared), scriptProperties(local))
}

export function propertiesInScope(sources: readonly string[], current: string, outer: readonly ScriptProperty[] = []): ScriptProperty[] {
  const declared = mergeProperties(
    sources.reduce((combined, source) => mergeProperties(combined, scriptProperties(source)), [] as ScriptProperty[]),
    scriptProperties(current)
  )
  const names = new Set(declared.map((property) => property.name))
  return [...declared, ...outer.filter((property) => !names.has(property.name))]
}
