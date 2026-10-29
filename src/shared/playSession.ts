import { LuaHost, type PlayFrame } from './luaHost'
import { menuPoint, surveyPointer, type MouseTarget, type Point } from './pointer'
import { writeComponentProperty, type ComponentOverride, type SceneOverrides, type ScriptValue } from './overrides'
import { findAssetByLocation } from './refs'
import { assetLocation } from './paths'
import type { PageDisplay } from './books'
import type { Asset } from './types'
import { SaveLibrary, type SaveKind, type SavePort } from './saves'
import type { AddedMap } from './spawned'

export type ScriptLog = { tone: 'message' | 'error'; text: string }

export class PlaySession {
  frames: PlayFrame[] = []
  index = 0
  logs: ScriptLog[] = []
  pages: Record<string, PageDisplay> = {}
  modals: PlayFrame[] = []
  assetsOf: () => Asset[] = () => []
  onChange: () => void = () => {}
  private host: LuaHost | null = null
  private saves = new SaveLibrary()
  private pointer: Point | null = null
  private viewport = { width: 0, height: 0 }
  private hovered: MouseTarget[] = []
  private displayScale = 1

  attachSaves(port: SavePort | null): void {
    this.savePort = port
    this.saves = new SaveLibrary(port)
  }

  dispose(): void {
    this.host?.dispose()
    this.host = null
  }

  reset(entryId: string | null): void {
    this.host?.dispose()
    this.frames = []
    this.index = 0
    this.logs = []
    this.pages = {}
    this.modals = []
    this.host = new LuaHost({
      assets: () => this.assetsOf(),
      log: (tone, text) => this.log(tone, text),
      openLocation: (location) => this.openLocation(location),
      openModal: (location) => this.openModalLocation(location),
      closeModal: (frame) => this.closeModalFrame(frame),
      changed: () => this.onChange(),
      saveAuto: (index, image) => this.saveAuto(index, image),
      loadAuto: (index) => this.loadAuto(index),
      autoInfo: (index) => {
        const slot = this.saves.auto(index)
        return slot ? { image: slot.image, time: slot.time } : null
      },
      saveCustom: (index, data, meta) => this.saves.putCustom(index, { data, meta }),
      loadCustom: (index) => this.saves.custom(index)?.data ?? null,
      customInfo: (index) => this.saves.custom(index)?.meta ?? null,
      transferSaves: (kind, direction) => this.transferSaves(kind, direction)
    })
    this.hovered = []
    if (entryId) this.navigate(entryId)
    else this.onChange()
    this.host?.rememberPointer(this.pointer, this.viewport)
    this.host?.setDisplayScale(this.displayScale)
  }

  navigate(menuId: string): void {
    const menu = this.assetsOf().find((asset) => asset.id === menuId && asset.type === 'menu')
    if (!menu) {
      this.log('error', 'That menu is missing.')
      return
    }
    const current = this.frames[this.index]
    this.dismissModals()
    if (current) this.host?.parkPersistent(current)
    let frame = current
    if (current?.menuId === menuId) {
      this.host?.release(current)
      current.overrides = {}
    } else {
      const dropped = this.frames.slice(this.index + 1)
      this.frames = this.frames.slice(0, this.index + 1)
      for (const item of dropped) this.host?.release(item)
      frame = { menuId, overrides: {} }
      this.frames.push(frame)
      this.index = this.frames.length - 1
    }
    if (!frame) return
    try {
      this.host?.open(frame)
    } catch (error) {
      this.log('error', error instanceof Error ? error.message : 'Script error')
    }
    this.onChange()
  }

  openLocation(location: string): void {
    const menu = findAssetByLocation(this.assetsOf(), location, 'menu')
    if (!menu) throw new Error(`No menu at "${location}".`)
    this.navigate(menu.id)
  }

  openModalLocation(location: string): void {
    if (!this.frames[this.index]) throw new Error('No menu is open.')
    const menu = findAssetByLocation(this.assetsOf(), location, 'menu')
    if (!menu || menu.type !== 'menu') throw new Error(`No menu at "${location}".`)
    const active = this.modals.at(-1) ?? this.frames[this.index]
    if (active) this.host?.parkPersistent(active)
    const top = this.modals.at(-1)
    if (top?.menuId === menu.id) {
      this.host?.release(top)
      top.overrides = {}
      this.host?.presentModal(top, true)
    } else {
      const frame: PlayFrame = { menuId: menu.id, overrides: {} }
      this.modals.push(frame)
      this.host?.presentModal(frame, true)
    }
    this.onChange()
  }

  closeModalFrame(frame: PlayFrame): void {
    const index = this.modals.indexOf(frame)
    if (index < 0) throw new Error('That modal is not open.')
    const removed = this.modals.splice(index)
    for (const item of removed) this.host?.release(item)
    const next = this.modals.at(-1)
    if (next) this.host?.show(next)
    else {
      this.host?.clearModal()
      const menu = this.frames[this.index]
      if (menu) this.host?.show(menu)
    }
    this.onChange()
  }

