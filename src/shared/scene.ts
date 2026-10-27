import { findPage, previewDisplay, type PageDisplay } from './books'
import { compositeById, fittedContent, instanceId, normalizeBox, shiftOrigin, type Box } from './composites'
import { componentColor, multiplyColor } from './color'
import { DEFAULT_FONT_FAMILY } from './fonts'
import { dropdownSelection, groupSelection, rangeNumbers, type ComponentOverride, type SceneOverrides } from './overrides'
import { findAssetByLocation } from './refs'
import { boxIntersects, clipInset, sceneById, sceneNodeId, viewerCamera, viewerScene } from './sceneCamera'
import { imageForTileset, mapSize, pruneCells, tileDraws, tilemapCellSize, tilemapDraws, tileSheet, tilesetFor, type TileStamp } from './tiles'
import type { Asset, ButtonAsset, ButtonSlices, CanvasAsset, ImageAsset, MenuComponent, PanelAsset, SliceFill } from './types'

export type SceneText = {
  value: string
  fontFamily: string
  fontSize: number
  color: string
  align: 'center' | 'start'
}

export type SceneChoice = { id: string; label: string }

export type SceneControl =
  | { kind: 'text'; value: string; placeholder: string }
  | { kind: 'textarea'; value: string; placeholder: string }
  | { kind: 'toggle'; value: boolean; label: string }
  | { kind: 'toggleGroup'; mode: 'one' | 'any'; value: string[]; options: SceneChoice[] }
  | { kind: 'slider'; value: number; min: number; max: number; step: number }
  | { kind: 'dropdown'; value: string; options: SceneChoice[] }

export type SceneNode = {
  id: string
  kind: 'image' | 'button' | 'panel' | 'label' | 'meter' | 'text' | 'textarea' | 'toggle' | 'toggleGroup' | 'slider' | 'dropdown' | 'pageViewer' | 'tile' | 'collider'
  name: string
  x: number
  y: number
  width: number
  height: number
  imagePath: string | null
  imageFit: 'stretch' | 'tile'
  slices: ButtonSlices | null
  edgeFill: SliceFill
  centerFill: SliceFill
  missing: string | null
  text: SceneText | null
  enabled: boolean
  visible: boolean
  fill: number | null
  fillColor: string | null
  control: SceneControl | null
  page: PageDisplay | null
  scrollable: boolean
  color: string
  clip: string | null
  crisp: boolean
  crop: { x: number; y: number; width: number; height: number; imageWidth: number; imageHeight: number } | null
  sheet: TileStamp[] | null
  flipX: boolean
  flipY: boolean
  colliderShape: 'square' | 'circle' | null
}

export function clampSlices(slices: ButtonSlices, width: number, height: number): ButtonSlices {
  const left = clamp(slices.left, 0, Math.max(0, width - 1))
  const right = clamp(slices.right, 0, Math.max(0, width - left - 1))
  const top = clamp(slices.top, 0, Math.max(0, height - 1))
  const bottom = clamp(slices.bottom, 0, Math.max(0, height - top - 1))
  return { left, right, top, bottom }
}

export function fittedBorderWidths(slices: ButtonSlices, boxWidth: number, boxHeight: number): ButtonSlices {
  const horizontal = slices.left + slices.right
  const vertical = slices.top + slices.bottom
  const scaleX = horizontal > boxWidth && horizontal > 0 ? boxWidth / horizontal : 1
  const scaleY = vertical > boxHeight && vertical > 0 ? boxHeight / vertical : 1
  const scale = Math.min(1, scaleX, scaleY)
  return {
    left: slices.left * scale,
    right: slices.right * scale,
    top: slices.top * scale,
    bottom: slices.bottom * scale
  }
}

export type NineSlicePatch = {
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
  tileWidth: number
  tileHeight: number
}

export function devicePixelScale(devicePixelRatio: number): number {
  return devicePixelRatio > 0 ? 1 / devicePixelRatio : 1
}

