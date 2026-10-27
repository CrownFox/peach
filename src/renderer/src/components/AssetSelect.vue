<script setup lang="ts">
import { computed } from 'vue'
import type { AssetType } from '@shared/types'
import { pickAsset } from '@/picker'
import { thumbnailUrl } from '@/canvasThumb'
import { hasThumbnail } from '@/thumbs'
import { useProjectStore } from '@/stores/project'

const props = defineProps<{
  label: string
  type: AssetType
  modelValue: string | null
  clearable?: boolean
  blockedIds?: string[]
  emptyLabel?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string | null] }>()
const project = useProjectStore()
const visual = computed(() => hasThumbnail(props.type))
const thumb = computed(() => (visual.value ? thumbnailUrl(project.assets, props.modelValue) : ''))
const name = computed(() => project.asset(props.modelValue)?.name ?? (props.emptyLabel || `Choose ${props.type}`))

async function choose(): Promise<void> {
  const id = await pickAsset(props.type, props.modelValue, props.blockedIds ?? [])
  if (id) emit('update:modelValue', id)
}
</script>

<template>
  <div class="field">
    <span class="field-label">{{ label }}</span>
    <button v-if="visual" class="thumb-button" type="button" @click="choose">
      <img v-if="thumb" :src="thumb" alt="" />
      <span v-else class="thumb-fallback"></span>
      <span>{{ name }}</span>
    </button>
    <button v-else class="pick-button" type="button" @click="choose">
      <span class="pick-name">{{ name }}</span>
      <svg class="pick-link" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          d="M6.6 9.4 9.4 6.6M7.2 5.1l.7-.7a2.4 2.4 0 0 1 3.4 3.4l-.7.7M8.8 10.9l-.7.7a2.4 2.4 0 0 1-3.4-3.4l.7-.7"
        />
      </svg>
    </button>
    <button v-if="clearable && (modelValue || emptyLabel)" class="btn quiet" type="button" @click="emit('update:modelValue', null)">Clear</button>
  </div>
</template>
