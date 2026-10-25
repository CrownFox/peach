import { computed, ref } from 'vue'
import { CANVAS_GRID, clientToWorld, isMiddleDoubleClick, layoutPoint, panBy, zoomAt, zoomFromWheel, type CanvasView } from '@shared/canvasView'

export function useCanvasView(initial?: Partial<CanvasView>) {
  const panX = ref(initial?.panX ?? 0)
  const panY = ref(initial?.panY ?? 0)
  const zoom = ref(initial?.zoom ?? 1)
  const panning = ref(false)
  const view = computed<CanvasView>(() => ({ panX: panX.value, panY: panY.value, zoom: zoom.value }))
  let lastMiddle: { time: number; x: number; y: number } | null = null
  let stopPan: (() => void) | null = null

  function setView(next: CanvasView): void {
    panX.value = next.panX
    panY.value = next.panY
    zoom.value = next.zoom
  }

  function pointIn(event: { clientX: number; clientY: number }, host: HTMLElement): { x: number; y: number } {
    const rect = host.getBoundingClientRect()
    return layoutPoint(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, host.clientWidth, host.clientHeight)
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault()
    const host = event.currentTarget as HTMLElement
    const local = pointIn(event, host)
    setView(zoomAt(view.value, local.x, local.y, zoomFromWheel(zoom.value, event.deltaY, event.deltaMode)))
  }

  function endPan(): void {
    stopPan?.()
  }

  function resetZoom(event: PointerEvent): void {
    endPan()
    event.stopPropagation()
    event.preventDefault()
    const host = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    if (!host) return
    const local = pointIn(event, host)
    setView(zoomAt(view.value, local.x, local.y, 1))
  }

  function onPointerDown(event: PointerEvent, panOnLeft?: (event: PointerEvent) => boolean): void {
    const middle = event.button === 1
    if (middle && isMiddleDoubleClick(lastMiddle, event.timeStamp, event.clientX, event.clientY)) {
      lastMiddle = null
      resetZoom(event)
      return
    }
    if (middle) lastMiddle = { time: event.timeStamp, x: event.clientX, y: event.clientY }
    const left = event.button === 0 && panOnLeft?.(event) === true
    if (!middle && !left) return
    event.stopPropagation()
    event.preventDefault()
    panning.value = true
    const host = event.currentTarget as HTMLElement
    const rect = host.getBoundingClientRect()
    const scaleX = rect.width > 0 ? host.clientWidth / rect.width : 1
    const scaleY = rect.height > 0 ? host.clientHeight / rect.height : 1
    const origin = { x: event.clientX, y: event.clientY, panX: panX.value, panY: panY.value, zoom: zoom.value }
    const move = (ev: PointerEvent): void => {
      setView(panBy(origin, (ev.clientX - origin.x) * scaleX, (ev.clientY - origin.y) * scaleY))
    }
    const up = (): void => endPan()
    stopPan = () => {
      panning.value = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      stopPan = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function worldFrom(event: { clientX: number; clientY: number }, host: HTMLElement): { x: number; y: number } {
    const local = pointIn(event, host)
    return clientToWorld(view.value, local.x, local.y)
  }

  const worldStyle = computed(() => ({
    transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
    transformOrigin: '0 0'
  }))

  const gridStyle = computed(() => ({
    backgroundPosition: `${panX.value}px ${panY.value}px`,
    backgroundSize: `${CANVAS_GRID * zoom.value}px ${CANVAS_GRID * zoom.value}px`
  }))

  function bindWheel(el: HTMLElement, handler: (event: WheelEvent) => void = onWheel): () => void {
    const listen = (event: WheelEvent): void => handler(event)
    el.addEventListener('wheel', listen, { passive: false })
    return () => el.removeEventListener('wheel', listen)
  }

  return { panX, panY, zoom, panning, view, setView, onWheel, onPointerDown, worldFrom, worldStyle, gridStyle, bindWheel }
}
