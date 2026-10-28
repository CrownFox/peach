<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { minimumCanvasSize, rectPercent } from '@shared/assets'
import { centerContent } from '@shared/canvasView'
import { storedFromVisual, visualRect } from '@shared/composites'
import { alignMove, alignResize } from '@shared/align'
import type { Rect } from '@shared/resize'
import { resizeRect, snapTilemapSize, snapToGrid } from '@shared/resize'
import { eraseCells, fillPicked, fillRegion, fitTileSpan, imageForTileset, lineCells, mapSize, mergeAt, paintAssigned, paintCells, placedTile, pruneCells, rectangleTiles, stampCells, tileGrid, tilemapCellSize, tileRoll, tilesetById } from '@shared/tiles'
import { buildScene } from '@shared/scene'
import { findComponent, frontOrder } from '@shared/zField'
import { DEFAULT_MENU_HEIGHT, DEFAULT_MENU_WIDTH, isCanvas, type MenuComponent } from '@shared/types'
import { fileUrl } from '@/thumbs'
import { useCanvasView } from '@/canvasView'
import { usePlayStore } from '@/stores/play'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import AssetSelect from './AssetSelect.vue'
import SceneView from './SceneView.vue'

const componentTypes: { type: MenuComponent['type']; label: string }[] = [
  { type: 'image', label: 'Image' },
  { type: 'button', label: 'Button' },
  { type: 'panel', label: 'Panel' },
  { type: 'label', label: 'Label' },
  { type: 'text', label: 'Text' },
  { type: 'textarea', label: 'Text area' },
  { type: 'toggle', label: 'Toggle' },
  { type: 'toggleGroup', label: 'Toggle group' },
  { type: 'slider', label: 'Slider' },
  { type: 'dropdown', label: 'Dropdown' },
  { type: 'meter', label: 'Meter' },
  { type: 'pageViewer', label: 'Page viewer' },
  { type: 'composite', label: 'Composite' },
  { type: 'sceneViewer', label: 'Scene viewer' },
  { type: 'tile', label: 'Tile' },
  { type: 'tilemap', label: 'Tilemap' },
  { type: 'collider', label: 'Collider' },
  { type: 'zField', label: 'Z field' }
]

