<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useCanvasView } from '@/canvasView'
import { useProjectStore } from '@/stores/project'
import { resizeRect, snapToGrid } from '@shared/resize'
import { GAME_PROPERTIES_WINDOW, INPUT_STYLE_WINDOW } from '@shared/workspace'
import ButtonEditor from './ButtonEditor.vue'
import GameProperties from './GameProperties.vue'
import InputStyleWindow from './InputStyleWindow.vue'
import ImageEditor from './ImageEditor.vue'
import PanelEditor from './PanelEditor.vue'
import TilesetEditor from './TilesetEditor.vue'

const project = useProjectStore()
const edges = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']
const { zoom, panX, panY, panning, onPointerDown, worldStyle, bindWheel } = useCanvasView({ panX: 48, panY: 48 })
const windows = computed(() =>
  [...project.workspace.windows]
    .filter((window) => window.assetId === GAME_PROPERTIES_WINDOW || window.assetId === INPUT_STYLE_WINDOW || project.asset(window.assetId))
    .sort((left, right) => left.z - right.z)
)

function panBackground(event: PointerEvent): boolean {
  const target = event.target instanceof Element ? event.target : null
  return !target?.closest('.asset-window')
}

function windowTitle(assetId: string): string {
  if (assetId === GAME_PROPERTIES_WINDOW) return 'Properties'
  if (assetId === INPUT_STYLE_WINDOW) return 'Input style'
  return project.asset(assetId)?.name ?? ''
}

const dottedStyle = computed(() => {
  const size = project.workspace.editorGrid * zoom.value
  return {
    backgroundPosition: `${panX.value - size / 2}px ${panY.value - size / 2}px`,
    backgroundSize: `${size}px ${size}px`
  }
})

