import { describe, expect, it } from 'vitest'
import { PlaySession } from './playSession'
import { createAsset, createMenuComponent, createPageViewerComponent } from './assets'
import { encodeBookPage, plainMarks } from './books'
import { documentText, emptyDocument, memorySavePort, parseDocument } from './saves'
import type { Asset, BookAsset, ButtonAsset, CollectionAsset, CompositeAsset, ImageAsset, MenuAsset, MenuComponent, SceneAsset } from './types'

function image(id: string, name: string, relativePath: string): ImageAsset {
  return { id, type: 'image', name, relativePath, file: `${name}.png`, width: 32, height: 32, format: 'png' }
}

function buttonAsset(id: string, relativePath: string, imageId: string): ButtonAsset {
  return {
    id,
    type: 'button',
    name: 'Plate',
    relativePath,
    mode: 'static',
    slices: { left: 0, right: 0, top: 0, bottom: 0 },
    edgeFill: 'stretch',
    centerFill: 'stretch',
    states: { default: imageId, pressed: null, disabled: null }
  }
}

function button(id: string, handle: string, script = ''): MenuComponent {
  return {
    id,
    type: 'button',
    name: handle,
    handle,
    scriptId: null,
    script,
    x: 0,
    y: 0,
    width: 20,
    height: 10,
    buttonId: 'plate',
    enabled: true,
    visible: true,
    text: 'Play',
    fontFamily: 'Arial, sans-serif',
    fontSize: 40,
    color: '#fff',
    tint: '#ffffff'
  }
}

function menu(id: string, relativePath: string, script: string, components: MenuComponent[]): MenuAsset {
  const name = relativePath.split('/').pop()?.replace(/\.menu\.json$/, '') ?? 'Menu'
  return {
    id,
    type: 'menu',
    name,
    relativePath,
    width: 880,
    height: 495,
    gridSize: 16,
    snapToGrid: false,
    scriptId: null,
    script,
    components
  }
}

function start(assets: Asset[], entryId: string): PlaySession {
  const session = new PlaySession()
  session.assetsOf = () => assets
  session.reset(entryId)
  return session
}

