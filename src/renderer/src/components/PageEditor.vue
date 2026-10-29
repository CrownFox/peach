<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { emptyParagraph, isAssetPageField, NEW_PAGE_IMAGE_EM, pageFieldValue, pageImageEm, pageInputKeys, PAGE_FONT_SIZES, splitRuns, valueScript, visibleScript } from '@shared/books'
import { BUILTIN_FONTS } from '@shared/fonts'
import { createId } from '@shared/ids'
import { uniqueName } from '@shared/paths'
import { assetLocationOf, findAssetByLocation } from '@shared/refs'
import type { BookAsset, BookPage, PageAlign, PageBlock, PageConditional, PageField, PageInputStyle, PageMarks, PageRun } from '@shared/types'
import { useProjectStore } from '@/stores/project'
import { fileUrl, thumbnailFile } from '@/thumbs'
import { caretInParagraphs, paragraphElements, type EditableParagraph } from '@/pageEdit'
import AssetSelect from './AssetSelect.vue'
import InputStyleEditor from './InputStyleEditor.vue'
import BookPageSelect from './BookPageSelect.vue'
import PageLine from './PageLine.vue'

type Spot = { block: number; paragraph: number }
type LineApi = {
  command: (name: string, value?: string) => void
  element: HTMLElement | null
  currentParagraphs: () => EditableParagraph[]
  sync: () => void
}

const props = defineProps<{ bookId: string; pageId: string }>()
const project = useProjectStore()
const generation = ref(0)
const focus = ref<Spot | null>(null)
const selectedId = ref('')
const lines = new Map<string, LineApi>()
let savedRange: Range | null = null

const book = computed(() => {
  const asset = project.asset(props.bookId)
  return asset?.type === 'book' ? asset : null
})
const located = computed(() => {
  const current = book.value
  if (!current) return null
  for (const chapter of current.chapters) {
    const page = chapter.pages.find((item) => item.id === props.pageId)
    if (page) return { chapter, page }
  }
  return null
})
const page = computed(() => located.value?.page ?? null)
const surfaces = computed(() => {
  const blocks = page.value?.blocks ?? []
  const groups: Array<
    | { kind: 'paragraphs'; key: string; start: number; paragraphs: EditableParagraph[] }
    | { kind: 'condition'; key: string; start: number; block: PageConditional }
  > = []
  let index = 0
  while (index < blocks.length) {
    const block = blocks[index]
    if (!block) break
    if (block.type === 'conditional') {
      groups.push({ kind: 'condition', key: block.id, start: index, block })
      index += 1
      continue
    }
    const start = index
    const paragraphs: EditableParagraph[] = []
    while (index < blocks.length && blocks[index]?.type === 'paragraph') {
      const item = blocks[index]
      if (item?.type === 'paragraph') paragraphs.push({ align: item.align, runs: item.runs })
      index += 1
    }
    groups.push({ kind: 'paragraphs', key: `p-${start}`, start, paragraphs })
  }
  return groups
})
const pathLabel = computed(() => (located.value ? `${located.value.chapter.name} / ${located.value.page.name}` : 'Page'))
const duplicateKeys = computed(() => {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const item of page.value ? pageInputKeys(page.value) : []) {
    if (!item.key || seen.has(item.key)) dupes.add(item.key)
    seen.add(item.key)
  }
  return dupes
})

const selected = computed(() => {
  const current = page.value
  const id = selectedId.value
  if (!current || !id) return null
  for (const block of current.blocks) {
    if (block.type === 'conditional' && block.id === id) return { kind: 'conditional' as const, block }
    const paragraphs = block.type === 'paragraph' ? [block] : block.blocks
    for (const paragraph of paragraphs) {
      const run = paragraph.runs.find((item) => item.type !== 'text' && item.id === id)
      if (run && run.type !== 'text') return { kind: 'run' as const, run }
    }
  }
  return null
})

