<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useCanvasView } from '@/canvasView'
import { useProjectStore } from '@/stores/project'
import { GAME_PROPERTIES_WINDOW } from '@shared/workspace'
import ButtonEditor from './ButtonEditor.vue'
import GameProperties from './GameProperties.vue'
import ImageEditor from './ImageEditor.vue'
import PanelEditor from './PanelEditor.vue'

const project = useProjectStore()
const edges = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']
const { zoom, panning, onPointerDown, worldStyle, gridStyle, bindWheel } = useCanvasView({ panX: 48, panY: 48 })
const windows = computed(() =>
  [...project.workspace.windows]
    .filter((window) => window.assetId === GAME_PROPERTIES_WINDOW || project.asset(window.assetId))
    .sort((left, right) => left.z - right.z)
)

function panBackground(event: PointerEvent): boolean {
  const target = event.target instanceof Element ? event.target : null
  return !target?.closest('.asset-window')
}

function assetType(assetId: string): 'image' | 'button' | 'panel' | null {
  const asset = project.asset(assetId)
  return asset?.type === 'image' || asset?.type === 'button' || asset?.type === 'panel' ? asset.type : null
}

function onTitleDown(event: PointerEvent, assetId: string): void {
  if (event.button !== 0) return
  if ((event.target as HTMLElement).closest('[data-close], [data-edge]')) return
  const win = project.workspace.windows.find((window) => window.assetId === assetId)
  if (!win) return
  project.focusWindow(assetId)
  const origin = { x: event.clientX, y: event.clientY, left: win.x, top: win.y }
  const scale = zoom.value || 1
  const move = (ev: PointerEvent): void => {
    project.moveWindow(assetId, origin.left + (ev.clientX - origin.x) / scale, origin.top + (ev.clientY - origin.y) / scale)
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
  const move = (ev: PointerEvent): void => {
    const dx = (ev.clientX - origin.x) / scale
    const dy = (ev.clientY - origin.y) / scale
    let { left, top, width, height } = origin
    if (edge.includes('e')) width = origin.width + dx
    if (edge.includes('s')) height = origin.height + dy
    if (edge.includes('w')) {
      width = origin.width - dx
      left = origin.left + dx
    }
    if (edge.includes('n')) {
      height = origin.height - dy
      top = origin.top + dy
    }
    project.resizeWindow(assetId, { x: left, y: top, width, height })
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const canvasEl = ref<HTMLElement | null>(null)
let stopWheel: (() => void) | null = null
onMounted(() => {
  if (canvasEl.value) stopWheel = bindWheel(canvasEl.value)
})
onBeforeUnmount(() => stopWheel?.())
</script>

<template>
  <div ref="canvasEl" class="canvas" :class="{ 'is-panning': panning }" :style="gridStyle" @pointerdown="onPointerDown($event, panBackground)">
    <div v-if="windows.length === 0" class="canvas-empty">Double-click an image, button, or panel in the tree, or choose Properties under Project.</div>
    <div class="canvas-surface" :style="worldStyle">
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
          <strong>{{ win.assetId === GAME_PROPERTIES_WINDOW ? 'Properties' : project.asset(win.assetId)?.name }}</strong>
          <button class="btn quiet" type="button" data-close @click="project.closeWindow(win.assetId)">Close</button>
        </header>
        <div class="window-body">
          <GameProperties v-if="win.assetId === GAME_PROPERTIES_WINDOW" />
          <ImageEditor v-else-if="assetType(win.assetId) === 'image'" :asset-id="win.assetId" />
          <ButtonEditor v-else-if="assetType(win.assetId) === 'button'" :asset-id="win.assetId" />
          <PanelEditor v-else-if="assetType(win.assetId) === 'panel'" :asset-id="win.assetId" />
        </div>
      </article>
    </div>
  </div>
</template>
