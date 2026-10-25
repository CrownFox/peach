import { describe, expect, it } from 'vitest'
import { assetDocument, createAsset, parseAsset } from './assets'
import {
  addWorkingEntry,
  collectionLoadError,
  createWorkingCollection,
  findWorkingEntry,
  loadWorkingCollection,
  masterKeyIssues,
  removeWorkingEntry,
  saveWorkingCollection,
  setWorkingField,
  setWorkingFieldByKey,
  workingFieldValue,
  type WorkingEntry
} from './collections'
import type { CollectionAsset } from './types'

function items(): CollectionAsset {
  return {
    id: 'items',
    type: 'collection',
    name: 'Items',
    relativePath: 'Collections/Items.collection.json',
    masterKeyId: 'name',
    fields: [
      { id: 'name', name: 'Name', type: 'text', presets: [], enforcePresets: false },
      { id: 'rare', name: 'Rare', type: 'boolean', presets: [], enforcePresets: false }
    ],
    entries: [
      { id: 'a', values: { name: 'Iron Sword', rare: false } },
      { id: 'b', values: { name: 'Gem', rare: true } }
    ]
  }
}

describe('collections', () => {
  it('starts with a Name field and round-trips through JSON', () => {
    const asset = createAsset('collection', 'Items', 'Collections/Items.collection.json', 'items')
    const parsed = parseAsset(assetDocument(asset), asset.relativePath)
    expect(parsed.type).toBe('collection')
    if (parsed.type !== 'collection') return
    expect(parsed.fields).toHaveLength(1)
    expect(parsed.fields[0]?.name).toBe('Name')
    expect(parsed.fields[0]?.type).toBe('text')
    expect(parsed.masterKeyId).toBe(parsed.fields[0]?.id)
    expect(parsed.entries).toEqual([])
  })

  it('keeps a stored true boolean and flags blank or duplicate master keys', () => {
    const parsed = parseAsset(
      {
        id: 'items',
        type: 'collection',
        name: 'Items',
        masterKeyId: 'name',
        fields: [
          { id: 'name', name: 'Name', type: 'text' },
          { id: 'rare', name: 'Rare', type: 'boolean' }
        ],
        entries: [{ id: 'a', values: { name: 'Gem', rare: 'true' } }]
      },
      'Collections/Items.collection.json'
    )
    if (parsed.type !== 'collection') throw new Error('expected a collection')
    expect(parsed.entries[0]?.values.rare).toBe(true)

    const asset = items()
    expect(collectionLoadError(asset)).toBeNull()
    asset.entries.push({ id: 'c', values: { name: 'Iron Sword', rare: false } })
    expect(masterKeyIssues(asset).entryIds.sort()).toEqual(['a', 'c'])
    expect(collectionLoadError(asset)).toContain('duplicated')

    asset.entries = [{ id: 'd', values: { name: '   ', rare: false } }]
    expect(masterKeyIssues(asset).message).toContain('needs a value')

    asset.masterKeyId = 'rare'
    asset.entries = [
      { id: 'e', values: { name: 'A', rare: false } },
      { id: 'f', values: { name: 'B', rare: false } }
    ]
    expect(masterKeyIssues(asset).entryIds.sort()).toEqual(['e', 'f'])
    expect(collectionLoadError({ ...asset, fields: asset.fields.map((field) => ({ ...field, name: 'Same' })) })).toContain('named "Same"')
  })

  it('keeps an explicit set when the value matches the authored value', () => {
    const working = createWorkingCollection(items())
    const sword = findWorkingEntry(working, 'Iron Sword')
    if (!sword) throw new Error('missing sword')
    setWorkingField(working, sword, 'Rare', true)
    setWorkingField(working, sword, 'Rare', false)
    const saved = saveWorkingCollection(working)
    expect(JSON.parse(saved)).toEqual({
      removed: [],
      added: [],
      overrides: [{ key: 'Iron Sword', values: { Rare: false } }]
    })

    setWorkingField(working, sword, 'Rare', true)
    loadWorkingCollection(working, saved)
    const restored = findWorkingEntry(working, 'Iron Sword')
    if (!restored) throw new Error('missing sword')
    expect(workingFieldValue(working, restored, 'Rare')).toBe(false)
    expect(saveWorkingCollection(working)).toBe(saved)
  })

  it('marks an authored entry removed and drops an added entry that was removed', () => {
    const working = createWorkingCollection(items())
    const gem = findWorkingEntry(working, 'Gem')
    if (!gem) throw new Error('missing gem')
    removeWorkingEntry(gem)
    expect(() => addWorkingEntry(working, 'Iron Sword')).toThrow('already exists')
    const copy = addWorkingEntry(working, 'Gem')
    setWorkingField(working, copy, 'Rare', false)
    const replaced = saveWorkingCollection(working)
    expect(JSON.parse(replaced)).toEqual({
      removed: ['Gem'],
      added: [{ key: 'Gem', values: { Rare: false } }],
      overrides: []
    })
    const reloaded = createWorkingCollection(items())
    loadWorkingCollection(reloaded, replaced)
    const gemAgain = findWorkingEntry(reloaded, 'Gem')
    if (!gemAgain) throw new Error('missing gem')
    expect(gemAgain.origin).toBe('added')
    expect(workingFieldValue(reloaded, gemAgain, 'Rare')).toBe(false)
    removeWorkingEntry(copy)
    const steel = addWorkingEntry(working, 'Steel Sword')
    setWorkingField(working, steel, 'Rare', true)
    removeWorkingEntry(steel)
    const kept = addWorkingEntry(working, 'Kept Sword')
    expect(findWorkingEntry(working, 'Gem')).toBeNull()
    expect(findWorkingEntry(working, 'Steel Sword')).toBeNull()
    expect(JSON.parse(saveWorkingCollection(working))).toEqual({
      removed: ['Gem'],
      added: [{ key: 'Kept Sword', values: {} }],
      overrides: []
    })
    expect(() => setWorkingField(working, gem, 'Rare', true)).toThrow('That entry has been removed.')
    expect(() => setWorkingField(working, findWorkingEntry(working, 'Iron Sword') as WorkingEntry, 'Name', 'Other')).toThrow(
      'The master key cannot be changed.'
    )

    setWorkingFieldByKey(working, 'Iron Sword', 'Rare', true)
    expect(() => loadWorkingCollection(working, '{')).toThrow('The collection save is not valid JSON.')
    const sword = findWorkingEntry(working, 'Iron Sword')
    if (!sword) throw new Error('missing sword')
    expect(workingFieldValue(working, sword, 'Rare')).toBe(true)
  })
})
