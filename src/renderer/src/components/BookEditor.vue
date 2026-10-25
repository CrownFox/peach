<script setup lang="ts">
import { computed, ref } from 'vue'
import { cloneBlocks, coercePageValue, decodeBookPage, emptyPage, encodeBookPage, isAssetPageField, PAGE_VALUE_TYPES, pageFieldType } from '@shared/books'
import { createId } from '@shared/ids'
import { uniqueName } from '@shared/paths'
import { assetLocationOf, findAssetByLocation } from '@shared/refs'
import type { BookAsset, BookChapter, BookPage, PageField, PageFieldType } from '@shared/types'
import { useProjectStore } from '@/stores/project'
import AssetSelect from './AssetSelect.vue'
import BookPageSelect from './BookPageSelect.vue'

const props = defineProps<{ bookId: string }>()
const project = useProjectStore()
const chapterId = ref<string | null>(null)
const editing = ref(false)
const banner = ref('')

const book = computed(() => {
  const asset = project.asset(props.bookId)
  return asset?.type === 'book' ? asset : null
})
const chapter = computed(() => book.value?.chapters.find((item) => item.id === chapterId.value) ?? book.value?.chapters[0] ?? null)

function patchBook(recipe: (book: BookAsset) => void): void {
  project.patchAsset(props.bookId, (asset) => {
    if (asset.type === 'book') recipe(asset)
  })
}

function cleanName(value: string): string | null {
  const name = value.trim()
  if (!name || name.includes('/')) {
    banner.value = 'A name cannot be blank or contain /.'
    return null
  }
  banner.value = ''
  return name
}

function renameChapter(item: BookChapter, event: Event): void {
  const input = event.target as HTMLInputElement
  const name = cleanName(input.value)
  if (!name || (book.value?.chapters.some((entry) => entry.id !== item.id && entry.name === name) ?? false)) {
    if (name) banner.value = 'That name is already used.'
    input.value = item.name
    return
  }
  patchBook((asset) => {
    const target = asset.chapters.find((entry) => entry.id === item.id)
    if (target) target.name = name
  })
}

function renamePage(item: BookPage, event: Event): void {
  const input = event.target as HTMLInputElement
  const name = cleanName(input.value)
  const current = chapter.value
  if (!name || !current || current.pages.some((entry) => entry.id !== item.id && entry.name === name)) {
    if (name) banner.value = 'That name is already used.'
    input.value = item.name
    return
  }
  patchBook((asset) => {
    const target = asset.chapters.find((entry) => entry.id === current.id)?.pages.find((entry) => entry.id === item.id)
    if (target) target.name = name
  })
}

function addChapter(): void {
  const id = createId()
  patchBook((asset) => {
    const name = uniqueName(asset.chapters.map((item) => item.name), 'Chapter')
    asset.chapters.push({ id, name, pages: [emptyPage(createId(), 'Page', asset.fields)] })
  })
  chapterId.value = id
  banner.value = ''
}

function removeChapter(item: BookChapter): void {
  if ((book.value?.chapters.length ?? 0) <= 1) {
    banner.value = 'A book needs a chapter.'
    return
  }
  for (const page of item.pages) project.closePage(`${props.bookId}/${page.id}`)
  patchBook((asset) => {
    asset.chapters = asset.chapters.filter((entry) => entry.id !== item.id)
  })
  if (chapterId.value === item.id) chapterId.value = null
  banner.value = ''
}

function addPage(): void {
  const current = chapter.value
  if (!current || !book.value) return
  const id = createId()
  patchBook((asset) => {
    const target = asset.chapters.find((entry) => entry.id === current.id)
    if (!target) return
    const name = uniqueName(target.pages.map((item) => item.name), 'Page')
    target.pages.push(emptyPage(id, name, asset.fields))
  })
}

