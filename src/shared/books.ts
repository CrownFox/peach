import { assetLocation } from './paths'
import type {
  AssetType,
  BookAsset,
  BookChapter,
  BookPage,
  ImageAsset,
  PageAlign,
  PageBlock,
  PageConditional,
  PageField,
  PageFieldType,
  PageMarks,
  PageParagraph,
  PageRun
} from './types'

export const PAGE_FONT_SIZES = [12, 14, 18, 24, 32, 42, 56]

export const visibleScript = `function visible()
  return true
end
`

export const valueScript = `function value()
  return ""
end
`

export const pageLoadScript = `function onLoad(parent)
end
`

export type LoadedBook = {
  location: string
  fields: PageField[]
  chapters: BookChapter[]
}

export type DisplayRun =
  | { type: 'text'; text: string; marks: PageMarks }
  | { type: 'image'; imagePath: string | null }
  | { type: 'input'; key: string; kind: 'text' | 'dropdown'; value: string; placeholder: string; options: string[] }
  | { type: 'note'; tone: 'evaluate'; label: string }

export type DisplayParagraph = { type: 'paragraph'; align: PageAlign; runs: DisplayRun[] }

export type DisplayBlock = DisplayParagraph | { type: 'conditional'; id: string; blocks: DisplayParagraph[] }

export type PageDisplay = {
  blocks: DisplayBlock[]
  missing: string | null
}

export function plainMarks(): PageMarks {
  return { bold: false, italic: false, underline: false, strike: false, color: null, fontSize: null, fontFamily: null }
}

export function emptyParagraph(): PageParagraph {
  return { type: 'paragraph', align: 'start', runs: [{ type: 'text', text: '', marks: plainMarks() }] }
}

export function emptyPage(id: string, name: string, fields: PageField[]): BookPage {
  const values: Record<string, string | boolean> = {}
  for (const field of fields) values[field.id] = pageValue(field, null)
  return { id, name, values, script: pageLoadScript, blocks: [emptyParagraph()] }
}

export function pagePath(chapter: BookChapter, page: BookPage): string {
  return `${chapter.name}/${page.name}`
}

export function findPage(book: Pick<BookAsset, 'chapters'>, path: string): { chapter: BookChapter; page: BookPage } | null {
  const slash = path.indexOf('/')
  if (slash <= 0 || slash !== path.lastIndexOf('/')) return null
  const chapterName = path.slice(0, slash)
  const pageName = path.slice(slash + 1)
  const chapter = book.chapters.find((item) => item.name === chapterName)
  const page = chapter?.pages.find((item) => item.name === pageName)
  if (!chapter || !page) return null
  return { chapter, page }
}

const ASSET_PAGE_TYPES = new Set<AssetType>(['menu', 'button', 'image', 'script', 'panel', 'collection', 'book', 'composite', 'scene', 'tileset'])

export const PAGE_VALUE_TYPES: { type: PageFieldType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'boolean', label: 'True / false' },
  { type: 'menu', label: 'Menu' },
  { type: 'button', label: 'Button' },
  { type: 'image', label: 'Image' },
  { type: 'script', label: 'Script' },
  { type: 'panel', label: 'Panel' },
  { type: 'collection', label: 'Collection' },
  { type: 'book', label: 'Book' },
  { type: 'composite', label: 'Composite' },
  { type: 'scene', label: 'Scene' },
  { type: 'tileset', label: 'Tileset' },
  { type: 'bookPage', label: 'Book+Page' }
]

export function pageFieldType(value: unknown): PageFieldType {
  if (value === 'boolean') return 'boolean'
  if (value === 'bookPage') return 'bookPage'
  if (typeof value === 'string' && ASSET_PAGE_TYPES.has(value as AssetType)) return value as PageFieldType
  return 'text'
}

export function isAssetPageField(type: PageFieldType): type is AssetType {
  return type !== 'text' && type !== 'boolean' && type !== 'bookPage'
}

export type BookPageRef = { book: string; page: string }

export function encodeBookPage(book: string, page: string): string {
  if (!book && !page) return ''
  return JSON.stringify({ book, page })
}

export function decodeBookPage(value: unknown): BookPageRef | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const record = parsed as { book?: unknown; page?: unknown }
    if (typeof record.book !== 'string' || typeof record.page !== 'string') return null
    return { book: record.book, page: record.page }
  } catch {
    return null
  }
}

export function coercePageValue(type: PageFieldType, value: unknown): string | boolean {
  if (type === 'boolean') return value === true || value === 'true'
  if (type === 'bookPage') {
    const ref = decodeBookPage(value)
    return ref ? encodeBookPage(ref.book, ref.page) : ''
  }
  if (isAssetPageField(type)) return typeof value === 'string' ? value : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return typeof value === 'string' ? value : ''
}

export function pageValue(field: PageField, values: object | null | undefined): string | boolean {
  if (values && Object.prototype.hasOwnProperty.call(values, field.id)) {
    return coercePageValue(field.type, (values as Record<string, unknown>)[field.id])
  }
  return coercePageValue(field.type, field.default)
}