function imageUrl(id: string | null): string {
  return fileUrl(thumbnailFile(project.assets, id))
}

function shownField(field: PageField): string | boolean {
  const current = page.value
  return current ? pageFieldValue(field, current) : field.default
}

function patchPage(recipe: (page: BookPage, book: BookAsset) => void): void {
  project.patchAsset(props.bookId, (asset) => {
    if (asset.type !== 'book') return
    for (const chapter of asset.chapters) {
      const target = chapter.pages.find((item) => item.id === props.pageId)
      if (target) recipe(target, asset)
    }
  })
}

function lineKey(start: number): string {
  return String(start)
}

function setLine(start: number, element: unknown): void {
  const key = lineKey(start)
  if (element && typeof element === 'object' && 'command' in element) lines.set(key, element as LineApi)
  else lines.delete(key)
}

function activeLine(): LineApi | null {
  return focus.value ? (lines.get(lineKey(focus.value.block)) ?? null) : null
}

function onFocus(start: number): void {
  const line = lines.get(lineKey(start))
  const caret = line?.element ? caretInParagraphs(line.element) : null
  focus.value = { block: start, paragraph: caret?.index ?? 0 }
}

function writeParagraphs(blocks: PageBlock[], start: number, paragraphs: EditableParagraph[]): void {
  const next = paragraphs.map((paragraph) => ({ type: 'paragraph' as const, align: paragraph.align, runs: paragraph.runs }))
  const block = blocks[start]
  if (block?.type === 'conditional') {
    block.blocks = next.length > 0 ? next : [emptyParagraph()]
    return
  }
  let count = 0
  while (blocks[start + count]?.type === 'paragraph') count += 1
  blocks.splice(start, Math.max(count, 1), ...(next.length > 0 ? next : [emptyParagraph()]))
}

function onUpdate(start: number, paragraphs: EditableParagraph[]): void {
  patchPage((item) => writeParagraphs(item.blocks, start, paragraphs))
}

function onSplit(start: number, index: number, offset: number, paragraphs: EditableParagraph[]): void {
  const current = paragraphs[index]
  if (!current) return
  const [before, after] = splitRuns(current.runs, offset)
  const next = paragraphs.map((paragraph) => ({ align: paragraph.align, runs: paragraph.runs }))
  next[index] = { align: current.align, runs: before }
  next.splice(index + 1, 0, { align: current.align, runs: after })
  patchPage((item) => writeParagraphs(item.blocks, start, next))
  generation.value += 1
  const spot = { block: start, paragraph: index + 1 }
  focus.value = spot
  void nextTick(() => placeCaret(spot))
}

function onMerge(start: number, index: number, paragraphs: EditableParagraph[]): void {
  if (index <= 0) return
  const previous = paragraphs[index - 1]
  const current = paragraphs[index]
  if (!previous || !current) return
  const caret = runLength(previous.runs)
  const next = paragraphs.map((paragraph) => ({ align: paragraph.align, runs: paragraph.runs }))
  next[index - 1] = { align: previous.align, runs: joinRuns(previous.runs, current.runs) }
  next.splice(index, 1)
  patchPage((item) => writeParagraphs(item.blocks, start, next))
  generation.value += 1
  const spot = { block: start, paragraph: index - 1 }
  focus.value = spot
  void nextTick(() => placeCaret(spot, caret))
}

function placeCaret(spot: Spot, offset = 0): void {
  const line = lines.get(lineKey(spot.block))
  const root = line?.element
  if (!root) return
  root.focus()
  const selection = window.getSelection()
  if (!selection) return
  const host = paragraphElements(root)[spot.paragraph] ?? root
  const range = document.createRange()
  const placed = placeOffset(host, offset)
  if (!placed) {
    range.selectNodeContents(host)
    range.collapse(true)
  } else {
    range.setStart(placed.node, placed.offset)
    range.collapse(true)
  }
  selection.removeAllRanges()
  selection.addRange(range)
  focus.value = spot
}

