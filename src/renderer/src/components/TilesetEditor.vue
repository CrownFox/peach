<script setup lang="ts">
import { computed, ref } from 'vue'
import { fittedMerges, mergeAt, spansOverlap, tileAtPoint, tileGrid } from '@shared/tiles'
import type { TileSpan } from '@shared/types'
import { fileUrl } from '@/thumbs'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import AssetSelect from './AssetSelect.vue'

const props = defineProps<{ assetId: string }>()
const project = useProjectStore()
const session = useSessionStore()
const sheet = ref<HTMLElement | null>(null)
const draft = ref<TileSpan | null>(null)
const selected = ref<TileSpan | null>(null)

const asset = computed(() => {
  const item = project.asset(props.assetId)
  return item?.type === 'tileset' ? item : null
})
const image = computed(() => {
  const item = project.asset(asset.value?.imageId ?? null)
  return item?.type === 'image' ? item : null
})
const url = computed(() => fileUrl(image.value?.file ?? null))
const grid = computed(() => tileGrid(asset.value?.tileWidth ?? 0, asset.value?.tileHeight ?? 0, image.value?.width ?? 0, image.value?.height ?? 0))

function spanStyle(span: TileSpan): Record<string, string> {
  const tileWidth = asset.value?.tileWidth ?? 1
  const tileHeight = asset.value?.tileHeight ?? 1
  return {
    left: `${span.x * tileWidth}px`,
    top: `${span.y * tileHeight}px`,
    width: `${span.width * tileWidth}px`,
    height: `${span.height * tileHeight}px`
  }
}

const gridStyle = computed(() => {
  const tileWidth = asset.value?.tileWidth ?? 16
  const tileHeight = asset.value?.tileHeight ?? 16
  return {
    width: `${grid.value.cols * tileWidth}px`,
    height: `${grid.value.rows * tileHeight}px`,
    backgroundSize: `${tileWidth}px ${tileHeight}px`
  }
})

function patch(apply: (tileset: NonNullable<typeof asset.value>) => void): void {
  project.patchAsset(props.assetId, (item) => {
    if (item.type === 'tileset') apply(item)
  })
}

function setImage(id: string | null): void {
  patch((tileset) => {
    tileset.imageId = id
    const next = project.asset(id)
    const picture = next?.type === 'image' ? next : null
    tileset.merges = fittedMerges(tileset.merges, tileset.tileWidth, tileset.tileHeight, picture?.width ?? 0, picture?.height ?? 0)
  })
  selected.value = null
}

function setTileSize(key: 'tileWidth' | 'tileHeight', event: Event): void {
  const value = Math.floor(Number((event.target as HTMLInputElement).value))
  if (!asset.value || !Number.isInteger(value) || value < 1) {
    if (asset.value) (event.target as HTMLInputElement).value = String(asset.value[key])
    return
  }
  patch((tileset) => {
    tileset[key] = value
    tileset.merges = fittedMerges(tileset.merges, tileset.tileWidth, tileset.tileHeight, image.value?.width ?? 0, image.value?.height ?? 0)
  })
  selected.value = null
}

function cellAt(event: PointerEvent): { x: number; y: number } | null {
  const host = sheet.value
  if (!host || !asset.value) return null
  const bounds = host.getBoundingClientRect()
  return tileAtPoint(
    event.clientX - bounds.left,
    event.clientY - bounds.top,
    bounds.width,
    bounds.height,
    host.clientWidth,
    host.clientHeight,
    asset.value.tileWidth,
    asset.value.tileHeight,
    grid.value.cols,
    grid.value.rows
  )
}

function spanBetween(start: { x: number; y: number }, end: { x: number; y: number }): TileSpan {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  return { x, y, width: Math.abs(start.x - end.x) + 1, height: Math.abs(start.y - end.y) + 1 }
}

function startMerge(event: PointerEvent): void {
  if (event.button !== 0 || !asset.value) return
  const start = cellAt(event)
  if (!start) return
  event.preventDefault()
  draft.value = { ...start, width: 1, height: 1 }
  const move = (ev: PointerEvent): void => {
    const end = cellAt(ev)
    if (end) draft.value = spanBetween(start, end)
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    const span = draft.value
    draft.value = null
    if (!span || !asset.value) return
    if (span.width === 1 && span.height === 1) {
      const found = mergeAt(asset.value.merges, span.x, span.y)
      selected.value = found.width > 1 || found.height > 1 ? found : null
      return
    }
    if (asset.value.merges.some((item) => spansOverlap(item, span))) {
      session.fail('That region overlaps a merged tile.')
      return
    }
    patch((tileset) => {
      tileset.merges = [...tileset.merges, span]
    })
    selected.value = span
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function unmerge(): void {
  const span = selected.value
  if (!span) return
  patch((tileset) => {
    tileset.merges = tileset.merges.filter((item) => item.x !== span.x || item.y !== span.y || item.width !== span.width || item.height !== span.height)
  })
  selected.value = null
}

function sameSpan(span: TileSpan): boolean {
  const current = selected.value
  return current !== null && current.x === span.x && current.y === span.y && current.width === span.width && current.height === span.height
}
</script>

<template>
  <div v-if="asset" class="editor-block tileset-editor">
    <AssetSelect label="Image" type="image" clearable :model-value="asset.imageId" @update:model-value="setImage" />
    <div class="grid-2">
      <label class="field"><span class="field-label">Tile width</span><input type="number" min="1" step="1" :value="asset.tileWidth" @change="setTileSize('tileWidth', $event)" /></label>
      <label class="field"><span class="field-label">Tile height</span><input type="number" min="1" step="1" :value="asset.tileHeight" @change="setTileSize('tileHeight', $event)" /></label>
    </div>
    <p class="tree-hint">Drag across cells to merge them into one picture. Click a merged piece, then unmerge it. Pixels past the last full cell are ignored.</p>
    <button class="btn" type="button" :disabled="!selected" @click="unmerge">Unmerge</button>
    <div v-if="url && image" class="tileset-scroll">
      <div ref="sheet" class="tileset-sheet" :style="{ width: `${image.width}px`, height: `${image.height}px` }" @pointerdown="startMerge">
        <img class="tileset-image" :src="url" alt="" draggable="false" />
        <div class="tileset-grid" :style="gridStyle"></div>
        <div v-for="span in asset.merges" :key="`${span.x},${span.y},${span.width},${span.height}`" class="tileset-merge" :class="{ selected: sameSpan(span) }" :style="spanStyle(span)"></div>
        <div v-if="draft && (draft.width > 1 || draft.height > 1)" class="tileset-draft" :style="spanStyle(draft)"></div>
      </div>
    </div>
    <p v-else class="tree-hint">Choose an image to cut it into tiles.</p>
    <p v-if="image" class="tree-hint">{{ grid.cols }} by {{ grid.rows }} tiles.</p>
  </div>
</template>
