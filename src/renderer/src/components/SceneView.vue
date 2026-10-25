<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { syncScene, watchDevicePixels, type ControlValue } from '@shared/paint'
import type { SceneNode } from '@shared/scene'

const props = defineProps<{ nodes: SceneNode[]; interactive?: boolean }>()
const emit = defineEmits<{ press: [id: string]; activate: [id: string]; value: [id: string, value: ControlValue, inputKey?: string] }>()
const el = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null
let stopScale: (() => void) | null = null

function draw(): void {
  if (!el.value) return
  syncScene(el.value, props.nodes, (relativePath) => window.peach.assetUrl(relativePath), {
    interactive: props.interactive,
    onPressStart: (id) => emit('press', id),
    onActivate: (id) => emit('activate', id),
    onValue: (id, value, inputKey) => emit('value', id, value, inputKey)
  })
}

onMounted(() => {
  if (!el.value) return
  observer = new ResizeObserver(() => draw())
  observer.observe(el.value)
  stopScale = watchDevicePixels(() => draw())
  draw()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  stopScale?.()
})
watch(() => [props.nodes, props.interactive], () => draw(), { deep: true })
</script>

<template>
  <div ref="el" class="scene-root"></div>
</template>