export function nineSliceLayout(input: {
  slices: ButtonSlices
  imageWidth: number
  imageHeight: number
  boxWidth: number
  boxHeight: number
  scaleX: number
  scaleY: number
  edgeFill: SliceFill
  centerFill: SliceFill
}): NineSlicePatch[] {
  const imageWidth = input.imageWidth
  const imageHeight = input.imageHeight
  if (imageWidth <= 0 || imageHeight <= 0 || input.boxWidth <= 0 || input.boxHeight <= 0) return []
  const slices = clampSlices(input.slices, imageWidth, imageHeight)
  const scaleX = input.scaleX > 0 ? input.scaleX : 1
  const scaleY = input.scaleY > 0 ? input.scaleY : 1
  const scaled = {
    left: slices.left * scaleX,
    right: slices.right * scaleX,
    top: slices.top * scaleY,
    bottom: slices.bottom * scaleY
  }
  const border = fittedBorderWidths(scaled, input.boxWidth, input.boxHeight)
  const fit = scaled.top > 0 ? border.top / scaled.top : scaled.left > 0 ? border.left / scaled.left : 1
  const centerWidth = Math.max(0, imageWidth - slices.left - slices.right)
  const centerHeight = Math.max(0, imageHeight - slices.top - slices.bottom)
  const columns = [border.left, Math.max(0, input.boxWidth - border.left - border.right), border.right]
  const rows = [border.top, Math.max(0, input.boxHeight - border.top - border.bottom), border.bottom]
  const sources = [
    { x: 0, w: slices.left },
    { x: slices.left, w: centerWidth },
    { x: imageWidth - slices.right, w: slices.right }
  ]
  const sourceRows = [
    { y: 0, h: slices.top },
    { y: slices.top, h: centerHeight },
    { y: imageHeight - slices.bottom, h: slices.bottom }
  ]
  const edgeTile = input.edgeFill === 'tile'
  const centerTile = input.centerFill === 'tile'
  const patches: NineSlicePatch[] = []
  let dy = 0
  sourceRows.forEach((row, rowIndex) => {
    let dx = 0
    sources.forEach((column, columnIndex) => {
      const dw = columns[columnIndex] ?? 0
      const dh = rows[rowIndex] ?? 0
      const middleColumn = columnIndex === 1
      const middleRow = rowIndex === 1
      const corner = !middleColumn && !middleRow
      let tileWidth = 0
      let tileHeight = 0
      if (!corner && edgeTile && middleColumn && !middleRow) tileWidth = column.w * scaleX * fit
      if (!corner && edgeTile && middleRow && !middleColumn) tileHeight = row.h * scaleY * fit
      if (middleColumn && middleRow && centerTile) {
        tileWidth = column.w * scaleX * fit
        tileHeight = row.h * scaleY * fit
      }
      if (column.w > 0 && row.h > 0 && dw > 0 && dh > 0) {
        patches.push({ sx: column.x, sy: row.y, sw: column.w, sh: row.h, dx, dy, dw, dh, tileWidth, tileHeight })
      }
      dx += dw
    })
    dy += rows[rowIndex] ?? 0
  })
  return patches
}

export function snapNineSlice(patches: NineSlicePatch[], width: number, height: number): NineSlicePatch[] {
  if (patches.length === 0 || width <= 0 || height <= 0) return []
  const xs = snapEdges(patches.flatMap((patch) => [patch.dx, patch.dx + patch.dw]), Math.round(width))
  const ys = snapEdges(patches.flatMap((patch) => [patch.dy, patch.dy + patch.dh]), Math.round(height))
  return patches.flatMap((patch) => {
    const x0 = edgeAt(xs, patch.dx)
    const x1 = edgeAt(xs, patch.dx + patch.dw)
    const y0 = edgeAt(ys, patch.dy)
    const y1 = edgeAt(ys, patch.dy + patch.dh)
    const dw = x1 - x0
    const dh = y1 - y0
    if (dw <= 0 || dh <= 0) return []
    const scaleX = patch.dw > 0 ? dw / patch.dw : 1
    const scaleY = patch.dh > 0 ? dh / patch.dh : 1
    return [
      {
        ...patch,
        dx: x0,
        dy: y0,
        dw,
        dh,
        tileWidth: patch.tileWidth > 0 ? Math.max(1, Math.round(patch.tileWidth * scaleX)) : 0,
        tileHeight: patch.tileHeight > 0 ? Math.max(1, Math.round(patch.tileHeight * scaleY)) : 0
      }
    ]
  })
}

