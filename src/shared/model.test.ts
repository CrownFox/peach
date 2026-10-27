import { describe, expect, it } from 'vitest'
import { assetDocument, createAsset, createButtonAsset, createButtonComponent, createMenuComponent, createPageViewerComponent, createPanelAsset, duplicateMenuComponent, parseAsset, parseMeta, planDuplicate } from './assets'
import { intrinsicSize } from './intrinsicSize'
import { resizeRect, snapTilemapSize, snapToGrid } from './resize'
import { fillRegion, lineCells, mapSize, placedTile, pruneCells, tileAtPoint, tileSheet, tilemapCellSize } from './tiles'
import { writeComponentProperty, type SceneOverrides } from './overrides'
import { buildScene, devicePixelScale, fitFrame, fittedBorderWidths, nineSliceLayout, snapNineSlice } from './scene'
import { assetLocation, sanitizeFileStem, uniqueName } from './paths'
import { buildTree, expandFolderPath, planTreeMove, remapMovedPaths } from './tree'
import type { Asset, ButtonAsset, CompositeAsset, ImageAsset, MenuAsset, SceneAsset } from './types'

function image(id: string, name: string, relativePath: string, file: string | null): ImageAsset {
  return { id, type: 'image', name, relativePath, file, width: 64, height: 32, format: 'png' }
}

function button(id: string, name: string, relativePath: string, imageId: string | null): ButtonAsset {
  return {
    id,
    type: 'button',
    name,
    relativePath,
    mode: 'nine-panel',
    slices: { left: 8, right: 8, top: 4, bottom: 4 },
    edgeFill: 'stretch',
    centerFill: 'stretch',
    states: { default: imageId, pressed: null, disabled: null }
  }
}

describe('names', () => {
  it('numbers copies without repeating the word copy', () => {
    expect(uniqueName(['Menu', 'Menu copy'], 'Menu copy')).toBe('Menu copy 2')
  })

  it('treats windows reserved names as unsafe filenames', () => {
    expect(sanitizeFileStem('CON')).toBe('CON_')
    expect(sanitizeFileStem('Main: Menu')).toBe('Main Menu')
  })
})

describe('tree', () => {
  it('puts folders before assets and nests them under root', () => {
    const assets: Asset[] = [image('img', 'Zebra', 'UI/zebra.image.json', 'UI/zebra.png'), image('img2', 'Alpha', 'alpha.image.json', null)]
    const tree = buildTree(['UI'], assets)
    expect(tree.name).toBe('Root')
    expect(tree.children.map((child) => child.name)).toEqual(['UI', 'Alpha'])
    expect(tree.children[0]?.children.map((child) => child.name)).toEqual(['Zebra'])
  })

  it('opens a collapsed folder and its parents when an item is added there', () => {
    expect(expandFolderPath([''], 'UI/Menus')).toEqual(['', 'UI/Menus', 'UI'])
    expect(expandFolderPath(['', 'UI'], 'UI')).toEqual(['', 'UI'])
    expect(expandFolderPath([], '')).toEqual([''])
  })

  it('plans a move into another folder and rejects a folder dropped into itself', () => {
    expect(
      planTreeMove({
        sourcePath: 'Menu.menu.json',
        sourceIsFolder: false,
        destFolder: 'UI',
        folders: ['UI'],
        assetPaths: ['Menu.menu.json']
      })
    ).toEqual({ destination: 'UI/Menu.menu.json' })
    expect(
      planTreeMove({
        sourcePath: 'UI',
        sourceIsFolder: true,
        destFolder: 'Art',
        folders: ['UI', 'Art'],
        assetPaths: []
      })
    ).toEqual({ destination: 'Art/UI' })
    expect(
      planTreeMove({
        sourcePath: 'UI/Menu.menu.json',
        sourceIsFolder: false,
        destFolder: 'UI',
        folders: ['UI'],
        assetPaths: ['UI/Menu.menu.json']
      })
    ).toBeNull()
    expect(() =>
      planTreeMove({
        sourcePath: 'UI',
        sourceIsFolder: true,
        destFolder: 'UI/Buttons',
        folders: ['UI', 'UI/Buttons'],
        assetPaths: []
      })
    ).toThrow('A folder cannot be moved into itself.')
    expect(() =>
      planTreeMove({
        sourcePath: 'Menu.menu.json',
        sourceIsFolder: false,
        destFolder: 'UI',
        folders: ['UI'],
        assetPaths: ['Menu.menu.json', 'UI/Menu.button.json']
      })
    ).toThrow('That name is already used in this folder.')
    expect(remapMovedPaths(['', 'UI', 'UI/Buttons'], 'UI', 'Art/UI', true)).toEqual(['', 'Art/UI', 'Art/UI/Buttons', 'Art'])
  })

  it('uses the folder path without the asset suffix', () => {
    expect(assetLocation('rooms/Main Menu.menu.json')).toBe('rooms/Main Menu')
    expect(assetLocation('Main Menu.image.json')).toBe('Main Menu')
  })
})

