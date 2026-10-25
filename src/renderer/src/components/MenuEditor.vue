<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { clampRect, minimumCanvasSize, rectPercent } from '@shared/assets'
import { centerContent } from '@shared/canvasView'
import { buildScene } from '@shared/scene'
import { DEFAULT_MENU_HEIGHT, DEFAULT_MENU_WIDTH, isCanvas, type MenuComponent } from '@shared/types'
import { useCanvasView } from '@/canvasView'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import AssetSelect from './AssetSelect.vue'
import SceneView from './SceneView.vue'

const componentTypes: { type: MenuComponent['type']; label: string }[] = [
  { type: 'image', label: 'Image' },
  { type: 'button', label: 'Button' },
  { type: 'panel', label: 'Panel' },
  { type: 'label', label: 'Label' },
  { type: 'text', label: 'Text' },
  { type: 'textarea', label: 'Text area' },
  { type: 'toggle', label: 'Toggle' },
  { type: 'toggleGroup', label: 'Toggle group' },
  { type: 'slider', label: 'Slider' },
  { type: 'dropdown', label: 'Dropdown' },
  { type: 'meter', label: 'Meter' },
  { type: 'pageViewer', label: 'Page viewer' },
  { type: 'composite', label: 'Composite' }
]

const props = defineProps<{ menuId: string }>()
const project = useProjectStore()
const session = useSessionStore()
const frameEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const { zoom, panning, setView, onPointerDown: onViewPointer, worldStyle, gridStyle, bindWheel } = useCanvasView()
const context = ref<{ x: number; y: number; componentId: string | null; roomOnRight: boolean; submenuTop: number } | null>(null)
const addOpen = ref(false)
const menu = computed(() => {
  const asset = project.asset(props.menuId)
  return asset && isCanvas(asset) ? asset : null
})
const scriptKey = computed(() => (menu.value?.type === 'composite' ? `composite:${props.menuId}` : `menu:${props.menuId}`))
const frame = ref({
  width: menu.value?.width ?? DEFAULT_MENU_WIDTH,
  height: menu.value?.height ?? DEFAULT_MENU_HEIGHT
})
const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const nodes = computed(() => (menu.value ? buildScene(menu.value, project.assets) : []))
const selected = computed(() => menu.value?.components.find((component) => component.id === session.selectedComponentId) ?? null)
const marqueeStyle = computed(() => {
  if (!selected.value || !menu.value) return {}
  const placed = rectPercent(selected.value, menu.value.width, menu.value.height)
  return { left: `${placed.x}%`, top: `${placed.y}%`, width: `${placed.width}%`, height: `${placed.height}%` }
})

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  if (!menu.value || !frameEl.value) return
  const bounds = frameEl.value.getBoundingClientRect()
  const menuW = menu.value.width
  const menuH = menu.value.height
  const handle = (event.target as HTMLElement).dataset.handle ?? null
  const xPx = ((event.clientX - bounds.left) / bounds.width) * menuW
  const yPx = ((event.clientY - bounds.top) / bounds.height) * menuH
  const component = handle
    ? selected.value
    : [...menu.value.components].reverse().find((item) => xPx >= item.x && xPx <= item.x + item.width && yPx >= item.y && yPx <= item.y + item.height)
  if (!component) {
    session.selectedComponentId = null
    return
  }
  session.selectedComponentId = component.id
  const drag = {
    id: component.id,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    rect: { x: component.x, y: component.y, width: component.width, height: component.height },
    frameW: bounds.width,
    frameH: bounds.height,
    menuW,
    menuH
  }
  const move = (ev: PointerEvent): void => {
    const dx = ((ev.clientX - drag.startX) / drag.frameW) * drag.menuW
    const dy = ((ev.clientY - drag.startY) / drag.frameH) * drag.menuH
    let { x, y, width, height } = drag.rect
    if (!drag.handle) {
      x += dx
      y += dy
    } else {
      if (drag.handle.includes('e')) width += dx
      if (drag.handle.includes('s')) height += dy
      if (drag.handle.includes('w')) {
        width -= dx
        x += dx
      }
      if (drag.handle.includes('n')) {
        height -= dy
        y += dy
      }
    }
    const rect = clampRect({ x, y, width, height }, drag.menuW, drag.menuH)
    project.patchComponent(props.menuId, drag.id, (item) => {
      item.x = rect.x
      item.y = rect.y
      item.width = rect.width
      item.height = rect.height
    })
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const canvasMin = computed(() => minimumCanvasSize(menu.value?.type === 'composite' ? 'composite' : 'menu'))

function designSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(canvasMin.value.width, Math.round(width)),
    height: Math.max(canvasMin.value.height, Math.round(height))
  }
}

