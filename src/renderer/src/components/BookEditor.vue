<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { cloneBlocks, coercePageValue, decodeBookPage, emptyPage, encodeBookPage, isAssetPageField, PAGE_VALUE_TYPES, pageFieldType } from '@shared/books'
import { createId } from '@shared/ids'
import { uniqueName } from '@shared/paths'
import { assetLocationOf, findAssetByLocation } from '@shared/refs'
import type { BookAsset, BookChapter, BookPage, PageField, PageFieldType } from '@shared/types'
import { useProjectStore } from '@/stores/project'
import AssetSelect from './AssetSelect.vue'
import BookPageSelect from './BookPageSelect.vue'
import Modal from './Modal.vue'
import PageEditor from './PageEditor.vue'

const props = defineProps<{ bookId: string }>()
const project = useProjectStore()
const pageId = ref<string | null>(null)
const expanded = ref<string[]>([])
const editing = ref(false)
const banner = ref('')
const renameInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null)
const renaming = ref<{ kind: 'chapter' | 'page'; id: string } | null>(null)
const menu = ref<{ x: number; y: number; chapterId: string | null; pageId: string | null } | null>(null)
const deleting = ref<{ kind: 'chapter' | 'page'; id: string; name: string } | null>(null)
let skipBlur = false
let committing = false
let treeReady = false

const book = computed(() => {
  const asset = project.asset(props.bookId)
  return asset?.type === 'book' ? asset : null
})
watch(
  book,
  (value) => {
    if (!value) return
    if (!treeReady) {
      treeReady = true
      expanded.value = value.chapters.map((chapter) => chapter.id)
    }
    const alive = value.chapters.some((chapter) => chapter.pages.some((page) => page.id === pageId.value))
    if (!alive) pageId.value = value.chapters[0]?.pages[0]?.id ?? null
  },
  { immediate: true }
)

function findPage(id: string): { chapter: BookChapter; page: BookPage } | null {
  for (const chapter of book.value?.chapters ?? []) {
    const page = chapter.pages.find((item) => item.id === id)
    if (page) return { chapter, page }
  }
  return null
}

function toggleChapter(id: string): void {
  expanded.value = expanded.value.includes(id) ? expanded.value.filter((item) => item !== id) : [...expanded.value, id]
}

function reveal(id: string): void {
  if (!expanded.value.includes(id)) expanded.value = [...expanded.value, id]
}

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

function renamePage(chapter: BookChapter, item: BookPage, event: Event): void {
  const input = event.target as HTMLInputElement
  const name = cleanName(input.value)
  if (!name || chapter.pages.some((entry) => entry.id !== item.id && entry.name === name)) {
    if (name) banner.value = 'That name is already used.'
    input.value = item.name
    return
  }
  patchBook((asset) => {
    const target = asset.chapters.find((entry) => entry.id === chapter.id)?.pages.find((entry) => entry.id === item.id)
    if (target) target.name = name
  })
}

function addChapter(): void {
  const id = createId()
  patchBook((asset) => {
    const name = uniqueName(asset.chapters.map((item) => item.name), 'Chapter')
    asset.chapters.push({ id, name, pages: [emptyPage(createId(), 'Page', asset.fields)] })
  })
  reveal(id)
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
  expanded.value = expanded.value.filter((id) => id !== item.id)
  banner.value = ''
}

function addPage(chapter: BookChapter): void {
  if (!book.value) return
  const id = createId()
  patchBook((asset) => {
    const target = asset.chapters.find((entry) => entry.id === chapter.id)
    if (!target) return
    const name = uniqueName(target.pages.map((item) => item.name), 'Page')
    target.pages.push(emptyPage(id, name, asset.fields))
  })
  reveal(chapter.id)
}

function duplicatePage(chapter: BookChapter, item: BookPage): void {
  patchBook((asset) => {
    const target = asset.chapters.find((entry) => entry.id === chapter.id)
    const source = target?.pages.find((entry) => entry.id === item.id)
    if (!target || !source) return
    const index = target.pages.indexOf(source)
    target.pages.splice(index + 1, 0, {
      id: createId(),
      name: uniqueName(target.pages.map((entry) => entry.name), `${source.name} copy`),
      values: { ...source.values },
      script: source.script,
      blocks: cloneBlocks(source.blocks, createId)
    })
  })
  reveal(chapter.id)
}