describe('duplicate', () => {
  it('keeps shared button references when a menu is duplicated alone', () => {
    const assets: Asset[] = [
      image('img', 'Plate', 'plate.image.json', 'plate.png'),
      button('btn', 'Plate', 'plate.button.json', 'img'),
      {
        id: 'menu',
        type: 'menu',
        name: 'Main',
        relativePath: 'main.menu.json',
        width: 880,
        height: 495,
        gridSize: 16,
        snapToGrid: false,
        scriptId: null,
        script: '',
        components: [
          {
            id: 'component',
            type: 'button',
            name: 'Play',
            handle: '',
            scriptId: null,
            script: '',
            x: 0,
            y: 0,
            width: 20,
            height: 10,
            buttonId: 'btn',
            enabled: true,
            text: 'Play',
            fontFamily: 'Arial, sans-serif',
            fontSize: 40,
            color: '#ffffff',
            tint: '#ffffff',
            visible: true
          }
        ]
      }
    ]
    let next = 0
    const plan = planDuplicate({
      assets,
      targetPath: 'main.menu.json',
      siblingStems: ['plate', 'main'],
      ids: () => `new-${next++}`
    })
    const copy = plan.assets[0] as MenuAsset
    expect(copy.id).not.toBe('menu')
    expect(copy.components[0]?.id).not.toBe('component')
    expect(copy.components[0]?.type).toBe('button')
    if (copy.components[0]?.type === 'button') expect(copy.components[0].buttonId).toBe('btn')
    expect(plan.copies).toEqual([])
  })

  it('remaps images inside a duplicated folder and leaves outside references shared', () => {
    const assets: Asset[] = [
      image('inside', 'Inside', 'UI/inside.image.json', 'UI/inside.png'),
      image('outside', 'Outside', 'outside.image.json', 'outside.png'),
      button('btn', 'Use both', 'UI/use.button.json', 'inside')
    ]
    const buttonAsset = assets[2] as ButtonAsset
    buttonAsset.states.pressed = 'outside'
    let next = 0
    const plan = planDuplicate({
      assets,
      folders: ['UI'],
      targetPath: 'UI',
      siblingStems: ['UI', 'outside'],
      ids: () => `new-${next++}`
    })
    const copiedButton = plan.assets.find((asset) => asset.type === 'button') as ButtonAsset
    const copiedInside = plan.assets.find((asset) => asset.type === 'image' && asset.name === 'Inside') as ImageAsset
    expect(copiedButton.states.default).toBe(copiedInside.id)
    expect(copiedButton.states.pressed).toBe('outside')
    expect(copiedInside.file).toBe('UI copy/inside.png')
    expect(plan.copies).toEqual([{ fromRelative: 'UI/inside.png', toRelative: 'UI copy/inside.png' }])
  })
})