function snapEdges(values: number[], limit: number): Array<{ from: number; to: number }> {
  const unique = [...new Set(values)].sort((left, right) => left - right)
  const snapped = unique.map((value, index) => {
    if (index === 0) return 0
    if (index === unique.length - 1) return limit
    return Math.round(value)
  })
  for (let index = 1; index < snapped.length - 1; index += 1) {
    const room = limit - (snapped.length - 1 - index)
    snapped[index] = Math.min(room, Math.max(snapped[index - 1] ?? 0, snapped[index] ?? 0))
  }
  if (snapped.length > 0) {
    snapped[0] = 0
    snapped[snapped.length - 1] = limit
  }
  return unique.map((from, index) => ({ from, to: snapped[index] ?? 0 }))
}

function edgeAt(edges: Array<{ from: number; to: number }>, value: number): number {
  const found = edges.find((edge) => Math.abs(edge.from - value) < 0.0001)
  return found ? found.to : Math.round(value)
}

export function buildScene(
  canvas: CanvasAsset,
  assets: Iterable<Asset>,
  options?: {
    pressedId?: string | null
    previewState?: 'default' | 'pressed' | 'disabled'
    overrides?: SceneOverrides
    pages?: Record<string, PageDisplay>
    displayScale?: number
    showColliders?: boolean
  }
): SceneNode[] {
  const byId = new Map<string, Asset>()
  for (const asset of assets) byId.set(asset.id, asset)
  const nodes: SceneNode[] = []
  const root = { x: 0, y: 0, width: canvas.width, height: canvas.height }
  expand(canvas.components, canvas.width, canvas.height, root, '', [], true, true, '#ffffff', canvas.width, canvas.height, byId, options, nodes, null, null, canvas.type === 'scene', false, false)
  return nodes
}