function removePage(chapter: BookChapter, item: BookPage): void {
  if (chapter.pages.length <= 1) {
    banner.value = 'A chapter needs a page.'
    return
  }
  project.closePage(`${props.bookId}/${item.id}`)
  patchBook((asset) => {
    const target = asset.chapters.find((entry) => entry.id === chapter.id)
    if (target) target.pages = target.pages.filter((entry) => entry.id !== item.id)
  })
  banner.value = ''
}

function onContext(event: MouseEvent): void {
  const row = (event.target as HTMLElement).closest('.tree-row')
  const chapterId = row?.getAttribute('data-chapter') ?? null
  const targetPage = row?.getAttribute('data-page') ?? null
  menu.value = {
    x: Math.min(event.clientX, window.innerWidth - 200),
    y: Math.min(event.clientY, window.innerHeight - 220),
    chapterId: chapterId || null,
    pageId: targetPage || null
  }
}

function closeMenu(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest('.context-menu')) return
  menu.value = null
}

function menuChapter(): BookChapter | null {
  const id = menu.value?.chapterId
  return book.value?.chapters.find((chapter) => chapter.id === id) ?? null
}

function newChapter(): void {
  menu.value = null
  addChapter()
}

function newPage(): void {
  const chapter = menuChapter()
  menu.value = null
  if (chapter) addPage(chapter)
}

function startRename(): void {
  const current = menu.value
  menu.value = null
  if (!current?.chapterId) return
  renaming.value = current.pageId ? { kind: 'page', id: current.pageId } : { kind: 'chapter', id: current.chapterId }
}

function copyPage(): void {
  const chapter = menuChapter()
  const page = chapter?.pages.find((item) => item.id === menu.value?.pageId)
  menu.value = null
  if (chapter && page) duplicatePage(chapter, page)
}

function askDelete(): void {
  const chapter = menuChapter()
  const page = chapter?.pages.find((item) => item.id === menu.value?.pageId)
  menu.value = null
  if (!chapter) return
  if (page) {
    if (chapter.pages.length <= 1) {
      banner.value = 'A chapter needs a page.'
      return
    }
    deleting.value = { kind: 'page', id: page.id, name: page.name }
    return
  }
  if ((book.value?.chapters.length ?? 0) <= 1) {
    banner.value = 'A book needs a chapter.'
    return
  }
  deleting.value = { kind: 'chapter', id: chapter.id, name: chapter.name }
}

function confirmDelete(): void {
  const target = deleting.value
  deleting.value = null
  if (!target) return
  if (target.kind === 'chapter') {
    const chapter = book.value?.chapters.find((item) => item.id === target.id)
    if (chapter) removeChapter(chapter)
    return
  }
  const found = findPage(target.id)
  if (found) removePage(found.chapter, found.page)
}

async function focusRename(): Promise<void> {
  await nextTick()
  const input = renameInput.value
  const field = Array.isArray(input) ? input[0] : input
  field?.focus()
  field?.select()
}

watch(renaming, (value) => {
  if (value) void focusRename()
})

function commitRename(event: Event): void {
  if (skipBlur || committing) {
    skipBlur = false
    return
  }
  committing = true
  const current = renaming.value
  renaming.value = null
  if (current?.kind === 'chapter') {
    const chapter = book.value?.chapters.find((item) => item.id === current.id)
    if (chapter) renameChapter(chapter, event)
  } else if (current?.kind === 'page') {
    const found = current.id ? findPage(current.id) : null
    if (found) renamePage(found.chapter, found.page, event)
  }
  committing = false
}

function cancelRename(): void {
  skipBlur = true
  renaming.value = null
}

