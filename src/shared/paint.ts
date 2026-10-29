import { devicePixelScale, nineSliceLayout, snapNineSlice, type SceneControl, type SceneNode } from './scene'
import type { DisplayBlock, DisplayRun } from './books'
import type { PageMarks } from './types'
import { setSceneInputStyles, type InputSceneSheet } from './inputStyle'
import { installSceneStyles } from './sceneCss'
import type { TileStamp } from './tiles'

export type ControlValue = string | number | boolean | string[]

export type SceneHooks = {
  interactive?: boolean
  onPressStart?: (id: string) => void
  onActivate?: (id: string) => void
  onValue?: (id: string, value: ControlValue, inputKey?: string) => void
}

type ControlHost = HTMLElement & { peachValue?: (value: ControlValue) => void }

type PageFieldFocus = {
  nodeId: string
  key: string
  start: number | null
  end: number | null
}

export function watchDevicePixels(onChange: () => void): () => void {
  let query = matchResolution()
  const handle = (): void => {
    onChange()
    query.removeEventListener('change', handle)
    query = matchResolution()
    query.addEventListener('change', handle)
  }
  query.addEventListener('change', handle)
  return () => query.removeEventListener('change', handle)
}

function matchResolution(): MediaQueryList {
  return window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
}

export function syncScene(
  container: HTMLElement,
  nodes: SceneNode[],
  resolveUrl: (relativePath: string) => string,
  hooks?: SceneHooks
): void {
  installSceneStyles()
  const interactive = hooks?.interactive === true
  container.classList.toggle('is-interactive', interactive)
  const focus = pageFieldFocus(container)
  const seen = new Set<string>()
  nodes.forEach((node, index) => {
    seen.add(node.id)
    let el = container.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`)
    if (!el) {
      el = document.createElement('div')
      el.dataset.nodeId = node.id
      const body = document.createElement('div')
      body.className = 'body'
      const face = document.createElement('div')
      face.className = 'face'
      const picture = document.createElement('img')
      picture.className = 'picture'
      picture.alt = ''
      picture.draggable = false
      const missing = document.createElement('div')
      missing.className = 'missing'
      const label = document.createElement('div')
      label.className = 'label'
      body.append(face, picture, missing, label)
      el.append(body)
    }
    placeNode(container, el, index)
    el.style.zIndex = String(index + 1)
    paintNode(el, node, resolveUrl, interactive, hooks?.onValue, focus)
    el.style.display = node.visible ? '' : 'none'
    const hittable = node.visible && interactive && node.enabled && (node.kind === 'button' || node.kind === 'image')
    if (hittable) {
      el.onpointerdown = (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        hooks?.onPressStart?.(node.id)
      }
      el.onpointerup = (event) => {
        if (event.button !== 0) return
        hooks?.onActivate?.(node.id)
      }
    } else {
      el.onpointerdown = null
      el.onpointerup = null
    }
  })
  for (const child of Array.from(container.querySelectorAll<HTMLElement>(':scope > [data-node-id]'))) {
    if (!seen.has(child.dataset.nodeId ?? '')) child.remove()
  }
  setSceneInputStyles(container, inputSheet(nodes))
}

function placeNode(container: HTMLElement, el: HTMLElement, index: number): void {
  if (container.children[index] === el) return
  const next = container.children[index]
  if (next) container.insertBefore(el, next)
  else container.append(el)
}

function applyRenderColor(el: HTMLElement, color: string): void {
  if (color === '#ffffff') {
    el.style.filter = ''
    return
  }
  el.style.filter = `url(#${tintFilterId(color)})`
}

function tintFilterId(color: string): string {
  const id = `peach-tint-${color.slice(1)}`
  if (document.getElementById(id)) return id
  let svg = document.querySelector<SVGSVGElement>('svg[data-peach-tint]')
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.dataset.peachTint = 'true'
    svg.setAttribute('aria-hidden', 'true')
    svg.style.position = 'absolute'
    svg.style.width = '0'
    svg.style.height = '0'
    document.documentElement.append(svg)
  }
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
  filter.id = id
  filter.setAttribute('color-interpolation-filters', 'sRGB')
  filter.setAttribute('x', '0')
  filter.setAttribute('y', '0')
  filter.setAttribute('width', '100%')
  filter.setAttribute('height', '100%')
  const flood = document.createElementNS('http://www.w3.org/2000/svg', 'feFlood')
  flood.setAttribute('flood-color', color)
  flood.setAttribute('result', 'flood')
  const blend = document.createElementNS('http://www.w3.org/2000/svg', 'feBlend')
  blend.setAttribute('in', 'SourceGraphic')
  blend.setAttribute('in2', 'flood')
  blend.setAttribute('mode', 'multiply')
  blend.setAttribute('result', 'mult')
  const composite = document.createElementNS('http://www.w3.org/2000/svg', 'feComposite')
  composite.setAttribute('in', 'mult')
  composite.setAttribute('in2', 'SourceGraphic')
  composite.setAttribute('operator', 'in')
  filter.append(flood, blend, composite)
  svg.append(filter)
  return id
}

function pageFieldFocus(container: HTMLElement): PageFieldFocus | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !container.contains(active)) return null
  const key = active.dataset.pageInput ?? ''
  const nodeId = active.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId ?? ''
  if (!key || !nodeId) return null
  if (active instanceof HTMLInputElement) return { nodeId, key, start: active.selectionStart, end: active.selectionEnd }
  return { nodeId, key, start: null, end: null }
}

