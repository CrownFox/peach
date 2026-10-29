export type StyleCompletion = {
  label: string
  insertText: string
  detail: string
  kind: 'property' | 'value' | 'block'
  snippet: boolean
}

const COLORS = ['white', 'black', 'transparent', 'currentColor', 'inherit', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray', 'silver', 'navy', 'teal']
const SHARED = ['inherit', 'initial', 'unset']

const PROPERTIES: { name: string; detail: string; values: string[] }[] = [
  { name: 'accent-color', detail: 'Control accent', values: ['auto', ...COLORS] },
  { name: 'appearance', detail: 'Native control look', values: ['auto', 'none'] },
  { name: 'background', detail: 'Background', values: ['none', ...COLORS] },
  { name: 'background-color', detail: 'Background color', values: COLORS },
  { name: 'border', detail: 'Border', values: ['none', '0', '1px solid currentColor'] },
  { name: 'border-color', detail: 'Border color', values: COLORS },
  { name: 'border-radius', detail: 'Corner radius', values: ['0', '0.3em', '4px'] },
  { name: 'border-style', detail: 'Border style', values: ['none', 'solid', 'dashed', 'dotted', 'double'] },
  { name: 'border-width', detail: 'Border thickness', values: ['0', '1px', 'thin', 'medium'] },
  { name: 'box-shadow', detail: 'Shadow', values: ['none'] },
  { name: 'box-sizing', detail: 'How width is measured', values: ['border-box', 'content-box'] },
  { name: 'caret-color', detail: 'Text cursor color', values: ['auto', ...COLORS] },
  { name: 'color', detail: 'Text color', values: COLORS },
  { name: 'color-scheme', detail: 'dark flips the open dropdown list', values: ['normal', 'light', 'dark', 'light dark'] },
  { name: 'cursor', detail: 'Pointer', values: ['auto', 'text', 'pointer', 'default', 'not-allowed'] },
  { name: 'display', detail: 'Box', values: ['inline-block', 'inline', 'block', 'none'] },
  { name: 'font', detail: 'Font', values: ['inherit'] },
  { name: 'font-family', detail: 'Font family', values: ['inherit', 'Georgia, serif', 'Consolas, monospace'] },
  { name: 'font-size', detail: 'Font size', values: ['inherit', '1em', '0.9em'] },
  { name: 'font-style', detail: 'Font style', values: ['normal', 'italic'] },
  { name: 'font-weight', detail: 'Font weight', values: ['normal', 'bold', '400', '600', '700'] },
  { name: 'letter-spacing', detail: 'Letter spacing', values: ['normal', '0'] },
  { name: 'line-height', detail: 'Line height', values: ['normal', 'inherit', '1.2'] },
  { name: 'margin', detail: 'Outer space', values: ['0', '0 0.15em'] },
  { name: 'max-width', detail: 'Maximum width', values: ['none'] },
  { name: 'min-width', detail: 'Minimum width', values: ['0', '6em'] },
  { name: 'opacity', detail: 'Opacity', values: ['1', '0.5', '0'] },
  { name: 'outline', detail: 'Outline', values: ['none'] },
  { name: 'outline-color', detail: 'Outline color', values: COLORS },
  { name: 'outline-offset', detail: 'Outline offset', values: ['0', '2px'] },
  { name: 'outline-style', detail: 'Outline style', values: ['none', 'solid', 'dashed', 'dotted'] },
  { name: 'outline-width', detail: 'Outline thickness', values: ['0', '1px', 'thin'] },
  { name: 'padding', detail: 'Inner space', values: ['0', '0.05em 0.35em'] },
  { name: 'text-align', detail: 'Text alignment', values: ['left', 'center', 'right', 'start', 'end'] },
  { name: 'text-decoration', detail: 'Text decoration', values: ['none', 'underline'] },
  { name: 'vertical-align', detail: 'Alignment on the line', values: ['baseline', 'middle', 'top', 'bottom'] },
  { name: 'width', detail: 'Width', values: ['auto'] }
]

const BLOCKS: StyleCompletion[] = [
  { label: '&:hover', insertText: '&:hover {\n  $0\n}', detail: 'While the pointer is over the field', kind: 'block', snippet: true },
  { label: '&:focus', insertText: '&:focus {\n  $0\n}', detail: 'While the field has keyboard focus', kind: 'block', snippet: true },
  { label: '&:disabled', insertText: '&:disabled {\n  $0\n}', detail: 'While the field is disabled', kind: 'block', snippet: true }
]

export function inputStyleCompletions(before: string, lineAfter: string): StyleCompletion[] {
  if (inComment(before)) return []
  const property = valueProperty(before)
  if (property) return valueCompletions(property, !/^\s*;/.test(lineAfter))
  return [
    ...BLOCKS,
    ...PROPERTIES.map((item) => ({
      label: item.name,
      insertText: `${item.name}: $0;`,
      detail: item.detail,
      kind: 'property' as const,
      snippet: true
    }))
  ]
}

function valueCompletions(property: string, needsSemi: boolean): StyleCompletion[] {
  const known = PROPERTIES.find((item) => item.name === property.toLowerCase())
  const values = unique([...(known?.values ?? []), ...SHARED])
  const tail = needsSemi ? ';' : ''
  return values.map((value) => ({
    label: value,
    insertText: `${value}${tail}`,
    detail: known?.detail ?? property,
    kind: 'value' as const,
    snippet: false
  }))
}

function valueProperty(before: string): string | null {
  const tail = before.split(/[;{}]/).pop() ?? ''
  const match = /^\s*([A-Za-z_-][\w-]*)\s*:\s*([^:]*)$/.exec(tail)
  return match?.[1] ?? null
}

function inComment(before: string): boolean {
  let open = false
  for (let index = 0; index < before.length; index++) {
    if (!open && before.startsWith('/*', index)) {
      open = true
      index += 1
      continue
    }
    if (open && before.startsWith('*/', index)) {
      open = false
      index += 1
    }
  }
  return open
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