onMounted(() => window.addEventListener('pointerdown', closeMenu))
onBeforeUnmount(() => window.removeEventListener('pointerdown', closeMenu))

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
  <div v-if="book" class="book-studio">
    <div class="menu-toolbar">
      <strong>{{ book.name }}</strong>
      <button class="btn" type="button" @click="editing = true">Edit page data</button>
    </div>
    <p v-if="banner" class="collection-banner">{{ banner }}</p>
    <div class="book-studio-body">
      <div class="book-tree" @contextmenu.prevent="onContext">
        <div v-for="item in book.chapters" :key="item.id" class="tree-branch" :class="{ 'is-open': expanded.includes(item.id) }">
          <div class="tree-row" :data-chapter="item.id" @click="toggleChapter(item.id)" @contextmenu.prevent="onContext">
            <button class="tree-cell twist" type="button" data-twist @click.stop="toggleChapter(item.id)">{{ expanded.includes(item.id) ? '▾' : '▸' }}</button>
            <span class="tree-cell badge folder" aria-hidden="true">
              <svg v-if="expanded.includes(item.id)" viewBox="0 0 16 16">
                <path class="folder-back" d="M1.2 3.2c0-.6.5-1 1.1-1h3.1l1.2 1.3h7c.6 0 1.1.4 1.1 1V6H1.2V3.2z" />
                <path d="M.4 6.2h15.1L13.9 13c-.1.5-.5.8-1 .8H1.5c-.5 0-.9-.3-1-.8L.4 6.2z" />
              </svg>
              <svg v-else viewBox="0 0 16 16">
                <path d="M1.2 3.6c0-.7.6-1.2 1.2-1.2h3.1L6.8 3.8h6.8c.7 0 1.2.5 1.2 1.2v7.2c0 .7-.5 1.2-1.2 1.2H2.4c-.7 0-1.2-.5-1.2-1.2V3.6z" />
              </svg>
            </span>
            <input
              v-if="renaming?.kind === 'chapter' && renaming.id === item.id"
              ref="renameInput"
              :value="item.name"
              @click.stop
              @keydown.enter="commitRename"
              @keydown.esc="cancelRename"
              @blur="commitRename"
            />
            <span v-else class="row-name">{{ item.name }}</span>
          </div>
          <template v-if="expanded.includes(item.id)">
            <div
              v-for="(page, index) in item.pages"
              :key="page.id"
              class="tree-row"
              :class="{ selected: page.id === pageId }"
              :data-chapter="item.id"
              :data-page="page.id"
              @click="pageId = page.id"
              @contextmenu.prevent="onContext"
            >
              <span class="tree-cell elbow" :class="{ last: index === item.pages.length - 1 }" aria-hidden="true"></span>
              <span class="tree-cell file-mark" aria-hidden="true">•</span>
              <input
                v-if="renaming?.kind === 'page' && renaming.id === page.id"
                ref="renameInput"
                :value="page.name"
                @click.stop
                @keydown.enter="commitRename"
                @keydown.esc="cancelRename"
                @blur="commitRename"
              />
              <span v-else class="row-name">{{ page.name }}</span>
            </div>
          </template>
        </div>
      </div>
      <div class="book-stage">
        <PageEditor v-if="pageId" :key="pageId" :book-id="bookId" :page-id="pageId" />
      </div>
    </div>
    <div v-if="menu" class="context-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
      <button v-if="!menu.chapterId" type="button" @click="newChapter">New chapter</button>
      <template v-else-if="!menu.pageId">
        <button type="button" @click="newChapter">New chapter</button>
        <button type="button" @click="newPage">New page</button>
        <div class="menu-sep"></div>
        <button type="button" @click="startRename">Rename</button>
        <button type="button" @click="askDelete">Delete</button>
      </template>
      <template v-else>
        <button type="button" @click="startRename">Rename</button>
        <button type="button" @click="copyPage">Duplicate</button>
        <button type="button" @click="askDelete">Delete</button>
      </template>
    </div>
    <Modal v-if="deleting" title="Delete" confirm-label="Delete" danger @cancel="deleting = null" @confirm="confirmDelete">
      <p>Delete {{ deleting.name }}? This cannot be undone.</p>
    </Modal>
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