function paintNode(
  el: HTMLElement,
  node: SceneNode,
  resolveUrl: (relativePath: string) => string,
  interactive: boolean,
  onValue: ((id: string, value: ControlValue, inputKey?: string) => void) | undefined,
  focus: PageFieldFocus | null
): void {
  const body = nodeBody(el)
  const face = body.querySelector('.face') as HTMLElement
  const picture = body.querySelector('.picture') as HTMLImageElement
  const missing = body.querySelector('.missing') as HTMLElement
  const label = body.querySelector('.label') as HTMLElement
  el.className = `scene-node kind-${node.kind}${node.crisp ? ' is-crisp' : ''}${node.crop ? ' has-crop' : ''}${node.flipX ? ' is-flip-x' : ''}${node.flipY ? ' is-flip-y' : ''}${node.colliderShape === 'circle' ? ' is-circle' : ''}`
  el.style.left = `${node.x}%`
  el.style.top = `${node.y}%`
  el.style.width = `${node.width}%`
  el.style.height = `${node.height}%`
  el.style.clipPath = node.clip ?? ''
  const usesControl = node.visible && interactive && node.enabled && node.control !== null
  const usesPage = node.page !== null
  el.style.pointerEvents = node.visible && ((interactive && node.enabled && (node.kind === 'button' || node.kind === 'image')) || usesControl || (interactive && node.enabled && usesPage)) ? 'auto' : 'none'
  applyRenderColor(el, node.color)

  missing.style.display = node.missing ? 'flex' : 'none'
  missing.textContent = node.missing ?? ''

  if (node.text?.value && !usesControl) {
    label.style.display = 'flex'
    label.textContent = node.text.value
    label.style.fontFamily = node.text.fontFamily
    label.style.color = node.text.color
    label.style.fontSize = `${node.text.fontSize}cqh`
    label.style.flexDirection = 'column'
    label.style.alignItems = 'stretch'
    label.style.justifyContent = node.text.alignY === 'top' ? 'flex-start' : node.text.alignY === 'bottom' ? 'flex-end' : 'center'
    label.style.textAlign = node.text.alignX === 'left' ? 'left' : node.text.alignX === 'right' ? 'right' : 'center'
  } else {
    label.style.display = 'none'
    label.textContent = ''
  }
  paintFill(body, node)
  paintControl(body, node, usesControl ? onValue : undefined)
  paintPage(body, node, resolveUrl, interactive ? onValue : undefined, focus)

  clearFace(face)
  const url = node.imagePath ? resolveUrl(node.imagePath) : ''
  const tiled = url && !node.sheet && !node.slices && node.imageFit === 'tile' && el.clientWidth > 0 && el.clientHeight > 0
  if (node.sheet && node.sheet.length > 0 && (url || node.sheet[0]?.imagePath)) {
    picture.style.display = 'none'
    face.querySelector('canvas.tile')?.remove()
    face.querySelector('canvas.nine')?.remove()
    paintTileSheet(face, node.sheet, url, resolveUrl)
  } else if (url && node.slices && el.clientWidth > 0 && el.clientHeight > 0) {
    picture.style.display = 'none'
    paintNineSlice(face, el, node, url)
  } else if (tiled) {
    picture.style.display = 'none'
    paintTiledImage(face, el, url)
  } else if (url && !node.slices) {
    picture.style.display = 'block'
    face.querySelector('canvas')?.remove()
    if (picture.dataset.src !== url) {
      picture.dataset.src = url
      picture.src = url
    }
    if (node.crop && node.crop.width > 0 && node.crop.height > 0) {
      picture.style.inset = 'auto'
      picture.style.left = `${-(node.crop.x / node.crop.width) * 100}%`
      picture.style.top = `${-(node.crop.y / node.crop.height) * 100}%`
      picture.style.width = `${(node.crop.imageWidth / node.crop.width) * 100}%`
      picture.style.height = `${(node.crop.imageHeight / node.crop.height) * 100}%`
    } else {
      picture.style.inset = '0'
      picture.style.left = ''
      picture.style.top = ''
      picture.style.width = '100%'
      picture.style.height = '100%'
    }
  } else {
    picture.style.display = 'none'
    face.querySelector('canvas')?.remove()
  }
}

