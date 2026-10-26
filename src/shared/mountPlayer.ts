import { isTypingTarget, keyAction } from './keys'
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
    const modalOpen = session.modals.length > 0
    syncScene(scene, buildScene(menu, assets, { pressedId, overrides: session.currentOverrides(), pages: session.pages }), (path) => encodeRelative(path), {
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
      syncScene(host.scene, buildScene(modal, assets, { pressedId, overrides: frame.overrides, pages: session.pages }), (path) => encodeRelative(path), {
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
  window.addEventListener('pointerup', () => {
    if (!pressedId) return
    pressedId = null
    draw()
  })
  const onKey = (event: KeyboardEvent): void => {
    const action = keyAction(event.type, event.repeat, event.code, isTypingTarget(event.target))
    if (!action) return
    if (session.pressKey(action.code, action.edge, action.fire)) event.preventDefault()
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  let clockAt = 0
  const onFrame = (now: number): void => {
    requestAnimationFrame(onFrame)
    if (clockAt > 0) session.advanceText(now - clockAt)
    clockAt = now
  }
  requestAnimationFrame(onFrame)
  new ResizeObserver(() => draw()).observe(container)
  watchDevicePixels(() => draw())
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