describe('scene', () => {
  const plate = image('img', 'Plate', 'plate.image.json', 'plate.png')
  const pressed = image('pressed', 'Pressed', 'pressed.image.json', 'pressed.png')
  const buttonAsset = button('btn', 'Plate', 'plate.button.json', 'img')
  buttonAsset.states.pressed = 'pressed'
  const menu: MenuAsset = {
    id: 'menu',
    type: 'menu',
    name: 'Main',
    relativePath: 'main.menu.json',
    width: 880,
    height: 495,
    gridSize: 16,
    snapToGrid: false,
    scriptId: null,
    script: '',
    components: [
      {
        id: 'play',
        type: 'button',
        name: 'Play',
        handle: '',
        scriptId: null,
        script: '',
        x: 10,
        y: 20,
        width: 30,
        height: 12,
        buttonId: 'btn',
        enabled: true,
        text: 'Play',
        fontFamily: 'Arial, sans-serif',
        fontSize: 40,
        color: '#fff',
        tint: '#ffffff',
        visible: true
      }
    ]
  }

  it('uses the pressed image while a button is held and falls back when it is missing', () => {
    const pressedScene = buildScene(menu, [plate, pressed, buttonAsset], { pressedId: 'play' })
    expect(pressedScene[0]?.imagePath).toBe('pressed.png')
    expect(pressedScene[0]?.slices).toEqual({ left: 8, right: 8, top: 4, bottom: 4 })
    expect(pressedScene[0]?.text?.value).toBe('Play')
    const fallback = buildScene(menu, [plate, { ...buttonAsset, states: { ...buttonAsset.states, pressed: null } }], {
      pressedId: 'play'
    })
    expect(fallback[0]?.imagePath).toBe('plate.png')
  })

  it('places a component from a script position', () => {
    const scene = buildScene(menu, [plate, pressed, buttonAsset], { overrides: { play: { x: 110, y: 40 } } })
    expect(scene[0]?.x).toBeCloseTo((110 / 880) * 100)
    expect(scene[0]?.y).toBeCloseTo((40 / 495) * 100)
  })

  it('frames a scene through a viewer and keeps pixel size when asked', () => {
    const town = createAsset('scene', 'Town', 'Town.scene.json', 'town') as SceneAsset
    town.width = 400
    town.height = 300
    const hero = createMenuComponent('image', [])
    hero.id = 'hero'
    hero.x = 10
    hero.y = 20
    hero.width = 8
    hero.height = 8
    town.components = [hero]
    const viewer = createMenuComponent('sceneViewer', [])
    viewer.id = 'camera'
    viewer.x = 0
    viewer.y = 0
    viewer.width = 200
    viewer.height = 100
    if (viewer.type === 'sceneViewer') {
      viewer.sceneId = 'town'
      viewer.scale = 2
    }
    const host = { ...menu, components: [viewer] }
    const framed = buildScene(host, [town])
    expect(framed[0]?.x).toBeCloseTo((20 / 880) * 100)
    expect(framed[0]?.y).toBeCloseTo((40 / 495) * 100)
    expect(framed[0]?.width).toBeCloseTo((16 / 880) * 100)
    expect(framed[0]?.id).toBe('camera::hero')
    if (viewer.type === 'sceneViewer') viewer.scaleWithViewer = false
    const pixels = buildScene(host, [town], { displayScale: 2 })
    expect(pixels[0]?.x).toBeCloseTo((10 / 880) * 100)
    expect(pixels[0]?.width).toBeCloseTo((8 / 880) * 100)
    hero.x = 190
    const hidden = buildScene(host, [town])
    expect(hidden).toEqual([])
  })

  it('uses play-session text, artwork, and the disabled state', () => {
    const disabled = image('disabled', 'Disabled', 'disabled.image.json', 'disabled.png')
    const withDisabled = { ...buttonAsset, states: { ...buttonAsset.states, disabled: 'disabled' } }
    const scene = buildScene(menu, [plate, pressed, disabled, withDisabled], {
      pressedId: 'play',
      overrides: { play: { text: 'Move Forward', enabled: false } }
    })
    expect(scene[0]?.text?.value).toBe('Move Forward')
    expect(scene[0]?.enabled).toBe(false)
    expect(scene[0]?.imagePath).toBe('disabled.png')
  })

  it('stretches static buttons instead of slicing them', () => {
    const scene = buildScene(menu, [plate, { ...buttonAsset, mode: 'static' }], {})
    expect(scene[0]?.slices).toBeNull()
  })

  it('letterboxes a wide menu inside a square window', () => {
    expect(fitFrame(1000, 1000, 880, 495)).toEqual({ width: 1000, height: 562 })
  })

  it('pillarboxes a menu inside a short wide window', () => {
    expect(fitFrame(2000, 500, 880, 495)).toEqual({ width: 888, height: 500 })
  })

  it('stretches a panel from its source insets', () => {
    const art = image('art', 'Frame', 'ui/Frame.image.json', 'ui/frame.png')
    const panel = { ...createPanelAsset('frame', 'Frame', 'ui/Frame.panel.json'), imageId: 'art', slices: { left: 6, right: 6, top: 2, bottom: 2 } }
    const scene = buildScene(
      {
        ...menu,
        components: [
          {
            id: 'plate',
            type: 'panel',
            name: 'Plate',
            handle: '',
            scriptId: null,
            script: '',
            x: 0,
            y: 0,
            width: 80,
            height: 40,
            panelId: 'frame',
            tint: '#ffffff',
            visible: true
          }
        ]
      },
      [art, panel]
    )
    expect(scene[0]?.imagePath).toBe('ui/frame.png')
    expect(scene[0]?.slices).toEqual({ left: 6, right: 6, top: 2, bottom: 2 })
    expect(scene[0]?.control).toBeNull()
  })

  it('fills a meter from its value and clamps a slider written by a script', () => {
    const meter = {
      id: 'hp',
      type: 'meter' as const,
      name: 'HP',
      handle: 'hp',
      scriptId: null,
      script: '',
      x: 0,
      y: 0,
      width: 40,
      height: 8,
      min: 0,
      max: 100,
      value: 25,
      fillColor: '#e8946a',
      panelId: null,
      tint: '#ffffff',
      visible: true
    }
    const slider = { ...meter, id: 'pace', type: 'slider' as const, name: 'Pace', handle: 'pace', step: 10, value: 0 }
    const withControls = { ...menu, components: [meter, slider] }
    expect(buildScene(withControls, [], {})[0]?.fill).toBe(0.25)
    const overrides: SceneOverrides = {}
    writeComponentProperty(withControls, 'pace', overrides, 'value', 250, [])
    expect(overrides).toEqual({ pace: { value: 100 } })
    writeComponentProperty(withControls, 'pace', overrides, 'value', null, [])
    expect(overrides.pace?.value).toBeUndefined()
  })

  it('shrinks 9-panel borders to fit a small component', () => {
    const border = fittedBorderWidths({ left: 30, right: 30, top: 10, bottom: 10 }, 40, 100)
    expect(border.left).toBeCloseTo(20)
    expect(border.right).toBeCloseTo(20)
    expect(border.top).toBeCloseTo(20 / 3)
    expect(border.bottom).toBeCloseTo(20 / 3)
  })

  it('keeps a 9-panel edge at its inset in screen pixels', () => {
    const slices = { left: 9, right: 5, top: 9, bottom: 5 }
    const atScreenScale = nineSliceLayout({
      slices,
      imageWidth: 40,
      imageHeight: 40,
      boxWidth: 200,
      boxHeight: 120,
      scaleX: 1,
      scaleY: 1,
      edgeFill: 'stretch',
      centerFill: 'stretch'
    })
    const corner = atScreenScale.find((patch) => patch.dx === 0 && patch.dy === 0)
    expect(corner?.dw).toBe(9)
    expect(corner?.dh).toBe(9)
    const cramped = nineSliceLayout({
      slices: { left: 9, right: 9, top: 9, bottom: 9 },
      imageWidth: 40,
      imageHeight: 40,
      boxWidth: 10,
      boxHeight: 80,
      scaleX: 1,
      scaleY: 1,
      edgeFill: 'stretch',
      centerFill: 'stretch'
    })
    expect(cramped.find((patch) => patch.dx === 0 && patch.dy === 0)?.dw).toBeCloseTo(5)
    const pixel = devicePixelScale(2)
    const onHighDensity = nineSliceLayout({
      slices,
      imageWidth: 40,
      imageHeight: 40,
      boxWidth: 400,
      boxHeight: 240,
      scaleX: pixel,
      scaleY: pixel,
      edgeFill: 'stretch',
      centerFill: 'stretch'
    })
    expect(onHighDensity.find((patch) => patch.dx === 0 && patch.dy === 0)?.dw).toBe(4.5)
    expect(onHighDensity.find((patch) => patch.dx === 0 && patch.dy === 0)?.dh).toBe(4.5)
    const top = onHighDensity.find((patch) => patch.sy === 0 && patch.sx === 9)
    expect(top?.dh).toBe(4.5)
    expect(top?.dw).toBe(393)
  })

  it('tiles edges along their length and tiles the center across and downward', () => {
    const patches = nineSliceLayout({
      slices: { left: 9, right: 9, top: 9, bottom: 9 },
      imageWidth: 30,
      imageHeight: 30,
      boxWidth: 200,
      boxHeight: 120,
      scaleX: 1,
      scaleY: 1,
      edgeFill: 'tile',
      centerFill: 'tile'
    })
    const top = patches.find((patch) => patch.sy === 0 && patch.sx === 9)
    const side = patches.find((patch) => patch.sx === 0 && patch.sy === 9)
    const center = patches.find((patch) => patch.sx === 9 && patch.sy === 9)
    expect(top).toMatchObject({ tileWidth: 12, tileHeight: 0, dh: 9 })
    expect(side).toMatchObject({ tileWidth: 0, tileHeight: 12, dw: 9 })
    expect(center).toMatchObject({ tileWidth: 12, tileHeight: 12 })
    const stretched = nineSliceLayout({
      slices: { left: 9, right: 9, top: 9, bottom: 9 },
      imageWidth: 30,
      imageHeight: 30,
      boxWidth: 200,
      boxHeight: 120,
      scaleX: 1,
      scaleY: 1,
      edgeFill: 'stretch',
      centerFill: 'stretch'
    })
    expect(stretched.every((patch) => patch.tileWidth === 0 && patch.tileHeight === 0)).toBe(true)
  })

  it('snaps 9-panel edges onto one shared device pixel', () => {
    const patches = nineSliceLayout({
      slices: { left: 9, right: 5, top: 9, bottom: 5 },
      imageWidth: 40,
      imageHeight: 40,
      boxWidth: 200.5,
      boxHeight: 120.25,
      scaleX: 1,
      scaleY: 1,
      edgeFill: 'tile',
      centerFill: 'tile'
    })
    const snapped = snapNineSlice(patches, 201, 120)
    expect(snapped.length).toBe(patches.length)
    expect(snapped.every((patch) => Number.isInteger(patch.dx) && Number.isInteger(patch.dy) && Number.isInteger(patch.dw) && Number.isInteger(patch.dh))).toBe(true)
    const corner = snapped.find((patch) => patch.sx === 0 && patch.sy === 0)
    const top = snapped.find((patch) => patch.sy === 0 && patch.sx === 9)
    const side = snapped.find((patch) => patch.sx === 0 && patch.sy === 9)
    expect(corner && top && side).toBeTruthy()
    expect(corner!.dx + corner!.dw).toBe(top!.dx)
    expect(corner!.dy + corner!.dh).toBe(side!.dy)
    expect(Math.min(...snapped.map((patch) => patch.dx))).toBe(0)
    expect(Math.min(...snapped.map((patch) => patch.dy))).toBe(0)
    expect(Math.max(...snapped.map((patch) => patch.dx + patch.dw))).toBe(201)
    expect(Math.max(...snapped.map((patch) => patch.dy + patch.dh))).toBe(120)
    expect(top!.tileWidth).toBeGreaterThan(0)
    expect(side!.tileHeight).toBeGreaterThan(0)
  })
})