const sliceImages = new Map<string, HTMLImageElement>()

function ensureCanvas(face: HTMLElement, className: 'tile' | 'nine' | 'sheet'): HTMLCanvasElement {
  const existing = face.querySelector(`canvas.${className}`)
  if (existing instanceof HTMLCanvasElement) return existing
  const canvas = document.createElement('canvas')
  canvas.className = className
  face.append(canvas)
  return canvas
}

function sheetSignature(stamps: readonly TileStamp[], fallbackUrl: string): string {
  let hash = hashText(2166136261, fallbackUrl)
  const pathHash = new Map<string, number>()
  for (const stamp of stamps) {
    const path = stamp.imagePath ?? ''
    let mix = pathHash.get(path)
    if (mix === undefined) {
      mix = hashText(2166136261, path)
      pathHash.set(path, mix)
    }
    hash = Math.imul(hash ^ mix, 16777619)
    hash = Math.imul(hash ^ Math.round(stamp.x), 16777619)
    hash = Math.imul(hash ^ Math.round(stamp.y), 16777619)
    hash = Math.imul(hash ^ Math.round(stamp.width), 16777619)
    hash = Math.imul(hash ^ Math.round(stamp.height), 16777619)
    hash = Math.imul(hash ^ Math.round(stamp.crop.x), 16777619)
    hash = Math.imul(hash ^ Math.round(stamp.crop.y), 16777619)
    hash = Math.imul(hash ^ Math.round(stamp.crop.width), 16777619)
    hash = Math.imul(hash ^ Math.round(stamp.crop.height), 16777619)
  }
  return `${stamps.length}:${hash >>> 0}`
}

function hashText(hash: number, text: string): number {
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  return hash
}

function sheetImage(url: string): HTMLImageElement {
  const existing = sliceImages.get(url)
  if (existing) return existing
  const image = new Image()
  image.src = url
  sliceImages.set(url, image)
  return image
}

function paintTileSheet(face: HTMLElement, stamps: readonly TileStamp[], fallbackUrl: string, resolveUrl: (path: string) => string): void {
  const canvas = ensureCanvas(face, 'sheet')
  const signature = sheetSignature(stamps, fallbackUrl)
  if (canvas.dataset.sig === signature) return
  if (canvas.dataset.pending === signature) return
  canvas.dataset.pending = signature
  const painted = stamps.map((stamp) => ({ ...stamp, url: stamp.imagePath ? resolveUrl(stamp.imagePath) : fallbackUrl }))
  const urls = [...new Set(painted.map((stamp) => stamp.url).filter((url) => url.length > 0))]
  const draw = (): void => {
    if (!canvas.isConnected || canvas.dataset.pending !== signature) return
    if (urls.some((url) => !imageReady(url))) return
    drawTileSheet(canvas, painted)
    canvas.dataset.sig = signature
  }
  for (const url of urls) {
    const image = sheetImage(url)
    if (!image.complete || image.naturalWidth <= 0) image.addEventListener('load', draw, { once: true })
  }
  draw()
}

function imageReady(url: string): boolean {
  const image = sliceImages.get(url)
  return image !== undefined && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
}

