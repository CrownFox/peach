import { describe, expect, it } from 'vitest'
import { PlaySession } from './playSession'
import { createAsset, createMenuComponent, createPageViewerComponent } from './assets'
import { encodeBookPage, plainMarks } from './books'
import { documentText, emptyDocument, memorySavePort, parseDocument } from './saves'
import type { Asset, BookAsset, ButtonAsset, CollectionAsset, CompositeAsset, ImageAsset, MenuAsset, MenuComponent } from './types'

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
})
