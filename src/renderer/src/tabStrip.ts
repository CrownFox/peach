export function tabWheelDelta(deltaX: number, deltaY: number, deltaMode = 0): number {
  const dominant = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
  if (deltaMode === 1) return dominant * 16
  if (deltaMode === 2) return dominant * 400
  return dominant
}

export function nextTabScroll(scrollLeft: number, viewWidth: number, itemLeft: number, itemWidth: number): number {
  if (!(viewWidth > 0)) return scrollLeft
  if (itemLeft < scrollLeft) return Math.max(0, itemLeft)
  const itemRight = itemLeft + itemWidth
  if (itemRight > scrollLeft + viewWidth) return Math.max(0, itemRight - viewWidth)
  return scrollLeft
}