function drawTileSheet(canvas: HTMLCanvasElement, stamps: readonly (TileStamp & { url: string })[]): void {
  let width = 1
  let height = 1
  for (const stamp of stamps) {
    width = Math.max(width, Math.round(stamp.x + stamp.width))
    height = Math.max(height, Math.round(stamp.y + stamp.height))
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, width, height)
  for (const stamp of stamps) {
    const image = sliceImages.get(stamp.url)
    const dw = Math.round(stamp.width)
    const dh = Math.round(stamp.height)
    if (!image || dw <= 0 || dh <= 0 || stamp.crop.width <= 0 || stamp.crop.height <= 0) continue
    ctx.drawImage(
      image,
      stamp.crop.x,
      stamp.crop.y,
      stamp.crop.width,
      stamp.crop.height,
      Math.round(stamp.x),
      Math.round(stamp.y),
      dw,
      dh
    )
  }
}

function paintTiledImage(face: HTMLElement, el: HTMLElement, url: string): void {
  face.querySelector('canvas.nine')?.remove()
  const canvas = ensureCanvas(face, 'tile')
  canvas.dataset.url = url
  const draw = (): void => {
    if (!canvas.isConnected || canvas.dataset.url !== url) return
    const image = sliceImages.get(url)
    if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return
    drawTiledImage(canvas, image, el)
  }
  const image = sliceImages.get(url) ?? new Image()
  if (!sliceImages.has(url)) {
    image.src = url
    sliceImages.set(url, image)
  }
  if (image.complete && image.naturalWidth > 0) draw()
  else image.addEventListener('load', draw, { once: true })
}

function drawTiledImage(canvas: HTMLCanvasElement, image: HTMLImageElement, el: HTMLElement): void {
  const boxWidth = el.clientWidth
  const boxHeight = el.clientHeight
  const dpr = window.devicePixelRatio || 1
  const pixel = devicePixelScale(dpr)
  const width = Math.max(1, Math.round(boxWidth * dpr))
  const height = Math.max(1, Math.round(boxHeight * dpr))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, boxWidth, boxHeight)
  ctx.imageSmoothingEnabled = false
  const pattern = ctx.createPattern(image, 'repeat')
  if (!pattern) return
  pattern.setTransform(new DOMMatrix().scale(pixel, pixel))
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, boxWidth, boxHeight)
}

function paintNineSlice(face: HTMLElement, el: HTMLElement, node: SceneNode, url: string): void {
  const slices = node.slices
  if (!slices) return
  face.querySelector('canvas.tile')?.remove()
  const canvas = ensureCanvas(face, 'nine')
  canvas.dataset.url = url
  const draw = (): void => {
    if (!canvas.isConnected || canvas.dataset.url !== url) return
    const image = sliceImages.get(url)
    if (!image || image.naturalWidth <= 0) return
    drawNineSlice(canvas, image, el, node)
  }
  const image = sliceImages.get(url) ?? new Image()
  if (!sliceImages.has(url)) {
    image.src = url
    sliceImages.set(url, image)
  }
  if (image.complete && image.naturalWidth > 0) draw()
  else image.addEventListener('load', draw, { once: true })
}

function drawNineSlice(canvas: HTMLCanvasElement, image: HTMLImageElement, el: HTMLElement, node: SceneNode): void {
  const slices = node.slices
  if (!slices) return
  const boxWidth = el.clientWidth
  const boxHeight = el.clientHeight
  const dpr = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(boxWidth * dpr))
  const height = Math.max(1, Math.round(boxHeight * dpr))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = false
  const patches = snapNineSlice(
    nineSliceLayout({
      slices,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      boxWidth: width,
      boxHeight: height,
      scaleX: 1,
      scaleY: 1,
      edgeFill: node.edgeFill,
      centerFill: node.centerFill
    }),
    width,
    height
  )
  for (const patch of patches) {
    const stepX = patch.tileWidth > 0 ? patch.tileWidth : patch.dw
    const stepY = patch.tileHeight > 0 ? patch.tileHeight : patch.dh
    if (stepX <= 0 || stepY <= 0) continue
    let drawn = 0
    for (let y = 0; y < patch.dh && drawn < 4000; y += stepY) {
      for (let x = 0; x < patch.dw && drawn < 4000; x += stepX) {
        const tileW = Math.min(stepX, patch.dw - x)
        const tileH = Math.min(stepY, patch.dh - y)
        const sourceW = patch.sw * (tileW / stepX)
        const sourceH = patch.sh * (tileH / stepY)
        if (sourceW <= 0 || sourceH <= 0) continue
        ctx.drawImage(image, patch.sx, patch.sy, sourceW, sourceH, patch.dx + x, patch.dy + y, tileW, tileH)
        drawn += 1
      }
    }
  }
}

