<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fitContent } from '@shared/canvasView'
import { clampSlices } from '@shared/scene'
import type { ButtonSlices } from '@shared/types'
import { useCanvasView } from '@/canvasView'

const props = defineProps<{ url: string; width: number; height: number; slices: ButtonSlices }>()
const emit = defineEmits<{ change: [slices: ButtonSlices] }>()
const box = ref<HTMLElement | null>(null)
const { panX, panY, zoom, panning, setView, onWheel, onPointerDown, worldFrom, gridStyle, bindWheel } = useCanvasView()
let observer: ResizeObserver | null = null
let stopWheel: (() => void) | null = null
let placed = false

function fit(): void {
  const host = box.value
  if (!host || host.clientWidth <= 0 || host.clientHeight <= 0 || props.width <= 0 || props.height <= 0) return
  setView(fitContent(host.clientWidth, host.clientHeight, props.width, props.height))
  placed = true
}

function guide(edge: 'left' | 'right' | 'top' | 'bottom'): Record<string, string> {
  const scale = zoom.value
  const originX = panX.value
  const originY = panY.value
  if (edge === 'left' || edge === 'right') {
    const x = originX + (edge === 'left' ? props.slices.left : props.width - props.slices.right) * scale
    return { left: `${x}px`, top: `${originY}px`, height: `${props.height * scale}px` }
  }
  const y = originY + (edge === 'top' ? props.slices.top : props.height - props.slices.bottom) * scale
  return { top: `${y}px`, left: `${originX}px`, width: `${props.width * scale}px` }
}

const imageStyle = computed(() => ({
  left: `${panX.value}px`,
  top: `${panY.value}px`,
  width: `${props.width * zoom.value}px`,
  height: `${props.height * zoom.value}px`
}))

function panStage(event: PointerEvent): boolean {
  const target = event.target instanceof Element ? event.target : null
  return !target?.closest('.guide')
}

function start(edge: 'left' | 'right' | 'top' | 'bottom', event: PointerEvent): void {
  if (event.button !== 0) return
  event.stopPropagation()
  event.preventDefault()
  const move = (ev: PointerEvent): void => {
    if (!box.value) return
    const world = worldFrom(ev, box.value)
    const next = { ...props.slices }
    if (edge === 'left') next.left = Math.round(world.x)
    if (edge === 'right') next.right = Math.round(props.width - world.x)
    if (edge === 'top') next.top = Math.round(world.y)
    if (edge === 'bottom') next.bottom = Math.round(props.height - world.y)
    emit('change', clampSlices(next, props.width, props.height))
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

onMounted(() => {
  fit()
  if (box.value) {
    stopWheel = bindWheel(box.value, (event) => {
      if (event.ctrlKey) {
        event.preventDefault()
        return
      }
      event.stopPropagation()
      onWheel(event)
    })
    observer = new ResizeObserver(() => {
      if (!placed) fit()
    })
    observer.observe(box.value)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stopWheel?.()
})
watch(
  () => [props.url, props.width, props.height],
  () => {
    placed = false
    fit()
  }
)
</script>

<template>
  <div
    ref="box"
    class="slice-stage"
    :class="{ 'is-panning': panning }"
    :style="gridStyle"
    @pointerdown="onPointerDown($event, panStage)"
  >
    <img :src="url" alt="" :style="imageStyle" />
    <button class="guide vertical" type="button" :style="guide('left')" @pointerdown="start('left', $event)"></button>
    <button class="guide vertical" type="button" :style="guide('right')" @pointerdown="start('right', $event)"></button>
    <button class="guide horizontal" type="button" :style="guide('top')" @pointerdown="start('top', $event)"></button>
    <button class="guide horizontal" type="button" :style="guide('bottom')" @pointerdown="start('bottom', $event)"></button>
  </div>
</template>