function duplicatePage(item: BookPage): void {
  const current = chapter.value
  if (!current) return
  const id = createId()
  patchBook((asset) => {
    const target = asset.chapters.find((entry) => entry.id === current.id)
    const source = target?.pages.find((entry) => entry.id === item.id)
    if (!target || !source) return
    const index = target.pages.indexOf(source)
    target.pages.splice(index + 1, 0, {
      id,
      name: uniqueName(target.pages.map((entry) => entry.name), `${source.name} copy`),
      values: { ...source.values },
      script: source.script,
      blocks: cloneBlocks(source.blocks, createId)
    })
  })
  project.openPage(props.bookId, id)
}

function removePage(item: BookPage): void {
  const current = chapter.value
  if (!current || current.pages.length <= 1) {
    banner.value = 'A chapter needs a page.'
    return
  }
  project.closePage(`${props.bookId}/${item.id}`)
  patchBook((asset) => {
    const target = asset.chapters.find((entry) => entry.id === current.id)
    if (target) target.pages = target.pages.filter((entry) => entry.id !== item.id)
  })
  banner.value = ''
}

function addField(): void {
  const id = createId()
  patchBook((asset) => {
    const name = uniqueName(asset.fields.map((field) => field.name), 'Field')
    asset.fields.push({ id, name, type: 'text', default: '' })
  })
}

function renameField(field: PageField, event: Event): void {
  const input = event.target as HTMLInputElement
  const name = input.value.trim()
  if (!name || (book.value?.fields.some((item) => item.id !== field.id && item.name === name) ?? false)) {
    banner.value = name ? 'That field name is already used.' : 'A field name cannot be blank.'
    input.value = field.name
    return
  }
  banner.value = ''
  patchBook((asset) => {
    const target = asset.fields.find((item) => item.id === field.id)
    if (target) target.name = name
  })
}

function storedValue(type: PageFieldType, value: unknown): string | boolean {
  const next = coercePageValue(type, value)
  if (type === 'bookPage') return keptBookPage(typeof next === 'string' ? next : '')
  if (!isAssetPageField(type) || typeof next !== 'string' || !next) return next
  return findAssetByLocation(project.assets, next, type) ? next : ''
}

function keptBookPage(value: string): string {
  const ref = decodeBookPage(value)
  if (!ref?.book) return ''
  const asset = findAssetByLocation(project.assets, ref.book, 'book')
  if (!asset || asset.type !== 'book') return ''
  const pages = asset.chapters.flatMap((chapter) => chapter.pages.map((page) => `${chapter.name}/${page.name}`))
  return encodeBookPage(ref.book, pages.includes(ref.page) ? ref.page : '')
}

function setFieldType(field: PageField, event: Event): void {
  const type = pageFieldType((event.target as HTMLSelectElement).value)
  patchBook((asset) => {
    const target = asset.fields.find((item) => item.id === field.id)
    if (!target) return
    target.type = type
    target.default = storedValue(type, target.default)
    for (const chapterEntry of asset.chapters) {
      for (const page of chapterEntry.pages) {
        if (Object.prototype.hasOwnProperty.call(page.values, field.id)) page.values[field.id] = storedValue(type, page.values[field.id])
      }
    }
  })
}

function assetChoice(field: PageField): string | null {
  if (!isAssetPageField(field.type) || typeof field.default !== 'string' || !field.default) return null
  return findAssetByLocation(project.assets, field.default, field.type)?.id ?? null
}

function unmatchedPath(field: PageField): string {
  if (assetChoice(field) || typeof field.default !== 'string') return ''
  return field.default
}

function setBookPageDefault(field: PageField, value: string): void {
  patchBook((asset) => {
    const target = asset.fields.find((item) => item.id === field.id)
    if (target) target.default = coercePageValue('bookPage', value)
  })
}

function setAssetDefault(field: PageField, id: string | null): void {
  const next = id ? (assetLocationOf(project.assets, id) ?? '') : ''
  patchBook((asset) => {
    const target = asset.fields.find((item) => item.id === field.id)
    if (target) target.default = coercePageValue(target.type, next)
  })
}

