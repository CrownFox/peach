<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { DEFAULT_FONT_FAMILY } from '@shared/fonts'
import { buildScene, clampSlices } from '@shared/scene'
import type { ButtonAsset, ButtonSlices } from '@shared/types'
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
const previewState = ref<'default' | 'pressed' | 'disabled'>('default')
const asset = computed(() => {
  const item = project.asset(props.assetId)
  return item?.type === 'button' ? item : null
})
const defaultImage = computed(() => {
  const image = project.asset(asset.value?.states.default ?? null)
  return image?.type === 'image' && image.file && image.width > 0 ? image : null
})
const nodes = computed(() => {
  const button = asset.value
  if (!button) return []
  return buildScene(
    {
      id: 'preview',
      type: 'menu',
      name: 'Preview',
      relativePath: '',
      width: 320,
      height: 96,
      gridSize: 16,
      snapToGrid: false,
      scriptId: null,
      script: '',
      components: [
        {
          id: 'preview-button',
          type: 'button',
          name: button.name,
          handle: '',
          scriptId: null,
          script: '',
          x: 8,
          y: 18,
          width: 84,
          height: 64,
          buttonId: button.id,
          enabled: true,
          text: '',
          fontFamily: DEFAULT_FONT_FAMILY,
          fontSize: 40,
          color: '#ffffff',
          tint: '#ffffff',
          visible: true
        }
      ]
    },
    project.assets,
    { previewState: previewState.value }
  )
})

onMounted(async () => {
  if (session.focusNameAssetId !== props.assetId) return
  session.focusNameAssetId = null
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
})

function patch(recipe: (button: ButtonAsset) => void): void {
  if (!asset.value) return
  project.patchAsset(asset.value.id, (item) => {
    if (item.type === 'button') recipe(item)
  })
}

function rename(event: Event): void {
  if (!asset.value) return
  void project.rename(asset.value.relativePath, (event.target as HTMLInputElement).value)
}

function setSlice(side: keyof ButtonSlices, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!asset.value || !Number.isFinite(value)) return
  const image = defaultImage.value
  const next = { ...asset.value.slices, [side]: Math.max(0, value) }
  patch((button) => {
    button.slices = image ? clampSlices(next, image.width, image.height) : next
  })
}
</script>

<template>
  <div v-if="asset" class="editor-block">
    <label class="field">
      <span class="field-label">Name</span>
      <input ref="nameInput" :value="asset.name" @change="rename" />
    </label>
    <div class="segmented">
      <button type="button" :class="{ active: asset.mode === 'static' }" @click="patch((button) => (button.mode = 'static'))">Static</button>
      <button type="button" :class="{ active: asset.mode === 'nine-panel' }" @click="patch((button) => (button.mode = 'nine-panel'))">9-panel</button>
    </div>
    <AssetSelect label="Default image" type="image" clearable :model-value="asset.states.default" @update:model-value="patch((button) => (button.states.default = $event))" />
    <AssetSelect label="Pressed image" type="image" clearable :model-value="asset.states.pressed" @update:model-value="patch((button) => (button.states.pressed = $event))" />
    <AssetSelect label="Disabled image" type="image" clearable :model-value="asset.states.disabled" @update:model-value="patch((button) => (button.states.disabled = $event))" />
    <label class="field">
      <span class="field-label">Preview state</span>
      <select v-model="previewState">
        <option value="default">Default</option>
        <option value="pressed">Pressed</option>
        <option value="disabled">Disabled</option>
      </select>
    </label>
    <div class="preview-box">
      <SceneView :nodes="nodes" />
    </div>
    <template v-if="asset.mode === 'nine-panel'">
      <NineSliceGuides
        v-if="defaultImage"
        :url="fileUrl(defaultImage.file)"
        :width="defaultImage.width"
        :height="defaultImage.height"
        :slices="asset.slices"
        @change="patch((button) => (button.slices = $event))"
      />
      <p v-else class="tree-hint">Import and choose a default image to edit the 9-panel guides.</p>
      <div class="grid-2">
        <label class="field"><span class="field-label">Left</span><input type="number" min="0" :value="asset.slices.left" @change="setSlice('left', $event)" /></label>
        <label class="field"><span class="field-label">Right</span><input type="number" min="0" :value="asset.slices.right" @change="setSlice('right', $event)" /></label>
        <label class="field"><span class="field-label">Top</span><input type="number" min="0" :value="asset.slices.top" @change="setSlice('top', $event)" /></label>
        <label class="field"><span class="field-label">Bottom</span><input type="number" min="0" :value="asset.slices.bottom" @change="setSlice('bottom', $event)" /></label>
      </div>
      <span class="field-label">Edges</span>
      <div class="segmented">
        <button type="button" :class="{ active: asset.edgeFill !== 'tile' }" @click="patch((button) => (button.edgeFill = 'stretch'))">Stretch</button>
        <button type="button" :class="{ active: asset.edgeFill === 'tile' }" @click="patch((button) => (button.edgeFill = 'tile'))">Tile</button>
      </div>
      <span class="field-label">Center</span>
      <div class="segmented">
        <button type="button" :class="{ active: asset.centerFill !== 'tile' }" @click="patch((button) => (button.centerFill = 'stretch'))">Stretch</button>
        <button type="button" :class="{ active: asset.centerFill === 'tile' }" @click="patch((button) => (button.centerFill = 'tile'))">Tile</button>
      </div>
      <p class="tree-hint">Tiled top and bottom edges repeat sideways, tiled sides repeat downward, and a tiled center repeats across and downward. Edge thickness stays the inset from the guides, in screen pixels.</p>
    </template>
  </div>
</template>
