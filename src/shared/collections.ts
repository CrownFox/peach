import type { CollectionAsset, CollectionEntry, CollectionField } from './types'

export type MasterKeyIssues = {
  entryIds: string[]
  message: string | null
}

export function coerceFieldValue(field: CollectionField, value: unknown): string | boolean {
  if (field.type === 'boolean') return value === true || value === 'true'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return typeof value === 'string' ? value : ''
}

export function entryFieldValue(field: CollectionField, entry: CollectionEntry): string | boolean {
  return coerceFieldValue(field, entry.values[field.id])
}

export function masterKeyIssues(asset: CollectionAsset): MasterKeyIssues {
  const field = asset.fields.find((item) => item.id === asset.masterKeyId)
  if (!field) return { entryIds: [], message: 'Choose a master key before the game can load this collection.' }
  const seen = new Map<string, string[]>()
  const blanks: string[] = []
  for (const entry of asset.entries) {
    const value = entryFieldValue(field, entry)
    if (field.type === 'text' && (typeof value !== 'string' || value.trim() === '')) {
      blanks.push(entry.id)
      continue
    }
    const token = String(value)
    const list = seen.get(token) ?? []
    list.push(entry.id)
    seen.set(token, list)
  }
  const duplicates = [...seen.values()].filter((list) => list.length > 1).flat()
  const entryIds = [...blanks, ...duplicates]
  if (entryIds.length === 0) return { entryIds, message: null }
  const parts: string[] = []
  if (duplicates.length > 0) parts.push('Some master keys are duplicated.')
  if (blanks.length > 0) parts.push('Every master key needs a value.')
  return { entryIds, message: `${parts.join(' ')} Change the highlighted values before the game can load this collection.` }
}

export function collectionLoadError(asset: CollectionAsset): string | null {
  const names = asset.fields.map((field) => field.name.trim())
  if (names.some((name) => name.length === 0)) return 'Every field needs a name.'
  const duplicate = names.find((name, index) => names.indexOf(name) !== index)
  if (duplicate) return `Two fields are named "${duplicate}".`
  return masterKeyIssues(asset).message
}

export type CollectionScalar = string | boolean

export type WorkingField = {
  id: string
  name: string
  type: 'text' | 'boolean'
}

export type WorkingEntry = {
  uid: number
  origin: 'authored' | 'added'
  removed: boolean
  base: Record<string, CollectionScalar>
  sets: Record<string, CollectionScalar>
}

export type WorkingCollection = {
  fields: WorkingField[]
  masterKeyId: string
  nextUid: number
  entries: WorkingEntry[]
}

type SavedRecord = {
  key: CollectionScalar
  values: Record<string, CollectionScalar>
}

type ChangePlan = {
  removed: CollectionScalar[]
  added: SavedRecord[]
  overrides: SavedRecord[]
}

export function createWorkingCollection(asset: CollectionAsset): WorkingCollection {
  const master = asset.fields.find((field) => field.id === asset.masterKeyId)
  if (!master) throw new Error('Choose a master key before the game can load this collection.')
  let nextUid = 1
  const entries: WorkingEntry[] = asset.entries.map((entry) => {
    const base: Record<string, CollectionScalar> = {}
    for (const field of asset.fields) base[field.id] = entryFieldValue(field, entry)
    return { uid: nextUid++, origin: 'authored', removed: false, base, sets: {} }
  })
  return {
    fields: asset.fields.map((field) => ({ id: field.id, name: field.name, type: field.type })),
    masterKeyId: master.id,
    nextUid,
    entries
  }
}

export function findWorkingEntry(working: WorkingCollection, key: CollectionScalar): WorkingEntry | null {
  return working.entries.find((entry) => !entry.removed && entry.base[working.masterKeyId] === key) ?? null
}

export function workingFieldValue(working: WorkingCollection, entry: WorkingEntry, fieldName: string): CollectionScalar {
  const field = fieldByName(working, fieldName)
  if (!field) throw new Error(`No field "${fieldName}".`)
  if (entry.removed) throw new Error('That entry has been removed.')
  if (field.id in entry.sets) return entry.sets[field.id]
  const base = entry.base[field.id]
  if (base !== undefined) return base
  return field.type === 'boolean' ? false : ''
}