function setFieldDefault(field: PageField, event: Event): void {
  const input = event.target as HTMLInputElement
  const next = field.type === 'boolean' ? input.checked : input.value
  patchBook((asset) => {
    const target = asset.fields.find((item) => item.id === field.id)
    if (target) target.default = coercePageValue(target.type, next)
  })
}

function removeField(field: PageField): void {
  patchBook((asset) => {
    asset.fields = asset.fields.filter((item) => item.id !== field.id)
    for (const chapterEntry of asset.chapters) {
      for (const page of chapterEntry.pages) delete page.values[field.id]
    }
  })
}
</script>

<template>
  <div v-if="book" class="book-page">
    <div class="menu-toolbar">
      <strong>{{ book.name }}</strong>
      <button class="btn" type="button" @click="editing = true">Edit page data</button>
    </div>
    <p v-if="banner" class="collection-banner">{{ banner }}</p>
    <div class="book-columns">
      <section>
        <header>
          <span>Chapters</span>
          <button class="btn" type="button" @click="addChapter">Add</button>
        </header>
        <div v-for="item in book.chapters" :key="item.id" class="book-row" :class="{ selected: chapter?.id === item.id }" @click="chapterId = item.id">
          <input :value="item.name" @change="renameChapter(item, $event)" @focus="chapterId = item.id" />
          <button class="row-x" type="button" title="Delete chapter" @click.stop="removeChapter(item)">×</button>
        </div>
      </section>
      <section v-if="chapter">
        <header>
          <span>{{ chapter.name }}</span>
          <button class="btn" type="button" @click="addPage">Add page</button>
        </header>
        <div v-for="item in chapter.pages" :key="item.id" class="book-row">
          <input :value="item.name" @change="renamePage(item, $event)" />
          <button class="btn quiet" type="button" @click="project.openPage(bookId, item.id)">Open</button>
          <button class="btn quiet" type="button" @click="duplicatePage(item)">Duplicate</button>
          <button class="row-x" type="button" title="Delete page" @click="removePage(item)">×</button>
        </div>
      </section>
    </div>
    <div v-if="editing" class="modal-backdrop" @click.self="editing = false">
      <div class="modal wide" role="dialog" aria-label="Page data">
        <h2>Page data</h2>
        <p class="tree-hint">Every page keeps these fields. A new page starts from the default. A page that does not have the field yet uses it too. A script reads the page with <code>viewer:get("Field")</code>. An asset field reads as that asset's path, such as <code>"characters/Hero"</code>. A Book+Page field reads as that book and page, and <code>game.loadPage</code> can show it.</p>
        <div v-for="field in book.fields" :key="field.id" class="template-field">
          <div class="template-line">
            <input :value="field.name" @change="renameField(field, $event)" />
            <select :value="field.type" @change="setFieldType(field, $event)">
              <option v-for="option in PAGE_VALUE_TYPES" :key="option.type" :value="option.type">{{ option.label }}</option>
            </select>
            <label v-if="field.type === 'boolean' || field.type === 'text'" class="check">
              <span>Default</span>
              <input v-if="field.type === 'boolean'" type="checkbox" :checked="field.default === true" @change="setFieldDefault(field, $event)" />
              <input v-else :value="String(field.default)" @change="setFieldDefault(field, $event)" />
            </label>
            <BookPageSelect
              v-else-if="field.type === 'bookPage'"
              label="Default"
              :model-value="typeof field.default === 'string' ? field.default : ''"
              @update:model-value="setBookPageDefault(field, $event)"
            />
            <AssetSelect
              v-else-if="isAssetPageField(field.type)"
              label="Default"
              clearable
              :type="field.type"
              :model-value="assetChoice(field)"
              :empty-label="unmatchedPath(field)"
              @update:model-value="setAssetDefault(field, $event)"
            />
            <button class="btn quiet" type="button" @click="removeField(field)">Remove</button>
          </div>
        </div>
        <p v-if="book.fields.length === 0" class="tree-hint">This book has no page data yet.</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="addField">Add field</button>
          <button class="btn primary" type="button" @click="editing = false">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>