function rememberSelection(): void {
  const selection = window.getSelection()
  const line = activeLine()
  if (!selection || selection.rangeCount === 0 || !line?.element?.contains(selection.anchorNode)) return
  savedRange = selection.getRangeAt(0).cloneRange()
}

function format(name: string, value?: string): void {
  const line = activeLine()
  if (!line?.element) return
  const already = document.activeElement === line.element
  line.element.focus()
  const selection = window.getSelection()
  if (!already && savedRange && selection) {
    selection.removeAllRanges()
    selection.addRange(savedRange)
  }
  document.execCommand(name, false, value)
  line.sync()
}

function setSize(event: Event): void {
  const size = Number((event.target as HTMLSelectElement).value)
  const index = PAGE_FONT_SIZES.indexOf(size)
  if (index >= 0) format('fontSize', String(index + 1))
}

function setFamily(event: Event): void {
  const family = (event.target as HTMLSelectElement).value.split(',')[0]?.replace(/['"]/g, '').trim() ?? ''
  if (family) format('fontName', family)
}

function setColor(event: Event): void {
  format('foreColor', (event.target as HTMLInputElement).value)
}

function setAlign(align: PageAlign): void {
  const spot = focus.value
  const line = activeLine()
  if (!spot || !line?.element) return
  const caret = caretInParagraphs(line.element)
  const index = caret?.index ?? spot.paragraph
  const paragraphs = line.currentParagraphs()
  const target = paragraphs[index]
  if (!target) return
  target.align = align
  const host = paragraphElements(line.element)[index]
  if (host) host.style.textAlign = align === 'center' ? 'center' : align === 'end' ? 'right' : 'left'
  onUpdate(spot.block, paragraphs)
}

function insertRun(run: Exclude<PageRun, { type: 'text' }>): void {
  const spot = focus.value ?? { block: 0, paragraph: 0 }
  const line = lines.get(lineKey(spot.block))
  const paragraphs = line?.currentParagraphs() ?? [{ align: 'start' as const, runs: emptyParagraph().runs }]
  const caret = line?.element ? caretInParagraphs(line.element) : null
  const index = Math.min(caret?.index ?? spot.paragraph, Math.max(paragraphs.length - 1, 0))
  const current = paragraphs[index] ?? { align: 'start' as const, runs: emptyParagraph().runs }
  const offset = caret?.offset ?? runLength(current.runs)
  const [before, after] = splitRuns(current.runs, offset)
  const next = paragraphs.map((paragraph) => ({ align: paragraph.align, runs: paragraph.runs }))
  next[index] = { align: current.align, runs: [...before, run, ...after] }
  patchPage((item) => {
    if (item.blocks.length === 0) item.blocks.push(emptyParagraph())
    writeParagraphs(item.blocks, spot.block, next)
  })
  selectedId.value = run.id
  generation.value += 1
}

function insertImage(): void {
  insertRun({ type: 'image', id: createId(), imageId: null, height: NEW_PAGE_IMAGE_EM })
}

function insertEvaluate(): void {
  insertRun({ type: 'evaluate', id: createId(), script: valueScript })
}

function insertText(): void {
  const keys = page.value ? pageInputKeys(page.value).map((item) => item.key) : []
  insertRun({ type: 'textInput', id: createId(), key: uniqueName(keys, 'text'), placeholder: '', style: '' })
}

function insertDropdown(): void {
  const keys = page.value ? pageInputKeys(page.value).map((item) => item.key) : []
  insertRun({ type: 'dropdown', id: createId(), key: uniqueName(keys, 'choice'), options: ['Yes', 'No'], style: '' })
}

function insertCondition(): void {
  const spot = focus.value
  let index = Math.max((page.value?.blocks.length ?? 1) - 1, 0)
  if (spot && page.value) {
    const block = page.value.blocks[spot.block]
    if (block?.type === 'conditional') index = spot.block
    else {
      const line = lines.get(lineKey(spot.block))
      const caret = line?.element ? caretInParagraphs(line.element) : null
      index = spot.block + (caret?.index ?? spot.paragraph)
    }
  }
  const block: PageConditional = { type: 'conditional', id: createId(), script: visibleScript, blocks: [emptyParagraph()] }
  patchPage((item) => {
    item.blocks.splice(Math.min(index + 1, item.blocks.length), 0, block)
  })
  selectedId.value = block.id
  generation.value += 1
}

function editPageScript(): void {
  project.openScriptTab(`pagescript:${props.bookId}:${props.pageId}`)
}

function editScript(id: string, kind: 'visible' | 'value'): void {
  patchPage((item) => {
    for (const block of item.blocks) {
      if (kind === 'visible' && block.type === 'conditional' && block.id === id && !block.script.trim()) block.script = visibleScript
      const paragraphs = block.type === 'paragraph' ? [block] : block.blocks
      for (const paragraph of paragraphs) {
        for (const run of paragraph.runs) {
          if (kind === 'value' && run.type === 'evaluate' && run.id === id && !run.script.trim()) run.script = valueScript
        }
      }
    }
  })
  project.openScriptTab(`doodad:${props.bookId}:${props.pageId}:${id}`)
}

function setRun(id: string, recipe: (run: PageRun) => void): void {
  patchPage((item) => {
    for (const block of item.blocks) {
      const paragraphs = block.type === 'paragraph' ? [block] : block.blocks
      for (const paragraph of paragraphs) {
        const run = paragraph.runs.find((entry) => entry.type !== 'text' && entry.id === id)
        if (run) recipe(run)
      }
    }
  })
  generation.value += 1
}

function setImage(id: string | null): void {
  const run = selected.value?.kind === 'run' ? selected.value.run : null
  if (!run || run.type !== 'image') return
  setRun(run.id, (item) => {
    if (item.type === 'image') item.imageId = id
  })
}

function setImageHeight(event: Event): void {
  const run = selected.value?.kind === 'run' ? selected.value.run : null
  const input = event.target as HTMLInputElement
  if (!run || run.type !== 'image') return
  const height = Number(input.value)
  if (!Number.isFinite(height) || height <= 0) {
    input.value = String(pageImageEm(run.height))
    return
  }
  const next = pageImageEm(height)
  input.value = String(next)
  setRun(run.id, (item) => {
    if (item.type === 'image') item.height = next
  })
}

function setInputKey(event: Event): void {
  const run = selected.value?.kind === 'run' ? selected.value.run : null
  if (!run || (run.type !== 'textInput' && run.type !== 'dropdown')) return
  const key = (event.target as HTMLInputElement).value.trim()
  if (!key) {
    ;(event.target as HTMLInputElement).value = run.key
    return
  }
  setRun(run.id, (item) => {
    if (item.type === 'textInput' || item.type === 'dropdown') item.key = key
  })
}

function setInputStyle(style: PageInputStyle): void {
  const run = selected.value?.kind === 'run' ? selected.value.run : null
  if (!run || (run.type !== 'textInput' && run.type !== 'dropdown')) return
  setRun(run.id, (item) => {
    if (item.type === 'textInput' || item.type === 'dropdown') item.style = style.text
  })
}

function setPlaceholder(event: Event): void {
  const run = selected.value?.kind === 'run' ? selected.value.run : null
  if (!run || run.type !== 'textInput') return
  const placeholder = (event.target as HTMLInputElement).value
  setRun(run.id, (item) => {
    if (item.type === 'textInput') item.placeholder = placeholder
  })
}

function setOptions(event: Event): void {
  const run = selected.value?.kind === 'run' ? selected.value.run : null
  if (!run || run.type !== 'dropdown') return
  const options = (event.target as HTMLTextAreaElement).value.split('\n').map((item) => item.trim()).filter(Boolean)
  setRun(run.id, (item) => {
    if (item.type === 'dropdown') item.options = options.length > 0 ? options : ['Yes']
  })
}

function removeSelected(): void {
  const id = selectedId.value
  if (!id) return
  patchPage((item) => {
    const next: PageBlock[] = []
    for (const block of item.blocks) {
      if (block.type === 'conditional' && block.id === id) continue
      if (block.type === 'conditional') {
        block.blocks = block.blocks.map((paragraph) => ({
          ...paragraph,
          runs: paragraph.runs.filter((run) => run.type === 'text' || run.id !== id)
        }))
        if (block.blocks.length === 0) block.blocks = [emptyParagraph()]
        next.push(block)
        continue
      }
      const runs = block.runs.filter((run) => run.type === 'text' || run.id !== id)
      next.push({ ...block, runs: runs.length > 0 ? runs : emptyParagraph().runs })
    }
    item.blocks = next.length > 0 ? next : [emptyParagraph()]
  })
  selectedId.value = ''
  generation.value += 1
}

function setFieldValue(fieldId: string, value: string | boolean): void {
  patchPage((item) => {
    item.values[fieldId] = value
  })
}

function assetChoice(field: PageField): string | null {
  if (!isAssetPageField(field.type)) return null
  const value = shownField(field)
  return typeof value === 'string' && value ? (findAssetByLocation(project.assets, value, field.type)?.id ?? null) : null
}

function unmatchedPath(field: PageField): string {
  if (assetChoice(field)) return ''
  const value = shownField(field)
  return typeof value === 'string' ? value : ''
}

function setAssetValue(fieldId: string, id: string | null): void {
  setFieldValue(fieldId, id ? (assetLocationOf(project.assets, id) ?? '') : '')
}

function setBookPageValue(fieldId: string, value: string): void {
  setFieldValue(fieldId, value)
}

function runLength(runs: PageRun[]): number {
  return runs.reduce((total, run) => total + (run.type === 'text' ? run.text.length : 1), 0)
}

function joinRuns(left: PageRun[], right: PageRun[]): PageRun[] {
  const runs = [...left, ...right]
  const merged: PageRun[] = []
  for (const run of runs) {
    const previous = merged[merged.length - 1]
    if (run.type === 'text' && previous?.type === 'text' && sameMarks(previous.marks, run.marks)) previous.text += run.text
    else merged.push(run)
  }
  return merged.length > 0 ? merged : emptyParagraph().runs
}

function sameMarks(left: PageMarks, right: PageMarks): boolean {
  return left.bold === right.bold && left.italic === right.italic && left.underline === right.underline && left.strike === right.strike && left.color === right.color && left.fontSize === right.fontSize && left.fontFamily === right.fontFamily
}

function placeOffset(root: HTMLElement, target: number): { node: Node; offset: number } | null {
  let seen = 0
  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (seen + text.length >= target) return { node, offset: target - seen }
      seen += text.length
      return null
    }
    if (node instanceof HTMLElement && node.dataset.doodadId) {
      seen += 1
      return seen >= target ? { node: node.parentNode ?? root, offset: childIndex(node) + 1 } : null
    }
    for (const child of node.childNodes) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return walk(root)
}

function childIndex(node: Node): number {
  return [...(node.parentNode?.childNodes ?? [])].indexOf(node as ChildNode)
}

function onConditionClick(event: MouseEvent, id: string): void {
  const target = event.target
  if (target instanceof HTMLElement && target.closest('.page-line')) return
  selectedId.value = id
}
</script>

<template>
  <div v-if="page && book" class="page-studio">
    <div class="page-toolbar">
      <span class="page-path">{{ pathLabel }}</span>
      <button class="mark-btn" type="button" title="Bold" @mousedown.prevent @click="format('bold')"><b>B</b></button>
      <button class="mark-btn" type="button" title="Italic" @mousedown.prevent @click="format('italic')"><i>I</i></button>
      <button class="mark-btn" type="button" title="Underline" @mousedown.prevent @click="format('underline')"><u>U</u></button>
      <button class="mark-btn" type="button" title="Strikethrough" @mousedown.prevent @click="format('strikeThrough')"><s>S</s></button>
      <select class="tool-select" title="Font" @mousedown="rememberSelection" @change="setFamily">
        <option value="">Font</option>
        <option v-for="font in BUILTIN_FONTS" :key="font.value" :value="font.value">{{ font.label }}</option>
      </select>
      <select class="tool-select" title="Size" @mousedown="rememberSelection" @change="setSize">
        <option value="">Size</option>
        <option v-for="size in PAGE_FONT_SIZES" :key="size" :value="size">{{ size }}</option>
      </select>
      <label class="tool-color" title="Color" @mousedown="rememberSelection">
        <input type="color" value="#2c241f" @input="setColor" />
      </label>
      <button class="mark-btn" type="button" title="Align start" @mousedown.prevent @click="setAlign('start')">⟸</button>
      <button class="mark-btn" type="button" title="Align center" @mousedown.prevent @click="setAlign('center')">≡</button>
      <button class="mark-btn" type="button" title="Align end" @mousedown.prevent @click="setAlign('end')">⟹</button>
      <span class="tool-gap"></span>
      <button class="btn" type="button" @mousedown.prevent @click="insertImage">Image</button>
      <button class="btn" type="button" @mousedown.prevent @click="insertCondition">Condition</button>
      <button class="btn" type="button" @mousedown.prevent @click="insertEvaluate">Evaluate</button>
      <button class="btn" type="button" @mousedown.prevent @click="insertText">Text field</button>
      <button class="btn" type="button" @mousedown.prevent @click="insertDropdown">Dropdown</button>
      <button class="btn" type="button" @click="editPageScript">Page script</button>
    </div>
    <div class="page-stage">
      <div class="page-paper">
        <div class="page-sheet">
        <template v-for="group in surfaces" :key="group.key">
          <section
            v-if="group.kind === 'condition'"
            class="paper-condition"
            :class="{ 'is-selected': selectedId === group.block.id }"
            @click="onConditionClick($event, group.block.id)"
          >
            <header>
              <span>Condition</span>
              <button class="btn quiet" type="button" @click.stop="editScript(group.block.id, 'visible')">Edit script</button>
            </header>
            <PageLine
              :ref="(element) => setLine(group.start, element)"
              :paragraphs="group.block.blocks"
              :generation="generation"
              :selected-id="selectedId"
              :image-url="imageUrl"
              @focusin="onFocus(group.start)"
              @keyup="onFocus(group.start)"
              @mouseup="onFocus(group.start)"
              @update="onUpdate(group.start, $event)"
              @select="selectedId = $event"
              @split="(index, offset, paragraphs) => onSplit(group.start, index, offset, paragraphs)"
              @merge="(index, paragraphs) => onMerge(group.start, index, paragraphs)"
            />
          </section>
          <PageLine
            v-else
            :ref="(element) => setLine(group.start, element)"
            :paragraphs="group.paragraphs"
            :generation="generation"
            :selected-id="selectedId"
            :image-url="imageUrl"
            @focusin="onFocus(group.start)"
            @keyup="onFocus(group.start)"
            @mouseup="onFocus(group.start)"
            @update="onUpdate(group.start, $event)"
            @select="selectedId = $event"
            @split="(index, offset, paragraphs) => onSplit(group.start, index, offset, paragraphs)"
            @merge="(index, paragraphs) => onMerge(group.start, index, paragraphs)"
          />
        </template>
        </div>
      </div>
      <aside class="page-side">
        <template v-if="selected?.kind === 'conditional'">
          <p class="side-kicker">Condition</p>
          <p class="tree-hint">visible() returning false hides this block. self is the page viewer.</p>
          <button class="btn" type="button" @click="editScript(selected.block.id, 'visible')">Edit script</button>
          <button class="btn quiet" type="button" @click="removeSelected">Remove</button>
        </template>
        <template v-else-if="selected?.kind === 'run' && selected.run.type === 'image'">
          <p class="side-kicker">Image</p>
          <AssetSelect label="Image" type="image" clearable :model-value="selected.run.imageId" @update:model-value="setImage" />
          <label class="field">
            <span class="field-label">Height</span>
            <input type="number" min="0.5" max="40" step="0.5" :value="pageImageEm(selected.run.height)" @change="setImageHeight" />
          </label>
          <p class="tree-hint">Lines of this page's text. Width follows the picture.</p>
          <button class="btn quiet" type="button" @click="removeSelected">Remove</button>
        </template>
        <template v-else-if="selected?.kind === 'run' && selected.run.type === 'evaluate'">
          <p class="side-kicker">Evaluate</p>
          <p class="tree-hint">value() replaces this insert with the text it returns.</p>
          <button class="btn" type="button" @click="editScript(selected.run.id, 'value')">Edit script</button>
          <button class="btn quiet" type="button" @click="removeSelected">Remove</button>
        </template>
        <template v-else-if="selected?.kind === 'run' && (selected.run.type === 'textInput' || selected.run.type === 'dropdown')">
          <p class="side-kicker">{{ selected.run.type === 'textInput' ? 'Text field' : 'Dropdown' }}</p>
          <label class="field">
            <span class="field-label">Key</span>
            <input :class="{ problem: duplicateKeys.has(selected.run.key) }" :value="selected.run.key" @change="setInputKey" />
          </label>
          <p v-if="duplicateKeys.has(selected.run.key)" class="tree-hint">Another input on this page uses that key.</p>
          <label v-if="selected.run.type === 'textInput'" class="field">
            <span class="field-label">Placeholder</span>
            <input :value="selected.run.placeholder" @change="setPlaceholder" />
          </label>
          <label v-else class="field">
            <span class="field-label">Options</span>
            <textarea rows="5" :value="selected.run.options.join('\n')" @change="setOptions"></textarea>
          </label>
          <InputStyleEditor
            compact
            layer="insert"
            :kind="selected.run.type === 'dropdown' ? 'dropdown' : 'text'"
            :text="selected.run.style"
            dropdown=""
            :under="project.meta?.inputStyle"
            hint="This adds to the game style for this field."
            @change="setInputStyle"
          />
          <button class="btn quiet" type="button" @click="removeSelected">Remove</button>
        </template>
        <p v-else class="tree-hint">Select an insert to edit it. Text formatting applies to the words at the cursor.</p>
        <div v-if="book.fields.length > 0" class="side-fields">
          <p class="side-kicker">Page data</p>
          <div v-for="field in book.fields" :key="field.id" class="page-data-group">
            <AssetSelect
              v-if="isAssetPageField(field.type)"
              :label="field.name"
              clearable
              :type="field.type"
              :model-value="assetChoice(field)"
              :empty-label="unmatchedPath(field)"
              @update:model-value="setAssetValue(field.id, $event)"
            />
            <BookPageSelect
              v-else-if="field.type === 'bookPage'"
              :label="field.name"
              :model-value="typeof shownField(field) === 'string' ? String(shownField(field)) : ''"
              @update:model-value="setBookPageValue(field.id, $event)"
            />
            <label v-else class="field">
              <span class="field-label">{{ field.name }}</span>
              <input
                v-if="field.type === 'boolean'"
                type="checkbox"
                :checked="shownField(field) === true"
                @change="setFieldValue(field.id, ($event.target as HTMLInputElement).checked)"
              />
              <input v-else :value="String(shownField(field))" @change="setFieldValue(field.id, ($event.target as HTMLInputElement).value)" />
            </label>
          </div>
        </div>
      </aside>
    </div>
  </div>
  <p v-else class="tree-hint">This page is no longer in the book.</p>
</template>