  back(): void {
    if (this.index <= 0) return
    this.dismissModals()
    this.parkCurrent()
    this.index -= 1
    this.restore()
  }

  forward(): void {
    if (this.index >= this.frames.length - 1) return
    this.dismissModals()
    this.parkCurrent()
    this.index += 1
    this.restore()
  }

  jump(index: number): void {
    if (index < 0 || index >= this.frames.length || index === this.index) return
    this.dismissModals()
    this.parkCurrent()
    this.index = index
    this.restore()
  }

  activate(componentId: string): void {
    const frame = this.activeFrame()
    if (!frame) return
    this.host?.activate(frame, componentId)
    this.onChange()
  }

  pressKey(code: string, edge: 'down' | 'up', fire = true): boolean {
    return this.host?.pressKey(code, edge, fire) ?? false
  }

  setTyping(typing: boolean): void {
    this.host?.setTyping(typing)
  }

  setDisplayScale(scale: number): void {
    this.displayScale = Number.isFinite(scale) && scale > 0 ? scale : 1
    this.host?.setDisplayScale(this.displayScale)
  }

  setPointer(point: Point | null, viewport: { width: number; height: number }): void {
    this.pointer = point
    this.viewport = viewport
    this.host?.rememberPointer(point, viewport)
    this.syncHover()
  }

  pointerDown(): void {
    this.syncHover()
    const frame = this.activeFrame()
    if (!frame || !this.pointer) return
    this.host?.dispatchMouse(frame, this.hovered, 'onMouseDown')
  }

  pointerUp(): void {
    this.syncHover()
    const frame = this.activeFrame()
    if (!frame || !this.pointer) return
    this.host?.dispatchMouse(frame, this.hovered, 'onMouseUp')
  }

  tick(elapsedMs: number): void {
    this.advanceText(elapsedMs)
    const top = this.modals.at(-1) ?? this.frames[this.index]
    if (top) this.host?.advanceUpdate(top, elapsedMs)
    this.syncHover()
  }

  advanceText(elapsedMs: number): void {
    const frames = [this.frames[this.index], ...this.modals].filter((frame): frame is PlayFrame => frame !== undefined)
    if (this.host?.advanceText(frames, elapsedMs)) this.onChange()
  }

  refreshPages(): void {
    const visible = [this.frames[this.index], ...this.modals].filter((frame): frame is PlayFrame => frame !== undefined)
    if (!this.host || visible.length === 0) {
      this.pages = {}
      return
    }
    for (let pass = 0; pass < 4; pass += 1) {
      const stamp = JSON.stringify(visible.map((frame) => frame.overrides))
      const pages: Record<string, PageDisplay> = {}
      for (const frame of visible) Object.assign(pages, this.host.buildPages(frame))
      this.pages = pages
      if (JSON.stringify(visible.map((frame) => frame.overrides)) === stamp) return
    }
  }

  setPageInput(componentId: string, key: string, value: string): void {
    const frame = this.activeFrame()
    if (!frame || !this.host?.usable(frame, componentId)) return
    const current = { ...(frame.overrides[componentId] ?? {}) }
    current.pageInputs = { ...(current.pageInputs ?? {}), [key]: value }
    frame.overrides[componentId] = current
    try {
      this.host?.emitChange(frame, componentId)
    } catch (error) {
      this.log('error', error instanceof Error ? error.message : 'Could not update that input.')
    }
    this.onChange()
  }

  setControl(componentId: string, value: ScriptValue): void {
    const frame = this.activeFrame()
    if (!frame) return
    const menu = this.assetsOf().find((asset) => asset.id === frame.menuId && asset.type === 'menu')
    if (!menu || menu.type !== 'menu' || !this.host?.usable(frame, componentId)) return
    try {
      writeComponentProperty(menu, componentId, frame.overrides, 'value', value, this.assetsOf())
      this.host?.emitChange(frame, componentId)
    } catch (error) {
      this.log('error', error instanceof Error ? error.message : 'Could not update that value.')
    }
    this.onChange()
  }

  clearOverride(menuId: string, componentId: string, key: keyof ComponentOverride): void {
    const frames = [this.frames[this.index], ...this.modals].filter((frame): frame is PlayFrame => frame?.menuId === menuId)
    let changed = false
    for (const frame of frames) {
      const current = frame.overrides[componentId]
      if (!current || current[key] === undefined) continue
      const next = { ...current }
      delete next[key]
      frame.overrides[componentId] = next
      changed = true
    }
    if (changed) this.onChange()
  }