function commitFrame(): void {
  project.patchAsset(props.menuId, (asset) => {
    if (!isCanvas(asset)) return
    asset.width = frame.value.width
    asset.height = frame.value.height
    for (const component of asset.components) {
      const rect = clampRect(component, asset.width, asset.height)
      component.x = rect.x
      component.y = rect.y
      component.width = rect.width
      component.height = rect.height
    }
  })
}

function setDesignSize(key: 'width' | 'height', event: Event): void {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (!Number.isFinite(value)) {
    input.value = String(frame.value[key])
    return
  }
  frame.value = designSize(key === 'width' ? value : frame.value.width, key === 'height' ? value : frame.value.height)
  input.value = String(frame.value[key])
  commitFrame()
}

function resizeFrame(event: PointerEvent): void {
  if (event.button !== 0) return
  event.stopPropagation()
  const origin = { x: event.clientX, y: event.clientY, width: frame.value.width, height: frame.value.height }
  const scale = zoom.value || 1
  const move = (ev: PointerEvent): void => {
    frame.value = designSize(origin.width + (ev.clientX - origin.x) / scale, origin.height + (ev.clientY - origin.y) / scale)
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    commitFrame()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function componentAt(event: MouseEvent): MenuComponent | null {
  if (!menu.value || !frameEl.value) return null
  const bounds = frameEl.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
    return null
  }
  const target = event.target as HTMLElement
  if (target.dataset.handle && selected.value) return selected.value
  const xPx = ((event.clientX - bounds.left) / bounds.width) * menu.value.width
  const yPx = ((event.clientY - bounds.top) / bounds.height) * menu.value.height
  return (
    [...menu.value.components].reverse().find((item) => item.visible && xPx >= item.x && xPx <= item.x + item.width && yPx >= item.y && yPx <= item.y + item.height) ??
    null
  )
}

function onContextMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, select')) return
  event.preventDefault()
  const component = componentAt(event)
  session.selectedComponentId = component?.id ?? null
  addOpen.value = false
  context.value = {
    x: Math.min(event.clientX, window.innerWidth - 200),
    y: Math.min(event.clientY, window.innerHeight - (component ? 120 : 48)),
    componentId: component?.id ?? null,
    roomOnRight: event.clientX + 380 < window.innerWidth,
    submenuTop: Math.min(0, window.innerHeight - event.clientY - 440)
  }
}

function closeContext(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest('.context-menu')) return
  context.value = null
  addOpen.value = false
}

function setMenuScript(id: string | null): void {
  project.patchAsset(props.menuId, (asset) => {
    if (isCanvas(asset)) asset.scriptId = id
  })
}

function addFromMenu(type: MenuComponent['type']): void {
  context.value = null
  addOpen.value = false
  project.addComponent(props.menuId, type)
}

function duplicateFromMenu(): void {
  const id = context.value?.componentId
  context.value = null
  if (id) project.duplicateComponent(props.menuId, id)
}

function deleteFromMenu(): void {
  const id = context.value?.componentId
  context.value = null
  if (id) project.removeComponent(props.menuId, id)
}

