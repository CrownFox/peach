<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parentPath } from '@shared/paths'
import type { TreeNode } from '@shared/types'
import { closePicker, pickerRequest } from '@/picker'
import { fileUrl, thumbnailFile } from '@/thumbs'
import { useProjectStore } from '@/stores/project'

const project = useProjectStore()
const folder = ref('')
const selectedId = ref<string | null>(null)

watch(pickerRequest, (request) => {
  if (!request) return
  folder.value = ''
  selectedId.value = request.selectedId
})

const folders = computed(() => {
  const list: { name: string; path: string; depth: number }[] = []
  const walk = (node: TreeNode, depth: number): void => {
    if (node.kind !== 'folder') return
    list.push({ name: node.name, path: node.relativePath, depth })
    for (const child of node.children) walk(child, depth + 1)
  }
  walk(project.tree, 0)
  return list
})

const assets = computed(() => {
  const type = pickerRequest.value?.type
  if (!type) return []
  const blocked = new Set(pickerRequest.value?.blockedIds ?? [])
  return project.assets.filter((asset) => asset.type === type && parentPath(asset.relativePath) === folder.value && !blocked.has(asset.id))
})

function confirmSelection(): void {
  if (selectedId.value) closePicker(selectedId.value)
}
</script>

<template>
  <div v-if="pickerRequest" class="modal-backdrop" @pointerdown.self="closePicker(null)">
    <section class="modal browser" @keydown.esc="closePicker(null)">
      <h2>Choose {{ pickerRequest.type }}</h2>
      <div class="browser-body">
        <div class="folder-list">
          <button
            v-for="item in folders"
            :key="item.path || 'root'"
            class="folder-item"
            :class="{ selected: folder === item.path }"
            type="button"
            :style="{ paddingLeft: `${8 + item.depth * 14}px` }"
            @click="folder = item.path"
          >
            {{ item.name }}
          </button>
        </div>
        <div class="thumb-grid">
          <button
            v-for="asset in assets"
            :key="asset.id"
            class="thumb"
            :class="{ selected: selectedId === asset.id }"
            type="button"
            @click="selectedId = asset.id"
            @dblclick="closePicker(asset.id)"
          >
            <img v-if="fileUrl(thumbnailFile(project.assets, asset.id))" :src="fileUrl(thumbnailFile(project.assets, asset.id))" alt="" />
            <span v-else class="thumb-fallback"></span>
            <span>{{ asset.name }}</span>
          </button>
          <p v-if="assets.length === 0" class="tree-hint">This folder has no {{ pickerRequest.type }} assets.</p>
        </div>
      </div>
      <footer>
        <button class="btn quiet" type="button" @click="closePicker(null)">Cancel</button>
        <button class="btn primary" type="button" :disabled="!selectedId" @click="confirmSelection">Select</button>
      </footer>
    </section>
  </div>
</template>