const editorGridStyle = computed(() => {
  const size = project.workspace.editorGrid
  const span = 20000
  return {
    left: `${-span}px`,
    top: `${-span}px`,
    width: `${span * 2}px`,
    height: `${span * 2}px`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${span}px ${span}px`
  }
})

function gridStep(): number {
  return project.workspace.editorSnap ? project.workspace.editorGrid : 0
}

function setGridSize(event: Event): void {
  const input = event.target as HTMLInputElement
  const value = Math.round(Number(input.value))
  if (!Number.isInteger(value) || value < 1) {
    input.value = String(project.workspace.editorGrid)
    return
  }
  project.setEditorGrid(value)
}

function setSnap(event: Event): void {
  project.setEditorSnap((event.target as HTMLInputElement).checked)
}

function assetType(assetId: string): 'image' | 'button' | 'panel' | 'tileset' | null {
  const asset = project.asset(assetId)
  return asset?.type === 'image' || asset?.type === 'button' || asset?.type === 'panel' || asset?.type === 'tileset' ? asset.type : null
}

function onTitleDown(event: PointerEvent, assetId: string): void {
  if (event.button !== 0) return
  if ((event.target as HTMLElement).closest('[data-close], [data-edge]')) return
  const win = project.workspace.windows.find((window) => window.assetId === assetId)
  if (!win) return
  project.focusWindow(assetId)
  const origin = { x: event.clientX, y: event.clientY, left: win.x, top: win.y, width: win.width, height: win.height }
  const scale = zoom.value || 1
  const move = (ev: PointerEvent): void => {
    let x = origin.left + (ev.clientX - origin.x) / scale
    let y = origin.top + (ev.clientY - origin.y) / scale
    const grid = gridStep()
    if (grid > 0) {
      const snapped = snapToGrid(
        { x: origin.left, y: origin.top, width: origin.width, height: origin.height },
        { x, y, width: origin.width, height: origin.height },
        '',
        grid,
        grid,
        false
      )
      x = snapped.x
      y = snapped.y
    }
    project.moveWindow(assetId, x, y)
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onResize(event: PointerEvent, assetId: string): void {
  if (event.button !== 0) return
  event.stopPropagation()
  const edge = (event.target as HTMLElement).dataset.edge
  const win = project.workspace.windows.find((window) => window.assetId === assetId)
  if (!edge || !win) return
  project.focusWindow(assetId)
  const origin = { x: event.clientX, y: event.clientY, left: win.x, top: win.y, width: win.width, height: win.height }
  const scale = zoom.value || 1
  const keepAlt = (ev: KeyboardEvent): void => {
    if (ev.key === 'Alt') ev.preventDefault()
  }
  const move = (ev: PointerEvent): void => {
    const dx = (ev.clientX - origin.x) / scale
    const dy = (ev.clientY - origin.y) / scale
    const start = { x: origin.left, y: origin.top, width: origin.width, height: origin.height }
    const aspect = ev.ctrlKey || ev.metaKey
    let next = resizeRect(start, dx, dy, edge, aspect, ev.altKey)
    const grid = gridStep()
    if (grid > 0) next = snapToGrid(start, next, edge, grid, grid, aspect, ev.altKey)
    project.resizeWindow(assetId, { x: next.x, y: next.y, width: next.width, height: next.height })
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('keydown', keepAlt)
    window.removeEventListener('keyup', keepAlt)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('keydown', keepAlt)
  window.addEventListener('keyup', keepAlt)
}

const canvasEl = ref<HTMLElement | null>(null)
let stopWheel: (() => void) | null = null
onMounted(() => {
  if (canvasEl.value) stopWheel = bindWheel(canvasEl.value)
})
onBeforeUnmount(() => stopWheel?.())
</script>

<template>
  <div class="editor-workspace">
  <div ref="canvasEl" class="canvas" :class="{ 'is-panning': panning }" :style="dottedStyle" @pointerdown="onPointerDown($event, panBackground)">
    <div v-if="windows.length === 0" class="canvas-empty">Double-click an image, button, panel, or tileset in the tree, or choose Properties or Style under Project.</div>
    <div class="canvas-surface" :style="worldStyle">
      <div v-if="project.workspace.editorSnap" class="editor-grid" :style="editorGridStyle"></div>
      <article
        v-for="win in windows"
        :key="win.assetId"
        class="asset-window"
        :style="{ left: `${win.x}px`, top: `${win.y}px`, width: `${win.width}px`, height: `${win.height}px`, zIndex: win.z }"
        @pointerdown="project.focusWindow(win.assetId)"
      >
        <button
          v-for="edge in edges"
          :key="edge"
          class="edge"
          :class="`edge-${edge}`"
          type="button"
          :data-edge="edge"
          @pointerdown="onResize($event, win.assetId)"
        ></button>
        <header class="window-title" @pointerdown="onTitleDown($event, win.assetId)">
          <strong>{{ windowTitle(win.assetId) }}</strong>
          <button class="btn quiet" type="button" data-close @click="project.closeWindow(win.assetId)">Close</button>
        </header>
        <div class="window-body">
          <GameProperties v-if="win.assetId === GAME_PROPERTIES_WINDOW" />
          <InputStyleWindow v-else-if="win.assetId === INPUT_STYLE_WINDOW" />
          <ImageEditor v-else-if="assetType(win.assetId) === 'image'" :asset-id="win.assetId" />
          <ButtonEditor v-else-if="assetType(win.assetId) === 'button'" :asset-id="win.assetId" />
          <PanelEditor v-else-if="assetType(win.assetId) === 'panel'" :asset-id="win.assetId" />
          <TilesetEditor v-else-if="assetType(win.assetId) === 'tileset'" :asset-id="win.assetId" />
        </div>
      </article>
    </div>
  </div>
  <div class="frame-size">
    <label>Grid <input type="number" min="1" step="1" :value="project.workspace.editorGrid" @change="setGridSize" /></label>
    <label class="check">
      <input type="checkbox" :checked="project.workspace.editorSnap" @change="setSnap" />
      <span>Snap</span>
    </label>
  </div>
  </div>
</template>
