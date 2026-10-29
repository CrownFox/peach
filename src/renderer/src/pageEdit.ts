import { PAGE_FONT_SIZES, pageImageEm } from '@shared/books'
import type { PageAlign, PageMarks, PageRun } from '@shared/types'

export type EditableParagraph = { align: PageAlign; runs: PageRun[] }

const SIZE_BY_HTML: Record<string, number> = {
  '1': 12,
  '2': 14,
  '3': 18,
  '4': 24,
  '5': 32,
  '6': 42,
  '7': 56
}

export function runsToHtml(runs: PageRun[], imageUrl: (id: string | null) => string): string {
  if (runs.length === 1 && runs[0]?.type === 'text' && runs[0].text === '') return '<br>'
  return runs.map((run) => runHtml(run, imageUrl)).join('')
}

export function paragraphsToHtml(paragraphs: EditableParagraph[], imageUrl: (id: string | null) => string): string {
  const list = paragraphs.length > 0 ? paragraphs : [{ align: 'start' as const, runs: [{ type: 'text' as const, text: '', marks: plain() }] }]
  return list.map((paragraph) => `<p style="${alignStyle(paragraph.align)}">${runsToHtml(paragraph.runs, imageUrl)}</p>`).join('')
}

export function htmlToRuns(root: HTMLElement, previous: PageRun[]): PageRun[] {
  const byId = new Map(previous.flatMap((run) => (run.type === 'text' ? [] : [[run.id, run] as const])))
  const runs = readNodes(root, plain(), byId)
  const merged = mergeText(runs)
  return merged.length > 0 ? merged : [{ type: 'text', text: '', marks: plain() }]
}

export function htmlToParagraphs(root: HTMLElement, previous: PageRun[]): EditableParagraph[] {
  const blocks = paragraphElements(root)
  const hosts = blocks.length > 0 ? blocks : [root]
  return hosts.map((host) => ({ align: alignOf(host), runs: htmlToRuns(host, previous) }))
}

export function paragraphElements(root: HTMLElement): HTMLElement[] {
  return [...root.children].filter((child): child is HTMLElement => child instanceof HTMLElement && (child.tagName === 'P' || child.tagName === 'DIV'))
}

export function caretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) return null
  const range = selection.getRangeAt(0)
  const probe = range.cloneRange()
  probe.selectNodeContents(root)
  probe.setEnd(range.endContainer, range.endOffset)
  return measure(probe.cloneContents())
}

export function caretInParagraphs(root: HTMLElement): { index: number; offset: number } | null {
  const selection = window.getSelection()
  const focus = selection?.focusNode
  if (!selection || selection.rangeCount === 0 || !focus || !root.contains(focus)) return null
  const blocks = paragraphElements(root)
  const hosts = blocks.length > 0 ? blocks : [root]
  let index = hosts.findIndex((host) => host === focus || host.contains(focus))
  if (index < 0) index = 0
  const host = hosts[index] ?? root
  if (focus !== host && !host.contains(focus)) return { index, offset: 0 }
  const probe = document.createRange()
  probe.selectNodeContents(host)
  probe.setEnd(focus, selection.focusOffset)
  return { index, offset: measure(probe.cloneContents()) }
}

function runHtml(run: PageRun, imageUrl: (id: string | null) => string): string {
  if (run.type === 'text') return `<span style="${styleText(run.marks)}">${escapeHtml(run.text)}</span>`
  if (run.type === 'image') {
    const url = imageUrl(run.imageId)
    const body = url ? `<img src="${escapeHtml(url)}" alt="" style="height:${pageImageEm(run.height)}em;width:auto;max-width:100%" />` : 'Image'
    return doodad('image', run.id, body)
  }
  if (run.type === 'evaluate') return doodad('evaluate', run.id, '<span class="doodad-mark">fx</span> Evaluate')
  if (run.type === 'textInput') return doodad('text', run.id, `Text ${escapeHtml(run.key || 'key')}`)
  return doodad('dropdown', run.id, `Menu ${escapeHtml(run.key || 'key')}`)
}

function doodad(type: string, id: string, body: string): string {
  return `<span class="doodad doodad-${type}" contenteditable="false" data-doodad-id="${escapeHtml(id)}">${body}</span>`
}