const props = defineProps<{ menuId: string }>()
const project = useProjectStore()
const session = useSessionStore()
const play = usePlayStore()
const frameEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const { zoom, panning, setView, onPointerDown: onViewPointer, worldStyle, gridStyle, bindWheel } = useCanvasView()
const context = ref<{ x: number; y: number; componentId: string | null; roomOnRight: boolean; submenuTop: number } | null>(null)
const addOpen = ref(false)
const menu = computed(() => {
  const asset = project.asset(props.menuId)
  return asset && isCanvas(asset) ? asset : null
})
const scriptKey = computed(() => {
  if (menu.value?.type === 'composite') return `composite:${props.menuId}`
  if (menu.value?.type === 'scene') return `scene:${props.menuId}`
  return `menu:${props.menuId}`
})
const frame = ref({
  width: menu.value?.width ?? DEFAULT_MENU_WIDTH,
  height: menu.value?.height ?? DEFAULT_MENU_HEIGHT
})
const palette = computed(() => {
  let items = menu.value?.type === 'scene' ? componentTypes.filter((item) => item.type !== 'sceneViewer') : componentTypes
  if (editingField.value) items = items.filter((item) => item.type !== 'zField')
  return items
})
const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const tool = ref<'paint' | 'line' | 'bucket'>('paint')
const erasing = ref(false)
const randomPaint = ref(false)
const selection = ref<{ tileX: number; tileY: number }[]>([])
const anchor = ref<{ tileX: number; tileY: number } | null>(null)
const draft = ref<{ tileX: number; tileY: number }[] | null>(null)
const paintSalt = ref(1)
const paletteId = ref<string | null>(null)
const hoverCell = ref<{ x: number; y: number } | null>(null)
const stroke = ref<{ x: number; y: number }[] | null>(null)
const showBelow = ref(true)
const showAbove = ref(true)
const alignGuides = ref<{ x: number | null; y: number | null }>({ x: null, y: null })
const alignGuideStyle = computed(() => {
  const canvas = menu.value
  const guide = alignGuides.value
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return { x: '', y: '' }
  return {
    x: guide.x === null ? '' : `${(guide.x / canvas.width) * 100}%`,
    y: guide.y === null ? '' : `${(guide.y / canvas.height) * 100}%`
  }
})
const editing = computed(() => {
  const key = session.tilemapEdit
  if (!key || !menu.value || !key.startsWith(`${props.menuId}/`)) return null
  const component = menu.value.components.find((item) => item.id === key.slice(props.menuId.length + 1))
  return component?.type === 'tilemap' ? component : null
})
const editingField = computed(() => {
  const key = session.zFieldEdit
  if (!key || !menu.value || !key.startsWith(`${props.menuId}/`)) return null
  const component = menu.value.components.find((item) => item.id === key.slice(props.menuId.length + 1))
  return component?.type === 'zField' ? component : null
})
const paintTileset = computed(() => tilesetById(project.assets, paletteId.value))
const paintImage = computed(() => (paintTileset.value ? imageForTileset(paintTileset.value, project.assets) : null))
const paintUrl = computed(() => fileUrl(paintImage.value?.file ?? null))
const paintGrid = computed(() => tileGrid(paintTileset.value?.tileWidth ?? 0, paintTileset.value?.tileHeight ?? 0, paintImage.value?.width ?? 0, paintImage.value?.height ?? 0))
const swatches = computed(() => {
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < paintGrid.value.rows; y += 1) {
    for (let x = 0; x < paintGrid.value.cols; x += 1) cells.push({ x, y })
  }
  return cells
})
const metrics = computed(() => {
  const component = editing.value
  if (!component) return null
  const cell = tilemapCellSize(component, project.assets)
  if (cell.tileWidth < 1 || cell.tileHeight < 1) return null
  const box = hitRect(component)
  const size = mapSize(box.width, box.height, cell.tileWidth, cell.tileHeight)
  return { ...box, cols: size.cols, rows: size.rows, cellW: box.width / size.cols, cellH: box.height / size.rows }
})
const cellGridStyle = computed(() => {
  const grid = metrics.value
  if (!grid) return {}
  return {
    left: `${grid.x}px`,
    top: `${grid.y}px`,
    width: `${grid.width}px`,
    height: `${grid.height}px`,
    backgroundSize: `${grid.cellW}px ${grid.cellH}px`
  }
})
const ghosts = computed(() => {
  const grid = metrics.value
  const sheet = paintTileset.value
  const picture = paintImage.value
  const cells = stroke.value ?? (hoverCell.value ? [hoverCell.value] : [])
  const tiles = selection.value
  if (!grid || (!erasing.value && tiles.length === 0)) return []
  const marks = ghostMarks(cells, tiles)
  return marks.flatMap((mark) => {
    const key = `${mark.x},${mark.y}`
    if (mark.erase || !sheet || !picture?.file) {
      return [{
        key,
        erase: true,
        style: {
          left: `${grid.x + mark.x * grid.cellW}px`,
          top: `${grid.y + mark.y * grid.cellH}px`,
          width: `${grid.cellW}px`,
          height: `${grid.cellH}px`
        }
      }]
    }
    const draw = placedTile(sheet, picture, mark.tileX, mark.tileY, {
      x: grid.x + mark.x * grid.cellW,
      y: grid.y + mark.y * grid.cellH,
      width: grid.cellW,
      height: grid.cellH
    })
    if (!draw) return []
    return [{
      key,
      erase: false,
      style: {
        left: `${draw.x}px`,
        top: `${draw.y}px`,
        width: `${draw.width}px`,
        height: `${draw.height}px`,
        backgroundImage: paintUrl.value ? `url("${paintUrl.value}")` : 'none',
        backgroundSize: `${(picture.width / draw.crop.width) * draw.width}px ${(picture.height / draw.crop.height) * draw.height}px`,
        backgroundPosition: `${-(draw.crop.x / draw.crop.width) * draw.width}px ${-(draw.crop.y / draw.crop.height) * draw.height}px`
      }
    }]
  })
})
const nodes = computed(() => {
  if (!menu.value) return []
  const focus = editing.value ?? editingField.value
  if (!focus) return buildScene(menu.value, project.assets, { displayScale: zoom.value, showColliders: true })
  const index = menu.value.components.findIndex((component) => component.id === focus.id)
  const components = menu.value.components.filter((component, position) => {
    if (component.id === focus.id) return true
    if (position < index) return showBelow.value
    return showAbove.value
  })
  return buildScene({ ...menu.value, components }, project.assets, { displayScale: zoom.value, showColliders: true })
})
const selected = computed(() => (menu.value ? findComponent(menu.value.components, session.selectedComponentId ?? '') : null))
const marqueeStyle = computed(() => {
  if (!selected.value || !menu.value) return {}
  const placed = rectPercent(visualRect(selected.value, project.assets), menu.value.width, menu.value.height)
  return { left: `${placed.x}%`, top: `${placed.y}%`, width: `${placed.width}%`, height: `${placed.height}%` }
})
const designGridStyle = computed(() => {
  const size = menu.value?.snapToGrid ? menu.value.gridSize : 0
  if (!size) return {}
  return { backgroundSize: `${size}px ${size}px` }
})
const originStyle = computed(() => {
  if (menu.value?.type !== 'composite' || menu.value.width <= 0 || menu.value.height <= 0) return {}
  return { left: `${(menu.value.originX / menu.value.width) * 100}%`, top: `${(menu.value.originY / menu.value.height) * 100}%` }
})

function hitRect(component: MenuComponent): { x: number; y: number; width: number; height: number } {
  return visualRect(component, project.assets)
}