function onKey(event: KeyboardEvent): void {
  if (project.workspace.activeTab !== scriptKey.value) return
  if ((event.target as HTMLElement).matches('input, textarea, select')) return
  if ((event.key === 'Delete' || event.key === 'Backspace') && session.selectedComponentId) {
    project.removeComponent(props.menuId, session.selectedComponentId)
  }
}

let stopWheel: (() => void) | null = null
let stageObserver: ResizeObserver | null = null
let placedView = false

function panStage(event: PointerEvent): boolean {
  const target = event.target instanceof Element ? event.target : null
  return !target?.closest('.menu-frame, .frame-grip')
}

function placeFrame(): void {
  const stage = stageEl.value
  if (placedView || !stage || stage.clientWidth === 0 || stage.clientHeight === 0) return
  setView(centerContent(stage.clientWidth, stage.clientHeight, frame.value.width, frame.value.height))
  placedView = true
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointerdown', closeContext)
  if (stageEl.value) {
    stopWheel = bindWheel(stageEl.value)
    stageObserver = new ResizeObserver(() => placeFrame())
    stageObserver.observe(stageEl.value)
  }
  placeFrame()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointerdown', closeContext)
  stageObserver?.disconnect()
  stopWheel?.()
})
</script>

<template>
  <div class="menu-workspace" @contextmenu="onContextMenu">
    <div class="menu-toolbar">
      <button v-if="menu?.type === 'menu'" class="btn" type="button" :disabled="project.meta?.entryMenuId === menuId" @click="project.setEntry(menuId)">
        {{ project.meta?.entryMenuId === menuId ? 'Entry point' : 'Set as entry point' }}
      </button>
      <AssetSelect v-if="menu" label="Script" type="script" clearable :model-value="menu.scriptId" @update:model-value="setMenuScript" />
      <button class="btn" type="button" @click="project.openScriptTab(scriptKey)">
        {{ menu?.type === 'composite' ? 'Edit composite script' : 'Edit menu script' }}
      </button>
    </div>
    <div
      ref="stageEl"
      class="menu-stage"
      :class="{ 'is-panning': panning }"
      :style="gridStyle"
      @pointerdown="onViewPointer($event, panStage)"
    >
      <div class="menu-world" :style="worldStyle">
        <div class="menu-frame-wrap" :style="{ width: `${frame.width}px`, height: `${frame.height}px` }">
          <div ref="frameEl" class="menu-frame">
            <SceneView :nodes="nodes" />
            <div class="overlay" @pointerdown="onPointerDown">
              <div v-if="selected" class="marquee" :style="marqueeStyle">
                <i v-for="handle in handles" :key="handle" class="handle" :class="`handle-${handle}`" :data-handle="handle"></i>
              </div>
            </div>
          </div>
          <button class="frame-grip" type="button" aria-label="Resize canvas preview" @pointerdown="resizeFrame"></button>
        </div>
      </div>
    </div>
    <div class="frame-size">
        <label>Width <input type="number" :min="canvasMin.width" :value="frame.width" @change="setDesignSize('width', $event)" /></label>
        <label>Height <input type="number" :min="canvasMin.height" :value="frame.height" @change="setDesignSize('height', $event)" /></label>
    </div>
    <div v-if="context" class="context-menu" :style="{ left: `${context.x}px`, top: `${context.y}px` }" @contextmenu.stop.prevent>
      <div class="context-add">
        <button type="button" @click.stop="addOpen = !addOpen">Add</button>
        <div v-if="addOpen" class="context-menu context-submenu" :class="{ 'open-left': !context.roomOnRight }" :style="{ top: `${context.submenuTop}px` }">
          <button v-for="item in componentTypes" :key="item.type" type="button" @click="addFromMenu(item.type)">{{ item.label }}</button>
        </div>
      </div>
      <template v-if="context.componentId">
        <div class="menu-sep"></div>
        <button type="button" @click="duplicateFromMenu">Duplicate</button>
        <button type="button" @click="deleteFromMenu">Delete</button>
      </template>
    </div>
  </div>
</template>
