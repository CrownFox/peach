<script setup lang="ts">
import { computed } from 'vue'
import type { AssetType } from '@shared/types'
import { pickAsset } from '@/picker'
import { fileUrl, thumbnailFile } from '@/thumbs'
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
const thumb = computed(() => fileUrl(thumbnailFile(project.assets, props.modelValue)))
const name = computed(() => project.asset(props.modelValue)?.name ?? (props.emptyLabel || `Choose ${props.type}`))

async function choose(): Promise<void> {
  const id = await pickAsset(props.type, props.modelValue, props.blockedIds ?? [])
  if (id) emit('update:modelValue', id)
}
</script>

<template>
  <div class="field">
    <span class="field-label">{{ label }}</span>
    <button class="thumb-button" type="button" @click="choose">
      <img v-if="thumb" :src="thumb" alt="" />
      <span v-else class="thumb-fallback"></span>
      <span>{{ name }}</span>
    </button>
    <button v-if="clearable && (modelValue || emptyLabel)" class="btn quiet" type="button" @click="emit('update:modelValue', null)">Clear</button>
  </div>
</template>
