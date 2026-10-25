<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { caretInParagraphs, htmlToParagraphs, paragraphsToHtml, type EditableParagraph } from '@/pageEdit'
import type { PageRun } from '@shared/types'

const props = defineProps<{
  paragraphs: EditableParagraph[]
  generation: number
  selectedId: string
  imageUrl: (id: string | null) => string
}>()
const emit = defineEmits<{
  update: [paragraphs: EditableParagraph[]]
  select: [id: string]
  split: [index: number, offset: number, paragraphs: EditableParagraph[]]
  merge: [index: number, paragraphs: EditableParagraph[]]
}>()
const root = ref<HTMLElement | null>(null)

function markSelected(): void {
  root.value?.querySelectorAll<HTMLElement>('[data-doodad-id]').forEach((item) => {
    item.classList.toggle('is-selected', item.dataset.doodadId === props.selectedId)
  })
}

function previousRuns(): PageRun[] {
  return props.paragraphs.flatMap((paragraph) => paragraph.runs)
}

function write(): void {
  if (!root.value) return
  root.value.innerHTML = paragraphsToHtml(props.paragraphs, props.imageUrl)
  markSelected()
}

function currentParagraphs(): EditableParagraph[] {
  return root.value ? htmlToParagraphs(root.value, previousRuns()) : props.paragraphs
}

function sync(): void {
  emit('update', currentParagraphs())
}

onMounted(write)
watch(() => props.generation, write)
watch(() => props.selectedId, () => markSelected())

function onKey(event: KeyboardEvent): void {
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && key === 'b') {
    event.preventDefault()
    document.execCommand('bold')
    sync()
  } else if ((event.ctrlKey || event.metaKey) && key === 'i') {
    event.preventDefault()
    document.execCommand('italic')
    sync()
  } else if ((event.ctrlKey || event.metaKey) && key === 'u') {
    event.preventDefault()
    document.execCommand('underline')
    sync()
  } else if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    const caret = root.value ? caretInParagraphs(root.value) : null
    emit('split', caret?.index ?? 0, caret?.offset ?? 0, currentParagraphs())
  } else if (event.key === 'Backspace' && root.value && window.getSelection()?.isCollapsed) {
    const caret = caretInParagraphs(root.value)
    if (!caret || caret.offset !== 0) return
    event.preventDefault()
    if (caret.index > 0) emit('merge', caret.index, currentParagraphs())
  }
}

function onClick(event: MouseEvent): void {
  const target = event.target
  const element = target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null
  emit('select', element?.closest('[data-doodad-id]')?.getAttribute('data-doodad-id') ?? '')
}

function command(name: string, value?: string): void {
  root.value?.focus()
  document.execCommand(name, false, value)
  sync()
}

defineExpose({ command, element: root, currentParagraphs, sync })
</script>

<template>
  <div
    ref="root"
    class="page-line"
    contenteditable="true"
    spellcheck="true"
    role="textbox"
    @input="sync"
    @keydown="onKey"
    @click="onClick"
  ></div>
</template>
