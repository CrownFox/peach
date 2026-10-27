<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { buildScene, clampSlices } from '@shared/scene'
import type { ButtonSlices, PanelAsset } from '@shared/types'
import { fileUrl } from '@/thumbs'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import AssetSelect from './AssetSelect.vue'
import NineSliceGuides from './NineSliceGuides.vue'
import SceneView from './SceneView.vue'

const props = defineProps<{ assetId: string }>()
const project = useProjectStore()
const session = useSessionStore()
const nameInput = ref<HTMLInputElement | null>(null)
const asset = computed(() => {
  const item = project.asset(props.assetId)
  return item?.type === 'panel' ? item : null
})
const image = computed(() => {
  const item = project.asset(asset.value?.imageId ?? null)
  return item?.type === 'image' && item.file && item.width > 0 ? item : null
})
const nodes = computed(() => {
  const panel = asset.value
  if (!panel) return []
  return buildScene(
    {
      id: 'preview',
      type: 'menu',
      name: 'Preview',
      relativePath: '',
      width: 320,
      height: 180,
      gridSize: 16,
      snapToGrid: false,
      scriptId: null,
      script: '',
      components: [
        {
          id: 'preview-panel',
          type: 'panel',
          name: panel.name,
          handle: '',
          scriptId: null,
          script: '',
          x: 8,
          y: 8,
          width: 84,
          height: 84,
          panelId: panel.id,
          tint: '#ffffff',
          visible: true
        }
      ]
    },
    project.assets
  )
})

onMounted(async () => {
  if (session.focusNameAssetId !== props.assetId) return
  session.focusNameAssetId = null
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
})

function patch(recipe: (panel: PanelAsset) => void): void {
  if (!asset.value) return
  project.patchAsset(asset.value.id, (item) => {
    if (item.type === 'panel') recipe(item)
  })
}

function rename(event: Event): void {
  if (!asset.value) return
  void project.rename(asset.value.relativePath, (event.target as HTMLInputElement).value)
}

function setSlice(side: keyof ButtonSlices, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!asset.value || !Number.isFinite(value)) return
  const source = image.value
  const next = { ...asset.value.slices, [side]: Math.max(0, value) }
  patch((panel) => {
    panel.slices = source ? clampSlices(next, source.width, source.height) : next
  })
}
</script>

<template>
  <div v-if="asset" class="editor-block">
    <label class="field">
      <span class="field-label">Name</span>
      <input ref="nameInput" :value="asset.name" @change="rename" />
    </label>
    <AssetSelect label="Image" type="image" clearable :model-value="asset.imageId" @update:model-value="patch((panel) => (panel.imageId = $event))" />
    <div class="preview-box">
      <SceneView :nodes="nodes" />
    </div>
    <NineSliceGuides
      v-if="image"
      :url="fileUrl(image.file)"
      :width="image.width"
      :height="image.height"
      :slices="asset.slices"
      @change="patch((panel) => (panel.slices = $event))"
    />
    <p v-else class="tree-hint">Import and choose an image to edit the 9-panel guides.</p>
    <div class="grid-2">
      <label class="field"><span class="field-label">Left</span><input type="number" min="0" :value="asset.slices.left" @change="setSlice('left', $event)" /></label>
      <label class="field"><span class="field-label">Right</span><input type="number" min="0" :value="asset.slices.right" @change="setSlice('right', $event)" /></label>
      <label class="field"><span class="field-label">Top</span><input type="number" min="0" :value="asset.slices.top" @change="setSlice('top', $event)" /></label>
      <label class="field"><span class="field-label">Bottom</span><input type="number" min="0" :value="asset.slices.bottom" @change="setSlice('bottom', $event)" /></label>
    </div>
    <span class="field-label">Edges</span>
    <div class="segmented">
      <button type="button" :class="{ active: asset.edgeFill !== 'tile' }" @click="patch((panel) => (panel.edgeFill = 'stretch'))">Stretch</button>
      <button type="button" :class="{ active: asset.edgeFill === 'tile' }" @click="patch((panel) => (panel.edgeFill = 'tile'))">Tile</button>
    </div>
    <span class="field-label">Center</span>
    <div class="segmented">
      <button type="button" :class="{ active: asset.centerFill !== 'tile' }" @click="patch((panel) => (panel.centerFill = 'stretch'))">Stretch</button>
      <button type="button" :class="{ active: asset.centerFill === 'tile' }" @click="patch((panel) => (panel.centerFill = 'tile'))">Tile</button>
    </div>
    <p class="tree-hint">Tiled top and bottom edges repeat sideways, tiled sides repeat downward, and a tiled center repeats across and downward. Edge thickness stays the inset from the guides, in screen pixels.</p>
  </div>
</template>
