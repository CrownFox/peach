<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { buildScene, fitFrame } from '@shared/scene'
import { isTypingTarget, keyAction } from '@shared/keys'
import type { ControlValue } from '@shared/paint'
import { DEFAULT_MENU_HEIGHT, DEFAULT_MENU_WIDTH } from '@shared/types'
import { usePlayStore } from '@/stores/play'
import { useProjectStore } from '@/stores/project'
import SceneView from './SceneView.vue'

const project = useProjectStore()
const play = usePlayStore()
const viewportEl = ref<HTMLElement | null>(null)
const box = ref({ width: 0, height: 0 })
let observer: ResizeObserver | null = null

const menu = computed(() => {
  const asset = project.asset(play.currentId)
  return asset?.type === 'menu' ? asset : null
})
const nodes = computed(() => {
  if (!menu.value) return []
  const fitted = fitFrame(box.value.width, box.value.height, menu.value.width, menu.value.height)
  const displayScale = menu.value.width > 0 ? fitted.width / menu.value.width : 1
  return buildScene(menu.value, project.assets, { pressedId: play.pressedId, overrides: play.overrides, pages: play.pages, displayScale })
})
const modalViews = computed(() =>
  play.modals.flatMap((modal) => {
    const asset = project.asset(modal.menuId)
    if (asset?.type !== 'menu') return []
    const fitted = fitFrame(box.value.width, box.value.height, asset.width, asset.height)
    const displayScale = asset.width > 0 ? fitted.width / asset.width : 1
    return [{
      style: { width: `${fitted.width}px`, height: `${fitted.height}px` },
      nodes: buildScene(asset, project.assets, { pressedId: play.pressedId, overrides: modal.overrides, pages: play.pages, displayScale })
    }]
  })
)
const stageStyle = computed(() => {
  const fitted = fitFrame(
    box.value.width,
    box.value.height,
    menu.value?.width ?? DEFAULT_MENU_WIDTH,
    menu.value?.height ?? DEFAULT_MENU_HEIGHT
  )
  return { width: `${fitted.width}px`, height: `${fitted.height}px` }
})

function measure(): void {
  if (!viewportEl.value) return
  box.value = { width: viewportEl.value.clientWidth, height: viewportEl.value.clientHeight }
}

function publishScale(): void {
  const modal = play.modals.at(-1)
  const asset = modal ? project.asset(modal.menuId) : menu.value
  if (!asset || asset.type !== 'menu' || asset.width <= 0) {
    play.setDisplayScale(1)
    return
  }
  const fitted = fitFrame(box.value.width, box.value.height, asset.width, asset.height)
  play.setDisplayScale(fitted.width > 0 ? fitted.width / asset.width : 1)
}

function activate(id: string): void {
  play.activate(id)
}

function onControl(id: string, value: ControlValue, inputKey?: string): void {
  if (inputKey) play.setPageInput(id, inputKey, String(value))
  else play.setControl(id, value)
}

function press(id: string): void {
  play.pressedId = id
  const release = (): void => {
    play.pressedId = null
    window.removeEventListener('pointerup', release)
  }
  window.addEventListener('pointerup', release)
}

function onKey(event: KeyboardEvent): void {
  if (project.workspace.activeTab !== 'game') return
  const typing = isTypingTarget(event.target)
  play.setTyping(typing)
  const action = keyAction(event.type, event.repeat, event.code, false)
  if (!action) return
  const handled = play.pressKey(action.code, action.edge, action.fire && !typing)
  if (!typing && handled) event.preventDefault()
}

let clock = 0
let clockAt = 0

function onFrame(now: number): void {
  clock = requestAnimationFrame(onFrame)
  if (project.workspace.activeTab !== 'game') {
    clockAt = now
    return
  }
  play.setTyping(isTypingTarget(document.activeElement))
  publishScale()
  if (clockAt > 0) play.tick(now - clockAt)
  clockAt = now
}

onMounted(() => {
  measure()
  observer = new ResizeObserver(() => measure())
  if (viewportEl.value) observer.observe(viewportEl.value)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  clock = requestAnimationFrame(onFrame)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKey)
  cancelAnimationFrame(clock)
})
</script>

<template>
  <div ref="viewportEl" class="viewport">
    <template v-if="menu">
      <div class="play-stage" :style="stageStyle">
        <SceneView :nodes="nodes" :interactive="play.modals.length === 0" @press="press" @activate="activate" @value="onControl" />
      </div>
      <div v-for="(modal, index) in modalViews" :key="index" class="modal-layer">
        <div class="modal-stage" :style="modal.style">
          <SceneView :nodes="modal.nodes" :interactive="index === modalViews.length - 1" @press="press" @activate="activate" @value="onControl" />
        </div>
      </div>
    </template>
    <div v-else class="empty-play">
      <div>
        <strong>No menu is open.</strong>
        <p>Choose a menu in the inspector, or set an entry point from the project tree.</p>
      </div>
    </div>
  </div>
</template>
