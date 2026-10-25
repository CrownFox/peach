<script setup lang="ts">
import { computed, ref } from 'vue'
import { collectionLoadError, coerceFieldValue, entryFieldValue, masterKeyIssues } from '@shared/collections'
import { createId } from '@shared/ids'
import { uniqueName } from '@shared/paths'
import type { CollectionAsset, CollectionField, CollectionFieldType } from '@shared/types'
import { useProjectStore } from '@/stores/project'

const props = defineProps<{ collectionId: string }>()
const project = useProjectStore()
const editing = ref(false)

const collection = computed(() => {
  const asset = project.asset(props.collectionId)
  return asset?.type === 'collection' ? asset : null
})
const banner = computed(() => (collection.value ? collectionLoadError(collection.value) : null))
const keyProblems = computed(() => new Set(collection.value ? masterKeyIssues(collection.value).entryIds : []))
const nameProblems = computed(() => {
  const fields = collection.value?.fields ?? []
  const names = fields.map((field) => field.name.trim())
  return new Set(
    fields
      .filter((field) => {
        const name = field.name.trim()
        return name.length === 0 || names.filter((item) => item === name).length > 1
      })
      .map((field) => field.id)
  )
})

function patch(recipe: (asset: CollectionAsset) => void): void {
  project.patchAsset(props.collectionId, (asset) => {
    if (asset.type === 'collection') recipe(asset)
  })
}

function entryOf(entryId: string) {
  return collection.value?.entries.find((entry) => entry.id === entryId) ?? null
}

function textOf(field: CollectionField, entryId: string): string {
  const entry = entryOf(entryId)
  if (!entry) return ''
  const value = entryFieldValue(field, entry)
  return typeof value === 'string' ? value : ''
}

function checked(field: CollectionField, entryId: string): boolean {
  const entry = entryOf(entryId)
  return entry ? entryFieldValue(field, entry) === true : false
}

function cellClass(field: CollectionField, entryId: string): string {
  if (field.id === collection.value?.masterKeyId && keyProblems.value.has(entryId)) return 'problem'
  if (field.enforcePresets && field.type === 'text' && !field.presets.includes(textOf(field, entryId))) return 'off-preset'
  return ''
}

function addField(): void {
  patch((asset) => {
    const field: CollectionField = {
      id: createId(),
      name: uniqueName(
        asset.fields.map((item) => item.name),
        'Field'
      ),
      type: 'text',
      presets: [],
      enforcePresets: false
    }
    asset.fields.push(field)
    if (!asset.masterKeyId) asset.masterKeyId = field.id
    for (const entry of asset.entries) entry.values[field.id] = ''
  })
}

function removeField(fieldId: string): void {
  patch((asset) => {
    asset.fields = asset.fields.filter((field) => field.id !== fieldId)
    for (const entry of asset.entries) delete entry.values[fieldId]
    if (asset.masterKeyId === fieldId) asset.masterKeyId = asset.fields[0]?.id ?? null
  })
}

function renameField(fieldId: string, name: string): void {
  patch((asset) => {
    const field = asset.fields.find((item) => item.id === fieldId)
    if (field) field.name = name
  })
}

function setType(fieldId: string, type: CollectionFieldType): void {
  patch((asset) => {
    const field = asset.fields.find((item) => item.id === fieldId)
    if (!field || field.type === type) return
    field.type = type
    if (type === 'boolean') {
      field.presets = []
      field.enforcePresets = false
    }
    for (const entry of asset.entries) entry.values[field.id] = coerceFieldValue(field, entry.values[field.id])
  })
}

function setMaster(fieldId: string): void {
  patch((asset) => {
    asset.masterKeyId = fieldId
  })
}

function setEnforce(fieldId: string, enforce: boolean): void {
  patch((asset) => {
    const field = asset.fields.find((item) => item.id === fieldId)
    if (field && field.type === 'text') field.enforcePresets = enforce
  })
}

function addPreset(fieldId: string, form: HTMLFormElement): void {
  const input = form.elements.namedItem('preset')
  if (!(input instanceof HTMLInputElement)) return
  const preset = input.value.trim()
  input.value = ''
  if (!preset) return
  patch((asset) => {
    const field = asset.fields.find((item) => item.id === fieldId)
    if (!field || field.type !== 'text' || field.presets.includes(preset)) return
    field.presets.push(preset)
  })
}

function removePreset(fieldId: string, preset: string): void {
  patch((asset) => {
    const field = asset.fields.find((item) => item.id === fieldId)
    if (field) field.presets = field.presets.filter((item) => item !== preset)
  })
}

function addEntry(): void {
  patch((asset) => {
    const values: Record<string, string | boolean> = {}
    for (const field of asset.fields) values[field.id] = field.type === 'boolean' ? false : ''
    asset.entries.push({ id: createId(), values })
  })
}