function nodeBody(el: HTMLElement): HTMLElement {
  const found = el.querySelector<HTMLElement>(':scope > .body')
  if (found) return found
  const body = document.createElement('div')
  body.className = 'body'
  while (el.firstChild) body.append(el.firstChild)
  el.append(body)
  return body
}

function paintFill(el: HTMLElement, node: SceneNode): void {
  let meter = el.querySelector<HTMLElement>(':scope > .meter')
  if (node.fill === null) {
    meter?.remove()
    return
  }
  if (!meter) {
    meter = document.createElement('div')
    meter.className = 'meter'
    const fill = document.createElement('div')
    fill.className = 'meter-fill'
    meter.append(fill)
    el.append(meter)
  }
  const fill = meter.querySelector<HTMLElement>('.meter-fill')
  if (!fill) return
  fill.style.width = `${Math.round(node.fill * 1000) / 10}%`
  fill.style.background = node.fillColor ?? '#e8946a'
}

function paintControl(el: HTMLElement, node: SceneNode, onValue?: (id: string, value: ControlValue, inputKey?: string) => void): void {
  let host = el.querySelector<ControlHost>(':scope > .control')
  if (!node.control || !onValue) {
    host?.remove()
    return
  }
  const stamp = controlStamp(node.control)
  if (!host || host.dataset.stamp !== stamp) {
    host?.remove()
    host = document.createElement('div') as ControlHost
    host.className = 'control'
    host.dataset.stamp = stamp
    mountControl(host, node.control)
    el.append(host)
  }
  if (node.text) {
    host.style.fontFamily = node.text.fontFamily
    host.style.color = node.text.color
    host.style.fontSize = `${node.text.fontSize}cqh`
  }
  host.peachValue = (value) => onValue(node.id, value)
  syncControl(host, node.control)
}

function controlStamp(control: SceneControl): string {
  if (control.kind === 'toggleGroup') return `toggleGroup:${control.mode}:${control.options.map((option) => `${option.id}=${option.label}`).join('|')}`
  if (control.kind === 'dropdown') return `dropdown:${control.options.map((option) => `${option.id}=${option.label}`).join('|')}`
  return control.kind
}

function mountControl(host: ControlHost, control: SceneControl): void {
  if (control.kind === 'text' || control.kind === 'textarea') {
    const input = document.createElement(control.kind === 'textarea' ? 'textarea' : 'input')
    input.className = control.kind === 'textarea' ? 'area' : 'field'
    if (input instanceof HTMLInputElement) input.type = 'text'
    input.addEventListener('input', () => host.peachValue?.(input.value))
    host.append(input)
    return
  }
  if (control.kind === 'toggle') {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'choice'
    button.addEventListener('click', () => host.peachValue?.(button.dataset.on !== 'true'))
    host.append(button)
    return
  }
  if (control.kind === 'toggleGroup') {
    const list = document.createElement('div')
    list.className = 'options'
    for (const option of control.options) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'choice'
      button.dataset.optionId = option.id
      button.addEventListener('click', () => chooseOption(host, control.mode, option.id))
      list.append(button)
    }
    host.append(list)
    return
  }
  if (control.kind === 'slider') {
    const input = document.createElement('input')
    input.type = 'range'
    input.className = 'range'
    input.addEventListener('input', () => host.peachValue?.(Number(input.value)))
    host.append(input)
    return
  }
  const select = document.createElement('select')
  select.className = 'menu'
  for (const option of control.options) {
    const item = document.createElement('option')
    item.value = option.id
    item.textContent = option.label
    select.append(item)
  }
  select.addEventListener('change', () => host.peachValue?.(select.value))
  host.append(select)
}

function chooseOption(host: ControlHost, mode: 'one' | 'any', id: string): void {
  const current = (host.dataset.selected ?? '').split('\n').filter(Boolean)
  if (mode === 'one') {
    host.peachValue?.(current.length === 1 && current[0] === id ? '' : id)
    return
  }
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  host.peachValue?.(next)
}