export function pageFieldValue(field: PageField, page: BookPage): string | boolean {
  return pageValue(field, page.values)
}

export function inputDefault(run: PageRun): string {
  if (run.type === 'dropdown') return run.options[0] ?? ''
  if (run.type === 'textInput') return ''
  return ''
}

export function pageInputKeys(page: BookPage): { key: string; kind: 'text' | 'dropdown' }[] {
  const keys: { key: string; kind: 'text' | 'dropdown' }[] = []
  for (const block of page.blocks) {
    const paragraphs = block.type === 'paragraph' ? [block] : block.blocks
    for (const paragraph of paragraphs) {
      for (const run of paragraph.runs) {
        if (run.type === 'textInput') keys.push({ key: run.key, kind: 'text' })
        if (run.type === 'dropdown') keys.push({ key: run.key, kind: 'dropdown' })
      }
    }
  }
  return keys
}

export function inputValue(page: BookPage, key: string, inputs: Record<string, string>): string | null {
  for (const block of page.blocks) {
    const paragraphs = block.type === 'paragraph' ? [block] : block.blocks
    for (const paragraph of paragraphs) {
      for (const run of paragraph.runs) {
        if ((run.type === 'textInput' || run.type === 'dropdown') && run.key === key) {
          return inputs[key] ?? inputDefault(run)
        }
      }
    }
  }
  return null
}

export type DoodadScript = { id: string; kind: 'visible' | 'value'; script: string }

export function doodadScripts(page: BookPage): DoodadScript[] {
  const scripts: DoodadScript[] = []
  for (const block of page.blocks) {
    if (block.type === 'conditional') scripts.push({ id: block.id, kind: 'visible', script: block.script })
    const paragraphs = block.type === 'paragraph' ? [block] : block.blocks
    for (const paragraph of paragraphs) {
      for (const run of paragraph.runs) {
        if (run.type === 'evaluate') scripts.push({ id: run.id, kind: 'value', script: run.script })
      }
    }
  }
  return scripts
}

export function previewDisplay(page: BookPage, images: Iterable<ImageAsset>): PageDisplay {
  return { blocks: page.blocks.map((block) => previewBlock(block, images)), missing: null }
}

export function playDisplay(
  page: BookPage,
  images: Iterable<ImageAsset>,
  inputs: Record<string, string>,
  visible: ReadonlyMap<string, boolean>,
  values: ReadonlyMap<string, string>
): PageDisplay {
  const blocks: DisplayBlock[] = []
  for (const block of page.blocks) {
    if (block.type === 'conditional') {
      if (visible.get(block.id) === false) continue
      blocks.push(...block.blocks.map((paragraph) => playParagraph(paragraph, images, inputs, values)))
      continue
    }
    blocks.push(playParagraph(block, images, inputs, values))
  }
  return { blocks, missing: null }
}

export function displayLength(blocks: DisplayBlock[]): number {
  let count = 0
  for (const paragraph of displayParagraphs(blocks)) {
    for (const run of paragraph.runs) count += run.type === 'text' ? textLength(run.text) : 1
  }
  return count
}

export function clipDisplay(display: PageDisplay, shown: number): PageDisplay {
  if (display.missing || shown >= displayLength(display.blocks)) return display
  const blocks: DisplayBlock[] = []
  let budget = Math.max(0, shown)
  for (const block of display.blocks) {
    if (budget <= 0) break
    if (block.type === 'conditional') {
      const kept: DisplayParagraph[] = []
      for (const paragraph of block.blocks) {
        if (budget <= 0) break
        const clipped = clipParagraph(paragraph, budget)
        budget = clipped.budget
        if (clipped.paragraph) kept.push(clipped.paragraph)
        if (clipped.done) break
      }
      if (kept.length > 0) blocks.push({ type: 'conditional', id: block.id, blocks: kept })
      continue
    }
    const clipped = clipParagraph(block, budget)
    budget = clipped.budget
    if (clipped.paragraph) blocks.push(clipped.paragraph)
    if (clipped.done) break
  }
  return { blocks, missing: null }
}

function displayParagraphs(blocks: DisplayBlock[]): DisplayParagraph[] {
  const paragraphs: DisplayParagraph[] = []
  for (const block of blocks) {
    if (block.type === 'conditional') paragraphs.push(...block.blocks)
    else paragraphs.push(block)
  }
  return paragraphs
}

function textLength(text: string): number {
  return Array.from(text).length
}

function clipParagraph(paragraph: DisplayParagraph, budget: number): { paragraph: DisplayParagraph | null; budget: number; done: boolean } {
  if (paragraph.runs.length === 0) return { paragraph, budget, done: false }
  const runs: DisplayRun[] = []
  let left = budget
  for (const run of paragraph.runs) {
    if (left <= 0) return { paragraph: runs.length > 0 ? { ...paragraph, runs } : null, budget: 0, done: true }
    if (run.type !== 'text') {
      runs.push(run)
      left -= 1
      continue
    }
    const units = Array.from(run.text)
    if (units.length <= left) {
      runs.push(run)
      left -= units.length
      continue
    }
    runs.push({ ...run, text: units.slice(0, left).join('') })
    return { paragraph: { ...paragraph, runs }, budget: 0, done: true }
  }
  return { paragraph: { ...paragraph, runs }, budget: left, done: false }
}

