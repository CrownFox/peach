<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { imageForTileset, indexInTileset, tileGrid, tilesetById } from '@shared/tiles'
import { fileUrl } from '@/thumbs'
import { useProjectStore } from '@/stores/project'

const props = defineProps<{ tilesetId: string; tileX: number; tileY: number }>()
const emit = defineEmits<{ confirm: [tileX: number, tileY: number]; cancel: [] }>()
const project = useProjectStore()

const tileset = computed(() => tilesetById(project.assets, props.tilesetId))
const image = computed(() => (tileset.value ? imageForTileset(tileset.value, project.assets) : null))
const url = computed(() => fileUrl(image.value?.file ?? null))
const grid = computed(() => tileGrid(tileset.value?.tileWidth ?? 0, tileset.value?.tileHeight ?? 0, image.value?.width ?? 0, image.value?.height ?? 0))
const cells = computed(() => {
  const found: { x: number; y: number }[] = []
  for (let y = 0; y < grid.value.rows; y += 1) {
    for (let x = 0; x < grid.value.cols; x += 1) found.push({ x, y })
  }
  return found
})
const scale = computed(() => {
  const tileWidth = tileset.value?.tileWidth ?? 0
  const tileHeight = tileset.value?.tileHeight ?? 0
  if (tileWidth < 1 || tileHeight < 1) return 1
  const shortest = Math.min(tileWidth, tileHeight)
  if (shortest < 32) return 32 / shortest
  return Math.min(1, 64 / Math.max(tileWidth, tileHeight))
})
const cellWidth = computed(() => (tileset.value?.tileWidth ?? 0) * scale.value)
const cellHeight = computed(() => (tileset.value?.tileHeight ?? 0) * scale.value)
const draft = ref<{ x: number; y: number } | null>(
  tileset.value && indexInTileset(tileset.value, image.value, props.tileX, props.tileY) ? { x: props.tileX, y: props.tileY } : null
)
const mergeBoxes = computed(() => {
  const sheet = tileset.value
  if (!sheet) return []
  return sheet.merges.flatMap((span) => {
    if ((span.width < 2 && span.height < 2) || span.x < 0 || span.y < 0) return []
    if (span.x + span.width > grid.value.cols || span.y + span.height > grid.value.rows) return []
    return [{
      key: `${span.x},${span.y}`,
      style: {
        left: `${span.x * cellWidth.value}px`,
        top: `${span.y * cellHeight.value}px`,
        width: `${span.width * cellWidth.value}px`,
        height: `${span.height * cellHeight.value}px`
      }
    }]
  })
})

const sheetStyle = computed(() => {
  const picture = image.value
  if (!picture || !url.value || grid.value.cols < 1 || grid.value.rows < 1) return {}
  return {
    width: `${grid.value.cols * cellWidth.value}px`,
    height: `${grid.value.rows * cellHeight.value}px`,
    gridTemplateColumns: `repeat(${grid.value.cols}, ${cellWidth.value}px)`,
    gridTemplateRows: `repeat(${grid.value.rows}, ${cellHeight.value}px)`,
    backgroundImage: `url("${url.value}")`,
    backgroundSize: `${picture.width * scale.value}px ${picture.height * scale.value}px`
  }
})

function choose(x: number, y: number): void {
  draft.value = { x, y }
}

function confirm(): void {
  if (!draft.value) return
  emit('confirm', draft.value.x, draft.value.y)
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape' && event.key !== 'Enter') return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.key === 'Escape') emit('cancel')
  else confirm()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="modal-backdrop" @pointerdown.self="emit('cancel')">
    <div class="modal tile-picker-dialog" role="dialog" aria-label="Choose tile">
      <h2>Choose tile</h2>
      <p v-if="!image?.file" class="tree-hint">This tileset has no image.</p>
      <template v-else-if="cells.length > 0">
        <div class="tile-picker-scroll">
          <div class="tile-picker-sheet" :style="sheetStyle">
            <button
              v-for="cell in cells"
              :key="`${cell.x},${cell.y}`"
              type="button"
              class="tile-picker-cell"
              :class="{ selected: draft?.x === cell.x && draft?.y === cell.y }"
              @click="choose(cell.x, cell.y)"
            ></button>
            <div v-for="span in mergeBoxes" :key="span.key" class="tile-picker-merge" :style="span.style"></div>
          </div>
        </div>
        <p class="tree-hint">{{ draft ? `Column ${draft.x}, row ${draft.y}. The chosen cell sits on the component, and a merged picture hangs off it.` : 'Click a cell.' }}</p>
      </template>
      <p v-else class="tree-hint">This image has no full cell at the tileset's cell size.</p>
      <footer>
        <button class="btn quiet" type="button" @click="emit('cancel')">Cancel</button>
        <button class="btn primary" type="button" :disabled="!draft" @click="confirm">Use this tile</button>
      </footer>
    </div>
  </div>
</template>
