export function componentColor(value: unknown, fallback = '#ffffff'): string {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(text)
  const hex = match?.[1]
  if (!hex) return fallback
  const full = hex.length === 3 ? hex.split('').map((channel) => channel + channel).join('') : hex
  return `#${full.toLowerCase()}`
}

export function multiplyColor(base: string, tint: string): string {
  const left = channels(base)
  const right = channels(tint)
  const mixed = left.map((channel, index) => Math.round((channel * (right[index] ?? 255)) / 255))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function channels(color: string): [number, number, number] {
  const hex = componentColor(color).slice(1)
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)]
}