export function splitRuns(runs: PageRun[], offset: number): [PageRun[], PageRun[]] {
  const before: PageRun[] = []
  const after: PageRun[] = []
  let cursor = 0
  let crossed = false
  for (const run of runs) {
    const size = run.type === 'text' ? run.text.length : 1
    if (crossed) {
      after.push(run)
      continue
    }
    if (cursor + size <= offset) {
      before.push(run)
      cursor += size
      continue
    }
    crossed = true
    if (run.type === 'text') {
      const cut = offset - cursor
      if (cut > 0) before.push({ ...run, text: run.text.slice(0, cut) })
      after.push({ ...run, text: run.text.slice(cut) })
    } else if (cursor === offset) {
      after.push(run)
    } else {
      before.push(run)
    }
    cursor += size
  }
  return [before.length > 0 ? before : [{ type: 'text', text: '', marks: plainMarks() }], after.length > 0 ? after : [{ type: 'text', text: '', marks: plainMarks() }]]
}

export function cloneBlocks(blocks: PageBlock[], ids: () => string): PageBlock[] {
  return blocks.map((block) => {
    if (block.type === 'conditional') {
      return { ...block, id: ids(), blocks: block.blocks.map((paragraph) => cloneParagraph(paragraph, ids)) }
    }
    return cloneParagraph(block, ids)
  })
}

function cloneParagraph(paragraph: PageParagraph, ids: () => string): PageParagraph {
  return {
    ...paragraph,
    runs: paragraph.runs.map((run) => (run.type === 'text' ? { ...run, marks: { ...run.marks } } : { ...run, id: ids() }))
  }
}

function previewBlock(block: PageBlock, images: Iterable<ImageAsset>): DisplayBlock {
  if (block.type === 'conditional') {
    return { type: 'conditional', id: block.id, blocks: block.blocks.map((paragraph) => previewParagraph(paragraph, images)) }
  }
  return previewParagraph(block, images)
}

function previewParagraph(paragraph: PageParagraph, images: Iterable<ImageAsset>): DisplayParagraph {
  return {
    type: 'paragraph',
    align: paragraph.align,
    runs: paragraph.runs.flatMap((run) => previewRun(run, images))
  }
}

function previewRun(run: PageRun, images: Iterable<ImageAsset>): DisplayRun[] {
  if (run.type === 'text') return run.text ? [{ type: 'text', text: run.text, marks: run.marks }] : []
  if (run.type === 'image') return [{ type: 'image', imagePath: imageFile(images, run.imageId) }]
  if (run.type === 'evaluate') return [{ type: 'note', tone: 'evaluate', label: 'Evaluate' }]
  if (run.type === 'textInput') return [{ type: 'input', key: run.key, kind: 'text', value: '', placeholder: run.placeholder, options: [] }]
  return [{ type: 'input', key: run.key, kind: 'dropdown', value: run.options[0] ?? '', placeholder: '', options: [...run.options] }]
}

function playParagraph(
  paragraph: PageParagraph,
  images: Iterable<ImageAsset>,
  inputs: Record<string, string>,
  values: ReadonlyMap<string, string>
): DisplayParagraph {
  return {
    type: 'paragraph',
    align: paragraph.align,
    runs: paragraph.runs.flatMap((run) => playRun(run, images, inputs, values))
  }
}

function playRun(run: PageRun, images: Iterable<ImageAsset>, inputs: Record<string, string>, values: ReadonlyMap<string, string>): DisplayRun[] {
  if (run.type === 'text') return run.text ? [{ type: 'text', text: run.text, marks: run.marks }] : []
  if (run.type === 'image') return [{ type: 'image', imagePath: imageFile(images, run.imageId) }]
  if (run.type === 'evaluate') return [{ type: 'text', text: values.get(run.id) ?? '', marks: plainMarks() }]
  if (run.type === 'textInput') {
    return [{ type: 'input', key: run.key, kind: 'text', value: inputs[run.key] ?? '', placeholder: run.placeholder, options: [] }]
  }
  return [{ type: 'input', key: run.key, kind: 'dropdown', value: inputs[run.key] ?? run.options[0] ?? '', placeholder: '', options: [...run.options] }]
}

function imageFile(images: Iterable<ImageAsset>, id: string | null): string | null {
  if (!id) return null
  for (const image of images) {
    if (image.id === id) return image.file
  }
  return null
}

export function snapshotBook(asset: BookAsset): LoadedBook {
  return {
    location: assetLocation(asset.relativePath),
    fields: copyData(asset.fields),
    chapters: copyData(asset.chapters)
  }
}

function copyData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