function alignTargets(id: string): Rect[] {
  const canvas = menu.value
  if (!canvas) return []
  const boxes: Rect[] = []
  for (const component of canvas.components) {
    if (component.type === 'zField') {
      if (!component.visible) continue
      for (const child of component.children) {
        if (child.id === id || child.type === 'zField' || !child.visible) continue
        boxes.push(visualRect(child, project.assets))
      }
      continue
    }
    if (component.id === id || !component.visible) continue
    boxes.push(visualRect(component, project.assets))
  }
  boxes.push({ x: 0, y: 0, width: canvas.width, height: canvas.height })
  return boxes
}

watch(
  () => editing.value?.id ?? null,
  () => {
    const map = editing.value
    selection.value = []
    anchor.value = null
    draft.value = null
    paletteId.value = map?.tilesetId ?? map?.cells.find((cell) => cell.tilesetId)?.tilesetId ?? null
  },
  { immediate: true }
)

watch(() => session.selectedComponentId, (id) => {
  const key = session.tilemapEdit
  if (key?.startsWith(`${props.menuId}/`) && id !== key.slice(props.menuId.length + 1)) session.tilemapEdit = null
})

watch(menu, () => {
  const key = session.tilemapEdit
  if (key?.startsWith(`${props.menuId}/`)) {
    const component = menu.value?.components.find((item) => item.id === key.slice(props.menuId.length + 1))
    if (component?.type !== 'tilemap') session.tilemapEdit = null
  }
  const fieldKey = session.zFieldEdit
  if (!fieldKey?.startsWith(`${props.menuId}/`)) return
  const field = menu.value?.components.find((item) => item.id === fieldKey.slice(props.menuId.length + 1))
  if (field?.type !== 'zField') session.zFieldEdit = null
})

function finishTiles(): void {
  session.tilemapEdit = null
  hoverCell.value = null
  stroke.value = null
}

function finishField(): void {
  session.zFieldEdit = null
}

function swatchStyle(x: number, y: number): Record<string, string> {
  const sheet = paintTileset.value
  const picture = paintImage.value
  if (!sheet || !picture) return {}
  const scale = sheet.tileWidth > 0 ? 32 / sheet.tileWidth : 1
  const span = mergeAt(sheet.merges, x, y)
  return {
    backgroundImage: paintUrl.value ? `url("${paintUrl.value}")` : 'none',
    backgroundSize: `${picture.width * scale}px ${picture.height * scale}px`,
    backgroundPosition: `${-x * sheet.tileWidth * scale}px ${-y * sheet.tileHeight * scale}px`,
    boxShadow: span.width > 1 || span.height > 1 ? 'inset 0 0 0 1px rgba(232, 148, 106, 0.85)' : 'none'
  }
}

function choosePalette(id: string | null): void {
  paletteId.value = id
  selection.value = []
  anchor.value = null
  draft.value = null
}

function tileChosen(x: number, y: number): boolean {
  return (draft.value ?? selection.value).some((tile) => tile.tileX === x && tile.tileY === y)
}

function toggleTile(x: number, y: number): void {
  const index = selection.value.findIndex((tile) => tile.tileX === x && tile.tileY === y)
  if (index >= 0) {
    selection.value = selection.value.filter((_, item) => item !== index)
    if (anchor.value?.tileX === x && anchor.value.tileY === y) anchor.value = selection.value[0] ?? null
    return
  }
  selection.value = [...selection.value, { tileX: x, tileY: y }]
  anchor.value = { tileX: x, tileY: y }
}

function swatchAt(event: PointerEvent): { tileX: number; tileY: number } | null {
  const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tile-x]')
  if (!hit) return null
  const tileX = Number(hit.dataset.tileX)
  const tileY = Number(hit.dataset.tileY)
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) return null
  return { tileX, tileY }
}