function expand(
  components: MenuComponent[],
  canvasWidth: number,
  canvasHeight: number,
  content: Box,
  parent: string,
  stack: string[],
  ancestorEnabled: boolean,
  ancestorVisible: boolean,
  parentColor: string,
  rootWidth: number,
  rootHeight: number,
  assets: Map<string, Asset>,
  options: SceneOptions | undefined,
  nodes: SceneNode[],
  clipView: Box | null,
  camera: { viewX: number; viewY: number; menuPerScene: number; view: Box } | null,
  blockViewers: boolean,
  flipX: boolean,
  flipY: boolean
): void {
  const scaleX = canvasWidth > 0 ? content.width / canvasWidth : 0
  const scaleY = canvasHeight > 0 ? content.height / canvasHeight : 0
  for (const component of components) {
    const id = instanceId(parent, component.id)
    const placed = options?.overrides?.[id]
    const x = typeof placed?.x === 'number' ? placed.x : component.x
    const y = typeof placed?.y === 'number' ? placed.y : component.y
    const signed = camera
      ? {
          x: camera.view.x + (x - camera.viewX) * camera.menuPerScene,
          y: camera.view.y + (y - camera.viewY) * camera.menuPerScene,
          width: component.width * camera.menuPerScene,
          height: component.height * camera.menuPerScene
        }
      : {
          x: content.x + x * scaleX,
          y: content.y + y * scaleY,
          width: component.width * scaleX,
          height: component.height * scaleY
        }
    const frame = camera ? camera.view : content
    const ownFlipX = component.width < 0
    const ownFlipY = component.height < 0
    const drawFlipX = flipX !== ownFlipX
    const drawFlipY = flipY !== ownFlipY
    const shown = ancestorVisible && (options?.overrides?.[id]?.visible ?? component.visible)
    const placedBox = (box: Box): Box => reflectBox(box, frame, flipX, flipY)
    if (component.type === 'sceneViewer') {
      const slot = placedBox(normalizeBox(signed))
      const own = componentColor(placed?.tint ?? component.tint)
      const color = multiplyColor(parentColor, own)
      if (camera || blockViewers) {
        const nested = missingComposite(slot, id, component.name, rootWidth, rootHeight, color, 'Scene viewer')
        nested.visible = shown
        placeNode(nodes, nested, slot, clipView, drawFlipX, drawFlipY)
        continue
      }
      const scene = viewerScene(component, placed, assets.values())
      if (!scene || !sceneById(assets.values(), scene.id)) {
        const missing = missingComposite(slot, id, component.name, rootWidth, rootHeight, color, component.sceneId || (placed && 'sceneRef' in placed) ? 'Missing scene' : 'No scene')
        missing.visible = shown
        placeNode(nodes, missing, slot, clipView, drawFlipX, drawFlipY)
        continue
      }
      const view = viewerCamera(component, placed, options?.displayScale ?? 1)
      const prefix = `scene:${scene.id}/`
      expand(
        scene.components,
        scene.width,
        scene.height,
        slot,
        `scene:${scene.id}`,
        [scene.id],
        ancestorEnabled,
        shown,
        color,
        rootWidth,
        rootHeight,
        assets,
        {
          ...options,
          presentId: (shared) => (shared.startsWith(prefix) ? sceneNodeId(id, shared.slice(prefix.length)) : shared)
        },
        nodes,
        slot,
        { viewX: view.viewX, viewY: view.viewY, menuPerScene: view.menuPerScene, view: slot },
        true,
        drawFlipX,
        drawFlipY
      )
      continue
    }
    if (component.type === 'composite') {
      const composite = compositeById(assets.values(), component.compositeId)
      const enabled = ancestorEnabled && (options?.overrides?.[id]?.enabled ?? component.enabled)
      const own = componentColor(options?.overrides?.[id]?.tint ?? component.tint)
      const placedSlot = placedBox(composite ? shiftOrigin(signed, composite.originX, composite.originY, composite.width, composite.height) : normalizeBox(signed))
      if (!composite || stack.includes(composite.id)) {
        const missing = missingComposite(placedSlot, id, component.name, rootWidth, rootHeight, multiplyColor(parentColor, own), composite ? 'Composite cycle' : 'Missing composite')
        missing.visible = shown
        missing.id = options?.presentId?.(id) ?? id
        placeNode(nodes, missing, placedSlot, clipView, drawFlipX, drawFlipY)
        continue
      }
      expand(
        composite.components,
        composite.width,
        composite.height,
        fittedContent(placedSlot, composite.width, composite.height),
        id,
        [...stack, composite.id],
        enabled,
        shown,
        multiplyColor(parentColor, own),
        rootWidth,
        rootHeight,
        assets,
        options,
        nodes,
        clipView,
        null,
        blockViewers,
        drawFlipX,
        drawFlipY
      )
      continue
    }
    const slot = placedBox(normalizeBox(signed))
    if (component.type === 'collider') {
      if (options?.showColliders) {
        const nodeFrame = { id, name: component.name, ...percentBox(slot, rootWidth, rootHeight) }
        const node = emptyNode(nodeFrame, 'collider')
        node.colliderShape = component.shape
        node.id = options.presentId?.(id) ?? node.id
        node.color = multiplyColor(parentColor, componentColor(options.overrides?.[id]?.tint ?? component.tint))
        node.visible = shown
        node.enabled = false
        placeNode(nodes, node, slot, clipView, drawFlipX, drawFlipY)
      }
      continue
    }
    if (component.type === 'tile' || component.type === 'tilemap') {
      emitTiles(component, id, slot, placed, shown, parentColor, rootWidth, rootHeight, assets, options, nodes, clipView, drawFlipX, drawFlipY)
      continue
    }
    const nodeFrame = { id, name: component.name, ...percentBox(slot, rootWidth, rootHeight) }
    const node = componentNode(component, assets, nodeFrame, options)
    node.id = options?.presentId?.(id) ?? node.id
    node.color = multiplyColor(parentColor, componentColor(options?.overrides?.[id]?.tint ?? component.tint))
    node.visible = shown
    if (!ancestorEnabled) node.enabled = false
    placeNode(nodes, node, slot, clipView, drawFlipX, drawFlipY)
  }
}

function reflectBox(box: Box, frame: Box, flipX: boolean, flipY: boolean): Box {
  if (!flipX && !flipY) return box
  return {
    x: flipX ? frame.x + frame.width - (box.x - frame.x) - box.width : box.x,
    y: flipY ? frame.y + frame.height - (box.y - frame.y) - box.height : box.y,
    width: box.width,
    height: box.height
  }
}