describe('documents', () => {
  it('round-trips a panel and keeps a text component', () => {
    const panel = createPanelAsset('frame', 'Frame', 'ui/Frame.panel.json')
    const parsed = parseAsset(assetDocument(panel), 'moved/Frame.panel.json')
    expect(parsed).toMatchObject({ id: 'frame', type: 'panel', relativePath: 'moved/Frame.panel.json', imageId: null, edgeFill: 'stretch', centerFill: 'stretch' })
    const buttonAsset = createButtonAsset('ok', 'Ok', 'ui/Ok.button.json')
    buttonAsset.mode = 'nine-panel'
    buttonAsset.edgeFill = 'tile'
    buttonAsset.centerFill = 'tile'
    expect(parseAsset(assetDocument(buttonAsset), 'ui/Ok.button.json')).toMatchObject({ edgeFill: 'tile', centerFill: 'tile' })
    const legacy = assetDocument(buttonAsset)
    delete legacy.edgeFill
    delete legacy.centerFill
    expect(parseAsset(legacy, 'ui/Ok.button.json')).toMatchObject({ edgeFill: 'stretch', centerFill: 'stretch' })
    const menuDocument = assetDocument({
      id: 'menu',
      type: 'menu',
      name: 'Main',
      relativePath: 'main.menu.json',
      width: 880,
      height: 495,
      gridSize: 16,
      snapToGrid: false,
      scriptId: null,
      script: '',
      components: [
        {
          id: 'name',
          type: 'text',
          name: 'Name',
          handle: 'name',
          scriptId: null,
          script: '',
          x: 1,
          y: 2,
          width: 30,
          height: 10,
          value: 'Ada',
          placeholder: 'Name',
          fontFamily: 'Arial',
          fontSize: 20,
          color: '#fff',
          panelId: 'frame',
          tint: '#ffffff',
          visible: true
        }
      ]
    })
    const menuAsset = parseAsset(menuDocument, 'main.menu.json')
    expect(menuAsset.type === 'menu' ? menuAsset.components[0] : null).toMatchObject({ type: 'text', value: 'Ada', panelId: 'frame' })
  })

  it('round-trips an image without writing the editor path into the file', () => {
    const asset = image('img', 'Logo', 'UI/logo.image.json', 'UI/logo.png')
    const parsed = parseAsset(assetDocument(asset), 'elsewhere.image.json')
    expect(parsed).toMatchObject({ id: 'img', name: 'Logo', file: 'UI/logo.png', relativePath: 'elsewhere.image.json' })
    expect(assetDocument(asset)).not.toHaveProperty('relativePath')
  })

  it('reads a game title, author, and icon from project data', () => {
    expect(parseMeta({ name: 'Peach', author: 'Ada', icon: 'game-icon.png', entryMenuId: 'menu' }, 'Folder')).toEqual({
      formatVersion: 2,
      name: 'Peach',
      author: 'Ada',
      icon: 'game-icon.png',
      entryMenuId: 'menu'
    })
    expect(parseMeta({ name: 'Peach' }, 'Folder')).toMatchObject({ author: '', icon: null, entryMenuId: null })
  })

  it('keeps a component outside its canvas when its size is negative', () => {
    const parsed = parseAsset(
      {
        formatVersion: 2,
        id: 'menu',
        type: 'menu',
        name: 'Main',
        width: 200,
        height: 200,
        components: [{ id: 'pic', type: 'image', name: 'Pic', x: -40, y: 10, width: -30, height: 20, imageId: null }]
      },
      'Main.menu.json'
    )
    expect(parsed.type).toBe('menu')
    if (parsed.type !== 'menu') return
    expect(parsed.components[0]).toMatchObject({ x: -40, y: 10, width: -30, height: 20 })
    const copy = duplicateMenuComponent(parsed.components[0]!, parsed.components, 200, 200)
    expect(copy).toMatchObject({ x: -24, y: 26, width: -30, height: 20 })
    const node = buildScene(parsed, []).find((item) => item.id === 'pic')
    expect((node?.x ?? 0) / 100 * parsed.width).toBeCloseTo(-70)
    expect((node?.y ?? 0) / 100 * parsed.height).toBeCloseTo(10)
    expect((node?.width ?? 0) / 100 * parsed.width).toBeCloseTo(30)
    expect((node?.height ?? 0) / 100 * parsed.height).toBeCloseTo(20)
    expect(node?.flipX).toBe(true)
    expect(node?.flipY).toBe(false)
    expect(mapSize(-64, 32, 32, 32)).toEqual({ cols: 2, rows: 1 })
  })
})