function onSwatchDown(event: PointerEvent, x: number, y: number): void {
  if (event.button !== 0 || !paletteId.value) return
  event.preventDefault()
  erasing.value = false
  if (event.shiftKey) {
    toggleTile(x, y)
    return
  }
  const start = { tileX: x, tileY: y }
  let end = start
  const cols = paintGrid.value.cols
  const rows = paintGrid.value.rows
  draft.value = rectangleTiles(start.tileX, start.tileY, end.tileX, end.tileY, cols, rows)
  const move = (ev: PointerEvent): void => {
    end = swatchAt(ev) ?? end
    draft.value = rectangleTiles(start.tileX, start.tileY, end.tileX, end.tileY, cols, rows)
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    selection.value = rectangleTiles(start.tileX, start.tileY, end.tileX, end.tileY, cols, rows)
    anchor.value = { tileX: start.tileX, tileY: start.tileY }
    draft.value = null
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function ghostMarks(
  cells: { x: number; y: number }[],
  tiles: { tileX: number; tileY: number }[]
): { x: number; y: number; tileX: number; tileY: number; erase: boolean }[] {
  if (erasing.value || tiles.length === 0) return cells.map((cell) => ({ ...cell, tileX: 0, tileY: 0, erase: true }))
  if (randomPaint.value) {
    return cells.map((cell) => {
      const tile = tiles[tileRoll(cell.x, cell.y, paintSalt.value, tiles.length)] ?? tiles[0]
      return { x: cell.x, y: cell.y, tileX: tile?.tileX ?? 0, tileY: tile?.tileY ?? 0, erase: !tile }
    })
  }
  if (tool.value === 'paint' && tiles.length > 1) {
    const originX = Math.min(...tiles.map((tile) => tile.tileX))
    const originY = Math.min(...tiles.map((tile) => tile.tileY))
    return cells.flatMap((cell) => tiles.map((tile) => ({
      x: cell.x + tile.tileX - originX,
      y: cell.y + tile.tileY - originY,
      tileX: tile.tileX,
      tileY: tile.tileY,
      erase: false
    })))
  }
  const tile = anchor.value ?? tiles[0]
  if (!tile) return []
  return cells.map((cell) => ({ x: cell.x, y: cell.y, tileX: tile.tileX, tileY: tile.tileY, erase: false }))
}

function pointerCell(event: PointerEvent): { x: number; y: number } | null {
  const grid = metrics.value
  if (!grid || !frameEl.value || !menu.value) return null
  const bounds = frameEl.value.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) return null
  const xPx = ((event.clientX - bounds.left) / bounds.width) * menu.value.width
  const yPx = ((event.clientY - bounds.top) / bounds.height) * menu.value.height
  const x = Math.floor((xPx - grid.x) / grid.cellW)
  const y = Math.floor((yPx - grid.y) / grid.cellH)
  if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return null
  return { x, y }
}

function writeCells(cells: ReturnType<typeof paintCells>): void {
  const map = editing.value
  if (!map) return
  project.patchComponent(props.menuId, map.id, (component) => {
    if (component.type === 'tilemap') component.cells = cells
  })
  play.clearOverride(props.menuId, map.id, 'cells')
}

function applyPoints(points: { x: number; y: number }[]): void {
  const map = editing.value
  const tilesetId = paletteId.value
  const tiles = selection.value
  if (!map || points.length === 0) return
  if (erasing.value) {
    writeCells(eraseCells(map.cells, points))
    return
  }
  if (!tilesetId || tiles.length === 0) return
  if (randomPaint.value) {
    writeCells(paintAssigned(map.cells, points.map((point) => {
      const tile = tiles[tileRoll(point.x, point.y, paintSalt.value, tiles.length)] ?? tiles[0]
      return { x: point.x, y: point.y, tileX: tile.tileX, tileY: tile.tileY }
    }), tilesetId))
    return
  }
  if (tool.value === 'paint' && tiles.length > 1) {
    const grid = metrics.value
    if (!grid) return
    writeCells(points.reduce((cells, point) => stampCells(cells, point, tiles, tilesetId, grid.cols, grid.rows), map.cells))
    return
  }
  const tile = anchor.value ?? tiles[0]
  if (!tile) return
  writeCells(paintCells(map.cells, points, tilesetId, tile.tileX, tile.tileY))
}

function beginStroke(cell: { x: number; y: number }): void {
  const grid = metrics.value
  const map = editing.value
  if (!grid || !map) return
  paintSalt.value += 1
  if (tool.value === 'bucket') {
    const tilesetId = paletteId.value
    const tiles = selection.value
    if (erasing.value) {
      writeCells(fillRegion(map.cells, grid.cols, grid.rows, cell.x, cell.y, null))
      return
    }
    if (!tilesetId || tiles.length === 0) return
    if (randomPaint.value) {
      writeCells(fillPicked(map.cells, grid.cols, grid.rows, cell.x, cell.y, (x, y) => {
        const tile = tiles[tileRoll(x, y, paintSalt.value, tiles.length)] ?? tiles[0]
        return { tilesetId, tileX: tile.tileX, tileY: tile.tileY }
      }))
      return
    }
    const tile = anchor.value ?? tiles[0]
    if (!tile) return
    writeCells(fillRegion(map.cells, grid.cols, grid.rows, cell.x, cell.y, { tilesetId, tileX: tile.tileX, tileY: tile.tileY }))
    return
  }
  if (tool.value === 'line') {
    stroke.value = [cell]
    const move = (ev: PointerEvent): void => {
      const next = pointerCell(ev)
      if (next) stroke.value = lineCells(cell.x, cell.y, next.x, next.y)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (session.tilemapEdit && stroke.value) applyPoints(stroke.value)
      stroke.value = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return
  }
  applyPoints([cell])
  const move = (ev: PointerEvent): void => {
    const next = pointerCell(ev)
    if (next) applyPoints([next])
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  if (!menu.value || !frameEl.value) return
  const bounds = frameEl.value.getBoundingClientRect()
  const menuW = menu.value.width
  const menuH = menu.value.height
  const handle = editing.value ? null : ((event.target as HTMLElement).dataset.handle ?? null)
  const xPx = ((event.clientX - bounds.left) / bounds.width) * menuW
  const yPx = ((event.clientY - bounds.top) / bounds.height) * menuH
  if (editing.value) {
    const grid = metrics.value
    if (grid && grid.cellW > 0 && grid.cellH > 0) {
      const x = Math.floor((xPx - grid.x) / grid.cellW)
      const y = Math.floor((yPx - grid.y) / grid.cellH)
      if (x >= 0 && y >= 0 && x < grid.cols && y < grid.rows) {
        beginStroke({ x, y })
        return
      }
    }
  }
  const component = handle ? selected.value : pickComponent(xPx, yPx, false)
  if (!component) {
    if (!editingField.value) session.selectedComponentId = null
    return
  }
  session.selectedComponentId = component.id
  const drag = {
    id: component.id,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    rect: hitRect(component),
    storedX: component.x,
    storedY: component.y,
    frameW: bounds.width,
    frameH: bounds.height,
    menuW,
    menuH
  }
  const keepAlt = (ev: KeyboardEvent): void => {
    if (ev.key === 'Alt') ev.preventDefault()
  }
  window.addEventListener('keydown', keepAlt)
  window.addEventListener('keyup', keepAlt)
  const move = (ev: PointerEvent): void => {
    const dx = ((ev.clientX - drag.startX) / drag.frameW) * drag.menuW
    const dy = ((ev.clientY - drag.startY) / drag.frameH) * drag.menuH
    const edge = drag.handle ?? ''
    const aspect = !!edge && (ev.ctrlKey || ev.metaKey)
    const fromCenter = !!edge && ev.altKey
    let next = resizeRect(drag.rect, dx, dy, edge, aspect, fromCenter)
    const cell = component.type === 'tilemap' ? tilemapCellSize(component, project.assets) : null
    const grid = menu.value?.snapToGrid ? menu.value.gridSize : 0
    const bounds = frameEl.value?.getBoundingClientRect()
    const thresholdX = bounds && bounds.width > 0 ? (8 * drag.menuW) / bounds.width : 0
    const thresholdY = bounds && bounds.height > 0 ? (8 * drag.menuH) / bounds.height : 0
    if (ev.shiftKey) {
      const aligned = edge
        ? alignResize(drag.rect, next, edge, alignTargets(drag.id), thresholdX, thresholdY, aspect, fromCenter)
        : alignMove(next, alignTargets(drag.id), thresholdX, thresholdY)
      next = aligned.box
      alignGuides.value = aligned.guide
    } else {
      alignGuides.value = { x: null, y: null }
      if (cell && edge) next = snapTilemapSize(drag.rect, next, edge, cell.tileWidth, cell.tileHeight, aspect, fromCenter)
      else if (grid > 0) next = snapToGrid(drag.rect, next, edge, grid, grid, aspect, fromCenter)
    }
    if (!edge) {
      project.patchComponent(props.menuId, drag.id, (item) => {
        item.x = drag.storedX + next.x - drag.rect.x
        item.y = drag.storedY + next.y - drag.rect.y
      })
      return
    }
    const lockCells = !!cell && (!ev.shiftKey || aspect)
    if (lockCells && ev.shiftKey && cell) next = snapTilemapSize(drag.rect, next, edge, cell.tileWidth, cell.tileHeight, aspect, fromCenter)
    const rect = lockCells && cell ? fitTileSpan(next, cell.tileWidth, cell.tileHeight) : next
    if (ev.shiftKey && lockCells) {
      const onX = alignGuides.value.x === null || [rect.x, rect.x + rect.width / 2, rect.x + rect.width].some((value) => Math.abs(value - (alignGuides.value.x ?? 0)) <= thresholdX)
      const onY = alignGuides.value.y === null || [rect.y, rect.y + rect.height / 2, rect.y + rect.height].some((value) => Math.abs(value - (alignGuides.value.y ?? 0)) <= thresholdY)
      alignGuides.value = { x: onX ? alignGuides.value.x : null, y: onY ? alignGuides.value.y : null }
    }
    const stored = storedFromVisual(component, rect, project.assets)
    project.patchComponent(props.menuId, drag.id, (item) => {
      item.x = stored.x
      item.y = stored.y
      item.width = stored.width
      item.height = stored.height
    })
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('keydown', keepAlt)
    window.removeEventListener('keyup', keepAlt)
    alignGuides.value = { x: null, y: null }
    if (component.type !== 'tilemap') return
    const cell = tilemapCellSize(component, project.assets)
    project.patchComponent(props.menuId, component.id, (item) => {
      if (item.type !== 'tilemap') return
      const size = mapSize(item.width, item.height, cell.tileWidth, cell.tileHeight)
      item.cells = pruneCells(item.cells, size.cols, size.rows)
    })
    play.clearOverride(props.menuId, component.id, 'cells')
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const canvasMin = computed(() => minimumCanvasSize(menu.value?.type === 'menu' ? 'menu' : menu.value?.type === 'scene' ? 'scene' : 'composite'))

function designSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(canvasMin.value.width, Math.round(width)),
    height: Math.max(canvasMin.value.height, Math.round(height))
  }
}

function commitFrame(): void {
  project.patchAsset(props.menuId, (asset) => {
    if (!isCanvas(asset)) return
    asset.width = frame.value.width
    asset.height = frame.value.height
  })
}

function setOrigin(key: 'originX' | 'originY', event: Event): void {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  const asset = menu.value
  if (asset?.type !== 'composite' || !Number.isFinite(value)) {
    if (asset?.type === 'composite') input.value = String(asset[key])
    return
  }
  project.patchAsset(props.menuId, (item) => {
    if (item.type === 'composite') item[key] = value
  })
}

function setGridSize(event: Event): void {
  const input = event.target as HTMLInputElement
  const value = Math.round(Number(input.value))
  if (!menu.value || !Number.isInteger(value) || value < 1) {
    if (menu.value) input.value = String(menu.value.gridSize)
    return
  }
  project.patchAsset(props.menuId, (asset) => {
    if (isCanvas(asset)) asset.gridSize = value
  })
}

function setSnap(event: Event): void {
  const snapToGrid = (event.target as HTMLInputElement).checked
  project.patchAsset(props.menuId, (asset) => {
    if (isCanvas(asset)) asset.snapToGrid = snapToGrid
  })
}

function setDesignSize(key: 'width' | 'height', event: Event): void {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (!Number.isFinite(value)) {
    input.value = String(frame.value[key])
    return
  }
  const grid = menu.value?.snapToGrid ? menu.value.gridSize : 0
  const snapped = grid > 0 ? Math.max(grid, Math.round(value / grid) * grid) : value
  frame.value = designSize(key === 'width' ? snapped : frame.value.width, key === 'height' ? snapped : frame.value.height)
  input.value = String(frame.value[key])
  commitFrame()
}

function resizeFrame(event: PointerEvent): void {
  if (event.button !== 0) return
  event.stopPropagation()
  const origin = { x: event.clientX, y: event.clientY, width: frame.value.width, height: frame.value.height }
  const scale = zoom.value || 1
  const keepAlt = (ev: KeyboardEvent): void => {
    if (ev.key === 'Alt') ev.preventDefault()
  }
  const move = (ev: PointerEvent): void => {
    const dx = (ev.clientX - origin.x) / scale
    const dy = (ev.clientY - origin.y) / scale
    const aspect = ev.ctrlKey || ev.metaKey
    let next = resizeRect({ x: 0, y: 0, width: origin.width, height: origin.height }, dx, dy, 'se', aspect, ev.altKey)
    const grid = menu.value?.snapToGrid ? menu.value.gridSize : 0
    if (grid > 0) next = snapToGrid({ x: 0, y: 0, width: origin.width, height: origin.height }, next, 'se', grid, grid, aspect, ev.altKey)
    frame.value = designSize(next.width, next.height)
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('keydown', keepAlt)
    window.removeEventListener('keyup', keepAlt)
    commitFrame()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('keydown', keepAlt)
  window.addEventListener('keyup', keepAlt)
}

function componentAt(event: MouseEvent): MenuComponent | null {
  if (!menu.value || !frameEl.value) return null
  const bounds = frameEl.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
    return null
  }
  const target = event.target as HTMLElement
  if (target.dataset.handle && selected.value) return selected.value
  const xPx = ((event.clientX - bounds.left) / bounds.width) * menu.value.width
  const yPx = ((event.clientY - bounds.top) / bounds.height) * menu.value.height
  return pickComponent(xPx, yPx, true)
}

function pickComponent(xPx: number, yPx: number, skipHidden: boolean): MenuComponent | null {
  if (!menu.value) return null
  const field = editingField.value
  const items = field ? frontOrder([field]) : frontOrder(menu.value.components)
  return (
    items.find((item) => {
      if (skipHidden && !item.visible) return false
      const box = hitRect(item)
      return xPx >= box.x && xPx <= box.x + box.width && yPx >= box.y && yPx <= box.y + box.height
    }) ?? null
  )
}

function onContextMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, select')) return
  event.preventDefault()
  const component = componentAt(event)
  const field = editingField.value
  const inField = !field || (component ? field.children.some((child) => child.id === component.id) : false)
  if (!field || (component && inField)) session.selectedComponentId = component?.id ?? (field ? session.selectedComponentId : null)
  addOpen.value = false
  const contextId = component && inField ? component.id : null
  context.value = {
    x: Math.min(event.clientX, window.innerWidth - 200),
    y: Math.min(event.clientY, window.innerHeight - (contextId ? 120 : 48)),
    componentId: contextId,
    roomOnRight: event.clientX + 380 < window.innerWidth,
    submenuTop: Math.min(0, window.innerHeight - event.clientY - 440)
  }
}

function closeContext(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest('.context-menu')) return
  context.value = null
  addOpen.value = false
}

function setPersistent(event: Event): void {
  const persistent = (event.target as HTMLInputElement).checked
  project.patchAsset(props.menuId, (asset) => {
    if (asset.type === 'scene') asset.persistent = persistent
  })
}

function setMenuScript(id: string | null): void {
  project.patchAsset(props.menuId, (asset) => {
    if (isCanvas(asset)) asset.scriptId = id
  })
}

function addFromMenu(type: MenuComponent['type']): void {
  context.value = null
  addOpen.value = false
  const field = editingField.value
  if (field) {
    if (type === 'zField') return
    project.addFieldComponent(props.menuId, field.id, type)
    return
  }
  project.addComponent(props.menuId, type)
}

function duplicateFromMenu(): void {
  const id = context.value?.componentId
  context.value = null
  if (id) project.duplicateComponent(props.menuId, id)
}

function deleteFromMenu(): void {
  const id = context.value?.componentId
  context.value = null
  if (id) project.removeComponent(props.menuId, id)
}

function onKey(event: KeyboardEvent): void {
  if (project.workspace.activeTab !== scriptKey.value) return
  if ((event.target as HTMLElement).matches('input, textarea, select')) return
  if (event.key === 'Escape' && (session.tilemapEdit?.startsWith(`${props.menuId}/`) || session.zFieldEdit?.startsWith(`${props.menuId}/`))) {
    finishTiles()
    finishField()
    return
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && session.selectedComponentId) {
    project.removeComponent(props.menuId, session.selectedComponentId)
  }
}

let stopWheel: (() => void) | null = null
let stageObserver: ResizeObserver | null = null
let placedView = false

function panStage(event: PointerEvent): boolean {
  const target = event.target instanceof Element ? event.target : null
  return !target?.closest('.menu-frame, .frame-grip')
}

function placeFrame(): void {
  const stage = stageEl.value
  if (placedView || !stage || stage.clientWidth === 0 || stage.clientHeight === 0) return
  setView(centerContent(stage.clientWidth, stage.clientHeight, frame.value.width, frame.value.height))
  placedView = true
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointerdown', closeContext)
  if (stageEl.value) {
    stopWheel = bindWheel(stageEl.value)
    stageObserver = new ResizeObserver(() => placeFrame())
    stageObserver.observe(stageEl.value)
  }
  placeFrame()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointerdown', closeContext)
  stageObserver?.disconnect()
  stopWheel?.()
})
</script>