function placeNode(nodes: SceneNode[], node: SceneNode, slot: Box, clipView: Box | null, flipX: boolean, flipY: boolean): void {
  node.flipX = flipX
  node.flipY = flipY
  if (!clipView) {
    nodes.push(node)
    return
  }
  if (!boxIntersects(slot, clipView)) return
  node.clip = clipInset(slot, clipView)
  node.crisp = true
  nodes.push(node)
}

function percentBox(box: Box, rootWidth: number, rootHeight: number): { x: number; y: number; width: number; height: number } {
  const width = rootWidth > 0 ? rootWidth : 1
  const height = rootHeight > 0 ? rootHeight : 1
  return {
    x: (box.x / width) * 100,
    y: (box.y / height) * 100,
    width: (box.width / width) * 100,
    height: (box.height / height) * 100
  }
}

function missingComposite(slot: Box, id: string, name: string, rootWidth: number, rootHeight: number, color: string, message: string): SceneNode {
  const node = emptyNode({ id, name, ...percentBox(slot, rootWidth, rootHeight) }, 'label')
  node.missing = message
  node.enabled = false
  node.color = color
  return node
}

type SceneOptions = {
  pressedId?: string | null
  previewState?: 'default' | 'pressed' | 'disabled'
  overrides?: SceneOverrides
  pages?: Record<string, PageDisplay>
  displayScale?: number
  presentId?: (id: string) => string
  showColliders?: boolean
}

function componentNode(
  component: MenuComponent,
  assets: Map<string, Asset>,
  frame: { id: string; name: string; x: number; y: number; width: number; height: number },
  options: SceneOptions | undefined
): SceneNode {
  const override = options?.overrides?.[frame.id]
  if (component.type === 'composite') {
    const node = emptyNode(frame, 'label')
    node.missing = 'Composite'
    node.enabled = false
    return node
  }
  if (component.type === 'image') {
    const image = imageForComponent(component, override, assets)
    const node = emptyNode(frame, 'image')
    if (!image) return { ...node, missing: referenced(component.imageId, override?.imageRef) ? 'Missing image' : 'No image' }
    if (!image.file) return { ...node, missing: 'No image' }
    return { ...node, imagePath: image.file, imageFit: component.fit }
  }
  if (component.type === 'button') return buttonNode(frame, component, override, assets, options)
  if (component.type === 'sceneViewer') {
    const node = emptyNode(frame, 'label')
    node.missing = 'Scene viewer'
    node.enabled = false
    return node
  }
  if (component.type === 'tile' || component.type === 'tilemap') {
    const node = emptyNode(frame, 'label')
    node.missing = component.type === 'tile' ? 'Tile' : 'Tilemap'
    node.enabled = false
    return node
  }
  if (component.type === 'collider') {
    const node = emptyNode(frame, 'collider')
    node.colliderShape = component.shape
    node.enabled = false
    return node
  }

  const node = emptyNode(frame, component.type)
  applyPanel(node, component.panelId, override, assets, component.type === 'panel')
  if (component.type === 'panel') return node
  if (component.type === 'pageViewer') {
    node.text = styledText('', component, 'start')
    node.page = options?.pages?.[frame.id] ?? previewPage(component, assets)
    node.scrollable = override?.scrollable ?? component.scrollable
    return node
  }
  if (component.type === 'label') {
    node.text = styledText(override?.text ?? component.text, component, 'center')
    return node
  }
  if (component.type === 'meter') {
    const range = rangeNumbers(component, override)
    node.fill = fillRatio(range.value, range.min, range.max)
    node.fillColor = component.fillColor
    return node
  }
  if (component.type === 'text' || component.type === 'textarea') {
    const value = typeof override?.value === 'string' ? override.value : component.value
    node.text = styledText(value || component.placeholder, component, 'start')
    node.control = { kind: component.type, value, placeholder: component.placeholder }
    return node
  }
  if (component.type === 'toggle') {
    const value = typeof override?.value === 'boolean' ? override.value : component.value
    const label = override?.text ?? component.text
    node.text = styledText(`${value ? '☑' : '☐'} ${label}`.trim(), component, 'start')
    node.control = { kind: 'toggle', value, label }
    return node
  }
  if (component.type === 'toggleGroup') {
    const value = groupSelection(component, override)
    const labels = component.options.filter((option) => value.includes(option.id)).map((option) => option.label)
    node.text = styledText(labels.join('\n'), component, 'start')
    node.control = { kind: 'toggleGroup', mode: component.mode, value, options: component.options.map(choice) }
    return node
  }
  if (component.type === 'slider') {
    const range = rangeNumbers(component, override)
    node.fill = fillRatio(range.value, range.min, range.max)
    node.fillColor = component.fillColor
    node.text = { value: String(range.value), fontFamily: DEFAULT_FONT_FAMILY, fontSize: 32, color: '#ffffff', align: 'center' }
    node.control = { kind: 'slider', ...range }
    return node
  }
  const selected = dropdownSelection(component, override)
  const label = component.options.find((option) => option.id === selected)?.label ?? ''
  node.text = styledText(label, component, 'start')
  node.control = { kind: 'dropdown', value: selected, options: component.options.map(choice) }
  return node
}