function readNodes(node: Node, marks: PageMarks, byId: Map<string, PageRun>): PageRun[] {
  const runs: PageRun[] = []
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? '').replace(/\u200b/g, '')
      if (text) runs.push({ type: 'text', text, marks: { ...marks } })
      continue
    }
    if (!(child instanceof HTMLElement)) continue
    if (child.dataset.doodadId) {
      const found = byId.get(child.dataset.doodadId)
      if (found) runs.push(found)
      continue
    }
    if (child.tagName === 'BR') continue
    runs.push(...readNodes(child, marksFrom(child, marks), byId))
  }
  return runs
}

function marksFrom(element: HTMLElement, marks: PageMarks): PageMarks {
  const next = { ...marks }
  const tag = element.tagName
  if (tag === 'B' || tag === 'STRONG') next.bold = true
  if (tag === 'I' || tag === 'EM') next.italic = true
  if (tag === 'U') next.underline = true
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.strike = true
  if (tag === 'FONT') {
    const color = element.getAttribute('color')
    const face = element.getAttribute('face')
    const size = element.getAttribute('size')
    if (color) next.color = color
    if (face) next.fontFamily = face
    if (size && SIZE_BY_HTML[size]) next.fontSize = SIZE_BY_HTML[size]
  }
  if (element.style.fontWeight === 'bold' || Number(element.style.fontWeight) >= 600) next.bold = true
  if (element.style.fontStyle === 'italic') next.italic = true
  if (element.style.textDecorationLine.includes('underline') || element.style.textDecoration.includes('underline')) next.underline = true
  if (element.style.textDecorationLine.includes('line-through') || element.style.textDecoration.includes('line-through')) next.strike = true
  if (element.style.color) next.color = normalizeColor(element.style.color)
  if (element.style.fontFamily) next.fontFamily = element.style.fontFamily
  const size = Number.parseFloat(element.style.fontSize)
  if (Number.isFinite(size) && size >= 8) next.fontSize = PAGE_FONT_SIZES.reduce((best, item) => (Math.abs(item - size) < Math.abs(best - size) ? item : best))
  return next
}

function mergeText(runs: PageRun[]): PageRun[] {
  const merged: PageRun[] = []
  for (const run of runs) {
    const previous = merged[merged.length - 1]
    if (run.type === 'text' && previous?.type === 'text' && sameMarks(previous.marks, run.marks)) previous.text += run.text
    else merged.push(run)
  }
  return merged
}

function sameMarks(left: PageMarks, right: PageMarks): boolean {
  return left.bold === right.bold && left.italic === right.italic && left.underline === right.underline && left.strike === right.strike && left.color === right.color && left.fontSize === right.fontSize && left.fontFamily === right.fontFamily
}

function measure(fragment: DocumentFragment): number {
  let count = 0
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) count += (node.textContent ?? '').replace(/\u200b/g, '').length
    else if (node instanceof HTMLElement && node.dataset.doodadId) count += 1
    else node.childNodes.forEach(walk)
  }
  fragment.childNodes.forEach(walk)
  return count
}

function alignStyle(align: PageAlign): string {
  if (align === 'center') return 'text-align:center'
  if (align === 'end') return 'text-align:right'
  return 'text-align:left'
}

function alignOf(element: HTMLElement): PageAlign {
  const value = element.style.textAlign
  if (value === 'center') return 'center'
  if (value === 'right' || value === 'end') return 'end'
  return 'start'
}

function styleText(marks: PageMarks): string {
  const parts: string[] = []
  if (marks.bold) parts.push('font-weight:700')
  if (marks.italic) parts.push('font-style:italic')
  const decoration = [marks.underline ? 'underline' : '', marks.strike ? 'line-through' : ''].filter(Boolean).join(' ')
  if (decoration) parts.push(`text-decoration:${decoration}`)
  if (marks.color) parts.push(`color:${marks.color}`)
  if (marks.fontFamily) parts.push(`font-family:${marks.fontFamily}`)
  if (marks.fontSize) parts.push(`font-size:${marks.fontSize}px`)
  return parts.join(';')
}

function plain(): PageMarks {
  return { bold: false, italic: false, underline: false, strike: false, color: null, fontSize: null, fontFamily: null }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function normalizeColor(value: string): string {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value)
  if (!match) return value
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}