<template>
  <div class="menu-workspace" @contextmenu="onContextMenu">
    <div class="menu-toolbar">
      <button v-if="menu?.type === 'menu'" class="btn" type="button" :disabled="project.meta?.entryMenuId === menuId" @click="project.setEntry(menuId)">
        {{ project.meta?.entryMenuId === menuId ? 'Entry point' : 'Set as entry point' }}
      </button>
      <label v-if="menu?.type === 'scene'" class="check" title="Keeps this scene's script values, and the changes scripts make to its components, when the menu changes. The next Scene Viewer shows that same state. Restarting the game starts it over.">
        <input type="checkbox" :checked="menu.persistent" @change="setPersistent" />
        <span>Persistent</span>
      </label>
      <AssetSelect v-if="menu" label="Script" type="script" clearable :model-value="menu.scriptId" @update:model-value="setMenuScript" />
      <button class="btn" type="button" @click="project.openScriptTab(scriptKey)">
        {{ menu?.type === 'scene' ? 'Edit scene script' : menu?.type === 'composite' ? 'Edit composite script' : 'Edit menu script' }}
      </button>
    </div>
    <div v-if="editing" class="tilemap-bar">
      <div class="tilemap-tools">
        <div class="tilemap-tool-row">
          <button class="btn" type="button" :class="{ selected: tool === 'paint' }" @click="tool = 'paint'">Paint</button>
          <button class="btn" type="button" :class="{ selected: tool === 'line' }" @click="tool = 'line'">Line</button>
          <button class="btn" type="button" :class="{ selected: tool === 'bucket' }" @click="tool = 'bucket'">Bucket</button>
          <button class="btn" type="button" :class="{ selected: erasing }" @click="erasing = !erasing">Eraser</button>
          <label class="check"><input v-model="randomPaint" type="checkbox" /><span>Random</span></label>
        </div>
        <label class="check"><input v-model="showBelow" type="checkbox" /><span>Show below</span></label>
        <label class="check"><input v-model="showAbove" type="checkbox" /><span>Show above</span></label>
        <button class="btn" type="button" @click="finishTiles">Done</button>
        <p class="tree-hint">Drag a rectangle of tiles, or Shift-click to select and clear tiles. Random paints one of those tiles on each cell. Line and Bucket do that too. With Random off, Paint places the selection as one group, and Line and Bucket paint the tile the selection started on.</p>
      </div>
      <div class="tilemap-palette">
        <AssetSelect label="Tileset" type="tileset" clearable :model-value="paletteId" @update:model-value="choosePalette" />
        <button class="btn" type="button" :disabled="!paletteId" @click="paletteId && project.openAsset(paletteId)">Open tileset</button>
      </div>
      <div v-if="paintImage?.file" class="tilemap-swatches" :style="{ gridTemplateColumns: `repeat(${Math.max(paintGrid.cols, 1)}, 32px)` }">
        <button
          v-for="cell in swatches"
          :key="`${cell.x},${cell.y}`"
          type="button"
          class="tilemap-swatch"
          :class="{ selected: !erasing && tileChosen(cell.x, cell.y) }"
          :data-tile-x="cell.x"
          :data-tile-y="cell.y"
          :style="swatchStyle(cell.x, cell.y)"
          @pointerdown="onSwatchDown($event, cell.x, cell.y)"
        ></button>
      </div>
      <p v-else class="tree-hint">Choose a tileset, then a tile. Each cell keeps the tileset it was painted from.</p>
    </div>
    <div v-else-if="editingField" class="tilemap-bar">
      <div class="tilemap-tools">
        <label class="check"><input v-model="showBelow" type="checkbox" /><span>Show below</span></label>
        <label class="check"><input v-model="showAbove" type="checkbox" /><span>Show above</span></label>
        <button class="btn" type="button" @click="finishField">Done</button>
        <p class="tree-hint">Right-click the canvas to add a component. Selection stays on the pieces in this field. Below and above hide the pieces drawn under or over the field.</p>
      </div>
    </div>
    <div
      ref="stageEl"
      class="menu-stage"
      :class="{ 'is-panning': panning }"
      :style="gridStyle"
      @pointerdown="onViewPointer($event, panStage)"
    >
      <div class="menu-world" :style="worldStyle">
        <div class="menu-frame-wrap" :style="{ width: `${frame.width}px`, height: `${frame.height}px` }">
          <div ref="frameEl" class="menu-frame" @pointerdown="onPointerDown" @pointermove="hoverCell = editing ? pointerCell($event) : null" @pointerleave="hoverCell = null">
            <SceneView :nodes="nodes" />
            <div v-if="menu?.snapToGrid" class="design-grid" :style="designGridStyle"></div>
            <div v-if="editing && metrics" class="tilemap-cells" :style="cellGridStyle"></div>
            <div v-if="menu?.type === 'composite'" class="origin-mark" :style="originStyle"></div>
            <div class="overlay" :class="{ 'is-painting': editing }">
              <div v-for="ghost in ghosts" :key="ghost.key" class="tile-ghost" :class="{ 'is-erase': ghost.erase }" :style="ghost.style"></div>
              <div v-if="alignGuideStyle.x" class="align-guide align-guide-x" :style="{ left: alignGuideStyle.x }"></div>
              <div v-if="alignGuideStyle.y" class="align-guide align-guide-y" :style="{ top: alignGuideStyle.y }"></div>
              <div v-if="selected && selected.type !== 'zField'" class="marquee" :style="marqueeStyle">
                <i v-for="handle in handles" v-show="!editing" :key="handle" class="handle" :class="`handle-${handle}`" :data-handle="handle"></i>
              </div>
            </div>
          </div>
          <button class="frame-grip" type="button" aria-label="Resize canvas preview" @pointerdown="resizeFrame"></button>
        </div>
      </div>
    </div>
    <div class="frame-size">
        <label>Width <input type="number" :min="canvasMin.width" :value="frame.width" @change="setDesignSize('width', $event)" /></label>
        <label>Height <input type="number" :min="canvasMin.height" :value="frame.height" @change="setDesignSize('height', $event)" /></label>
        <label>Grid <input type="number" min="1" step="1" :value="menu?.gridSize ?? 16" @change="setGridSize" /></label>
        <label class="check">
          <input type="checkbox" :checked="menu?.snapToGrid === true" @change="setSnap" />
          <span>Snap</span>
        </label>
        <template v-if="menu?.type === 'composite'">
          <label>Origin X <input type="number" :value="menu.originX" @change="setOrigin('originX', $event)" /></label>
          <label>Origin Y <input type="number" :value="menu.originY" @change="setOrigin('originY', $event)" /></label>
        </template>
    </div>
    <div v-if="context" class="context-menu" :style="{ left: `${context.x}px`, top: `${context.y}px` }" @contextmenu.stop.prevent>
      <div class="context-add">
        <button type="button" @click.stop="addOpen = !addOpen">Add</button>
        <div v-if="addOpen" class="context-menu context-submenu" :class="{ 'open-left': !context.roomOnRight }" :style="{ top: `${context.submenuTop}px` }">
          <button v-for="item in palette" :key="item.type" type="button" @click="addFromMenu(item.type)">{{ item.label }}</button>
        </div>
      </div>
      <template v-if="context.componentId">
        <div class="menu-sep"></div>
        <button type="button" @click="duplicateFromMenu">Duplicate</button>
        <button type="button" @click="deleteFromMenu">Delete</button>
      </template>
    </div>
  </div>
</template>
