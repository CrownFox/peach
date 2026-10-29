import { isTypingTarget, keyAction } from './keys'
import { readInputStyle, setGlobalInputStyle } from './inputStyle'
import { installSceneStyles } from './sceneCss'
import { syncScene, watchDevicePixels } from './paint'
import { PlaySession } from './playSession'
import { storageSavePort } from './saves'
import { buildScene, fitFrame } from './scene'
import { encodeRelative } from './paths'
import type { Asset, MenuAsset } from './types'
import { parseAsset } from './assets'

type GameFile = {
  name?: string
  author?: string
  icon?: string | null
  entryMenuId?: string | null
  inputStyle?: unknown
  assets?: unknown[]
}

export function mountPlayer(container: HTMLElement): void {
  installSceneStyles()
  void load(container)
}

async function load(container: HTMLElement): Promise<void> {
  let game: GameFile
  try {
    game = await loadGame()
  } catch {
    showMessage(container, 'Could not load the game.')
    return
  }
  document.title = game.name || 'Game'
  if (game.author) {
    const author = document.createElement('meta')
    author.name = 'author'
    author.content = game.author
    document.head.append(author)
  }
  if (game.icon) {
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.href = game.icon
    document.head.append(icon)
  }
  setGlobalInputStyle(readInputStyle(game.inputStyle))
  const assets = (game.assets ?? []).flatMap((item) => {
    try {
      return [parseAsset(item, '')]
    } catch {
      return []
    }
  })
  const entry = assets.find((asset) => asset.id === game.entryMenuId && asset.type === 'menu') as MenuAsset | undefined
  if (!game.entryMenuId) {
    showMessage(container, 'No entry menu is set.')
    return
  }
  if (!entry) {
    showMessage(container, 'The entry menu is missing.')
    return
  }
  const stage = document.createElement('div')
  stage.style.position = 'relative'
  stage.style.zIndex = '0'
  stage.style.background = '#14110f'
  stage.style.flex = 'none'
  const scene = document.createElement('div')
  scene.className = 'scene-root'
  stage.append(scene)
  container.replaceChildren(stage)
  container.style.display = 'flex'
  container.style.alignItems = 'center'
  container.style.justifyContent = 'center'
  container.style.background = '#000'
  container.style.position = 'relative'
  const session = new PlaySession()
  let pressedId: string | null = null
  const layers: { stage: HTMLElement; scene: HTMLElement }[] = []
  const menuById = (id: string | undefined): MenuAsset | null => {
    const asset = assets.find((item) => item.id === id)
    return asset?.type === 'menu' ? asset : null
  }
  const draw = (): void => {
    const menu = menuById(session.frames[session.index]?.menuId) ?? entry
    const fitted = fitFrame(container.clientWidth, container.clientHeight, menu.width, menu.height)
    stage.style.width = `${fitted.width}px`
    stage.style.height = `${fitted.height}px`
    const displayScale = menu.width > 0 ? fitted.width / menu.width : 1
    const modalOpen = session.modals.length > 0
    syncScene(scene, buildScene(menu, assets, { pressedId, overrides: session.currentOverrides(), pages: session.pages, displayScale, added: session.addedPieces() }), (path) => encodeRelative(path), {
      interactive: !modalOpen,
      onPressStart: (id) => {
        pressedId = id
        draw()
      },
      onActivate: (id) => session.activate(id),
      onValue: (id, value, inputKey) => {
        if (inputKey) session.setPageInput(id, inputKey, String(value))
        else session.setControl(id, value)
      }
    })
    while (layers.length > session.modals.length) layers.pop()?.stage.parentElement?.remove()
    session.modals.forEach((frame, index) => {
      const modal = menuById(frame.menuId)
      if (!modal) return
      let host = layers[index]
      if (!host) {
        const layer = document.createElement('div')
        layer.className = 'modal-layer'
        const modalStage = document.createElement('div')
        modalStage.className = 'modal-stage'
        const modalScene = document.createElement('div')
        modalScene.className = 'scene-root'
        modalStage.append(modalScene)
        layer.append(modalStage)
        container.append(layer)
        host = { stage: modalStage, scene: modalScene }
        layers.push(host)
      }
      const modalFit = fitFrame(container.clientWidth, container.clientHeight, modal.width, modal.height)
      host.stage.style.width = `${modalFit.width}px`
      host.stage.style.height = `${modalFit.height}px`
      const modalScale = modal.width > 0 ? modalFit.width / modal.width : 1
      syncScene(host.scene, buildScene(modal, assets, { pressedId, overrides: frame.overrides, pages: session.pages, displayScale: modalScale, added: session.addedPieces(frame) }), (path) => encodeRelative(path), {
        interactive: index === session.modals.length - 1,
        onPressStart: (id) => {
          pressedId = id
          draw()
        },
        onActivate: (id) => session.activate(id),
        onValue: (id, value, inputKey) => {
          if (inputKey) session.setPageInput(id, inputKey, String(value))
          else session.setControl(id, value)
        }
      })
    })
  }
  session.assetsOf = () => assets
  session.attachSaves(storageSavePort(`peach-saves:${game.name || 'game'}`))
  session.onChange = () => {
    session.refreshPages()
    draw()
  }
  const viewportSize = (): { width: number; height: number } => ({ width: container.clientWidth, height: container.clientHeight })
  const pointerAt = (event: PointerEvent): { x: number; y: number } | null => {
    const bounds = container.getBoundingClientRect()
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const size = viewportSize()
    const inside = point.x >= 0 && point.y >= 0 && point.x <= size.width && point.y <= size.height
    return inside ? point : null
  }
  container.addEventListener('pointermove', (event) => {
    session.setPointer(pointerAt(event), viewportSize())
  })
  container.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    session.setPointer(pointerAt(event), viewportSize())
    session.pointerDown()
  })
  container.addEventListener('pointerleave', () => {
    session.setPointer(null, viewportSize())
  })
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) {
      session.setPointer(pointerAt(event), viewportSize())
      session.pointerUp()
    }
    if (!pressedId) return
    pressedId = null
    draw()
  })
  const onKey = (event: KeyboardEvent): void => {
    const typing = isTypingTarget(event.target)
    session.setTyping(typing)
    const action = keyAction(event.type, event.repeat, event.code, false)
    if (!action) return
    const handled = session.pressKey(action.code, action.edge, action.fire && !typing)
    if (!typing && handled) event.preventDefault()
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  const publishScale = (): void => {
    const top = session.modals.at(-1) ?? session.frames[session.index]
    const asset = menuById(top?.menuId) ?? entry
    const fitted = fitFrame(container.clientWidth, container.clientHeight, asset.width, asset.height)
    session.setDisplayScale(asset.width > 0 && fitted.width > 0 ? fitted.width / asset.width : 1)
  }
  let clockAt = 0
  const onFrame = (now: number): void => {
    requestAnimationFrame(onFrame)
    if (clockAt > 0) {
      publishScale()
      session.setTyping(isTypingTarget(document.activeElement))
      session.tick(now - clockAt)
    }
    clockAt = now
  }
  requestAnimationFrame(onFrame)
  new ResizeObserver(() => draw()).observe(container)
  watchDevicePixels(() => draw())
  publishScale()
  session.reset(entry.id)
}

async function loadGame(): Promise<GameFile> {
  const embedded = document.getElementById('peach-game')?.textContent?.trim() ?? ''
  if (embedded && embedded !== '__PEACH_GAME__') return JSON.parse(embedded) as GameFile
  const response = await fetch('./game.json')
  if (!response.ok) throw new Error('missing')
  return (await response.json()) as GameFile
}

function showMessage(container: HTMLElement, message: string): void {
  container.replaceChildren()
  const el = document.createElement('div')
  el.textContent = message
  el.style.cssText =
    'height:100%;display:flex;align-items:center;justify-content:center;color:#b3a69a;font:16px Segoe UI,sans-serif;text-align:center;padding:24px;'
  container.append(el)
}