function syncControl(host: ControlHost, control: SceneControl): void {
  if (control.kind === 'text' || control.kind === 'textarea') {
    const input = host.querySelector('input, textarea')
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return
    input.placeholder = control.placeholder
    if (document.activeElement === input) return
    if (input.value !== control.value) input.value = control.value
    return
  }
  if (control.kind === 'toggle') {
    const button = host.querySelector('button')
    if (!(button instanceof HTMLButtonElement)) return
    button.dataset.on = control.value ? 'true' : 'false'
    button.textContent = `${control.value ? '☑' : '☐'} ${control.label}`.trim()
    return
  }
  if (control.kind === 'toggleGroup') {
    host.dataset.selected = control.value.join('\n')
    for (const button of host.querySelectorAll('button')) {
      const on = control.value.includes(button.dataset.optionId ?? '')
      button.dataset.on = on ? 'true' : 'false'
      const label = control.options.find((option) => option.id === button.dataset.optionId)?.label ?? ''
      button.textContent = `${on ? '☑' : '☐'} ${label}`.trim()
    }
    return
  }
  if (control.kind === 'slider') {
    const input = host.querySelector('input')
    if (!(input instanceof HTMLInputElement)) return
    input.min = String(Math.min(control.min, control.max))
    input.max = String(Math.max(control.min, control.max))
    input.step = String(control.step > 0 ? control.step : 1)
    if (document.activeElement === input) return
    input.value = String(control.value)
    return
  }
  const select = host.querySelector('select')
  if (!(select instanceof HTMLSelectElement) || document.activeElement === select) return
  select.value = control.value
}

function clearFace(face: HTMLElement): void {
  face.style.borderStyle = ''
  face.style.borderWidth = ''
  face.style.borderColor = ''
  face.style.borderImageSource = ''
  face.style.borderImageSlice = ''
  face.style.borderImageRepeat = ''
}

function paintPage(
  el: HTMLElement,
  node: SceneNode,
  resolveUrl: (relativePath: string) => string,
  onValue: ((id: string, value: ControlValue, inputKey?: string) => void) | undefined,
  focus: PageFieldFocus | null
): void {
  let view = el.querySelector<HTMLElement>(':scope > .page-view')
  if (!node.page) {
    view?.remove()
    return
  }
  if (!view) {
    view = document.createElement('div')
    view.className = 'page-view'
    el.append(view)
  }
  const base = `${node.text?.fontSize ?? 4}cqh`
  view.style.fontFamily = node.text?.fontFamily ?? 'Georgia, serif'
  view.style.color = node.text?.color ?? '#f4efe8'
  view.style.fontSize = base
  view.style.overflow = node.scrollable ? 'auto' : 'hidden'
  view.dataset.inputScope = node.id
  if (!node.scrollable) view.scrollTop = 0
  const stamp = JSON.stringify(node.page)
  if (view.dataset.stamp === stamp) {
    lockPageInputs(view, node.enabled)
    restorePageField(view, node.id, focus)
    return
  }
  const active = document.activeElement
  const live = active instanceof HTMLElement && view.contains(active) ? active : null
  const saved = focus?.nodeId === node.id ? focus : null
  const key = live?.dataset.pageInput || saved?.key || ''
  const start = live instanceof HTMLInputElement ? live.selectionStart : (saved?.start ?? null)
  const end = live instanceof HTMLInputElement ? live.selectionEnd : (saved?.end ?? null)
  const follow = view.scrollHeight - view.clientHeight - view.scrollTop <= 2
  view.dataset.stamp = stamp
  view.replaceChildren()
  if (node.page.missing && node.page.blocks.length === 0) {
    const note = document.createElement('div')
    note.className = 'page-missing'
    note.textContent = node.page.missing
    view.append(note)
    return
  }
  for (const block of node.page.blocks) appendPageBlock(view, block, base, resolveUrl, node.id, node.enabled, onValue)
  placePageField(view, key, start, end)
  if (follow && node.scrollable) view.scrollTop = view.scrollHeight
}

function restorePageField(view: HTMLElement, nodeId: string, focus: PageFieldFocus | null): void {
  const saved = focus?.nodeId === nodeId ? focus : null
  if (!saved) return
  const active = document.activeElement
  if (active instanceof HTMLElement && view.contains(active) && active.dataset.pageInput === saved.key) return
  placePageField(view, saved.key, saved.start, saved.end)
}

function placePageField(view: HTMLElement, key: string, start: number | null, end: number | null): void {
  if (!key) return
  const next = view.querySelector<HTMLElement>(`[data-page-input="${CSS.escape(key)}"]`)
  if (!next || document.activeElement === next) {
    if (next instanceof HTMLInputElement && start !== null && end !== null) next.setSelectionRange(start, end)
    return
  }
  next.focus()
  if (next instanceof HTMLInputElement && start !== null && end !== null) next.setSelectionRange(start, end)
}