describe('menu pixels', () => {
  it('converts a version 1 menu from percentages into pixels', () => {
    const parsed = parseAsset(
      {
        formatVersion: 1,
        id: 'menu',
        type: 'menu',
        name: 'Main',
        width: 880,
        height: 495,
        script: '',
        components: [{ id: 'panel', type: 'panel', name: 'Frame', x: 10, y: 20, width: 50, height: 25, panelId: null }]
      },
      'Main.menu.json'
    )
    expect(parsed.type).toBe('menu')
    if (parsed.type !== 'menu') return
    expect(parsed.components[0]).toMatchObject({ x: 88, y: 99, width: 440, height: 124 })
  })

  it('keeps an older image stretched and accepts a tiled image', () => {
    const parsed = parseAsset(
      {
        id: 'menu',
        type: 'menu',
        name: 'Main',
        width: 880,
        height: 495,
        components: [
          { id: 'old', type: 'image', name: 'Old', x: 0, y: 0, width: 40, height: 40, imageId: 'img' },
          { id: 'tile', type: 'image', name: 'Tile', x: 40, y: 0, width: 40, height: 40, imageId: 'img', fit: 'tile', tint: '#f00', visible: false }
        ]
      },
      'Main.menu.json'
    )
    expect(parsed.type).toBe('menu')
    if (parsed.type !== 'menu') return
    expect(parsed.components[0]).toMatchObject({ fit: 'stretch', tint: '#ffffff', visible: true })
    expect(parsed.components[1]).toMatchObject({ fit: 'tile', tint: '#ff0000', visible: false })
    const scene = buildScene(parsed, [image('img', 'Pattern', 'pattern.image.json', 'pattern.png')])
    expect(scene.map((node) => node.imageFit)).toEqual(['stretch', 'tile'])
    expect(scene.map((node) => node.color)).toEqual(['#ffffff', '#ff0000'])
    expect(scene.map((node) => node.visible)).toEqual([true, false])
  })

  it('keeps a page viewer scrollable unless Scrollable is turned off', () => {
    const viewer = createPageViewerComponent([])
    expect(viewer.scrollable).toBe(true)
    const menu = createAsset('menu', 'Main', 'Main.menu.json', 'menu')
    if (menu.type !== 'menu') throw new Error('expected a menu')
    menu.components = [viewer]
    expect(buildScene(menu, [])[0]?.scrollable).toBe(true)
    viewer.scrollable = false
    expect(buildScene(menu, [])[0]?.scrollable).toBe(false)
    const overrides: SceneOverrides = {}
    writeComponentProperty(menu, viewer.id, overrides, 'scrollable', true, [])
    expect(buildScene(menu, [], { overrides })[0]?.scrollable).toBe(true)
    expect(() => writeComponentProperty(menu, viewer.id, overrides, 'scrollable', 'no', [])).toThrow(/scrollable expects true or false/)
    const parsed = parseAsset(
      {
        id: 'menu',
        type: 'menu',
        name: 'Main',
        width: 880,
        height: 495,
        components: [{ id: 'reader', type: 'pageViewer', name: 'Reader', x: 0, y: 0, width: 100, height: 100 }]
      },
      'Main.menu.json'
    )
    if (parsed.type !== 'menu') throw new Error('expected a menu')
    expect(parsed.components[0]).toMatchObject({ type: 'pageViewer', scrollable: true })
  })

  it('combines a composite color with the color of a piece inside it', () => {
    const child = createMenuComponent('image', [])
    child.id = 'mark'
    child.tint = '#00ff00'
    const composite = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    composite.components = [child]
    const slot = createMenuComponent('composite', [])
    slot.id = 'slot'
    slot.tint = '#ff0000'
    if (slot.type === 'composite') slot.compositeId = 'badge'
    const menu: MenuAsset = {
      id: 'menu',
      type: 'menu',
      name: 'Main',
      relativePath: 'Main.menu.json',
      width: 880,
      height: 495,
      gridSize: 16,
      snapToGrid: false,
      scriptId: null,
      script: '',
      components: [slot]
    }
    const scene = buildScene(menu, [composite, image('img', 'Pattern', 'pattern.image.json', 'pattern.png')])
    expect(scene[0]?.color).toBe('#000000')
    const overrides: SceneOverrides = {}
    writeComponentProperty(menu, 'slot', overrides, 'color', '#808080', [])
    expect(buildScene(menu, [composite], { overrides })[0]?.color).toBe('#008000')
    expect(() => writeComponentProperty(menu, 'slot', overrides, 'color', 'red', [])).toThrow(/color expects/)
    child.visible = false
    expect(buildScene(menu, [composite])[0]?.visible).toBe(false)
    child.visible = true
    slot.visible = false
    expect(buildScene(menu, [composite])[0]?.visible).toBe(false)
    slot.visible = true
    writeComponentProperty(menu, 'slot/mark', overrides, 'visible', false, [composite])
    expect(buildScene(menu, [composite], { overrides })[0]?.visible).toBe(false)
    expect(() => writeComponentProperty(menu, 'slot/mark', overrides, 'visible', 'no', [composite])).toThrow(/visible expects/)
  })

  it('draws an 80 by 80 component as a square in pixels and two different percentages', () => {
    const menu: MenuAsset = {
      id: 'menu',
      type: 'menu',
      name: 'Main',
      relativePath: 'Main.menu.json',
      width: 880,
      height: 495,
      gridSize: 16,
      snapToGrid: false,
      scriptId: null,
      script: '',
      components: [
        {
          id: 'panel',
          type: 'panel',
          name: 'Frame',
          handle: '',
          scriptId: null,
          script: '',
          x: 80,
          y: 80,
          width: 80,
          height: 80,
          panelId: null,
          tint: '#ffffff',
          visible: true
        }
      ]
    }
    const scene = buildScene(menu, [])
    expect(menu.components[0]).toMatchObject({ width: 80, height: 80 })
    expect(scene[0]?.width).toBeCloseTo((80 / 880) * 100)
    expect(scene[0]?.height).toBeCloseTo((80 / 495) * 100)
    expect(scene[0]?.width).not.toBeCloseTo(scene[0]?.height ?? 0)
  })
})

describe('component copies', () => {
  it('copies a component beside the original with its own name and script id', () => {
    const source = createButtonComponent([])
    source.name = 'Play'
    source.handle = 'play'
    source.x = 10
    source.y = 20
    const copy = duplicateMenuComponent(source, [source])
    expect(copy.id).not.toBe(source.id)
    expect(copy.name).toBe('Play copy')
    expect(copy.handle).toBe('play2')
    expect(copy.x).toBe(26)
    expect(copy.y).toBe(36)
    expect(copy.type).toBe('button')
    const again = duplicateMenuComponent(source, [source, copy])
    expect(again.handle).toBe('play3')
    expect(again.name).toBe('Play copy 2')
  })
})