function emptyNode(frame: { id: string; name: string; x: number; y: number; width: number; height: number }, kind: SceneNode['kind']): SceneNode {
  return {
    ...frame,
    kind,
    imagePath: null,
    imageFit: 'stretch',
    slices: null,
    edgeFill: 'stretch',
    centerFill: 'stretch',
    missing: null,
    text: null,
    enabled: true,
    visible: true,
    fill: null,
    fillColor: null,
    control: null,
    page: null,
    scrollable: true,
    color: '#ffffff',
    clip: null,
    crisp: false,
    crop: null,
    sheet: null,
    flipX: false,
    flipY: false,
    colliderShape: null
  }
}

function emitTiles(
  component: Extract<MenuComponent, { type: 'tile' | 'tilemap' }>,
  id: string,
  slot: Box,
  placed: ComponentOverride | undefined,
  shown: boolean,
  parentColor: string,
  rootWidth: number,
  rootHeight: number,
  assets: Map<string, Asset>,
  options: SceneOptions | undefined,
  nodes: SceneNode[],
  clipView: Box | null,
  flipX: boolean,
  flipY: boolean
): void {
  const color = multiplyColor(parentColor, componentColor(placed?.tint ?? component.tint))
  const present = options?.presentId?.(id) ?? id
  const tileset = tilesetFor(component.tilesetId, placed, assets.values())
  const image = tileset ? imageForTileset(tileset, assets.values()) : null
  const missing = (text: string): void => {
    const node = emptyNode({ id: present, name: component.name, ...percentBox(slot, rootWidth, rootHeight) }, 'label')
    node.missing = text
    node.visible = shown
    node.color = color
    node.enabled = false
    placeNode(nodes, node, slot, clipView, flipX, flipY)
  }
  const spanWidth = Math.abs(component.width)
  const spanHeight = Math.abs(component.height)
  const placeSheet = (local: { width: number; height: number; draws: ReturnType<typeof tileDraws> }, imagePath: string | null): void => {
    const scaleX = local.width > 0 ? slot.width / local.width : 0
    const scaleY = local.height > 0 ? slot.height / local.height : 0
    const sheet = tileSheet(local.draws)
    if (!sheet || sheet.width <= 0 || sheet.height <= 0) return
    const box = {
      x: slot.x + sheet.x * scaleX,
      y: slot.y + sheet.y * scaleY,
      width: sheet.width * scaleX,
      height: sheet.height * scaleY
    }
    const node = emptyNode({ id: `${present}@sheet`, name: component.name, ...percentBox(box, rootWidth, rootHeight) }, 'tile')
    node.imagePath = imagePath
    node.sheet = sheet.stamps
    node.crisp = true
    node.color = color
    node.visible = shown
    node.enabled = false
    placeNode(nodes, node, box, clipView, flipX, flipY)
  }
  if (component.type === 'tilemap') {
    const grid = tilemapCellSize(component, assets)
    const size = mapSize(spanWidth, spanHeight, grid.tileWidth, grid.tileHeight)
    const mapCells = pruneCells(placed?.cells ?? component.cells, size.cols, size.rows)
    const draws = tilemapDraws(mapCells, grid.tileWidth, grid.tileHeight, assets)
    if (draws.length === 0) {
      if (mapCells.length > 0) missing('Missing tileset')
      return
    }
    placeSheet(
      { width: size.cols * grid.tileWidth, height: size.rows * grid.tileHeight, draws },
      draws[0]?.imagePath ?? null
    )
    return
  }
  if (!tileset) {
    missing(component.tilesetId || (placed && 'tilesetRef' in placed) ? 'Missing tileset' : 'No tileset')
    return
  }
  if (!image?.file) {
    missing('No image')
    return
  }
  const draws = tileDraws(tileset, image, placed?.tileX ?? component.tileX, placed?.tileY ?? component.tileY, { x: 0, y: 0, width: spanWidth, height: spanHeight })
  if (draws.length === 0) {
    missing('Outside tileset')
    return
  }
  placeSheet({ width: spanWidth, height: spanHeight, draws }, image.file)
}