function lockPageInputs(view: HTMLElement, enabled: boolean): void {
  for (const field of view.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) field.disabled = !enabled
}

function inputSheet(nodes: SceneNode[]): InputSceneSheet {
  const viewers: InputSceneSheet['viewers'] = []
  const inserts: InputSceneSheet['inserts'] = []
  for (const node of nodes) {
    if (node.inputStyle) viewers.push({ id: node.id, style: node.inputStyle })
    if (!node.page) continue
    for (const block of node.page.blocks) {
      const paragraphs = block.type === 'conditional' ? block.blocks : [block]
      for (const paragraph of paragraphs) {
        for (const run of paragraph.runs) {
          if (run.type !== 'input' || !run.style) continue
          inserts.push({ id: run.styleId, kind: run.kind === 'dropdown' ? 'dropdown' : 'text', source: run.style })
        }
      }
    }
  }
  return { viewers, inserts }
}

function appendPageBlock(
  parent: HTMLElement,
  block: DisplayBlock,
  base: string,
  resolveUrl: (relativePath: string) => string,
  componentId: string,
  enabled: boolean,
  onValue?: (id: string, value: ControlValue, inputKey?: string) => void
): void {
  if (block.type === 'conditional') {
    const section = document.createElement('section')
    section.className = 'page-condition'
    for (const paragraph of block.blocks) appendPageBlock(section, paragraph, base, resolveUrl, componentId, enabled, onValue)
    parent.append(section)
    return
  }
  const paragraph = document.createElement('p')
  paragraph.style.textAlign = block.align === 'center' ? 'center' : block.align === 'end' ? 'right' : 'left'
  for (const run of block.runs) appendPageRun(paragraph, run, base, resolveUrl, componentId, enabled, onValue)
  parent.append(paragraph)
}

function appendPageRun(
  parent: HTMLElement,
  run: DisplayRun,
  base: string,
  resolveUrl: (relativePath: string) => string,
  componentId: string,
  enabled: boolean,
  onValue?: (id: string, value: ControlValue, inputKey?: string) => void
): void {
  if (run.type === 'text') {
    const span = document.createElement('span')
    span.textContent = run.text
    span.style.cssText = markCss(run.marks, base)
    parent.append(span)
    return
  }
  if (run.type === 'image') {
    if (!run.imagePath) return
    const image = document.createElement('img')
    image.alt = ''
    image.src = resolveUrl(run.imagePath)
    image.style.height = `${run.height}em`
    image.style.width = 'auto'
    image.style.maxWidth = '100%'
    image.style.objectFit = 'contain'
    parent.append(image)
    return
  }
  if (run.type === 'note') {
    const chip = document.createElement('span')
    chip.className = 'page-note'
    chip.textContent = run.label
    parent.append(chip)
    return
  }
  if (run.kind === 'dropdown') {
    const select = document.createElement('select')
    select.className = 'page-drop'
    select.dataset.pageInput = run.key
    select.dataset.inputStyle = run.styleId
    select.disabled = !enabled
    for (const option of run.options) {
      const item = document.createElement('option')
      item.value = option
      item.textContent = option
      select.append(item)
    }
    select.value = run.value
    select.addEventListener('change', () => onValue?.(componentId, select.value, run.key))
    parent.append(select)
    return
  }
  const input = document.createElement('input')
  input.className = 'page-input'
  input.dataset.pageInput = run.key
  input.dataset.inputStyle = run.styleId
  input.disabled = !enabled
  input.placeholder = run.placeholder
  input.value = run.value
  input.addEventListener('input', () => onValue?.(componentId, input.value, run.key))
  parent.append(input)
}

function markCss(marks: PageMarks, base: string): string {
  const parts: string[] = []
  if (marks.bold) parts.push('font-weight:700')
  if (marks.italic) parts.push('font-style:italic')
  const decoration = [marks.underline ? 'underline' : '', marks.strike ? 'line-through' : ''].filter(Boolean).join(' ')
  if (decoration) parts.push(`text-decoration:${decoration}`)
  if (marks.color) parts.push(`color:${marks.color}`)
  if (marks.fontFamily) parts.push(`font-family:${marks.fontFamily}`)
  if (marks.fontSize) parts.push(`font-size:calc(${base} * ${marks.fontSize / 18})`)
  return parts.join(';')
}