export function setWorkingField(working: WorkingCollection, entry: WorkingEntry, fieldName: string, value: CollectionScalar): void {
  if (entry.removed) throw new Error('That entry has been removed.')
  const field = fieldByName(working, fieldName)
  if (!field) throw new Error(`No field "${fieldName}".`)
  if (field.id === working.masterKeyId) throw new Error('The master key cannot be changed.')
  if (field.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${field.name} expects true or false.`)
  if (field.type === 'text' && typeof value !== 'string') throw new Error(`${field.name} expects text.`)
  entry.sets[field.id] = value
}

export function setWorkingFieldByKey(working: WorkingCollection, key: CollectionScalar, fieldName: string, value: CollectionScalar): void {
  const entry = findWorkingEntry(working, key)
  if (!entry) throw new Error('No entry for that master key.')
  setWorkingField(working, entry, fieldName, value)
}

export function addWorkingEntry(working: WorkingCollection, key: CollectionScalar): WorkingEntry {
  const master = working.fields.find((field) => field.id === working.masterKeyId)
  if (!master) throw new Error('Choose a master key before the game can load this collection.')
  if (master.type === 'text' && typeof key !== 'string') throw new Error(`A master key for ${master.name} is text.`)
  if (master.type === 'boolean' && typeof key !== 'boolean') throw new Error(`A master key for ${master.name} is true or false.`)
  if (typeof key === 'string' && key.trim() === '') throw new Error('Every master key needs a value.')
  if (findWorkingEntry(working, key)) throw new Error('An entry with that master key already exists.')
  const base: Record<string, CollectionScalar> = {}
  for (const field of working.fields) base[field.id] = field.id === working.masterKeyId ? key : field.type === 'boolean' ? false : ''
  const entry: WorkingEntry = { uid: working.nextUid++, origin: 'added', removed: false, base, sets: {} }
  working.entries.push(entry)
  return entry
}

export function removeWorkingEntry(entry: WorkingEntry): void {
  if (entry.removed) throw new Error('That entry has been removed.')
  entry.removed = true
  entry.sets = {}
}

export function removeWorkingEntryByKey(working: WorkingCollection, key: CollectionScalar): void {
  const entry = findWorkingEntry(working, key)
  if (!entry) throw new Error('No entry for that master key.')
  removeWorkingEntry(entry)
}

export function saveWorkingCollection(working: WorkingCollection): string {
  return JSON.stringify({
    removed: working.entries
      .filter((entry) => entry.origin === 'authored' && entry.removed)
      .map((entry) => entry.base[working.masterKeyId]),
    added: working.entries
      .filter((entry) => entry.origin === 'added' && !entry.removed)
      .map((entry) => ({ key: entry.base[working.masterKeyId], values: namedSets(working, entry) })),
    overrides: working.entries
      .filter((entry) => entry.origin === 'authored' && !entry.removed && Object.keys(entry.sets).length > 0)
      .map((entry) => ({ key: entry.base[working.masterKeyId], values: namedSets(working, entry) }))
  })
}

export function loadWorkingCollection(working: WorkingCollection, saved: string): void {
  const plan = parseCollectionChanges(working, saved)
  const authored = working.entries
    .filter((entry) => entry.origin === 'authored')
    .map((entry) => ({
      ...entry,
      removed: plan.removed.some((key) => key === entry.base[working.masterKeyId]),
      sets: overrideSets(working, plan.overrides, entry.base[working.masterKeyId])
    }))
  let nextUid = working.nextUid
  const added = plan.added.map((item) => {
    const base: Record<string, CollectionScalar> = {}
    for (const field of working.fields) base[field.id] = field.id === working.masterKeyId ? item.key : field.type === 'boolean' ? false : ''
    return {
      uid: nextUid++,
      origin: 'added' as const,
      removed: false,
      base,
      sets: setsById(working, item.values)
    }
  })
  working.entries = [...authored, ...added]
  working.nextUid = nextUid
}

function fieldByName(working: WorkingCollection, fieldName: string): WorkingField | null {
  return working.fields.find((field) => field.name === fieldName) ?? null
}

function namedSets(working: WorkingCollection, entry: WorkingEntry): Record<string, CollectionScalar> {
  const values: Record<string, CollectionScalar> = {}
  for (const field of working.fields) {
    if (field.id in entry.sets) values[field.name] = entry.sets[field.id]
  }
  return values
}

function setsById(working: WorkingCollection, values: Record<string, CollectionScalar>): Record<string, CollectionScalar> {
  const sets: Record<string, CollectionScalar> = {}
  for (const field of working.fields) {
    if (field.name in values) sets[field.id] = values[field.name]
  }
  return sets
}

function overrideSets(working: WorkingCollection, overrides: SavedRecord[], key: CollectionScalar): Record<string, CollectionScalar> {
  const match = overrides.find((item) => item.key === key)
  return match ? setsById(working, match.values) : {}
}

function parseCollectionChanges(working: WorkingCollection, saved: string): ChangePlan {
  let raw: unknown
  try {
    raw = JSON.parse(saved)
  } catch {
    throw new Error('The collection save is not valid JSON.')
  }
  if (!isRecord(raw)) throw new Error('The collection save must be an object.')
  const removed = readKeys(raw.removed)
  const added = readRecords(working, raw.added)
  const overrides = readRecords(working, raw.overrides)
  const master = working.fields.find((field) => field.id === working.masterKeyId)
  if (!master) throw new Error('Choose a master key before the game can load this collection.')
  const authoredKeys = working.entries
    .filter((entry) => entry.origin === 'authored')
    .map((entry) => entry.base[working.masterKeyId])
  if (hasDuplicate(removed) || hasDuplicate(added.map((item) => item.key)) || hasDuplicate(overrides.map((item) => item.key))) {
    throw new Error('The save lists that master key more than once.')
  }
  for (const key of removed) {
    if (!authoredKeys.some((item) => item === key)) throw new Error('No authored entry for that master key.')
  }
  for (const item of added) {
    if (master.type === 'text' && typeof item.key !== 'string') throw new Error(`A master key for ${master.name} is text.`)
    if (master.type === 'boolean' && typeof item.key !== 'boolean') throw new Error(`A master key for ${master.name} is true or false.`)
    if (typeof item.key === 'string' && item.key.trim() === '') throw new Error('Every master key needs a value.')
    const stillVisible = authoredKeys.some((key) => key === item.key) && !removed.some((key) => key === item.key)
    if (stillVisible) throw new Error('An entry with that master key already exists.')
  }
  for (const item of overrides) {
    const visible = authoredKeys.some((key) => key === item.key) && !removed.some((key) => key === item.key)
    if (!visible) throw new Error('No entry for that master key.')
  }
  return { removed, added, overrides }
}

function readKeys(value: unknown): CollectionScalar[] {
  const list = value ?? []
  if (!Array.isArray(list)) throw new Error('The collection save is not valid.')
  return list.map(readKey)
}

function readRecords(working: WorkingCollection, value: unknown): SavedRecord[] {
  const list = value ?? []
  if (!Array.isArray(list)) throw new Error('The collection save is not valid.')
  return list.map((item) => {
    if (!isRecord(item)) throw new Error('The collection save is not valid.')
    return { key: readKey(item.key), values: readValues(working, item.values ?? {}) }
  })
}

function readValues(working: WorkingCollection, value: unknown): Record<string, CollectionScalar> {
  if (!isRecord(value)) throw new Error('Saved field values must be an object.')
  const values: Record<string, CollectionScalar> = {}
  for (const [name, fieldValue] of Object.entries(value)) {
    const field = fieldByName(working, name)
    if (!field) throw new Error(`No field "${name}".`)
    if (field.id === working.masterKeyId) throw new Error('The master key cannot be changed.')
    if (field.type === 'boolean') {
      if (typeof fieldValue !== 'boolean') throw new Error(`${field.name} expects true or false.`)
      values[name] = fieldValue
    } else {
      if (typeof fieldValue !== 'string') throw new Error(`${field.name} expects text.`)
      values[name] = fieldValue
    }
  }
  return values
}

function readKey(value: unknown): CollectionScalar {
  if (typeof value === 'string' || typeof value === 'boolean') return value
  throw new Error('A master key is text or true or false.')
}

function hasDuplicate(keys: CollectionScalar[]): boolean {
  return keys.some((key, index) => keys.slice(0, index).some((earlier) => earlier === key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