describe('play session', () => {
  const hero = image('hero', 'Hero', 'characters/Hero.image.json')
  const plate = image('plate-image', 'Plate', 'ui/Plate.image.json')
  const plateButton = buttonAsset('plate', 'ui/Plate.button.json', 'plate-image')

  it('runs onLoad from saved values and shows the new text', () => {
    const main = menu(
      'main',
      'rooms/Main Menu.menu.json',
      `function onLoad()
        game.currentMenu.play.text = "Move Forward"
      end`,
      [button('play', 'play')]
    )
    const session = start([main, plate, plateButton, hero], 'main')
    expect(session.frames[0]?.overrides.play?.text).toBe('Move Forward')
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('opens a menu by its tree path and keeps game.state', () => {
    const town = menu('town', 'rooms/Town.menu.json', `function onLoad() game.state.visits = (game.state.visits or 0) + 1 end`, [])
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.state.visits = (game.state.visits or 0) + 1
        game.openMenu("rooms/Town")
      end`,
      []
    )
    const session = start([main, town], 'main')
    expect(session.frames.map((frame) => frame.menuId)).toEqual(['main', 'town'])
    expect(session.logs.some((entry) => entry.tone === 'error')).toBe(false)
  })

  it('does not run onLoad when going back', () => {
    const town = menu('town', 'Town.menu.json', '', [])
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.currentMenu.play.text = "Opened"
      end`,
      [button('play', 'play', `function onInteract() game.openMenu("Town") end`)]
    )
    const session = start([main, town], 'main')
    session.activate('play')
    expect(session.frames[session.index]?.menuId).toBe('town')
    session.back()
    expect(session.frames[session.index]?.overrides.play?.text).toBe('Opened')
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('runs a button and image onInteract and restores a cleared value', () => {
    const portrait = {
      id: 'portrait',
      type: 'image' as const,
      name: 'Portrait',
      handle: 'portrait',
      scriptId: null,
      script: `function onInteract() self.image = "characters/Hero" end`,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      imageId: null,
      fit: 'stretch' as const,
      tint: '#ffffff',
      visible: true
    }
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.currentMenu.play.text = "Changed"
        game.currentMenu.play.text = nil
        game.currentMenu.play.button = "missing/Nope"
      end`,
      [button('play', 'play', `function onInteract() self.text = "Clicked" end`), portrait]
    )
    const session = start([main, plate, plateButton, hero], 'main')
    expect(session.frames[0]?.overrides.play?.text).toBeUndefined()
    expect(session.logs.some((entry) => entry.text.includes('No button at "missing/Nope".'))).toBe(true)
    session.activate('play')
    expect(session.frames[0]?.overrides.play?.text).toBe('Clicked')
    session.activate('portrait')
    expect(session.frames[0]?.overrides.portrait?.imageRef).toBe('characters/Hero')
  })

  it('ignores a click on a disabled image and calls a function written on the menu', () => {
    const portrait = {
      id: 'portrait',
      type: 'image' as const,
      name: 'Portrait',
      handle: 'portrait',
      scriptId: null,
      script: `function onInteract() self.image = "characters/Hero" end`,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      imageId: null,
      fit: 'stretch' as const,
      tint: '#ffffff',
      visible: true
    }
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        self.portrait.enabled = false
        self:paint()
      end
      function paint()
        self.play.text = "Ready"
      end`,
      [button('play', 'play'), portrait]
    )
    const session = start([main, plate, plateButton, hero], 'main')
    expect(session.frames[0]?.overrides.play?.text).toBe('Ready')
    session.activate('portrait')
    expect(session.frames[0]?.overrides.portrait?.imageRef).toBeUndefined()
  })

  it('lets a local script replace a function from the referenced script', () => {
    const shared = {
      id: 'shared',
      type: 'script' as const,
      name: 'Shared',
      relativePath: 'Shared.script.json',
      source: 'function onInteract() self.text = "Shared" end\n'
    }
    const play = button('play', 'play', 'function onInteract() self.text = string.upper("local") end\n')
    play.scriptId = 'shared'
    const main = menu('main', 'Main Menu.menu.json', '', [play])
    const session = start([main, shared, plate, plateButton], 'main')
    session.activate('play')
    expect(session.frames[0]?.overrides.play?.text).toBe('LOCAL')
  })

  it('runs onChange once and keeps the value the script writes', () => {
    const field = {
      id: 'name',
      type: 'text' as const,
      name: 'Name',
      handle: 'name',
      scriptId: null,
      script: `function onChange()
        calls = (calls or 0) + 1
        print(calls)
        print(self.value)
        self.value = "kept"
      end`,
      x: 0,
      y: 0,
      width: 30,
      height: 10,
      value: '',
      placeholder: '',
      fontFamily: 'Arial, sans-serif',
      fontSize: 40,
      color: '#fff',
      panelId: null,
      tint: '#ffffff',
      visible: true
    }
    const session = start([menu('main', 'Main Menu.menu.json', '', [field])], 'main')
    session.setControl('name', 'typed')
    expect(session.frames[0]?.overrides.name?.value).toBe('kept')
    expect(session.logs.map((entry) => entry.text)).toEqual(['1', 'typed'])
  })

  it('ignores clicks on a hidden component', () => {
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        print(game.currentMenu.play.visible and "shown" or "hidden")
        game.currentMenu.play.visible = false
      end`,
      [button('play', 'play', `function onInteract() self.text = "Clicked" end`)]
    )
    const session = start([main, plate, plateButton], 'main')
    session.activate('play')
    expect(session.logs.map((entry) => entry.text)).toContain('shown')
    expect(session.frames[0]?.overrides.play?.text).toBeUndefined()
    expect(session.frames[0]?.overrides.play?.visible).toBe(false)
  })

  it('ignores clicks on a disabled button', () => {
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad() game.currentMenu.play.enabled = false end`,
      [button('play', 'play', `function onInteract() self.text = "Clicked" end`)]
    )
    const session = start([main, plate, plateButton], 'main')
    session.activate('play')
    expect(session.frames[0]?.overrides.play?.text).toBeUndefined()
  })

  it('loads a collection onto game.state and keeps false boolean', () => {
    const collection: CollectionAsset = {
      id: 'items',
      type: 'collection',
      name: 'Items',
      relativePath: 'Collections/Items.collection.json',
      masterKeyId: 'name',
      fields: [
        { id: 'name', name: 'Name', type: 'text', presets: [], enforcePresets: false },
        { id: 'rare', name: 'Rare', type: 'boolean', presets: [], enforcePresets: false }
      ],
      entries: [
        { id: 'a', values: { name: 'Iron Sword', rare: false } },
        { id: 'b', values: { name: 'Gem', rare: true } }
      ]
    }
    const main = menu(
      'main',
      'rooms/Main Menu.menu.json',
      `function onLoad()
        game.state.items = game.loadCollection("Collections/Items")
        local sword = game.state.items:get("Iron Sword")
        if sword:get("Rare") then
          game.currentMenu.play.text = "rare"
        else
          game.currentMenu.play.text = "common"
        end
        local commons = game.state.items:find("Rare", false)
        game.currentMenu.play.text = game.currentMenu.play.text .. #commons
        game.openMenu("Town")
      end`,
      [button('play', 'play')]
    )
    const town = menu(
      'town',
      'Town.menu.json',
      `function onLoad()
        local gem = game.state.items:get("Gem")
        if gem:get("Rare") then
          game.currentMenu.play.text = "shiny"
        end
        if game.state.items:get(false) == nil then
          game.currentMenu.play.text = game.currentMenu.play.text .. " miss"
        end
      end`,
      [button('play', 'play')]
    )
    const session = start([main, town, collection, plate, plateButton], 'main')
    const townFrame = session.frames.at(-1)
    expect(townFrame?.menuId).toBe('town')
    expect(townFrame?.overrides.play?.text).toBe('shiny miss')
    expect(session.frames[0]?.overrides.play?.text).toBe('common1')
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('reports a collection that cannot be loaded and refuses script writes', () => {
    const collection: CollectionAsset = {
      id: 'items',
      type: 'collection',
      name: 'Items',
      relativePath: 'Collections/Items.collection.json',
      masterKeyId: 'name',
      fields: [{ id: 'name', name: 'Name', type: 'text', presets: [], enforcePresets: false }],
      entries: [
        { id: 'a', values: { name: 'Iron Sword' } },
        { id: 'b', values: { name: 'Iron Sword' } }
      ]
    }
    const broken = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.loadCollection("Collections/Items")
      end`,
      [button('play', 'play')]
    )
    const session = start([broken, collection, plate, plateButton], 'main')
    expect(session.logs.some((entry) => entry.tone === 'error' && entry.text.includes('duplicated'))).toBe(true)
    expect(session.frames[0]?.menuId).toBe('main')

    const locked = menu(
      'locked',
      'Locked.menu.json',
      `function onLoad()
        local items = game.loadCollection("Collections/Items")
        items.extra = 1
      end`,
      [button('play', 'play')]
    )
    collection.entries = [{ id: 'a', values: { name: 'Iron Sword' } }]
    const again = start([locked, collection, plate, plateButton], 'locked')
    expect(again.logs.some((entry) => entry.text.includes('cannot be changed'))).toBe(true)
  })

  it('saves collection changes and loads them onto a fresh copy', () => {
    const collection: CollectionAsset = {
      id: 'items',
      type: 'collection',
      name: 'Items',
      relativePath: 'Collections/Items.collection.json',
      masterKeyId: 'name',
      fields: [
        { id: 'name', name: 'Name', type: 'text', presets: [], enforcePresets: false },
        { id: 'rare', name: 'Rare', type: 'boolean', presets: [], enforcePresets: false }
      ],
      entries: [
        { id: 'a', values: { name: 'Iron Sword', rare: false } },
        { id: 'b', values: { name: 'Gem', rare: true } }
      ]
    }
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        local items = game.loadCollection("Collections/Items")
        local sword = items:get("Iron Sword")
        sword:set("Rare", true)
        sword:set("Rare", false)
        local saved = items:save()
        sword:set("Rare", true)
        local fresh = game.loadCollection("Collections/Items")
        fresh:load(saved)
        if fresh:get("Iron Sword"):get("Rare") then
          game.currentMenu.play.text = "rare"
        else
          game.currentMenu.play.text = "restored"
        end
        fresh:set("Gem", "Rare", false)
        if fresh:get("Gem"):get("Rare") then
          game.currentMenu.play.text = game.currentMenu.play.text .. " still"
        else
          game.currentMenu.play.text = game.currentMenu.play.text .. " gem"
        end
        fresh:remove("Gem")
        local steel = fresh:add("Steel Sword")
        steel:set("Rare", true)
        steel:remove()
        local kept = fresh:add("Kept Sword")
        kept:set("Rare", true)
        local third = game.loadCollection("Collections/Items")
        third:load(fresh:save())
        local keptEntry = third:get("Kept Sword")
        if third:get("Gem") == nil and third:get("Steel Sword") == nil and keptEntry:get("Rare") and third:get("Iron Sword"):get("Rare") == false then
          game.currentMenu.play.text = game.currentMenu.play.text .. " loaded"
        end
      end`,
      [button('play', 'play')]
    )
    const session = start([main, collection, plate, plateButton], 'main')
    expect(session.frames[0]?.overrides.play?.text).toBe('restored gem loaded')
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])

    const locked = menu(
      'locked',
      'Locked.menu.json',
      `function onLoad()
        local items = game.loadCollection("Collections/Items")
        items:get("Iron Sword"):set("Name", "Other")
      end`,
      [button('play', 'play')]
    )
    const rejected = start([locked, collection, plate, plateButton], 'locked')
    expect(rejected.logs.some((entry) => entry.text.includes('master key'))).toBe(true)
  })

  it('loads a book page, hides a false condition, and keeps the page when the path is missing', () => {
    const asset = createAsset('book', 'Journal', 'Books/Journal.book.json', 'journal')
    if (asset.type !== 'book') throw new Error('expected a book')
    const journal: BookAsset = asset
    journal.fields = [
      { id: 'rare', name: 'Rare', type: 'boolean', default: false },
      { id: 'portrait', name: 'Portrait', type: 'image', default: '' }
    ]
    journal.chapters[0].name = 'Chapter'
    const page = journal.chapters[0].pages[0]
    page.name = 'Page'
    page.values = { rare: false, portrait: 'characters/Hero' }
    page.blocks = [
      {
        type: 'paragraph',
        align: 'start',
        runs: [
          { type: 'text', text: 'Hello ', marks: plainMarks() },
          { type: 'evaluate', id: 'ev', script: 'function value()\n  return "there"\nend\n' },
          { type: 'dropdown', id: 'choice', key: 'choice', options: ['Yes', 'No'] }
        ]
      },
      {
        type: 'conditional',
        id: 'hid',
        script: 'function visible()\n  return false\nend\n',
        blocks: [{ type: 'paragraph', align: 'start', runs: [{ type: 'text', text: 'secret', marks: plainMarks() }] }]
      }
    ]
    const reader = createPageViewerComponent([])
    reader.handle = 'reader'
    const main = menu(
      'main',
      'rooms/Main Menu.menu.json',
      `function onLoad()
        local book = game.loadBook("Books/Journal")
        local page = book:openPage("Chapter/Page")
        if page:get("Rare") == false and page:get("Portrait") == "characters/Hero" then
          game.currentMenu.play.text = "rare false"
        end
        game.currentMenu.reader:loadPage(book, "Chapter/Page")
        if game.currentMenu.reader:get("Portrait") ~= "characters/Hero" then
          game.currentMenu.play.text = "missing portrait"
        end
        game.currentMenu.play.text = game.currentMenu.play.text .. " " .. game.currentMenu.reader:getInput("choice")
        game.currentMenu.reader:loadPage(book, "Missing/Nope")
      end`,
      [reader, button('play', 'play')]
    )
    const session = start([main, journal, plate, plateButton], 'main')
    session.refreshPages()
    expect(session.frames[0]?.overrides.play?.text).toBe('rare false Yes')
    const shown = JSON.stringify(session.pages[reader.id])
    expect(shown).toContain('there')
    expect(shown).not.toContain('secret')
    expect(session.logs.some((entry) => entry.text.includes('No page at "Missing/Nope"'))).toBe(true)
  })

  it('shows a book and page from page data in one call', () => {
    const asset = createAsset('book', 'Journal', 'Books/Journal.book.json', 'journal')
    if (asset.type !== 'book') throw new Error('expected a book')
    const journal: BookAsset = asset
    journal.fields = [
      { id: 'rare', name: 'Rare', type: 'boolean', default: false },
      { id: 'story', name: 'Story', type: 'bookPage', default: '' },
      { id: 'blank', name: 'Blank', type: 'bookPage', default: '' }
    ]
    journal.chapters[0].name = 'Chapter'
    const page = journal.chapters[0].pages[0]
    page.name = 'Page'
    page.values = { rare: false, story: encodeBookPage('Books/Journal', 'Chapter/Page'), blank: '' }
    page.script = `function onLoad(parent)
      game.currentMenu.play.text = "shown"
    end
    `
    const reader = createPageViewerComponent([])
    reader.handle = 'reader'
    const main = menu(
      'main',
      'rooms/Main Menu.menu.json',
      `function onLoad()
        local book = game.loadBook("Books/Journal")
        local page = book:openPage("Chapter/Page")
        if page:get("Blank") ~= "" then
          game.currentMenu.play.text = "blank"
          return
        end
        local story = page:get("Story")
        if story.book ~= "Books/Journal" or story.page ~= "Chapter/Page" then
          game.currentMenu.play.text = "shape"
          return
        end
        game.loadPage(game.currentMenu.reader, story)
        game.loadPage(game.currentMenu.reader, { book = "Books/Journal", page = "Missing/Nope" })
      end`,
      [reader, button('play', 'play')]
    )
    const session = start([main, journal, plate, plateButton], 'main')
    expect(session.frames[0]?.overrides.play?.text).toBe('shown')
    expect(session.frames[0]?.overrides[reader.id]?.pagePath).toBe('Chapter/Page')
    expect(session.logs.some((entry) => entry.text.includes('No page at "Missing/Nope"'))).toBe(true)
  })

  it('runs a page script from the viewer and clears it when the next page loads', () => {
    const asset = createAsset('book', 'Journal', 'Books/Journal.book.json', 'journal')
    if (asset.type !== 'book') throw new Error('expected a book')
    const journal: BookAsset = asset
    journal.chapters[0].name = 'Chapter'
    const page = journal.chapters[0].pages[0]
    page.name = 'Page'
    page.blocks = [
      {
        type: 'paragraph',
        align: 'start',
        runs: [{ type: 'dropdown', id: 'choice', key: 'choice', options: ['Yes', 'No'] }]
      }
    ]
    page.script = `function onLoad(parent)
      function parent:submit()
        game.currentMenu.play.text = parent:getInput("choice")
      end
    end
    `
    journal.chapters[0].pages.push({
      id: 'next',
      name: 'Next',
      values: {},
      script: 'print("ready")\n',
      blocks: [{ type: 'paragraph', align: 'start', runs: [{ type: 'text', text: '', marks: plainMarks() }] }]
    })
    const reader = createPageViewerComponent([])
    reader.handle = 'reader'
    const main = menu(
      'main',
      'rooms/Main Menu.menu.json',
      `function onLoad()
        local book = game.loadBook("Books/Journal")
        game.currentMenu.reader:loadPage(book, "Chapter/Page")
        game.currentMenu.reader:submit()
        game.currentMenu.reader:loadPage(book, "Chapter/Next")
        local ok = pcall(function()
          game.currentMenu.reader:submit()
        end)
        if ok then game.currentMenu.play.text = "still there" end
      end`,
      [reader, button('play', 'play')]
    )
    const session = start([main, journal, plate, plateButton], 'main')
    expect(session.frames[0]?.overrides.play?.text).toBe('Yes')
    expect(session.logs.some((entry) => entry.text.includes('Next onLoad') && entry.text.includes('onLoad() is missing'))).toBe(true)
  })

  it('runs the page script before the menu opens and again when that menu returns', () => {
    const asset = createAsset('book', 'Journal', 'Books/Journal.book.json', 'journal')
    if (asset.type !== 'book') throw new Error('expected a book')
    const journal: BookAsset = asset
    journal.chapters[0].name = 'Chapter'
    const page = journal.chapters[0].pages[0]
    page.name = 'Page'
    page.blocks = [
      {
        type: 'paragraph',
        align: 'start',
        runs: [{ type: 'dropdown', id: 'choice', key: 'choice', options: ['Yes', 'No'] }]
      }
    ]
    page.script = `function onLoad(parent)
      game.state.loads = (game.state.loads or 0) + 1
      function parent:submit()
        game.currentMenu.play.text = tostring(game.state.loads) .. " " .. parent:getInput("choice")
      end
    end
    `
    const reader = createPageViewerComponent([])
    reader.handle = 'reader'
    reader.bookId = 'journal'
    reader.pagePath = 'Chapter/Page'
    const main = menu(
      'main',
      'rooms/Main Menu.menu.json',
      `function onLoad()
        game.currentMenu.reader:submit()
        game.currentMenu.play.text = game.currentMenu.play.text .. " M"
      end`,
      [reader, button('play', 'play', `function onInteract()\n  game.currentMenu.reader:submit()\nend`)]
    )
    const other = menu('other', 'Other.menu.json', '', [])
    const session = start([main, other, journal, plate, plateButton], 'main')
    expect(session.frames[0]?.overrides.play?.text).toBe('1 Yes M')
    session.navigate('other')
    session.back()
    expect(session.frames[0]?.overrides.play?.text).toBe('1 Yes M')
    session.forward()
    session.back()
    session.activate('play')
    expect(session.frames[0]?.overrides.play?.text).toBe('3 Yes')
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('opens a modal over the current menu without changing history', () => {
    const confirm = menu(
      'confirm',
      'Confirm.menu.json',
      `function onLoad()
        game.currentModal.ok.text = "modal"
        game.currentMenu.play.text = "back"
      end`,
      [button('ok', 'ok', `function onInteract() game.closeModal(game.currentModal) end`)]
    )
    const main = menu('main', 'Main Menu.menu.json', `function onLoad() game.openModal("Confirm") end`, [button('play', 'play')])
    const session = start([main, confirm, plate, plateButton], 'main')
    expect(session.frames.map((frame) => frame.menuId)).toEqual(['main'])
    expect(session.modals.map((frame) => frame.menuId)).toEqual(['confirm'])
    expect(session.frames[0]?.overrides.play?.text).toBe('back')
    expect(session.modals[0]?.overrides.ok?.text).toBe('modal')
    session.activate('ok')
    expect(session.modals).toEqual([])
    expect(session.frames.map((frame) => frame.menuId)).toEqual(['main'])
    expect(session.frames[0]?.overrides.play?.text).toBe('back')
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('closes a lower modal and every modal above it', () => {
    const warn = menu('warn', 'Warn.menu.json', '', [button('close', 'close', `function onInteract() game.closeModal(game.state.keep) end`)])
    const confirm = menu(
      'confirm',
      'Confirm.menu.json',
      `function onLoad()
        game.state.keep = game.currentModal
        game.openModal("Warn")
      end`,
      [button('ok', 'ok')]
    )
    const main = menu('main', 'Main Menu.menu.json', `function onLoad() game.openModal("Confirm") end`, [button('play', 'play')])
    const session = start([main, confirm, warn, plate, plateButton], 'main')
    expect(session.modals.map((frame) => frame.menuId)).toEqual(['confirm', 'warn'])
    expect(session.frames).toHaveLength(1)
    session.activate('close')
    expect(session.modals).toEqual([])
    expect(session.frames.map((frame) => frame.menuId)).toEqual(['main'])
  })

  it('drops a modal when the menu changes and does not restore it', () => {
    const confirm = menu('confirm', 'Confirm.menu.json', '', [button('ok', 'ok')])
    const town = menu('town', 'Town.menu.json', '', [button('play', 'play')])
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad() game.currentMenu.play.text = "home" end`,
      [button('play', 'play', `function onInteract()
        game.openModal("Confirm")
        game.openMenu("Town")
      end`)]
    )
    const session = start([main, confirm, town, plate, plateButton], 'main')
    session.activate('play')
    expect(session.frames.map((frame) => frame.menuId)).toEqual(['main', 'town'])
    expect(session.modals).toEqual([])
    session.back()
    expect(session.frames[session.index]?.menuId).toBe('main')
    expect(session.frames[session.index]?.overrides.play?.text).toBe('home')
    expect(session.modals).toEqual([])
    session.forward()
    expect(session.modals).toEqual([])
  })

  it('reports a missing modal and leaves the menu in place', () => {
    const main = menu('main', 'Main Menu.menu.json', `function onLoad() game.openModal("missing/Nope") end`, [button('play', 'play')])
    const session = start([main, plate, plateButton], 'main')
    expect(session.modals).toEqual([])
    expect(session.frames.map((frame) => frame.menuId)).toEqual(['main'])
    expect(session.logs.some((entry) => entry.text.includes('No menu at "missing/Nope"'))).toBe(true)
  })

  it('starts the top modal over when it is opened again', () => {
    const confirm = menu(
      'confirm',
      'Confirm.menu.json',
      `function onLoad() game.currentModal.ok.text = "fresh" end`,
      [button('ok', 'ok', `function onInteract()
        self.text = "edited"
        game.openModal("Confirm")
      end`)]
    )
    const main = menu('main', 'Main Menu.menu.json', `function onLoad() game.openModal("Confirm") end`, [button('play', 'play')])
    const session = start([main, confirm, plate, plateButton], 'main')
    expect(session.modals[0]?.overrides.ok?.text).toBe('fresh')
    session.activate('ok')
    expect(session.modals).toHaveLength(1)
    expect(session.modals[0]?.overrides.ok?.text).toBe('fresh')
    expect(session.frames).toHaveLength(1)
  })

  it('runs nested composite onLoad from the inside out and writes game.currentMenu.foo.bar.baz', () => {
    const baz = createMenuComponent('label', [])
    baz.id = 'baz'
    baz.handle = 'baz'
    const inner = createAsset('composite', 'Inner', 'Inner.composite.json', 'inner') as CompositeAsset
    inner.script = 'function onLoad()\n  self.baz.text = "deep"\nend\n'
    inner.components = [baz]
    const bar = createMenuComponent('composite', [])
    bar.id = 'bar'
    bar.handle = 'bar'
    if (bar.type === 'composite') bar.compositeId = 'inner'
    const mid = createAsset('composite', 'Mid', 'Mid.composite.json', 'mid') as CompositeAsset
    mid.script = 'function onLoad()\n  self.bar.baz.text = self.bar.baz.text .. " mid"\nend\n'
    mid.components = [bar]
    const foo = createMenuComponent('composite', [])
    foo.id = 'foo'
    foo.handle = 'foo'
    if (foo.type === 'composite') foo.compositeId = 'mid'
    const main = menu(
      'main',
      'Main.menu.json',
      `function onLoad()
        game.currentMenu.foo.bar.baz.text = game.currentMenu.foo.bar.baz.text .. " menu"
      end`,
      [foo]
    )
    const session = start([main, inner, mid], 'main')
    expect(session.currentOverrides()['foo/bar/baz']?.text).toBe('deep mid menu')
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('keeps two copies of one composite on separate instance paths', () => {
    const label = createMenuComponent('label', [])
    label.id = 'label'
    label.handle = 'label'
    const badge = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    badge.script = 'function onLoad()\n  self.label.text = "shared"\nend\n'
    badge.components = [label]
    const one = createMenuComponent('composite', [])
    one.id = 'one'
    one.handle = 'one'
    const two = createMenuComponent('composite', [])
    two.id = 'two'
    two.handle = 'two'
    if (one.type === 'composite') one.compositeId = 'badge'
    if (two.type === 'composite') two.compositeId = 'badge'
    const main = menu(
      'main',
      'Main.menu.json',
      `function onLoad()
        game.currentMenu.one.label.text = "A"
        game.currentMenu.two.label.text = "B"
      end`,
      [one, two]
    )
    const session = start([main, badge], 'main')
    expect(session.currentOverrides()['one/label']?.text).toBe('A')
    expect(session.currentOverrides()['two/label']?.text).toBe('B')
  })

  it('calls a function on the composite object with that copy as self', () => {
    const label = createMenuComponent('label', [])
    label.id = 'label'
    label.handle = 'label'
    const inner = createAsset('composite', 'Inner', 'Inner.composite.json', 'inner') as CompositeAsset
    inner.script = 'function onLoad()\n  mark()\nend\n'
    const bar = createMenuComponent('composite', [])
    bar.id = 'bar'
    bar.handle = 'bar'
    if (bar.type === 'composite') bar.compositeId = 'inner'
    const badge = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    badge.script = `function mark()
      self.label.text = "outer"
    end
    function paint()
      self.label.text = "painted"
    end`
    badge.components = [label, bar]
    const foo = createMenuComponent('composite', [])
    foo.id = 'foo'
    foo.handle = 'foo'
    if (foo.type === 'composite') foo.compositeId = 'badge'
    const main = menu(
      'main',
      'Main.menu.json',
      `function onLoad()
        game.currentMenu.foo.paint()
      end`,
      [foo]
    )
    const session = start([main, inner, badge], 'main')
    expect(session.currentOverrides()['foo/label']?.text).toBe('painted')
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('runs a key for the current visit and restores it with Back', () => {
    const town = menu('town', 'Town.menu.json', '', [])
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.registerKey(BTN_A, "down", function() print("main") end)
        game.registerKey(BTN_A, "down", function() print("replaced") end)
        game.registerKey("KeyB", "down", function() print("raw") end)
        game.registerKey(BTN_A, "up", function() print("up") end)
        game.registerKey(BTN_C, "down", function() print("cleared") end)
        game.registerKey(BTN_C, "down", nil)
      end`,
      [button('play', 'play', `function onInteract() game.openMenu("Town") end`)]
    )
    const session = start([main, town, plate, plateButton], 'main')
    expect(session.pressKey('KeyA', 'down', false)).toBe(true)
    expect(session.logs.map((entry) => entry.text)).toEqual([])
    expect(session.pressKey('KeyA', 'down')).toBe(true)
    expect(session.pressKey('KeyA', 'up')).toBe(true)
    expect(session.pressKey('KeyB', 'down')).toBe(true)
    expect(session.pressKey('KeyC', 'down')).toBe(false)
    expect(session.logs.map((entry) => entry.text)).toEqual(['replaced', 'up', 'raw'])
    session.activate('play')
    expect(session.pressKey('KeyA', 'down')).toBe(false)
    expect(session.logs.map((entry) => entry.text)).toEqual(['replaced', 'up', 'raw'])
    session.back()
    expect(session.pressKey('KeyA', 'down')).toBe(true)
    expect(session.logs.map((entry) => entry.text)).toEqual(['replaced', 'up', 'raw', 'replaced'])
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('moves a component from onUpdate and stops after one error', () => {
    const play = button('play', 'play')
    play.x = 10
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onUpdate(dt)
        self.play.x = self.play.x + 100 * dt
      end`,
      [play]
    )
    const session = start([main, plate, plateButton], 'main')
    session.tick(50)
    expect(session.currentOverrides().play?.x).toBe(15)
    session.tick(1000)
    expect(session.currentOverrides().play?.x).toBe(25)
    session.tick(0)
    expect(session.currentOverrides().play?.x).toBe(25)

    const restored = menu(
      'restored',
      'Restored.menu.json',
      `function onLoad()
        self.play.x = 40
        self.play.x = nil
      end`,
      [button('play', 'play')]
    )
    const reset = start([restored, plate, plateButton], 'restored')
    expect(reset.currentOverrides().play?.x).toBeUndefined()

    const broken = menu(
      'broken',
      'Broken.menu.json',
      `function onUpdate(dt)
        self.play.x = 4
        error("boom")
      end`,
      [button('play', 'play', `function onInteract() game.openMenu("Broken") end`)]
    )
    const failing = start([broken, plate, plateButton], 'broken')
    failing.tick(16)
    failing.tick(16)
    expect(failing.currentOverrides().play?.x).toBe(4)
    expect(failing.logs.filter((entry) => entry.tone === 'error')).toHaveLength(1)
    failing.activate('play')
    failing.tick(16)
    expect(failing.currentOverrides().play?.x).toBe(4)
    expect(failing.logs.filter((entry) => entry.tone === 'error')).toHaveLength(2)
  })

  it('runs onUpdate on the modal and resumes the menu when the modal closes', () => {
    const confirm = menu(
      'confirm',
      'Confirm.menu.json',
      `function onUpdate(dt)
        print("modal")
      end`,
      [button('ok', 'ok', `function onInteract() game.closeModal(game.currentModal) end`)]
    )
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.openModal("Confirm")
      end
      function onUpdate(dt)
        self.play.x = self.play.x + 10
      end`,
      [button('play', 'play')]
    )
    const session = start([main, confirm, plate, plateButton], 'main')
    session.tick(16)
    expect(session.currentOverrides().play?.x).toBeUndefined()
    expect(session.logs.map((entry) => entry.text)).toEqual(['modal'])
    session.activate('ok')
    session.tick(16)
    expect(session.currentOverrides().play?.x).toBe(10)
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('reports a held key and stays quiet while typing', () => {
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onUpdate(dt)
        if game.keyDown(BTN_A) then print("held") end
      end`,
      []
    )
    const session = start([main, plate, plateButton], 'main')
    session.pressKey('KeyA', 'down')
    session.tick(16)
    session.setTyping(true)
    session.tick(16)
    session.setTyping(false)
    session.pressKey('KeyA', 'up')
    session.tick(16)
    expect(session.logs.map((entry) => entry.text)).toEqual(['held'])
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('runs one scene update for every viewer and skips it when they are hidden', () => {
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.script = `function onUpdate(dt)
      self.hero.x = self.hero.x + 10
    end`
    town.components = [button('hero', 'hero', `function onInteract() print("hit") end`)]
    const camera = createMenuComponent('sceneViewer', [])
    const other = createMenuComponent('sceneViewer', [])
    camera.id = 'camera'
    camera.handle = 'camera'
    other.id = 'other'
    other.handle = 'other'
    if (camera.type === 'sceneViewer') camera.sceneId = 'town'
    if (other.type === 'sceneViewer') other.sceneId = 'town'
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.currentMenu.other.visible = false
        game.currentMenu.camera.viewX = 12
      end`,
      [camera, other]
    )
    const session = start([main, town, plate, plateButton], 'main')
    expect(session.currentOverrides().camera?.viewX).toBe(12)
    session.tick(16)
    expect(session.currentOverrides()['scene:town/hero']?.x).toBe(10)
    session.activate('camera::hero')
    expect(session.logs.map((entry) => entry.text)).toEqual(['hit'])
    const hiding = menu(
      'hiding',
      'Hiding.menu.json',
      `function onLoad()
        game.currentMenu.camera.visible = false
      end`,
      [camera]
    )
    const quiet = start([hiding, town, plate, plateButton], 'hiding')
    quiet.tick(16)
    expect(quiet.currentOverrides()['scene:town/hero']?.x).toBeUndefined()
    expect(quiet.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('keeps a persistent scene through menu changes and starts it over on restart', () => {
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.persistent = true
    town.script = `local n = 0
      function onLoad()
        n = 1
        print("load")
      end
      function onUpdate(dt)
        n = n + 1
        self.hero.x = n
      end`
    town.components = [button('hero', 'hero')]
    const camera = createMenuComponent('sceneViewer', [])
    camera.id = 'camera'
    camera.handle = 'camera'
    if (camera.type === 'sceneViewer') camera.sceneId = 'town'
    const opener = button('open', 'open', `function onInteract()
      game.openModal("Dialog")
    end`)
    const main = menu('main', 'Main Menu.menu.json', '', [camera, opener])
    const next = menu('next', 'Next.menu.json', '', [camera])
    const hiding = menu('hiding', 'Hiding.menu.json', `function onLoad()
      game.currentMenu.camera.visible = false
    end`, [camera])
    const dialog = menu('dialog', 'Dialog.menu.json', '', [
      button('close', 'close', `function onInteract()
        game.closeModal(game.currentModal)
      end`)
    ])
    const assets = [main, next, hiding, dialog, town, plate, plateButton]
    const session = start(assets, 'main')
    const heroX = (): number | undefined => session.currentOverrides()['scene:town/hero']?.x
    const loads = (): number => session.logs.filter((entry) => entry.text === 'load').length
    session.tick(16)
    expect(heroX()).toBe(2)
    expect(loads()).toBe(1)
    session.navigate('next')
    session.tick(16)
    expect(heroX()).toBe(3)
    expect(loads()).toBe(1)
    session.navigate('hiding')
    session.tick(16)
    expect(heroX()).toBe(3)
    expect(loads()).toBe(1)
    session.back()
    session.tick(16)
    expect(heroX()).toBe(4)
    expect(loads()).toBe(1)
    session.back()
    session.activate('open')
    session.tick(16)
    expect(heroX()).toBe(4)
    session.activate('close')
    session.tick(16)
    expect(heroX()).toBe(5)
    expect(loads()).toBe(1)
    session.reset('main')
    session.tick(16)
    expect(heroX()).toBe(2)
    expect(loads()).toBe(1)
    town.script = `function onLoad()
      print("fresh")
    end
    function onUpdate(dt)
      self.hero.x = 1
    end`
    session.navigate('next')
    session.tick(16)
    expect(heroX()).toBe(1)
    expect(session.logs.map((entry) => entry.text)).toContain('fresh')
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('runs onShow when a persistent scene is shown on a new menu', () => {
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.persistent = true
    town.script = `function onLoad()
      print("load")
    end
    function onShow()
      print("show")
      game.registerKey(BTN_A, "down", function()
        print("key")
      end)
    end`
    town.components = [button('hero', 'hero')]
    const camera = createMenuComponent('sceneViewer', [])
    camera.id = 'camera'
    camera.handle = 'camera'
    if (camera.type === 'sceneViewer') camera.sceneId = 'town'
    const main = menu('main', 'Main Menu.menu.json', '', [camera])
    const next = menu('next', 'Next.menu.json', '', [camera])
    const dialog = menu('dialog', 'Dialog.menu.json', '', [camera, button('close', 'close', `function onInteract()
      game.closeModal(game.currentModal)
    end`)])
    const quiet = menu('quiet', 'Quiet.menu.json', '', [button('close', 'close', `function onInteract()
      game.closeModal(game.currentModal)
    end`)])
    const opener = button('open', 'open', `function onInteract()
      game.openModal("Dialog")
    end`)
    const quietOpen = button('quiet', 'quiet', `function onInteract()
      game.openModal("Quiet")
    end`)
    main.components = [camera, opener, quietOpen]
    const session = start([main, next, dialog, quiet, town, plate, plateButton], 'main')
    const text = (value: string): number => session.logs.filter((entry) => entry.text === value).length
    expect(text('load')).toBe(1)
    expect(text('show')).toBe(1)
    expect(session.pressKey('KeyA', 'down')).toBe(true)
    expect(text('key')).toBe(1)
    session.navigate('next')
    expect(text('load')).toBe(1)
    expect(text('show')).toBe(2)
    expect(session.pressKey('KeyA', 'down')).toBe(true)
    expect(text('key')).toBe(2)
    session.back()
    expect(text('show')).toBe(2)
    expect(session.pressKey('KeyA', 'down')).toBe(true)
    expect(text('key')).toBe(3)
    session.activate('quiet')
    expect(text('show')).toBe(2)
    expect(session.pressKey('KeyA', 'down')).toBe(false)
    session.activate('close')
    expect(text('show')).toBe(2)
    expect(session.pressKey('KeyA', 'down')).toBe(true)
    session.activate('open')
    expect(text('show')).toBe(3)
    expect(session.pressKey('KeyA', 'down')).toBe(true)
    expect(text('key')).toBe(5)
    session.activate('close')
    expect(text('show')).toBe(3)
    expect(session.pressKey('KeyA', 'down')).toBe(true)
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('waits to run onShow until a viewer is visible and does not repeat it on the same menu', () => {
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.script = `function onShow()
      print("show")
    end`
    town.components = [button('hero', 'hero')]
    const camera = createMenuComponent('sceneViewer', [])
    camera.id = 'camera'
    camera.handle = 'camera'
    camera.visible = false
    if (camera.type === 'sceneViewer') camera.sceneId = 'town'
    const show = button('show', 'show', `function onInteract()
      game.currentMenu.camera.visible = true
    end`)
    const hide = button('hide', 'hide', `function onInteract()
      game.currentMenu.camera.visible = false
    end`)
    const main = menu('main', 'Main Menu.menu.json', '', [camera, show, hide])
    const session = start([main, town, plate, plateButton], 'main')
    const shows = (): number => session.logs.filter((entry) => entry.text === 'show').length
    session.tick(16)
    expect(shows()).toBe(0)
    session.activate('show')
    session.tick(16)
    expect(shows()).toBe(1)
    session.activate('hide')
    session.tick(16)
    session.activate('show')
    session.tick(16)
    expect(shows()).toBe(1)
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('runs composite onShow after onLoad and skips it when going back', () => {
    const label = createMenuComponent('label', [])
    label.id = 'label'
    label.handle = 'label'
    const badge = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    badge.script = `function onLoad()
      print("load")
    end
    function onShow()
      print("show")
    end`
    badge.components = [label]
    const slot = createMenuComponent('composite', [])
    slot.id = 'badge'
    slot.handle = 'badge'
    if (slot.type === 'composite') slot.compositeId = 'badge'
    const town = menu('town', 'Town.menu.json', '', [])
    const main = menu(
      'main',
      'Main.menu.json',
      '',
      [slot, button('play', 'play', `function onInteract() game.openMenu("Town") end`)]
    )
    const session = start([main, town, badge, plate, plateButton], 'main')
    const text = (value: string): number => session.logs.filter((entry) => entry.text === value).length
    expect(text('load')).toBe(1)
    expect(text('show')).toBe(1)
    session.activate('play')
    session.back()
    expect(text('load')).toBe(1)
    expect(text('show')).toBe(1)
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('runs a composite inside a persistent scene onShow on the next menu', () => {
    const label = createMenuComponent('label', [])
    label.id = 'label'
    label.handle = 'label'
    const badge = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    badge.script = `function onLoad()
      print("cload")
    end
    function onShow()
      print("cshow")
    end`
    badge.components = [label]
    const slot = createMenuComponent('composite', [])
    slot.id = 'badge'
    slot.handle = 'badge'
    if (slot.type === 'composite') slot.compositeId = 'badge'
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.persistent = true
    town.script = `function onLoad()
      print("load")
    end
    function onShow()
      print("show")
    end`
    town.components = [slot]
    const camera = createMenuComponent('sceneViewer', [])
    camera.id = 'camera'
    camera.handle = 'camera'
    if (camera.type === 'sceneViewer') camera.sceneId = 'town'
    const main = menu('main', 'Main Menu.menu.json', '', [camera])
    const next = menu('next', 'Next.menu.json', '', [camera])
    const session = start([main, next, town, badge, plate, plateButton], 'main')
    const text = (value: string): number => session.logs.filter((entry) => entry.text === value).length
    expect(text('cload')).toBe(1)
    expect(text('load')).toBe(1)
    expect(text('cshow')).toBe(1)
    expect(text('show')).toBe(1)
    const order = session.logs.map((entry) => entry.text)
    expect(order.indexOf('cshow')).toBeLessThan(order.indexOf('show'))
    session.navigate('next')
    expect(text('cload')).toBe(1)
    expect(text('load')).toBe(1)
    expect(text('cshow')).toBe(2)
    expect(text('show')).toBe(2)
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('starts a scene over when the next menu shows it', () => {
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.script = `local n = 0
      function onLoad()
        n = 1
        print("load")
      end
      function onUpdate(dt)
        n = n + 1
        self.hero.x = n
      end`
    town.components = [button('hero', 'hero')]
    const camera = createMenuComponent('sceneViewer', [])
    camera.id = 'camera'
    camera.handle = 'camera'
    if (camera.type === 'sceneViewer') camera.sceneId = 'town'
    const main = menu('main', 'Main Menu.menu.json', '', [camera])
    const next = menu('next', 'Next.menu.json', '', [camera])
    const session = start([main, next, town, plate, plateButton], 'main')
    session.tick(16)
    session.navigate('next')
    session.tick(16)
    expect(session.currentOverrides()['scene:town/hero']?.x).toBe(2)
    expect(session.logs.filter((entry) => entry.text === 'load')).toHaveLength(2)
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('reports the visible scene size from the viewer width and height', () => {
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.script = `function onUpdate(dt)
      local view = game.currentMenu.camera
      view.viewX = view.viewWidth
      view.viewY = view.viewHeight
    end`
    town.components = []
    const open = (scaleWithViewer: boolean, displayScale: number): PlaySession => {
      const camera = createMenuComponent('sceneViewer', [])
      if (camera.type !== 'sceneViewer') throw new Error('scene viewer')
      camera.id = 'camera'
      camera.handle = 'camera'
      camera.sceneId = 'town'
      camera.width = 200
      camera.height = 100
      camera.scale = 2
      camera.scaleWithViewer = scaleWithViewer
      const session = start([menu('main', 'Main Menu.menu.json', '', [camera]), town], 'main')
      session.setDisplayScale(displayScale)
      session.tick(16)
      return session
    }
    const fitted = open(true, 2)
    expect(fitted.currentOverrides().camera?.viewX).toBe(100)
    expect(fitted.currentOverrides().camera?.viewY).toBe(50)
    const locked = open(false, 2)
    expect(locked.currentOverrides().camera?.viewX).toBe(200)
    expect(locked.currentOverrides().camera?.viewY).toBe(100)
    const still = open(false, 1)
    expect(still.currentOverrides().camera?.viewX).toBe(100)
    expect(still.currentOverrides().camera?.viewY).toBe(50)
    expect(still.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('moves a composite by its x inside a scene viewer', () => {
    const badge = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    const hero = createMenuComponent('composite', [])
    if (hero.type !== 'composite') throw new Error('composite')
    hero.id = 'hero'
    hero.handle = 'hero'
    hero.x = 10
    hero.compositeId = 'badge'
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.components = [hero]
    const camera = createMenuComponent('sceneViewer', [])
    if (camera.type !== 'sceneViewer') throw new Error('scene viewer')
    camera.id = 'camera'
    camera.handle = 'camera'
    camera.sceneId = 'town'
    const slot = createMenuComponent('composite', [])
    if (slot.type !== 'composite') throw new Error('composite')
    slot.id = 'slot'
    slot.handle = 'slot'
    slot.x = 3
    slot.compositeId = 'badge'
    const session = start(
      [
        menu(
          'main',
          'Explore Menu.menu.json',
          `function onUpdate(dt)
            local hero = game.currentMenu.camera.hero
            hero.x = hero.x + 5
            self.slot.x = self.slot.x + 7
          end`,
          [camera, slot]
        ),
        town,
        badge,
        plate,
        plateButton
      ],
      'main'
    )
    session.tick(16)
    expect(session.currentOverrides()['scene:town/hero']?.x).toBe(15)
    expect(session.currentOverrides().slot?.x).toBe(10)
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('runs onUpdate for each composite copy and stops that copy after one error', () => {
    const badge = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    const mark = button('mark', 'mark')
    badge.components = [mark]
    badge.script = `function onUpdate(dt)
      self.mark.x = self.mark.x + 4
    end`
    const slot = createMenuComponent('composite', [])
    const other = createMenuComponent('composite', [])
    if (slot.type !== 'composite' || other.type !== 'composite') throw new Error('composite')
    slot.id = 'slot'
    slot.handle = 'slot'
    slot.compositeId = 'badge'
    other.id = 'other'
    other.handle = 'other'
    other.compositeId = 'badge'
    const session = start(
      [
        menu(
          'main',
          'Main Menu.menu.json',
          `function onLoad()
            game.currentMenu.slot.visible = false
          end`,
          [slot, other]
        ),
        badge,
        plate,
        plateButton
      ],
      'main'
    )
    session.tick(16)
    expect(session.currentOverrides()['slot/mark']?.x).toBe(4)
    expect(session.currentOverrides()['other/mark']?.x).toBe(4)
    const broken = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    broken.components = [button('mark', 'mark')]
    broken.script = `function onUpdate(dt)
      error("boom")
    end`
    const one = createMenuComponent('composite', [])
    if (one.type !== 'composite') throw new Error('composite')
    one.id = 'slot'
    one.handle = 'slot'
    one.compositeId = 'badge'
    const failing = start([menu('main', 'Main Menu.menu.json', '', [one]), broken, plate, plateButton], 'main')
    failing.tick(16)
    failing.tick(16)
    expect(failing.currentOverrides()['slot/mark']?.x).toBeUndefined()
    expect(failing.logs.filter((entry) => entry.tone === 'error')).toHaveLength(1)
    expect(failing.logs.find((entry) => entry.tone === 'error')?.text).toContain('Badge onUpdate')
  })

  it('runs only the top modal keys until that modal closes', () => {
    const confirm = menu(
      'confirm',
      'Confirm.menu.json',
      `function onLoad()
        game.registerKey(BTN_A, "down", function() print("modal") end)
      end`,
      [button('ok', 'ok', `function onInteract() game.closeModal(game.currentModal) end`)]
    )
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.registerKey(BTN_A, "down", function() print("menu") end)
        game.openModal("Confirm")
      end`,
      [button('play', 'play')]
    )
    const session = start([main, confirm, plate, plateButton], 'main')
    expect(session.pressKey('KeyA', 'down')).toBe(true)
    expect(session.logs.map((entry) => entry.text)).toEqual(['modal'])
    session.activate('ok')
    expect(session.pressKey('KeyA', 'down')).toBe(true)
    expect(session.logs.map((entry) => entry.text)).toEqual(['modal', 'menu'])
  })

  it('reports a key event that is not down or up', () => {
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.registerKey(BTN_A, "press", function() end)
      end`,
      []
    )
    const session = start([main], 'main')
    expect(session.logs.some((entry) => entry.tone === 'error' && entry.text.includes('game.registerKey expects "down" or "up".'))).toBe(true)
  })

  it('streams a page from the first character and can pause, resume, finish, and start again', () => {
    const asset = createAsset('book', 'Journal', 'Books/Journal.book.json', 'journal')
    if (asset.type !== 'book') throw new Error('expected a book')
    const journal: BookAsset = asset
    journal.chapters[0].name = 'Chapter'
    const page = journal.chapters[0].pages[0]
    page.name = 'Page'
    page.blocks = [{ type: 'paragraph', align: 'start', runs: [{ type: 'text', text: 'Hello', marks: plainMarks() }] }]
    const reader = createPageViewerComponent([])
    reader.handle = 'reader'
    reader.progressive = true
    reader.rate = 1
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.currentMenu.reader.rate = 10
        local book = game.loadBook("Books/Journal")
        game.currentMenu.reader:loadPage(book, "Chapter/Page")
      end`,
      [
        reader,
        button(
          'play',
          'play',
          `function onInteract()
            game.state.n = (game.state.n or 0) + 1
            if game.state.n == 1 then
              print(game.currentMenu.reader.finished and "done" or "playing")
            elseif game.state.n == 2 then
              game.currentMenu.reader:stop()
            elseif game.state.n == 3 then
              game.currentMenu.reader:resume()
            elseif game.state.n == 4 then
              game.currentMenu.reader:finish()
              print(game.currentMenu.reader.finished and "done" or "playing")
            else
              game.currentMenu.reader:start()
              print(game.currentMenu.reader.finished and "done" or "playing")
            end
          end`
        )
      ]
    )
    const session = start([main, journal, plate, plateButton], 'main')
    session.refreshPages()
    expect(JSON.stringify(session.pages[reader.id])).not.toContain('Hello')
    session.advanceText(50)
    session.refreshPages()
    expect(JSON.stringify(session.pages[reader.id])).not.toContain('Hello')
    session.advanceText(50)
    session.refreshPages()
    expect(JSON.stringify(session.pages[reader.id])).toContain('"text":"H"')
    session.activate('play')
    expect(session.logs.map((entry) => entry.text)).toEqual(['playing'])
    session.activate('play')
    session.advanceText(1000)
    session.refreshPages()
    expect(JSON.stringify(session.pages[reader.id])).toContain('"text":"H"')
    session.activate('play')
    session.advanceText(100)
    session.refreshPages()
    expect(JSON.stringify(session.pages[reader.id])).toContain('"text":"He"')
    session.activate('play')
    session.refreshPages()
    expect(JSON.stringify(session.pages[reader.id])).toContain('"text":"Hello"')
    expect(session.logs.map((entry) => entry.text)).toEqual(['playing', 'done'])
    session.activate('play')
    session.refreshPages()
    expect(JSON.stringify(session.pages[reader.id])).not.toContain('Hello')
    expect(session.logs.map((entry) => entry.text)).toEqual(['playing', 'done', 'playing'])
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('saves the visit and game state, and keeps custom slots separate', () => {
    const collection: CollectionAsset = {
      id: 'items',
      type: 'collection',
      name: 'Items',
      relativePath: 'Collections/Items.collection.json',
      masterKeyId: 'name',
      fields: [
        { id: 'name', name: 'Name', type: 'text', presets: [], enforcePresets: false },
        { id: 'rare', name: 'Rare', type: 'boolean', presets: [], enforcePresets: false }
      ],
      entries: [{ id: 'a', values: { name: 'Iron Sword', rare: false } }]
    }
    const asset = createAsset('book', 'Journal', 'Books/Journal.book.json', 'journal')
    if (asset.type !== 'book') throw new Error('expected a book')
    const journal: BookAsset = asset
    journal.chapters[0].name = 'Chapter'
    journal.chapters[0].pages[0].name = 'Page'
    const main = menu(
      'main',
      'rooms/Main Menu.menu.json',
      `function onLoad()
        if game.state.ready then return end
        game.state.ready = true
        game.state.gold = 1
        game.state.items = game.loadCollection("Collections/Items")
        game.state.book = game.loadBook("Books/Journal")
        game.state.page = game.state.book:openPage("Chapter/Page")
        game.state.fn = function() end
        print(game.state.items.type .. " " .. game.state.items.path)
        print(game.state.book.type .. " " .. game.state.book.path)
        print(game.state.page.type .. " " .. game.state.page.path)
      end`,
      [
        button(
          'play',
          'play',
          `function onInteract()
            game.state.n = (game.state.n or 0) + 1
            if game.state.n == 1 then
              game.state.gold = 9
              game.state.items:set("Iron Sword", "Rare", true)
              game.state.note = "kept"
              game.saveSlot(1, "characters/Hero")
              local info = game.slotInfo(1)
              print(info.image)
              print(type(info.time) == "string" and "timed" or "notime")
              print(game.slotInfo(2) == nil and "empty" or "full")
              game.customSaveSlot(1, { gold = 3 }, { label = "Morning" })
              game.state.gold = 1
              game.state.items:set("Iron Sword", "Rare", false)
              game.loadSlot(1)
              print(tostring(game.state.gold))
              local sword = game.state.items:get("Iron Sword")
              print(sword:get("Rare") and "rare" or "common")
              print(game.state.note)
              print(game.state.fn == nil and "nofn" or "fn")
              print(game.state.book.type)
              print(game.state.page.path)
              print(game.currentModal == nil and "nomodal" or "modal")
              local data = game.customLoadSlot(1)
              print(tostring(data.gold))
              print(game.customSlotInfo(1).label)
              print(game.slotInfo(1).image)
            elseif game.state.n == 2 then
              local loop = {}
              loop.self = loop
              game.state.loop = loop
              game.saveSlot(2)
            else
              print(game.slotInfo(2) == nil and "still empty" or "filled")
            end
          end`
        )
      ]
    )
    const session = start([main, collection, journal, hero, plate, plateButton], 'main')
    session.activate('play')
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
    expect(session.logs.map((entry) => entry.text)).toEqual([
      'collection Collections/Items',
      'book Books/Journal',
      'page Chapter/Page',
      'characters/Hero',
      'timed',
      'empty',
      '9.0',
      'rare',
      'kept',
      'nofn',
      'book',
      'Chapter/Page',
      'nomodal',
      '3.0',
      'Morning',
      'characters/Hero'
    ])
    session.activate('play')
    expect(session.logs.some((entry) => entry.tone === 'error' && entry.text.includes('cannot contain a table that refers to itself'))).toBe(true)
    session.activate('play')
    expect(session.logs.at(-1)?.text).toBe('still empty')
  })

  it('leaves Forward menus out of a save and does not reopen a modal', () => {
    const confirm = menu(
      'confirm',
      'Confirm.menu.json',
      '',
      [
        button(
          'ok',
          'ok',
          `function onInteract()
            game.saveSlot(1)
            game.loadSlot(1)
          end`
        )
      ]
    )
    const town = menu('town', 'Town.menu.json', '', [])
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.state.opens = (game.state.opens or 0) + 1
        if game.state.opens == 1 then
          game.openModal("Confirm")
        end
      end`,
      [
        button('go', 'go', `function onInteract() game.openMenu("Town") end`),
        button('save', 'save', `function onInteract() game.saveSlot(1) game.loadSlot(1) end`)
      ]
    )
    const session = start([main, town, confirm, plate, plateButton], 'main')
    expect(session.modals).toHaveLength(1)
    session.activate('ok')
    expect(session.modals).toHaveLength(0)
    expect(session.frames).toHaveLength(1)
    session.activate('go')
    session.back()
    expect(session.frames).toHaveLength(2)
    session.activate('save')
    expect(session.frames.map((frame) => frame.menuId)).toEqual(['main'])
    expect(session.index).toBe(0)
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('loads a slot from storage and refuses the other kind of file', () => {
    const port = memorySavePort()
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        game.state.gold = game.state.gold or 1
      end`,
      [
        button(
          'play',
          'play',
          `function onInteract()
            game.state.gold = 6
            game.saveSlot(1)
            game.customSaveSlot(1, { gold = 4 }, { label = "A" })
            game.exportSaves()
            game.exportCustomSaves()
          end`
        ),
        button(
          'load',
          'load',
          `function onInteract()
            game.loadSlot(1)
            print(tostring(game.state.gold))
            print(game.customSlotInfo(1).label)
          end`
        ),
        button(
          'bring',
          'bring',
          `function onInteract()
            game.importSaves()
            print(game.slotInfo(1) == nil and "gone" or "kept")
          end`
        )
      ]
    )
    const assets = [main, plate, plateButton]
    const session = new PlaySession()
    session.attachSaves(port)
    session.assetsOf = () => assets
    session.reset('main')
    session.activate('play')
    expect(port.exported).toHaveLength(2)
    expect(port.files.saves).toContain('"kind": "saves"')
    expect(port.files.customSaves).toContain('"kind": "customSaves"')
    const again = new PlaySession()
    again.attachSaves(port)
    again.assetsOf = () => assets
    again.reset('main')
    again.activate('load')
    expect(again.logs.map((entry) => entry.text)).toEqual(['6.0', 'A'])
    const saved = port.files.saves ?? ''
    port.files.saves = documentText(emptyDocument('saves'))
    again.activate('bring')
    expect(again.logs.at(-1)?.text).toBe('gone')
    port.files.saves = documentText({ kind: 'customSaves', slots: {} })
    again.activate('bring')
    expect(again.logs.some((entry) => entry.tone === 'error' && entry.text.includes('That file is for the other kind of save.'))).toBe(true)
    expect(again.logs.at(-1)?.text).toBe('gone')
    port.files.saves = saved
    expect(again.logs.filter((entry) => entry.tone === 'error').map((entry) => entry.text)).toEqual([
      expect.stringContaining('That file is for the other kind of save.')
    ])
  })

  it('reports an empty slot, a bad index, and a missing icon', () => {
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onLoad()
        local function attempt(fn)
          local ok, err = pcall(fn)
          print(ok and "ok" or err)
        end
        attempt(function() game.loadSlot(1) end)
        attempt(function() game.saveSlot(0) end)
        attempt(function() game.saveSlot(1, "missing/Icon") end)
        attempt(function() game.customLoadSlot(1) end)
      end`,
      []
    )
    const session = start([main], 'main')
    const text = session.logs.map((entry) => entry.text).join('\n')
    expect(text).toContain('That save slot is empty.')
    expect(text).toContain('A save slot starts at 1.')
    expect(text).toContain('No image at "missing/Icon".')
    expect(session.frames[0]?.menuId).toBe('main')
  })

  it('rejects a save file from the other kind', () => {
    expect(() => parseDocument(documentText({ kind: 'customSaves', slots: {} }), 'saves')).toThrow('That file is for the other kind of save.')
    expect(() => parseDocument('{', 'saves')).toThrow('That save file could not be read.')
    expect(emptyDocument('saves').slots).toEqual({})
  })

  it('gives each copy the property declared by its script', () => {
    const play = button(
      'play',
      'play',
      `---@property targetPage bookPage "Next Page"
function onInteract()
  print(targetPage.book .. " " .. targetPage.page)
end`
    )
    play.properties = { targetPage: encodeBookPage('Books/Journal', 'Chapter/Page') }
    const label = createMenuComponent('label', [])
    label.id = 'label'
    label.handle = 'label'
    const badge = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    badge.script = `---@property caption text "Caption"
function onLoad()
  print(caption)
end
`
    badge.components = [label]
    const one = createMenuComponent('composite', [])
    const two = createMenuComponent('composite', [])
    one.id = 'one'
    two.id = 'two'
    one.handle = 'one'
    two.handle = 'two'
    one.properties = { caption: 'A' }
    two.properties = { caption: 'B' }
    if (one.type === 'composite') one.compositeId = 'badge'
    if (two.type === 'composite') two.compositeId = 'badge'
    const main = menu('main', 'Main Menu.menu.json', '', [play, one, two])
    const session = start([main, plate, plateButton, badge], 'main')
    expect(session.logs.map((entry) => entry.text)).toEqual(['A', 'B'])
    session.activate('play')
    expect(session.logs.map((entry) => entry.text)).toEqual(['A', 'B', 'Books/Journal Chapter/Page'])
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('reads string, integer, and float properties', () => {
    const script = `---@property title string "Title"
---@property count integer "Count"
---@property scale float "Scale"
function onInteract()
  if title == "Go" and count == 3 and scale == 1.25 then print("set") end
  if title == "" and count == 0 and scale == 0 then print("empty") end
end`
    const filled = button('filled', 'filled', script)
    filled.properties = { title: 'Go', count: 3.9, scale: 1.25 }
    const blank = button('blank', 'blank', script)
    const main = menu('main', 'Main Menu.menu.json', '', [filled, blank])
    const session = start([main, plate, plateButton], 'main')
    session.activate('filled')
    session.activate('blank')
    expect(session.logs.map((entry) => entry.text)).toEqual(['set', 'empty'])
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('reads a tilemap cell and paints another without changing the saved map', () => {
    const picture = image('img', 'Dungeon', 'Dungeon.image.json')
    picture.width = 64
    picture.height = 64
    const tileset = createAsset('tileset', 'Dungeon', 'tiles/Dungeon.tileset.json', 'dungeon')
    if (tileset.type !== 'tileset') throw new Error('tileset')
    tileset.imageId = 'img'
    tileset.tileWidth = 32
    tileset.tileHeight = 32
    const map = createMenuComponent('tilemap', [])
    if (map.type !== 'tilemap') throw new Error('tilemap')
    map.id = 'ground'
    map.handle = 'ground'
    map.tilesetId = 'dungeon'
    map.tileWidth = 32
    map.tileHeight = 32
    map.width = 64
    map.height = 32
    map.cells = [{ x: 0, y: 0, tileX: 0, tileY: 1, tilesetId: 'dungeon' }]
    const mark = createMenuComponent('image', [])
    mark.id = 'mark'
    mark.handle = 'mark'
    const icon = createMenuComponent('tile', [])
    if (icon.type !== 'tile') throw new Error('tile')
    icon.id = 'icon'
    icon.handle = 'icon'
    icon.tilesetId = 'dungeon'
    const main = menu(
      'main',
      'Explore Menu.menu.json',
      `function onUpdate(dt)
        local path, column, row = self.ground:getTile(0, 0)
        self.mark.x = column
        self.mark.y = row
        self.ground:setTile(1, 0, "tiles/Dungeon", 1, 0)
        self.icon:setTile("tiles/Dungeon", 1, 0)
      end`,
      [map, mark, icon]
    )
    const session = start([main, picture, tileset], 'main')
    session.tick(16)
    expect(session.currentOverrides().mark?.x).toBe(0)
    expect(session.currentOverrides().mark?.y).toBe(1)
    expect(session.currentOverrides().ground?.cells).toEqual([
      { x: 0, y: 0, tileX: 0, tileY: 1, tilesetId: 'dungeon' },
      { x: 1, y: 0, tileX: 1, tileY: 0, tilesetId: 'dungeon' }
    ])
    expect(map.cells).toEqual([{ x: 0, y: 0, tileX: 0, tileY: 1, tilesetId: 'dungeon' }])
    expect(session.currentOverrides().icon).toMatchObject({ tilesetRef: 'tiles/Dungeon', tileX: 1, tileY: 0 })
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('checks collider overlap on a menu without seeing the scene behind a viewer', () => {
    const hero = createMenuComponent('collider', [])
    const solid = createMenuComponent('collider', [])
    if (hero.type !== 'collider' || solid.type !== 'collider') throw new Error('collider')
    hero.id = 'hero'
    hero.handle = 'hero'
    hero.tags = ['body']
    hero.x = 0
    hero.y = 0
    hero.width = 40
    hero.height = 40
    solid.id = 'solid'
    solid.handle = 'solid'
    solid.tags = ['solid']
    solid.x = 20
    solid.y = 0
    solid.width = 40
    solid.height = 40
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    const wall = createMenuComponent('collider', [])
    const other = createMenuComponent('collider', [])
    if (wall.type !== 'collider' || other.type !== 'collider') throw new Error('collider')
    wall.id = 'wall'
    wall.handle = 'wall'
    wall.tags = ['scene']
    wall.x = 0
    wall.y = 0
    wall.width = 20
    wall.height = 20
    other.id = 'other'
    other.handle = 'other'
    other.tags = ['scene']
    other.x = 10
    other.y = 0
    other.width = 20
    other.height = 20
    town.components = [wall, other]
    town.script = `function onUpdate(dt)
      local hits = self.wall:collisionWith({"scene"})
      print("scene hits " .. #hits)
      print("scene x " .. string.format("%d", hits[1].x))
      print("scene at " .. #self:collisionAt(4, 4, {"scene"}))
      print("scene menu " .. #self:collisionAt(4, 4, {"menu"}))
    end`
    const camera = createMenuComponent('sceneViewer', [])
    if (camera.type !== 'sceneViewer') throw new Error('scene viewer')
    camera.id = 'camera'
    camera.handle = 'camera'
    camera.sceneId = 'town'
    const main = menu(
      'main',
      'Explore Menu.menu.json',
      `function onUpdate(dt)
        local hits = self.hero:collisionWith({"solid"})
        print("menu hits " .. #hits)
        print("menu x " .. string.format("%d", hits[1].x))
        print("menu y " .. string.format("%d", hits[1].y))
        print("menu tag " .. hits[1].collider.tags[1])
        print("menu at " .. #self:collisionAt(24, 4, {"solid"}))
        print("menu scene " .. #self:collisionAt(4, 4, {"scene"}))
        print("menu none " .. #self.hero:collisionWith({}))
        self.solid.x = 100
        print("menu moved " .. #self.hero:collisionWith({"solid"}))
      end`,
      [hero, solid, camera]
    )
    const session = start([main, town], 'main')
    session.tick(16)
    expect(session.logs.map((entry) => entry.text)).toEqual([
      'menu hits 1',
      'menu x 20',
      'menu y 0',
      'menu tag solid',
      'menu at 1',
      'menu scene 0',
      'menu none 0',
      'menu moved 0',
      'scene hits 1',
      'scene x 10',
      'scene at 1',
      'scene menu 0'
    ])
    expect(session.currentOverrides().solid?.x).toBe(100)
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('checks collisionAt in a composite\'s own pixels', () => {
    const piece = createMenuComponent('collider', [])
    if (piece.type !== 'collider') throw new Error('collider')
    piece.id = 'piece'
    piece.handle = 'piece'
    piece.tags = ['solid']
    piece.x = 0
    piece.y = 0
    piece.width = 10
    piece.height = 10
    const card = createAsset('composite', 'Card', 'Card.composite.json', 'card') as CompositeAsset
    card.components = [piece]
    card.script = `function onLoad()
      print("card at " .. #self:collisionAt(2, 2, {"solid"}))
      print("card miss " .. #self:collisionAt(20, 20, {"solid"}))
    end`
    const slot = createMenuComponent('composite', [])
    if (slot.type !== 'composite') throw new Error('slot')
    slot.id = 'card'
    slot.handle = 'card'
    slot.compositeId = 'card'
    slot.x = 100
    slot.y = 100
    const main = menu('main', 'Main Menu.menu.json', '', [slot])
    const session = start([main, card], 'main')
    expect(session.logs.map((entry) => entry.text)).toEqual(['card at 1', 'card miss 0'])
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('reports the pointer in menu pixels and in a composite', () => {
    const card = createAsset('composite', 'Card', 'Card.composite.json', 'card') as CompositeAsset
    card.width = 40
    card.height = 20
    card.script = `function onMouseDown()
      print("card down")
    end`
    const slot = createMenuComponent('composite', [])
    if (slot.type !== 'composite') throw new Error('slot')
    slot.id = 'card'
    slot.handle = 'card'
    slot.compositeId = 'card'
    slot.x = 100
    slot.y = 50
    slot.width = 40
    slot.height = 20
    const main = menu(
      'main',
      'Main Menu.menu.json',
      `function onMouseEnter()
        print("menu enter")
      end
      function onMouseDown()
        local point = game.getMousePosition()
        print("game " .. string.format("%d", point.x) .. " " .. string.format("%d", point.y))
        local here = self:getMousePosition()
        print("menu " .. string.format("%d", here.x) .. " " .. string.format("%d", here.y))
      end
      function onUpdate(dt)
        local here = self.card:getMousePosition()
        if here ~= nil then print("card " .. string.format("%d", here.x) .. " " .. string.format("%d", here.y)) end
      end`,
      [slot]
    )
    const session = start([main, card], 'main')
    session.tick(16)
    expect(session.logs.map((entry) => entry.text)).toEqual([])
    session.setPointer({ x: 110, y: 60 }, { width: main.width, height: main.height })
    session.pointerDown()
    session.tick(16)
    expect(session.logs.map((entry) => entry.text)).toEqual(['menu enter', 'card down', 'game 110 60', 'menu 110 60', 'card 10 10'])
    expect(session.logs.filter((entry) => entry.tone === 'error')).toEqual([])
  })

  it('sets z on a component inside a Z field and leaves the saved number alone', () => {
    const hero = createMenuComponent('label', [])
    hero.id = 'hero'
    hero.handle = 'hero'
    hero.y = 40
    hero.z = 2
    const field = createMenuComponent('zField', [])
    if (field.type !== 'zField') throw new Error('field')
    field.id = 'layer'
    field.children = [hero]
    const back = createMenuComponent('label', [])
    back.id = 'back'
    back.handle = 'back'
    const main = menu(
      'main',
      'Main.menu.json',
      `function onUpdate()
        print(self.hero.z)
        self.hero.z = self.hero.y
        print(self.hero.z)
        self.back.z = 1
      end`,
      [field, back]
    )
    const session = start([main], 'main')
    session.tick(16)
    expect(session.logs.filter((entry) => entry.tone !== 'error').map((entry) => entry.text)).toEqual(['2.0', '40.0'])
    expect(session.currentOverrides().hero?.z).toBe(40)
    expect(hero.z).toBe(2)
    expect(session.currentOverrides().back?.z).toBeUndefined()
    expect(session.logs.some((entry) => entry.tone === 'error' && entry.text.includes('Z field'))).toBe(true)
  })
})