function buttonNode(
  frame: { id: string; name: string; x: number; y: number; width: number; height: number },
  component: Extract<MenuComponent, { type: 'button' }>,
  override: ComponentOverride | undefined,
  assets: Map<string, Asset>,
  options: SceneOptions | undefined
): SceneNode {
  const textValue = override?.text ?? component.text
  const node = emptyNode(frame, 'button')
  node.text = styledText(textValue, component, 'center')
  node.enabled = override?.enabled ?? component.enabled
  const button = resolveButton(component, override, assets)
  if (!button) {
    node.missing = referenced(component.buttonId, override?.buttonRef) ? 'Missing button' : 'No button'
    return node
  }
  const displayId = options?.presentId?.(frame.id) ?? frame.id
  const image = chooseButtonImage(button, assets, displayId, node.enabled, override, options)
  if (!image?.file) {
    node.missing = 'No image'
    return node
  }
  node.imagePath = image.file
  node.slices =
    button.mode === 'nine-panel'
      ? clampSlices(button.slices, image.width || Number.MAX_SAFE_INTEGER, image.height || Number.MAX_SAFE_INTEGER)
      : null
  if (node.slices) {
    node.edgeFill = button.edgeFill
    node.centerFill = button.centerFill
  }
  return node
}

function applyPanel(
  node: SceneNode,
  panelId: string | null,
  override: ComponentOverride | undefined,
  assets: Map<string, Asset>,
  required: boolean
): void {
  const panel = resolvePanel(panelId, override, assets)
  const wanted = referenced(panelId, override?.panelRef)
  if (!panel) {
    if (required || wanted) node.missing = wanted ? 'Missing panel' : 'No panel'
    return
  }
  const image = resolveImage(assets, panel.imageId)
  if (!image?.file) {
    node.missing = 'No image'
    return
  }
  node.imagePath = image.file
  node.missing = null
  node.slices = clampSlices(panel.slices, image.width || Number.MAX_SAFE_INTEGER, image.height || Number.MAX_SAFE_INTEGER)
  node.edgeFill = panel.edgeFill
  node.centerFill = panel.centerFill
}

function previewPage(component: Extract<MenuComponent, { type: 'pageViewer' }>, assets: Map<string, Asset>): PageDisplay {
  const book = component.bookId ? assets.get(component.bookId) : undefined
  if (!book || book.type !== 'book') return { blocks: [], missing: component.bookId ? 'Missing book' : 'Choose a book' }
  if (!component.pagePath) return { blocks: [], missing: 'Choose a page' }
  const found = findPage(book, component.pagePath)
  if (!found) return { blocks: [], missing: 'Missing page' }
  const images: ImageAsset[] = []
  for (const asset of assets.values()) if (asset.type === 'image') images.push(asset)
  return previewDisplay(found.page, images)
}

function styledText(
  value: string,
  style: { fontFamily: string; fontSize: number; color: string },
  align: 'center' | 'start'
): SceneText {
  return { value, fontFamily: style.fontFamily, fontSize: style.fontSize, color: style.color, align }
}

function choice(option: { id: string; label: string }): SceneChoice {
  return { id: option.id, label: option.label }
}

function fillRatio(value: number, min: number, max: number): number {
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  if (high === low) return value >= high ? 1 : 0
  return Math.min(1, Math.max(0, (value - low) / (high - low)))
}

