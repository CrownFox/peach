<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { fileUrl } from '@/thumbs'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ assetId: string }>()
const project = useProjectStore()
const session = useSessionStore()
const nameInput = ref<HTMLInputElement | null>(null)
const asset = computed(() => {
  const item = project.asset(props.assetId)
  return item?.type === 'image' ? item : null
})
const url = computed(() => fileUrl(asset.value?.file ?? null))

onMounted(async () => {
  if (session.focusNameAssetId !== props.assetId) return
  session.focusNameAssetId = null
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
})

async function importImage(): Promise<void> {
  if (!asset.value) return
  const source = await window.peach.chooseImage()
  if (!source) return
  await project.importImage(asset.value.relativePath, source)
}

function rename(event: Event): void {
  if (!asset.value) return
  void project.rename(asset.value.relativePath, (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div v-if="asset" class="editor-block">
    <label class="field">
      <span class="field-label">Name</span>
      <input ref="nameInput" :value="asset.name" @change="rename" />
    </label>
    <div class="import-well">
      <img v-if="url" :src="url" alt="" />
      <span v-else>Import a PNG, JPEG, WebP, or GIF.</span>
    </div>
    <div v-if="asset.file" class="meta">
      <span>{{ asset.width }} × {{ asset.height }}</span>
      <span>{{ asset.format?.toUpperCase() }}</span>
    </div>
    <button class="btn primary" type="button" @click="importImage">Import</button>
  </div>
</template>