describe('composites', () => {
  it('keeps an 80 by 80 child square after the composite canvas is letterboxed into a slot', () => {
    const child = createMenuComponent('label', [])
    child.id = 'mark'
    child.x = 0
    child.y = 0
    child.width = 80
    child.height = 80
    const composite = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    composite.width = 160
    composite.height = 160
    composite.components = [child]
    const slot = createMenuComponent('composite', [])
    slot.id = 'slot'
    if (slot.type === 'composite') slot.compositeId = 'badge'
    slot.x = 0
    slot.y = 0
    slot.width = 200
    slot.height = 100
    const menu: MenuAsset = {
      id: 'menu',
      type: 'menu',
      name: 'Main',
      relativePath: 'Main.menu.json',
      width: 880,
      height: 495,
      gridSize: 16,
      snapToGrid: false,
      scriptId: null,
      script: '',
      components: [slot]
    }
    const scene = buildScene(menu, [composite])
    const pixelW = ((scene[0]?.width ?? 0) / 100) * menu.width
    const pixelH = ((scene[0]?.height ?? 0) / 100) * menu.height
    expect(pixelW).toBeCloseTo(50)
    expect(pixelH).toBeCloseTo(50)
    const pixelX = ((scene[0]?.x ?? 0) / 100) * menu.width
    expect(pixelX).toBeCloseTo(50)
  })

  it('mirrors the pieces inside a composite when its width is negative', () => {
    const child = createMenuComponent('image', [])
    child.id = 'mark'
    child.x = 0
    child.y = 0
    child.width = 20
    child.height = 20
    const composite = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    composite.width = 100
    composite.height = 100
    composite.components = [child]
    const slot = createMenuComponent('composite', [])
    slot.id = 'slot'
    if (slot.type !== 'composite') throw new Error('slot')
    slot.compositeId = 'badge'
    slot.x = 0
    slot.y = 0
    slot.width = -100
    slot.height = 100
    const menu = createAsset('menu', 'Main', 'Main.menu.json', 'menu') as MenuAsset
    menu.components = [slot]
    const node = buildScene(menu, [composite]).find((item) => item.id === 'slot/mark')
    expect(((node?.x ?? 0) / 100) * menu.width).toBeCloseTo(-20)
    expect(((node?.y ?? 0) / 100) * menu.height).toBeCloseTo(0)
    expect(((node?.width ?? 0) / 100) * menu.width).toBeCloseTo(20)
    expect(node?.flipX).toBe(true)
    expect(node?.flipY).toBe(false)
  })

  it('places a composite so its origin sits on x and y', () => {
    const child = createMenuComponent('label', [])
    child.id = 'mark'
    child.x = 0
    child.y = 0
    child.width = 160
    child.height = 160
    const composite = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    composite.width = 160
    composite.height = 160
    composite.originX = 80
    composite.originY = 40
    composite.components = [child]
    const slot = createMenuComponent('composite', [])
    slot.id = 'slot'
    if (slot.type === 'composite') slot.compositeId = 'badge'
    slot.x = 100
    slot.y = 80
    slot.width = 160
    slot.height = 160
    const menu: MenuAsset = {
      id: 'menu',
      type: 'menu',
      name: 'Main',
      relativePath: 'Main.menu.json',
      width: 880,
      height: 495,
      gridSize: 16,
      snapToGrid: false,
      scriptId: null,
      script: '',
      components: [slot]
    }
    const scene = buildScene(menu, [composite])
    expect(((scene[0]?.x ?? 0) / 100) * menu.width).toBeCloseTo(20)
    expect(((scene[0]?.y ?? 0) / 100) * menu.height).toBeCloseTo(40)
    const parsed = parseAsset(
      { id: 'badge', type: 'composite', name: 'Badge', width: 64, height: 64, originX: 12, originY: 8, components: [] },
      'Badge.composite.json'
    )
    expect(parsed).toMatchObject({ originX: 12, originY: 8 })
  })

  it('keeps the aspect ratio while a resize handle is dragged with shift', () => {
    const start = { x: 10, y: 20, width: 100, height: 50 }
    expect(resizeRect(start, 20, 0, 'e', true)).toEqual({ x: 10, y: 15, width: 120, height: 60 })
    expect(resizeRect(start, 20, 40, 'se', true)).toEqual({ x: 10, y: 20, width: 180, height: 90 })
    expect(resizeRect(start, 20, 0, 'e', false)).toEqual({ x: 10, y: 20, width: 120, height: 50 })
  })

  it('reads the original size of an image, a button, a panel, and a composite', () => {
    const picture = image('img', 'Hero', 'Hero.image.json', 'hero.png')
    const plate = button('plate', 'Plate', 'Plate.button.json', 'img')
    const frame = createPanelAsset('frame', 'Frame', 'Frame.panel.json')
    frame.imageId = 'img'
    const badge = createAsset('composite', 'Badge', 'Badge.composite.json', 'badge') as CompositeAsset
    badge.width = 48
    badge.height = 36
    const hero = createMenuComponent('image', [])
    if (hero.type === 'image') hero.imageId = 'img'
    const control = createMenuComponent('button', [])
    if (control.type === 'button') control.buttonId = 'plate'
    const panel = createMenuComponent('panel', [])
    if (panel.type === 'panel') panel.panelId = 'frame'
    const slot = createMenuComponent('composite', [])
    if (slot.type === 'composite') slot.compositeId = 'badge'
    const assets = [picture, plate, frame, badge]
    expect(intrinsicSize(hero, assets)).toEqual({ width: 64, height: 32 })
    expect(intrinsicSize(control, assets)).toEqual({ width: 64, height: 32 })
    expect(intrinsicSize(panel, assets)).toEqual({ width: 64, height: 32 })
    expect(intrinsicSize(slot, assets)).toEqual({ width: 48, height: 36 })
  })

  it('keeps a composite canvas as small as 32 by 32', () => {
    const parsed = parseAsset(
      { id: 'badge', type: 'composite', name: 'Badge', width: 32, height: 32, components: [] },
      'Badge.composite.json'
    )
    expect(parsed).toMatchObject({ width: 32, height: 32 })
    const raised = parseAsset(
      { id: 'badge', type: 'composite', name: 'Badge', width: 8, height: 8, components: [] },
      'Badge.composite.json'
    )
    expect(raised).toMatchObject({ width: 32, height: 32 })
  })

  it('stops drawing when a composite contains itself', () => {
    const composite = createAsset('composite', 'Loop', 'Loop.composite.json', 'loop') as CompositeAsset
    const slot = createMenuComponent('composite', [])
    if (slot.type === 'composite') slot.compositeId = 'loop'
    composite.components = [slot]
    const scene = buildScene(composite, [composite])
    expect(scene).toHaveLength(1)
    expect(scene[0]?.missing).toBe('Composite cycle')
  })
})

