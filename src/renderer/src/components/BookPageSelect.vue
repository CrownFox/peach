<script setup lang="ts">
import { computed } from 'vue'
import { decodeBookPage, encodeBookPage } from '@shared/books'
import { assetLocationOf, findAssetByLocation } from '@shared/refs'
import { useProjectStore } from '@/stores/project'
import AssetSelect from './AssetSelect.vue'

const props = defineProps<{ label: string; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const project = useProjectStore()

const current = computed(() => decodeBookPage(props.modelValue) ?? { book: '', page: '' })
const bookId = computed(() => (current.value.book ? (findAssetByLocation(project.assets, current.value.book, 'book')?.id ?? null) : null))
const pagePaths = computed(() => {
  const asset = bookId.value ? project.asset(bookId.value) : null
  if (asset?.type !== 'book') return []
  return asset.chapters.flatMap((chapter) => chapter.pages.map((page) => `${chapter.name}/${page.name}`))
})

function write(book: string, page: string): void {
  emit('update:modelValue', encodeBookPage(book, page))
}

function setBook(id: string | null): void {
  const book = id ? (assetLocationOf(project.assets, id) ?? '') : ''
  const asset = book ? findAssetByLocation(project.assets, book, 'book') : null
  const pages = asset?.type === 'book' ? asset.chapters.flatMap((chapter) => chapter.pages.map((page) => `${chapter.name}/${page.name}`)) : []
  write(book, pages.includes(current.value.page) ? current.value.page : '')
}

function setPage(event: Event): void {
  write(current.value.book, (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="book-page-field">
    <AssetSelect :label="label" type="book" clearable :model-value="bookId" :empty-label="bookId ? '' : current.book" @update:model-value="setBook" />
    <label class="field">
      <span class="field-label">Page</span>
      <select :value="current.page" :disabled="!bookId" @change="setPage">
        <option value="">Choose a page</option>
        <option v-for="path in pagePaths" :key="path" :value="path">{{ path }}</option>
        <option v-if="current.page && !pagePaths.includes(current.page)" :value="current.page">{{ current.page }}</option>
      </select>
    </label>
  </div>
</template>