function resolvePanel(panelId: string | null, override: ComponentOverride | undefined, assets: Map<string, Asset>): PanelAsset | null {
  if (override && override.panelRef !== undefined) {
    if (!override.panelRef) return null
    const asset = findAssetByLocation(assets.values(), override.panelRef, 'panel')
    return asset?.type === 'panel' ? asset : null
  }
  const asset = panelId ? assets.get(panelId) : undefined
  return asset?.type === 'panel' ? asset : null
}

function referenced(id: string | null, overrideRef: string | undefined): boolean {
  return overrideRef !== undefined ? overrideRef.length > 0 : id !== null
}

function chooseButtonImage(
  button: ButtonAsset,
  assets: Map<string, Asset>,
  componentId: string,
  enabled: boolean,
  override: ComponentOverride | undefined,
  options: SceneOptions | undefined
): ImageAsset | null {
  const state = preferredState(componentId, enabled, options)
  const preferredImage = stateImage(button, assets, override, state)
  if (preferredImage) return preferredImage
  if (override && state !== 'default' && override[imageField(state)] !== undefined) return null
  return stateImage(button, assets, override, 'default')
}

function preferredState(
  componentId: string,
  enabled: boolean,
  options: SceneOptions | undefined
): 'default' | 'pressed' | 'disabled' {
  if (options?.previewState === 'pressed') return 'pressed'
  if (options?.previewState === 'disabled') return 'disabled'
  if (!enabled && !options?.previewState) return 'disabled'
  if (options?.pressedId && options.pressedId === componentId) return 'pressed'
  return 'default'
}

function imageField(state: 'default' | 'pressed' | 'disabled'): 'defaultImage' | 'pressedImage' | 'disabledImage' {
  if (state === 'pressed') return 'pressedImage'
  if (state === 'disabled') return 'disabledImage'
  return 'defaultImage'
}

function stateImage(
  button: ButtonAsset,
  assets: Map<string, Asset>,
  override: ComponentOverride | undefined,
  state: 'default' | 'pressed' | 'disabled'
): ImageAsset | null {
  const field = imageField(state)
  if (override && override[field] !== undefined) return imageFromLocation(assets, override[field] ?? null)
  return imageWithFile(assets, button.states[state])
}

function imageForComponent(
  component: Extract<MenuComponent, { type: 'image' }>,
  override: ComponentOverride | undefined,
  assets: Map<string, Asset>
): ImageAsset | null {
  if (override && override.imageRef !== undefined) return imageFromLocation(assets, override.imageRef)
  return resolveImage(assets, component.imageId)
}

function resolveButton(
  component: Extract<MenuComponent, { type: 'button' }>,
  override: ComponentOverride | undefined,
  assets: Map<string, Asset>
): ButtonAsset | null {
  if (override && override.buttonRef !== undefined) {
    const asset = override.buttonRef ? findAssetByLocation(assets.values(), override.buttonRef, 'button') : null
    return asset?.type === 'button' ? asset : null
  }
  const asset = component.buttonId ? assets.get(component.buttonId) : undefined
  return asset?.type === 'button' ? asset : null
}

function imageFromLocation(assets: Map<string, Asset>, location: string | null): ImageAsset | null {
  if (!location) return null
  const asset = findAssetByLocation(assets.values(), location, 'image')
  return asset?.type === 'image' ? asset : null
}

function resolveImage(assets: Map<string, Asset>, id: string | null): ImageAsset | null {
  if (!id) return null
  const asset = assets.get(id)
  return asset && asset.type === 'image' ? asset : null
}

function imageWithFile(assets: Map<string, Asset>, id: string | null): ImageAsset | null {
  const image = resolveImage(assets, id)
  return image?.file ? image : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function fitFrame(
  containerWidth: number,
  containerHeight: number,
  frameWidth: number,
  frameHeight: number
): { width: number; height: number } {
  if (containerWidth <= 0 || containerHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) {
    return { width: 0, height: 0 }
  }
  const scale = Math.min(containerWidth / frameWidth, containerHeight / frameHeight)
  return {
    width: Math.floor(frameWidth * scale),
    height: Math.floor(frameHeight * scale)
  }
}
