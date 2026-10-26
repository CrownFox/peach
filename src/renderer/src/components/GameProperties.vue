<script setup lang="ts">
import { computed } from 'vue'
import { fileUrl } from '@/thumbs'
import { useProjectStore } from '@/stores/project'

const project = useProjectStore()
const iconUrl = computed(() => fileUrl(project.meta?.icon ?? null))

function setTitle(event: Event): void {
  const input = event.target as HTMLInputElement
  const name = input.value.trim()
  if (!name || name === project.meta?.name) {
    input.value = project.meta?.name ?? ''
    return
  }
  void project.updateMeta({ name })
}

function setAuthor(event: Event): void {
  const input = event.target as HTMLInputElement
  const author = input.value.trim()
  if (author === (project.meta?.author ?? '')) return
  void project.updateMeta({ author })
}
</script>

<template>
  <div v-if="project.meta" class="editor-block">
    <label class="field">
      <span class="field-label">Title</span>
      <input :value="project.meta.name" @change="setTitle" />
    </label>
    <label class="field">
      <span class="field-label">Author</span>
      <input :value="project.meta.author" @change="setAuthor" />
    </label>
    <div class="import-well">
      <img v-if="iconUrl" :src="iconUrl" alt="" />
      <span v-else>Import a PNG, JPEG, WebP, or GIF.</span>
    </div>
    <div class="inline-actions">
      <button class="btn primary" type="button" @click="project.importGameIcon()">Import icon</button>
      <button class="btn" type="button" :disabled="!project.meta.icon" @click="project.clearGameIcon()">Remove</button>
    </div>
  </div>
</template>
