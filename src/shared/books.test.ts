import { describe, expect, it } from 'vitest'
import { assetDocument, createAsset, parseAsset } from './assets'
import { cloneBlocks, clipDisplay, coercePageValue, decodeBookPage, displayLength, emptyPage, encodeBookPage, findPage, pageFieldType, pageFieldValue, playDisplay, previewDisplay, snapshotBook, splitRuns, plainMarks } from './books'
import type { BookAsset, PageBlock } from './types'

function book(): BookAsset {
  const asset = createAsset('book', 'Journal', 'Books/Journal.book.json', 'journal')
  if (asset.type !== 'book') throw new Error('expected a book')
  return asset
}

describe('books', () => {
  it('parses a book and finds a page by chapter and name', () => {
    const asset = book()
    asset.fields = [{ id: 'rare', name: 'Rare', type: 'boolean', default: false }]
    asset.chapters[0].name = 'Chapter'
    asset.chapters[0].pages[0].name = 'Page'
    asset.chapters[0].pages[0].values = { rare: false }
    const parsed = parseAsset(assetDocument(asset), asset.relativePath)
    if (parsed.type !== 'book') throw new Error('expected a book')
    expect(findPage(parsed, 'Chapter/Page')?.page.values.rare).toBe(false)
    expect(findPage(parsed, 'chapter/Page')).toBeNull()
    expect(findPage(parsed, 'Chapter')).toBeNull()
    expect(coercePageValue('boolean', false)).toBe(false)
  })

  it('inherits a page data default on a new page and on a page that has no value yet', () => {
    const asset = book()
    asset.fields = [{ id: 'place', name: 'Place', type: 'text', default: 'Town' }]
    expect(emptyPage('next', 'Next', asset.fields).values.place).toBe('Town')
    asset.chapters[0].pages[0].values = {}
    const parsed = parseAsset(assetDocument(asset), asset.relativePath)
    if (parsed.type !== 'book') throw new Error('expected a book')
    const field = parsed.fields[0]
    const parsedPage = parsed.chapters[0]?.pages[0]
    if (!field || !parsedPage) throw new Error('expected a field and a page')
    expect(parsedPage.values.place).toBe('Town')
    expect(pageFieldValue(field, { ...parsedPage, values: {} })).toBe('Town')
    asset.chapters[0].pages[0].values = { place: 'Village' }
    const kept = parseAsset(assetDocument(asset), asset.relativePath)
    if (kept.type !== 'book') throw new Error('expected a book')
    expect(kept.chapters[0]?.pages[0]?.values.place).toBe('Village')
    const legacy = assetDocument(asset)
    const fields = legacy.fields as { default?: string }[]
    delete fields[0]?.default
    const filled = parseAsset(legacy, asset.relativePath)
    if (filled.type !== 'book') throw new Error('expected a book')
    expect(filled.fields[0]?.default).toBe('')
  })

  it('keeps an asset path on a page data field', () => {
    const asset = book()
    asset.fields = [{ id: 'portrait', name: 'Portrait', type: 'image', default: 'characters/Hero' }]
    asset.chapters[0].pages[0].values = { portrait: 'characters/Hero' }
    const parsed = parseAsset(assetDocument(asset), asset.relativePath)
    if (parsed.type !== 'book') throw new Error('expected a book')
    expect(parsed.fields[0]).toMatchObject({ type: 'image', default: 'characters/Hero' })
    expect(parsed.chapters[0]?.pages[0]?.values.portrait).toBe('characters/Hero')
    expect(pageFieldType('menu')).toBe('menu')
    expect(pageFieldType('picture')).toBe('text')
    expect(coercePageValue('image', true)).toBe('')
    expect(coercePageValue('button', 'ui/Continue')).toBe('ui/Continue')
    const legacy = assetDocument(asset)
    const fields = legacy.fields as { type?: string }[]
    if (fields[0]) fields[0].type = 'picture'
    const text = parseAsset(legacy, asset.relativePath)
    if (text.type !== 'book') throw new Error('expected a book')
    expect(text.fields[0]?.type).toBe('text')
  })

  it('keeps a book and page together on a page data field', () => {
    const asset = book()
    const stored = encodeBookPage('Books/Journal', 'Chapter/Page')
    asset.fields = [{ id: 'story', name: 'Story', type: 'bookPage', default: stored }]
    asset.chapters[0].pages[0].values = {}
    const parsed = parseAsset(assetDocument(asset), asset.relativePath)
    if (parsed.type !== 'book') throw new Error('expected a book')
    expect(parsed.fields[0]).toMatchObject({ type: 'bookPage', default: stored })
    expect(parsed.chapters[0]?.pages[0]?.values.story).toBe(stored)
    expect(decodeBookPage(stored)).toEqual({ book: 'Books/Journal', page: 'Chapter/Page' })
    expect(coercePageValue('bookPage', true)).toBe('')
    expect(pageFieldType('bookPage')).toBe('bookPage')
  })

  it('copies a book whose lists are proxies', () => {
    const asset = book()
    asset.fields = new Proxy(asset.fields, {})
    asset.chapters = new Proxy(asset.chapters, {})
    const loaded = snapshotBook(asset)
    expect(loaded.location).toBe('Books/Journal')
    expect(loaded.chapters[0]?.name).toBe('Chapter')
    loaded.chapters[0].name = 'Changed'
    expect(asset.chapters[0]?.name).toBe('Chapter')
  })

  it('keeps a condition in the preview and hides it while playing', () => {
    const blocks: PageBlock[] = [
      {
        type: 'paragraph',
        align: 'center',
        runs: [
          { type: 'text', text: 'Hello ', marks: plainMarks() },
          { type: 'evaluate', id: 'ev', script: '' }
        ]
      },
      {
        type: 'conditional',
        id: 'hid',
        script: '',
        blocks: [{ type: 'paragraph', align: 'start', runs: [{ type: 'text', text: 'secret', marks: plainMarks() }] }]
      }
    ]
    const page = { id: 'p', name: 'Page', values: {}, script: '', blocks }
    const preview = previewDisplay(page, [])
    expect(preview.blocks[1]?.type).toBe('conditional')
    expect(JSON.stringify(preview)).toContain('Evaluate')
    const played = playDisplay(page, [], {}, new Map([['hid', false]]), new Map([['ev', 'there']]))
    const text = JSON.stringify(played)
    expect(text).toContain('there')
    expect(text).not.toContain('secret')
    expect(played.blocks.some((block) => block.type === 'conditional')).toBe(false)
  })

  it('splits around a doodad and gives a copy new ids', () => {
    const runs = [
      { type: 'text' as const, text: 'Hi', marks: plainMarks() },
      { type: 'image' as const, id: 'pic', imageId: null }
    ]
    const [before, after] = splitRuns(runs, 2)
    expect(before.map((run) => run.type)).toEqual(['text'])
    expect(after[0]?.type).toBe('image')
    const blocks: PageBlock[] = [{ type: 'conditional', id: 'hid', script: 'keep', blocks: [{ type: 'paragraph', align: 'start', runs }] }]
    const copy = cloneBlocks(blocks, () => 'fresh')
    const copied = copy[0]
    if (copied?.type !== 'conditional') throw new Error('expected a condition')
    expect(copied.id).toBe('fresh')
    expect(copied.script).toBe('keep')
    expect(copied.blocks[0]?.runs[1]).toMatchObject({ type: 'image', id: 'fresh' })
  })

  it('reveals text up to a count and keeps an image until the stream reaches it', () => {
    const display = {
      blocks: [
        {
          type: 'paragraph' as const,
          align: 'start' as const,
          runs: [
            { type: 'text' as const, text: 'A👍B', marks: plainMarks() },
            { type: 'image' as const, imagePath: 'hero.png' },
            { type: 'input' as const, key: 'name', kind: 'text' as const, value: '', placeholder: 'Name', options: [] }
          ]
        }
      ],
      missing: null
    }
    expect(displayLength(display.blocks)).toBe(5)
    expect(clipDisplay(display, 0).blocks).toEqual([])
    expect(JSON.stringify(clipDisplay(display, 2))).toContain('A👍')
    expect(JSON.stringify(clipDisplay(display, 2))).not.toContain('hero.png')
    const reached = JSON.stringify(clipDisplay(display, 4))
    expect(reached).toContain('hero.png')
    expect(reached).not.toContain('name')
    expect(JSON.stringify(clipDisplay(display, 5))).toContain('name')
  })
})
