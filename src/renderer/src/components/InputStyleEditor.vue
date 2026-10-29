<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { editor } from 'monaco-editor/editor/editor.api.js'
import { emptyInputStyle, nextPreviewId, parseInputStyle, previewInputCss, type InputKind, type PageInputStyle } from '@shared/inputStyle'
import { monacoApi } from '@/script/monaco'

const props = withDefaults(defineProps<{
  text: string
  dropdown: string
  showKind?: boolean
  kind?: InputKind
  layer: 'global' | 'viewer' | 'insert'
  under?: PageInputStyle | null
  compact?: boolean
  hint: string
  fontFamily?: string
  color?: string
}>(), {
  showKind: false,
  kind: 'text',
  under: null,
  compact: false,
  fontFamily: '',
  color: ''
})

const emit = defineEmits<{ change: [style: PageInputStyle] }>()

const previewId = nextPreviewId()
const picked = ref<InputKind>(props.kind)
const host = ref<HTMLElement | null>(null)
let codeEditor: editor.IStandaloneCodeEditor | null = null
let applying = false
let overflowNode: HTMLElement | null = null
let overflowObserver: MutationObserver | null = null

function placeSuggestions(editorHost: HTMLElement, overflow: HTMLElement): void {
  const widget = overflow.querySelector<HTMLElement>('.suggest-widget')
  const cursor = editorHost.querySelector<HTMLElement>('.cursor')
  if (!widget || !cursor || widget.style.visibility === 'hidden' || widget.style.display === 'none') return
  const cursorBox = cursor.getBoundingClientRect()
  const widgetBox = widget.getBoundingClientRect()
  const nearCursor = Math.min(Math.abs(widgetBox.top - cursorBox.bottom), Math.abs(widgetBox.bottom - cursorBox.top)) < 20
    && Math.abs(widgetBox.left - cursorBox.left) < 160
  if (nearCursor || cursorBox.width + cursorBox.height === 0) return
  const roomBelow = window.innerHeight - cursorBox.bottom
  const placeAbove = roomBelow < widgetBox.height && cursorBox.top > roomBelow
  const nextTop = placeAbove ? cursorBox.top - widgetBox.height : cursorBox.bottom
  overflowObserver?.disconnect()
  widget.style.top = `${nextTop}px`
  widget.style.left = `${cursorBox.left}px`
  overflowObserver?.observe(overflow, { attributes: true, attributeFilter: ['style'], subtree: true })
}

watch(() => props.kind, (value) => {
  if (!props.showKind) picked.value = value
})

const active = computed(() => (props.showKind ? picked.value : props.kind))
const source = computed(() => {
  if (!props.showKind || active.value === 'text') return props.text
  return props.dropdown
})
const parsed = computed(() => parseInputStyle(source.value))
const error = computed(() => (parsed.value.ok ? '' : parsed.value.error))
const root = computed(() => `.input-style-stage[data-preview="${previewId}"]`)
const css = computed(() => previewInputCss(root.value, {
  layer: props.layer,
  kind: active.value,
  source: source.value,
  other: active.value === 'dropdown' ? props.text : props.dropdown,
  under: props.under ?? emptyInputStyle()
}))
const sampleStyle = computed(() => ({
  background: '#14110f',
  color: props.color || '#f4efe8',
  fontFamily: props.fontFamily || 'Georgia, serif',
  fontSize: '16px',
  lineHeight: '1.45',
  padding: '10px 12px',
  borderRadius: '8px'
}))

function publish(value: string): void {
  if (props.showKind && active.value === 'dropdown') emit('change', { text: props.text, dropdown: value })
  else emit('change', { text: value, dropdown: props.dropdown })
}

onMounted(() => {
  if (!host.value) return
  const editorHost = host.value
  overflowNode = document.createElement('div')
  overflowNode.className = 'monaco-editor style-overflow'
  document.body.append(overflowNode)
  overflowObserver = new MutationObserver(() => placeSuggestions(editorHost, overflowNode!))
  overflowObserver.observe(overflowNode, { attributes: true, attributeFilter: ['style'], subtree: true })
  codeEditor = monacoApi().editor.create(editorHost, {
    value: source.value,
    language: 'peach-css',
    overflowWidgetsDomNode: overflowNode,
    theme: 'peach',
    fontSize: 13,
    fontFamily: 'Cascadia Code, Consolas, monospace',
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    tabSize: 2,
    insertSpaces: true,
    autoIndent: 'full',
    wordWrap: 'on',
    lineNumbersMinChars: 2,
    folding: true,
    fixedOverflowWidgets: true,
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
    wordBasedSuggestions: 'off',
    snippetSuggestions: 'top',
    padding: { top: 8, bottom: 8 },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    placeholder: 'color: inherit;'
  })
  codeEditor.onDidChangeModelContent(() => {
    if (applying || !codeEditor) return
    publish(codeEditor.getValue())
  })
})

watch(source, (value) => {
  if (!codeEditor || codeEditor.getValue() === value) return
  applying = true
  codeEditor.setValue(value)
  applying = false
})

onBeforeUnmount(() => {
  overflowObserver?.disconnect()
  overflowObserver = null
  codeEditor?.dispose()
  codeEditor = null
  overflowNode?.remove()
  overflowNode = null
})
</script>

<template>
  <div class="style-editor">
    <label v-if="showKind" class="field">
      <span class="field-label">Input</span>
      <select v-model="picked">
        <option value="text">Text field</option>
        <option value="dropdown">Dropdown</option>
      </select>
    </label>
    <div class="field">
      <span class="field-label">Style</span>
      <div ref="host" class="style-code" :class="{ compact }"></div>
    </div>
    <p v-if="error" class="style-error">{{ error }}</p>
    <p class="tree-hint">{{ hint }}</p>
    <div class="input-style-stage" :data-preview="previewId">
      <component :is="'style'">{{ css }}</component>
      <div class="page-view" data-input-scope="peach-preview" :style="sampleStyle">
        <div class="style-sample">
          <template v-if="active === 'text'">
            <input class="page-input" data-input-style="peach-preview" placeholder="Name" />
            <input class="page-input" data-input-style="peach-preview" placeholder="Name" disabled />
          </template>
          <template v-else>
            <select class="page-drop" data-input-style="peach-preview">
              <option>Yes</option>
              <option>No</option>
            </select>
            <select class="page-drop" data-input-style="peach-preview" disabled>
              <option>Yes</option>
              <option>No</option>
            </select>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