describe('tiles', () => {
  it('reads a tileset cell from the zoomed sheet', () => {
    expect(tileAtPoint(16, 0, 64, 32, 64, 32, 16, 16, 4, 2)).toEqual({ x: 1, y: 0 })
    expect(tileAtPoint(32, 16, 128, 64, 64, 32, 16, 16, 4, 2)).toEqual({ x: 1, y: 0 })
    expect(tileAtPoint(8, 4, 32, 16, 64, 32, 16, 16, 4, 2)).toEqual({ x: 1, y: 0 })
    expect(tileAtPoint(128, 0, 128, 64, 64, 32, 16, 16, 4, 2)).toBeNull()
  })

  it('hangs the rest of a merged tile off the selected cell', () => {
    const picture = image('img', 'Dungeon', 'Dungeon.image.json', 'dungeon.png')
    picture.width = 64
    picture.height = 64
    const tileset = createAsset('tileset', 'Dungeon', 'tiles/Dungeon.tileset.json', 'dungeon')
    if (tileset.type !== 'tileset') throw new Error('tileset')
    tileset.imageId = 'img'
    tileset.tileWidth = 32
    tileset.tileHeight = 32
    tileset.merges = [{ x: 0, y: 0, width: 1, height: 2 }]
    expect(placedTile(tileset, picture, 0, 1, { x: 0, y: 0, width: 32, height: 32 })).toMatchObject({ x: 0, y: -32, width: 32, height: 64 })
    expect(placedTile(tileset, picture, 0, 0, { x: 0, y: 0, width: 32, height: 32 })).toMatchObject({ x: 0, y: 0, width: 32, height: 64 })
    const map = createMenuComponent('tilemap', [])
    if (map.type !== 'tilemap') throw new Error('tilemap')
    map.tilesetId = 'dungeon'
    map.tileWidth = 32
    map.tileHeight = 32
    map.x = 40
    map.y = 40
    map.width = 64
    map.height = 32
    map.cells = [
      { x: 0, y: 0, tileX: 0, tileY: 1, tilesetId: 'dungeon' },
      { x: 5, y: 0, tileX: 0, tileY: 0, tilesetId: 'dungeon' }
    ]
    const menu = createAsset('menu', 'Main', 'Main.menu.json', 'menu') as MenuAsset
    menu.width = 200
    menu.height = 200
    menu.components = [map]
    const nodes = buildScene(menu, [picture, tileset]).filter((node) => node.kind === 'tile')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.sheet).toHaveLength(1)
    expect((nodes[0]?.y ?? 0) / 100 * menu.height).toBeCloseTo(8)
    expect((nodes[0]?.height ?? 0) / 100 * menu.height).toBeCloseTo(64)
    expect(pruneCells(map.cells, 2, 1)).toEqual([{ x: 0, y: 0, tileX: 0, tileY: 1, tilesetId: 'dungeon' }])
  })

  it('packs a tilemap into one sheet with tiles touching', () => {
    const picture = image('img', 'Dungeon', 'Dungeon.image.json', 'dungeon.png')
    picture.width = 64
    picture.height = 32
    const tileset = createAsset('tileset', 'Dungeon', 'tiles/Dungeon.tileset.json', 'dungeon')
    if (tileset.type !== 'tileset') throw new Error('tileset')
    tileset.imageId = 'img'
    tileset.tileWidth = 32
    tileset.tileHeight = 32
    const map = createMenuComponent('tilemap', [])
    if (map.type !== 'tilemap') throw new Error('tilemap')
    map.tilesetId = 'dungeon'
    map.tileWidth = 32
    map.tileHeight = 32
    map.width = 64
    map.height = 32
    map.cells = [
      { x: 0, y: 0, tileX: 0, tileY: 0, tilesetId: 'dungeon' },
      { x: 1, y: 0, tileX: 1, tileY: 0, tilesetId: 'dungeon' }
    ]
    const menu = createAsset('menu', 'Main', 'Main.menu.json', 'menu') as MenuAsset
    menu.components = [map]
    const nodes = buildScene(menu, [picture, tileset]).filter((node) => node.kind === 'tile')
    expect(nodes).toHaveLength(1)
    const stamps = [...(nodes[0]?.sheet ?? [])].sort((left, right) => left.x - right.x)
    expect(stamps).toHaveLength(2)
    expect((stamps[0]?.x ?? 0) + (stamps[0]?.width ?? 0)).toBe(stamps[1]?.x)
    const packed = tileSheet([
      { key: 'a', x: 0, y: 0, width: 32, height: 32, crop: { x: 0, y: 0, width: 32, height: 32, imageWidth: 64, imageHeight: 32 } },
      { key: 'b', x: 0, y: -32, width: 32, height: 64, crop: { x: 0, y: 0, width: 32, height: 64, imageWidth: 64, imageHeight: 32 } }
    ])
    expect(packed).toMatchObject({ y: -32, height: 64 })
    expect(packed?.stamps.map((stamp) => stamp.y).sort((left, right) => left - right)).toEqual([0, 32])
  })

  it('draws mixed tilesets in one sheet and keeps an older map on that tileset', () => {
    const grassImage = image('grass-img', 'Grass', 'Grass.image.json', 'grass.png')
    const treeImage = image('tree-img', 'Trees', 'Trees.image.json', 'trees.png')
    grassImage.width = 16
    grassImage.height = 16
    treeImage.width = 32
    treeImage.height = 32
    const grass = createAsset('tileset', 'Grass', 'tiles/Grass.tileset.json', 'grass')
    const trees = createAsset('tileset', 'Trees', 'tiles/Trees.tileset.json', 'trees')
    if (grass.type !== 'tileset' || trees.type !== 'tileset') throw new Error('tileset')
    grass.imageId = 'grass-img'
    grass.tileWidth = 16
    grass.tileHeight = 16
    trees.imageId = 'tree-img'
    trees.tileWidth = 32
    trees.tileHeight = 32
    const map = createMenuComponent('tilemap', [])
    if (map.type !== 'tilemap') throw new Error('tilemap')
    map.tileWidth = 16
    map.tileHeight = 16
    map.width = 32
    map.height = 32
    map.cells = [
      { x: 0, y: 1, tileX: 0, tileY: 0, tilesetId: 'grass' },
      { x: 0, y: 0, tileX: 0, tileY: 0, tilesetId: 'trees' }
    ]
    const menu = createAsset('menu', 'Main', 'Main.menu.json', 'menu') as MenuAsset
    menu.components = [map]
    const sheet = buildScene(menu, [grassImage, treeImage, grass, trees]).find((node) => node.kind === 'tile')?.sheet ?? []
    expect(sheet.map((stamp) => stamp.imagePath)).toEqual(['trees.png', 'grass.png'])
    expect(sheet[0]?.width).toBe(16)

    const parsed = parseAsset(
      {
        formatVersion: 2,
        id: 'room',
        type: 'menu',
        name: 'Room',
        width: 320,
        height: 180,
        components: [{ id: 'ground', type: 'tilemap', name: 'Ground', x: 0, y: 0, width: 64, height: 32, tilesetId: 'dungeon', cells: [{ x: 1, y: 0, tileX: 1, tileY: 0 }] }]
      },
      'Room.menu.json'
    )
    const ground = parsed.type === 'menu' ? parsed.components[0] : null
    expect(ground).toMatchObject({ tileWidth: 0, tileHeight: 0, tilesetId: 'dungeon', cells: [{ x: 1, y: 0, tileX: 1, tileY: 0, tilesetId: 'dungeon' }] })
    if (!ground || ground.type !== 'tilemap') throw new Error('tilemap')
    const picture = image('img', 'Dungeon', 'Dungeon.image.json', 'dungeon.png')
    picture.width = 64
    picture.height = 32
    const tileset = createAsset('tileset', 'Dungeon', 'tiles/Dungeon.tileset.json', 'dungeon')
    if (tileset.type !== 'tileset') throw new Error('tileset')
    tileset.imageId = 'img'
    tileset.tileWidth = 32
    tileset.tileHeight = 32
    expect(tilemapCellSize(ground, [tileset])).toEqual({ tileWidth: 32, tileHeight: 32 })
    const legacy = buildScene(parsed.type === 'menu' ? parsed : menu, [picture, tileset]).find((node) => node.kind === 'tile')
    expect(legacy?.sheet?.[0]?.width).toBe(32)
    expect(legacy?.sheet?.[0]?.imagePath).toBe('dungeon.png')
  })

  it('snaps the closer edge and keeps the aspect ratio', () => {
    const start = { x: 0, y: 0, width: 100, height: 50 }
    const next = resizeRect(start, 10, 0, 'se', true)
    expect(snapToGrid(start, next, 'se', 16, 16, true)).toMatchObject({ x: 0, y: 0, width: 112, height: 56 })
  })

  it('snaps a tilemap to whole tiles on the closer axis', () => {
    const start = { x: 0, y: 0, width: 64, height: 32 }
    const next = resizeRect(start, 20, 2, 'se', true)
    const snapped = snapTilemapSize(start, next, 'se', 32, 16, true)
    expect(snapped.width % 32).toBe(0)
    expect(snapped.height % 16).toBe(0)
    expect(snapped.width / snapped.height).toBeCloseTo(start.width / start.height, 0)
  })

  it('draws a straight line of cells and fills a connected area', () => {
    expect(lineCells(0, 0, 3, 0).map((cell) => cell.x)).toEqual([0, 1, 2, 3])
    expect(lineCells(1, 1, 1, 1)).toEqual([{ x: 1, y: 1 }])
    const filled = fillRegion([], 3, 3, 1, 1, { tilesetId: 'dungeon', tileX: 2, tileY: 0 })
    expect(filled).toHaveLength(9)
    const blocked = fillRegion(
      [
        { x: 1, y: 0, tileX: 4, tileY: 4, tilesetId: 'dungeon' },
        { x: 1, y: 1, tileX: 4, tileY: 4, tilesetId: 'dungeon' },
        { x: 1, y: 2, tileX: 4, tileY: 4, tilesetId: 'dungeon' }
      ],
      3,
      3,
      0,
      1,
      { tilesetId: 'dungeon', tileX: 1, tileY: 0 }
    )
    const painted = blocked.filter((cell) => cell.tileX === 1)
    expect(painted).toHaveLength(3)
    expect(painted.every((cell) => cell.x === 0)).toBe(true)
    expect(blocked.filter((cell) => cell.tileX === 4)).toHaveLength(3)
    expect(fillRegion([{ x: 0, y: 0, tileX: 2, tileY: 0, tilesetId: 'dungeon' }], 2, 1, 0, 0, { tilesetId: 'dungeon', tileX: 2, tileY: 0 })).toEqual([{ x: 0, y: 0, tileX: 2, tileY: 0, tilesetId: 'dungeon' }])
    const mixed = fillRegion(
      [
        { x: 0, y: 0, tileX: 1, tileY: 0, tilesetId: 'grass' },
        { x: 1, y: 0, tileX: 1, tileY: 0, tilesetId: 'trees' }
      ],
      2,
      1,
      0,
      0,
      { tilesetId: 'water', tileX: 2, tileY: 0 }
    )
    expect(mixed.find((cell) => cell.x === 0)?.tilesetId).toBe('water')
    expect(mixed.find((cell) => cell.x === 1)?.tilesetId).toBe('trees')
  })
})