  prune(menuIds: Set<string>): void {
    const current = this.frames[this.index]
    if (!current || !menuIds.has(current.menuId)) this.dismissModals()
    else {
      const index = this.modals.findIndex((frame) => !menuIds.has(frame.menuId))
      if (index >= 0) this.closeModalFrame(this.modals[index])
    }
    for (const frame of this.frames) {
      if (!menuIds.has(frame.menuId)) this.host?.release(frame)
    }
    this.frames = this.frames.filter((frame) => menuIds.has(frame.menuId))
    const kept = current ? this.frames.indexOf(current) : -1
    this.index = kept >= 0 ? kept : Math.max(0, this.frames.length - 1)
    const frame = this.frames[this.index]
    if (frame) this.host?.show(frame)
    else this.host?.clearMenu()
    this.onChange()
  }

  currentOverrides(): SceneOverrides {
    return { ...(this.frames[this.index]?.overrides ?? {}) }
  }

  addedPieces(frame?: PlayFrame): AddedMap {
    const target = frame ?? this.frames[this.index]
    return target ? (this.host?.addedFor(target) ?? {}) : {}
  }

  private parkCurrent(): void {
    const frame = this.frames[this.index]
    if (frame) this.host?.parkPersistent(frame)
  }

  private restore(): void {
    const frame = this.frames[this.index]
    if (frame) {
      this.host?.show(frame)
      this.host?.loadPages(frame)
    }
    this.onChange()
  }

  private activeFrame(): PlayFrame | undefined {
    return this.modals.at(-1) ?? this.frames[this.index]
  }

  private syncHover(): void {
    const frame = this.activeFrame()
    const next = frame && this.pointer ? this.hoverTargets(frame) : []
    const key = (target: MouseTarget): string => `${target.kind}:${target.id}`
    const previous = new Set(this.hovered.map(key))
    const upcoming = new Set(next.map(key))
    const left = this.hovered.filter((target) => !upcoming.has(key(target)))
    const entered = next.filter((target) => !previous.has(key(target)))
    this.hovered = next
    if (!frame) return
    this.host?.dispatchMouse(frame, left, 'onMouseLeave')
    this.host?.dispatchMouse(frame, entered, 'onMouseEnter')
  }

  private hoverTargets(frame: PlayFrame): MouseTarget[] {
    if (!this.pointer) return []
    const menu = this.assetsOf().find((asset) => asset.id === frame.menuId && asset.type === 'menu')
    if (!menu || menu.type !== 'menu') return []
    const point = menuPoint(this.pointer, this.viewport, menu.width, menu.height)
    return surveyPointer(menu, this.assetsOf(), frame.overrides, point, this.displayScale, this.addedPieces(frame)).targets
  }

  private dismissModals(): void {
    if (this.modals.length === 0) return
    for (const frame of this.modals) this.host?.release(frame)
    this.modals = []
    this.host?.clearModal()
  }

  private saveAuto(index: number, image: string | null): void {
    const host = this.host
    if (!host) throw new Error('No menu is open.')
    const frames = this.frames.slice(0, this.index + 1)
    if (frames.length === 0) throw new Error('No menu is open.')
    const visits = frames.map((frame) => {
      const menu = this.assetsOf().find((asset) => asset.id === frame.menuId && asset.type === 'menu')
      if (!menu) throw new Error('That menu is missing.')
      return { menu: assetLocation(menu.relativePath), overrides: host.captureOverrides(frame.overrides) }
    })
    this.saves.putAuto(index, { image, time: new Date().toISOString(), visits, state: host.captureState(), scenes: host.capturePersistent(frames) })
  }

  private loadAuto(index: number): void {
    const host = this.host
    const slot = this.saves.auto(index)
    if (!host || !slot) throw new Error('That save slot is empty.')
    if (slot.visits.length === 0) throw new Error('That save slot is empty.')
    const frames: PlayFrame[] = slot.visits.map((visit) => {
      const menu = findAssetByLocation(this.assetsOf(), visit.menu, 'menu')
      if (!menu || menu.type !== 'menu') throw new Error(`No menu at "${visit.menu}".`)
      return { menuId: menu.id, overrides: host.restoreOverrides(visit.overrides) }
    })
    const current = frames[frames.length - 1]
    if (!current) throw new Error('That save slot is empty.')
    host.restoreState(slot.state)
    this.dismissModals()
    for (const frame of this.frames) host.release(frame)
    host.forgetPersistent()
    this.frames = frames
    this.index = frames.length - 1
    host.restorePersistent(slot.scenes)
    host.open(current)
    this.onChange()
  }

  private transferSaves(kind: SaveKind, direction: 'import' | 'export'): void {
    const port = this.savePort
    if (!port) throw new Error('Save files are not available here.')
    if (direction === 'export') {
      port.pickExport(kind, this.saves.text(kind))
      return
    }
    port.pickImport(kind, (text) => {
      try {
        this.saves.replace(kind, text)
      } catch (error) {
        this.log('error', error instanceof Error ? error.message : 'That save file could not be read.')
      }
    })
  }

  private savePort: SavePort | null = null

  private log(tone: ScriptLog['tone'], text: string): void {
    this.logs = [...this.logs, { tone, text }].slice(-200)
    this.onChange()
  }
}