function removeEntry(entryId: string): void {
  patch((asset) => {
    asset.entries = asset.entries.filter((entry) => entry.id !== entryId)
  })
}

function setCell(entryId: string, fieldId: string, value: string | boolean): void {
  patch((asset) => {
    const field = asset.fields.find((item) => item.id === fieldId)
    const entry = asset.entries.find((item) => item.id === entryId)
    if (!field || !entry) return
    entry.values[field.id] = field.type === 'boolean' ? value === true : String(value)
  })
}
</script>

<template>
  <div v-if="collection" class="collection-page">
    <div class="menu-toolbar">
      <button class="btn" type="button" @click="editing = true">Edit Template</button>
      <button class="btn" type="button" @click="addEntry">Add entry</button>
    </div>
    <p v-if="banner" class="collection-banner">{{ banner }}</p>
    <div class="sheet-scroll">
      <table class="sheet">
        <thead>
          <tr>
            <th v-for="field in collection.fields" :key="field.id">
              {{ field.name || 'Untitled' }}
              <span v-if="field.id === collection.masterKeyId" class="key-mark">KEY</span>
              <datalist :id="`presets-${collectionId}-${field.id}`">
                <option v-for="preset in field.presets" :key="preset" :value="preset" />
              </datalist>
            </th>
            <th class="row-end"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="collection.entries.length === 0">
            <td class="sheet-empty" :colspan="Math.max(collection.fields.length, 1) + 1">Add an entry to this collection.</td>
          </tr>
          <tr v-for="entry in collection.entries" :key="entry.id">
            <td v-for="field in collection.fields" :key="field.id" :class="cellClass(field, entry.id)">
              <input
                v-if="field.type === 'boolean'"
                type="checkbox"
                :checked="checked(field, entry.id)"
                @change="setCell(entry.id, field.id, ($event.target as HTMLInputElement).checked)"
              />
              <select
                v-else-if="field.enforcePresets"
                :value="textOf(field, entry.id)"
                @change="setCell(entry.id, field.id, ($event.target as HTMLSelectElement).value)"
              >
                <option v-if="!field.presets.includes(textOf(field, entry.id))" :value="textOf(field, entry.id)">
                  {{ textOf(field, entry.id) || '(empty)' }}
                </option>
                <option v-for="preset in field.presets" :key="preset" :value="preset">{{ preset }}</option>
              </select>
              <input
                v-else
                type="text"
                :value="textOf(field, entry.id)"
                :list="field.presets.length > 0 ? `presets-${collectionId}-${field.id}` : undefined"
                @change="setCell(entry.id, field.id, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td class="row-end">
              <button class="row-x" type="button" title="Delete entry" @click="removeEntry(entry.id)">×</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editing" class="modal-backdrop" @click.self="editing = false">
      <div class="modal wide" role="dialog" aria-label="Edit template">
        <h2>Edit Template</h2>
        <p>Renaming a field keeps its values. Removing a field deletes them. The master key has to be filled in and unique before the game can load this collection.</p>
        <div v-for="field in collection.fields" :key="field.id" class="template-field">
          <div class="template-line">
            <label class="check">
              <input type="radio" :name="`master-${collectionId}`" :checked="field.id === collection.masterKeyId" @change="setMaster(field.id)" />
              <span>Master key</span>
            </label>
            <input :class="{ problem: nameProblems.has(field.id) }" :value="field.name" @change="renameField(field.id, ($event.target as HTMLInputElement).value)" />
            <select :value="field.type" @change="setType(field.id, ($event.target as HTMLSelectElement).value === 'boolean' ? 'boolean' : 'text')">
              <option value="text">Text</option>
              <option value="boolean">Boolean</option>
            </select>
            <button class="btn quiet" type="button" @click="removeField(field.id)">Remove</button>
          </div>
          <template v-if="field.type === 'text'">
            <label class="check">
              <input type="checkbox" :checked="field.enforcePresets" @change="setEnforce(field.id, ($event.target as HTMLInputElement).checked)" />
              <span>Entries must use a preset</span>
            </label>
            <div v-for="preset in field.presets" :key="preset" class="preset-row">
              <span>{{ preset }}</span>
              <button class="btn quiet" type="button" @click="removePreset(field.id, preset)">Remove</button>
            </div>
            <form class="preset-row" @submit.prevent="addPreset(field.id, $event.currentTarget as HTMLFormElement)">
              <input name="preset" placeholder="Preset value" />
              <button class="btn" type="submit">Add preset</button>
            </form>
          </template>
        </div>
        <footer>
          <button class="btn" type="button" @click="addField">Add field</button>
          <button class="btn primary" type="button" @click="editing = false">Done</button>
        </footer>
      </div>
    </div>
  </div>
</template>
