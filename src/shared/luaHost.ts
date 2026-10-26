import lua from 'fengari/src/lua.js'
import lauxlib from 'fengari/src/lauxlib.js'
import { to_luastring } from 'fengari/src/fengaricore.js'
import { luaopen_base } from 'fengari/src/lbaselib.js'
import { luaopen_math } from 'fengari/src/lmathlib.js'
import { luaopen_string } from 'fengari/src/lstrlib.js'
import { luaopen_table } from 'fengari/src/ltablib.js'
import { luaopen_utf8 } from 'fengari/src/lutf8lib.js'
import {
  addWorkingEntry,
  collectionLoadError,
  createWorkingCollection,
  findWorkingEntry,
  loadWorkingCollection,
  removeWorkingEntry,
  removeWorkingEntryByKey,
  saveWorkingCollection,
  setWorkingField,
  workingFieldValue,
  type CollectionScalar,
  type WorkingCollection,
  type WorkingEntry
} from './collections'
import { compositeById, instanceEnabled, instanceVisible, resolvePiece, visitPieces } from './composites'
import { readComponentProperty, writeComponentProperty, type SceneOverrides, type ScriptValue } from './overrides'
import { findAssetByLocation } from './refs'
import { KEYS } from './keys'
import { type SavedOverride, type SavedValue, type SaveKind, slotNumber } from './saves'
import { snapshotBook, clipDisplay, decodeBookPage, displayLength, doodadScripts, findPage, inputValue, pageFieldValue, playDisplay, type LoadedBook, type PageDisplay } from './books'
import { componentProperties, scriptPropertyNumber, type ScriptPropertyType } from './scriptProperties'
import type { Asset, BookPage, CompositeAsset, ImageAsset, MenuAsset, MenuComponent, PageField } from './types'

export type PlayFrame = {
  menuId: string
  overrides: SceneOverrides
}

type LogTone = 'message' | 'error'
type TextReveal = { shown: number; total: number; playing: boolean; carry: number }

type HostHooks = {
  assets: () => Asset[]
  log: (tone: LogTone, text: string) => void
  openLocation: (location: string) => void
  openModal: (location: string) => void
  closeModal: (frame: PlayFrame) => void
  changed: () => void
  saveAuto: (index: number, image: string | null) => void
  loadAuto: (index: number) => void
  autoInfo: (index: number) => { image: string | null; time: string } | null
  saveCustom: (index: number, data: SavedValue, meta: SavedValue) => void
  loadCustom: (index: number) => SavedValue | null
  customInfo: (index: number) => SavedValue | null
  transferSaves: (kind: SaveKind, direction: 'import' | 'export') => void
}

type CompiledMenu = {
  stamp: string
  menuRef: number
  components: Map<string, number>
  composites: Map<string, number>
}

type RuntimeObject =
  | { kind: 'menu'; frame: PlayFrame }
  | { kind: 'component'; frame: PlayFrame; componentId: string }
  | { kind: 'composite'; frame: PlayFrame; instanceId: string }

const S = (value: string) => to_luastring(value)
const omitted = Symbol('omit')

const pageViewerOwn = new Set(['loadPage', 'get', 'getInput', 'book', 'page', 'panel', 'progressive', 'rate', 'finished', 'start', 'stop', 'resume', 'finish', 'scrollable'])

function pageText(value: ScriptValue | undefined): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return ''
}

export class LuaHost {
  private readonly state = lauxlib.luaL_newstate()
  private readonly objects = new Map<number, RuntimeObject>()
  private readonly collections = new Map<number, WorkingCollection>()
  private readonly collectionPaths = new Map<number, string>()
  private readonly books = new Map<number, LoadedBook>()
  private readonly compiled = new Map<PlayFrame, CompiledMenu>()
  private readonly pageMethods = new Map<PlayFrame, Map<string, number>>()
  private readonly keys = new Map<PlayFrame, Map<string, { down?: number; up?: number }>>()
  private readonly reveals = new Map<PlayFrame, Map<string, TextReveal>>()
  private menuFrame: PlayFrame | null = null
  private modalFrame: PlayFrame | null = null
  private nextId = 1
  private readonly modalFrames = new Set<PlayFrame>()
  private clicking = new Set<string>()
  private changing = new Set<string>()

  constructor(private readonly hooks: HostHooks) {
    this.openLibraries()
    this.installGame()
  }

  dispose(): void {
    for (const frame of this.compiled.keys()) this.release(frame)
    lua.lua_close(this.state)
  }

  clearMenu(): void {
    this.setCurrentMenu(null)
    this.setCurrentModal(null)
  }

  clearModal(): void {
    this.setCurrentModal(null)
  }

  release(frame: PlayFrame): void {
    this.dropFrameMethods(frame)
    this.dropKeys(frame)
    this.reveals.delete(frame)
    const compiled = this.compiled.get(frame)
    this.modalFrames.delete(frame)
    if (!compiled) return
    this.unref(compiled.menuRef)
    for (const ref of compiled.components.values()) this.unref(ref)
    for (const ref of compiled.composites.values()) this.unref(ref)
    this.compiled.delete(frame)
  }

  presentModal(frame: PlayFrame, runOnLoad: boolean): void {
    this.modalFrames.add(frame)
    this.prepare(frame, runOnLoad)
  }

  open(frame: PlayFrame): void {
    this.prepare(frame, true)
  }

  show(frame: PlayFrame): void {
    this.prepare(frame, false)
  }

  activate(frame: PlayFrame, componentId: string): void {
    if (this.clicking.has(componentId)) return
    const menu = this.menu(frame.menuId)
    const component = menu ? resolvePiece(menu, this.hooks.assets(), componentId)?.component : null
    if (!menu || !component) return
    if (!instanceEnabled(menu, this.hooks.assets(), componentId, frame.overrides)) return
    if (!instanceVisible(menu, this.hooks.assets(), componentId, frame.overrides)) return
    if (component.type !== 'button' && component.type !== 'image') return
    this.prepare(frame, false)
    const compiled = this.compiled.get(frame)
    const env = compiled?.components.get(componentId)
    if (!env) return
    this.clicking.add(componentId)
    try {
      this.setSelf(env, { kind: 'component', frame, componentId })
      this.callHook(env, 'onInteract', `${component.name} onInteract`)
    } finally {
      this.clicking.delete(componentId)
    }
  }

  emitChange(frame: PlayFrame, componentId: string): void {
    if (this.changing.has(componentId)) return
    const menu = this.menu(frame.menuId)
    const component = menu ? resolvePiece(menu, this.hooks.assets(), componentId)?.component : null
    if (!menu || !component) return
    this.prepare(frame, false)
    const env = this.compiled.get(frame)?.components.get(componentId)
    if (!env) return
    this.changing.add(componentId)
    try {
      this.setSelf(env, { kind: 'component', frame, componentId })
      this.callHook(env, 'onChange', `${component.name} onChange`)
    } finally {
      this.changing.delete(componentId)
    }
  }

  private prepare(frame: PlayFrame, runOnLoad: boolean): void {
    const menu = this.menu(frame.menuId)
    if (!menu) return
    const modal = this.modalFrames.has(frame)
    if (modal) this.setCurrentModal({ kind: 'menu', frame })
    else this.setCurrentMenu({ kind: 'menu', frame })
    const stamp = scriptStamp(menu, this.hooks.assets())
    const existing = this.compiled.get(frame)
    if (!existing || existing.stamp !== stamp || runOnLoad) {
      this.release(frame)
      if (modal) this.modalFrames.add(frame)
      this.compile(frame, menu, stamp)
    }
    this.refreshProperties(frame)
    if (!runOnLoad) return
    this.loadPages(frame)
    const compiled = this.compiled.get(frame)
    if (!compiled) return
    this.runCompositeLoads(frame, menu.components, '', [])
    this.setSelf(compiled.menuRef, { kind: 'menu', frame })
    this.callHook(compiled.menuRef, 'onLoad', `${menu.name} onLoad`)
  }

  private compile(frame: PlayFrame, menu: MenuAsset, stamp: string): void {
    const menuRef = this.newEnv(null)
    this.setSelf(menuRef, { kind: 'menu', frame })
    this.runSources(menuRef, sourceFor(this.hooks.assets(), menu.scriptId), menu.script, menu.name)
    const components = new Map<string, number>()
    const composites = new Map<string, number>()
    this.compilePieces(frame, menu.components, menuRef, '', [], components, composites)
    this.compiled.set(frame, { stamp, menuRef, components, composites })
  }

  private compilePieces(
    frame: PlayFrame,
    components: MenuComponent[],
    parentRef: number,
    parent: string,
    stack: string[],
    componentEnvs: Map<string, number>,
    compositeEnvs: Map<string, number>
  ): void {
    for (const component of components) {
      const id = parent ? `${parent}/${component.id}` : component.id
      if (component.type === 'composite' && component.compositeId && !stack.includes(component.compositeId)) {
        const asset = compositeById(this.hooks.assets(), component.compositeId)
        if (!asset) continue
        const env = this.newEnv(parentRef)
        compositeEnvs.set(id, env)
        this.setSelf(env, { kind: 'composite', frame, instanceId: id })
        this.bindProperties(env, component, asset)
        this.runSources(env, sourceFor(this.hooks.assets(), asset.scriptId), asset.script, asset.name)
        this.compilePieces(frame, asset.components, env, id, [...stack, asset.id], componentEnvs, compositeEnvs)
        continue
      }
      if (component.type === 'composite') continue
      const env = this.newEnv(parentRef)
      this.bindProperties(env, component, null)
      this.runSources(env, sourceFor(this.hooks.assets(), component.scriptId), component.script, component.name)
      componentEnvs.set(id, env)
    }
  }

  private runCompositeLoads(frame: PlayFrame, components: MenuComponent[], parent: string, stack: string[]): void {
    const compiled = this.compiled.get(frame)
    if (!compiled) return
    for (const component of components) {
      if (component.type !== 'composite' || !component.compositeId || stack.includes(component.compositeId)) continue
      const asset = compositeById(this.hooks.assets(), component.compositeId)
      if (!asset) continue
      const id = parent ? `${parent}/${component.id}` : component.id
      this.runCompositeLoads(frame, asset.components, id, [...stack, asset.id])
      const env = compiled.composites.get(id)
      if (!env) continue
      this.setSelf(env, { kind: 'composite', frame, instanceId: id })
      this.callHook(env, 'onLoad', `${asset.name} onLoad`)
    }
  }

  private runSources(envRef: number, shared: string, inline: string, label: string): void {
    this.runLoose(shared, `${label} script`, envRef)
    this.runLoose(inline, `${label} inline`, envRef)
  }

  private runLoose(source: string, name: string, envRef: number): void {
    if (!source.trim()) return
    try {
      this.runChunk(source, name, envRef)
    } catch (error) {
      this.hooks.log('error', error instanceof Error ? error.message : 'Script error')
    }
  }

  private runChunk(source: string, name: string, envRef: number): void {
    const top = lua.lua_gettop(this.state)
    const bytes = to_luastring(source)
    if (lauxlib.luaL_loadbuffer(this.state, bytes, bytes.length, S(`@${name}`)) !== lua.LUA_OK) {
      const message = this.errorText()
      lua.lua_settop(this.state, top)
      throw new Error(message)
    }
    this.pushRef(envRef)
    if (lua.lua_setupvalue(this.state, -2, 1) === null) lua.lua_pop(this.state, 1)
    if (lua.lua_pcall(this.state, 0, 0, 0) !== lua.LUA_OK) {
      const message = this.errorText()
      lua.lua_settop(this.state, top)
      throw new Error(message)
    }
    lua.lua_settop(this.state, top)
  }

  private callHook(envRef: number, name: string, label: string): void {
    const top = lua.lua_gettop(this.state)
    this.pushRef(envRef)
    lua.lua_pushstring(this.state, S(name))
    lua.lua_rawget(this.state, -2)
    if (!lua.lua_isfunction(this.state, -1)) {
      lua.lua_settop(this.state, top)
      return
    }
    if (lua.lua_pcall(this.state, 0, 0, 0) !== lua.LUA_OK) {
      this.hooks.log('error', `${label}: ${this.errorText()}`)
    }
    lua.lua_settop(this.state, top)
  }

  private openLibraries(): void {
    const libs: [string, (state: unknown) => number][] = [
      ['_G', luaopen_base],
      ['string', luaopen_string],
      ['table', luaopen_table],
      ['math', luaopen_math],
      ['utf8', luaopen_utf8]
    ]
    for (const [name, open] of libs) {
      lauxlib.luaL_requiref(this.state, S(name), open, 1)
      lua.lua_pop(this.state, 1)
    }
    for (const name of ['dofile', 'loadfile', 'load', 'require']) {
      lua.lua_pushnil(this.state)
      lua.lua_setglobal(this.state, S(name))
    }
    lua.lua_pushcfunction(this.state, (L: unknown) => this.print(L))
    lua.lua_setglobal(this.state, S('print'))
  }

  private installGame(): void {
    lua.lua_newtable(this.state)
    lua.lua_newtable(this.state)
    lua.lua_setfield(this.state, -2, S('state'))
    lua.lua_pushcfunction(this.state, (L: unknown) => this.openMenu(L))
    lua.lua_setfield(this.state, -2, S('openMenu'))
    lua.lua_pushcfunction(this.state, (L: unknown) => this.openModal(L))
    lua.lua_setfield(this.state, -2, S('openModal'))
    lua.lua_pushcfunction(this.state, (L: unknown) => this.closeModal(L))
    lua.lua_setfield(this.state, -2, S('closeModal'))
    lua.lua_pushnil(this.state)
    lua.lua_setfield(this.state, -2, S('currentModal'))
    lua.lua_pushcfunction(this.state, (L: unknown) => this.loadCollection(L))
    lua.lua_setfield(this.state, -2, S('loadCollection'))
    lua.lua_pushcfunction(this.state, (L: unknown) => this.loadBook(L))
    lua.lua_setfield(this.state, -2, S('loadBook'))
    lua.lua_pushcfunction(this.state, (L: unknown) => this.gameLoadPage(L))
    lua.lua_setfield(this.state, -2, S('loadPage'))
    lua.lua_pushcfunction(this.state, (L: unknown) => this.registerKey(L))
    lua.lua_setfield(this.state, -2, S('registerKey'))
    for (const [name, method] of [
      ['saveSlot', this.saveSlot],
      ['loadSlot', this.loadSlot],
      ['slotInfo', this.slotInfo],
      ['customSaveSlot', this.customSaveSlot],
      ['customLoadSlot', this.customLoadSlot],
      ['customSlotInfo', this.customSlotInfo],
      ['importSaves', this.importSaves],
      ['exportSaves', this.exportSaves],
      ['importCustomSaves', this.importCustomSaves],
      ['exportCustomSaves', this.exportCustomSaves]
    ] as const) {
      lua.lua_pushcfunction(this.state, (L: unknown) => method.call(this, L))
      lua.lua_setfield(this.state, -2, S(name))
    }
    lua.lua_setglobal(this.state, S('game'))
    this.installKeys()
  }

  private print(L: unknown): number {
    const count = lua.lua_gettop(L)
    const parts: string[] = []
    for (let index = 1; index <= count; index += 1) {
      const text = lua.lua_tojsstring(L, index)
      parts.push(typeof text === 'string' ? text : '?')
    }
    this.hooks.log('message', parts.join('\t'))
    return 0
  }

  pressKey(code: string, edge: 'down' | 'up', fire = true): boolean {
    const frame = this.modalFrame ?? this.menuFrame
    const ref = frame ? this.keys.get(frame)?.get(code)?.[edge] : undefined
    if (ref === undefined) return false
    if (!fire) return true
    const top = lua.lua_gettop(this.state)
    this.pushRef(ref)
    if (lua.lua_pcall(this.state, 0, 0, 0) !== lua.LUA_OK) {
      this.hooks.log('error', `Key: ${this.errorText()}`)
      lua.lua_settop(this.state, top)
    }
    return true
  }

  private registerKey(L: unknown): number {
    const frame = this.modalFrame ?? this.menuFrame
    if (!frame) return this.fail(L, 'No menu is open.')
    const code = lua.lua_type(L, 1) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, 1) : ''
    const event = lua.lua_type(L, 2) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, 2) : ''
    if (typeof code !== 'string' || !code) return this.fail(L, 'game.registerKey expects a key, such as BTN_A.')
    if (event !== 'down' && event !== 'up') return this.fail(L, 'game.registerKey expects "down" or "up".')
    const edge: 'down' | 'up' = event
    let bindings = this.keys.get(frame)
    if (!bindings) {
      bindings = new Map()
      this.keys.set(frame, bindings)
    }
    const current = bindings.get(code) ?? {}
    if (lua.lua_type(L, 3) === lua.LUA_TNIL) {
      const previous = current[edge]
      if (previous !== undefined) this.unref(previous)
      delete current[edge]
      if (current.down === undefined && current.up === undefined) bindings.delete(code)
      if (bindings.size === 0) this.keys.delete(frame)
      return 0
    }
    if (!lua.lua_isfunction(L, 3)) return this.fail(L, 'game.registerKey expects a function.')
    const previous = current[edge]
    if (previous !== undefined) this.unref(previous)
    lua.lua_pushvalue(L, 3)
    current[edge] = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX)
    bindings.set(code, current)
    return 0
  }

  private dropKeys(frame: PlayFrame): void {
    const bindings = this.keys.get(frame)
    if (!bindings) return
    for (const binding of bindings.values()) {
      if (binding.down !== undefined) this.unref(binding.down)
      if (binding.up !== undefined) this.unref(binding.up)
    }
    this.keys.delete(frame)
  }

  private installKeys(): void {
    for (const key of KEYS) {
      lua.lua_pushstring(this.state, S(key.code))
      lua.lua_setglobal(this.state, S(key.name))
    }
  }

  captureState(): SavedValue {
    const top = lua.lua_gettop(this.state)
    try {
      lua.lua_getglobal(this.state, S('game'))
      lua.lua_getfield(this.state, -1, S('state'))
      const value = this.readSaved(-1, new Set(), 'game.state')
      return value === omitted || value === null ? {} : value
    } finally {
      lua.lua_settop(this.state, top)
    }
  }

  restoreState(value: SavedValue): void {
    const top = lua.lua_gettop(this.state)
    try {
      lua.lua_getglobal(this.state, S('game'))
      this.pushSaved(value)
      lua.lua_setfield(this.state, -2, S('state'))
    } finally {
      lua.lua_settop(this.state, top)
    }
  }

  captureOverrides(overrides: SceneOverrides): Record<string, SavedOverride> {
    const saved: Record<string, SavedOverride> = {}
    for (const [id, override] of Object.entries(overrides)) {
      const next: SavedOverride & { pageBook?: number } = { ...override }
      if (typeof next.pageBook === 'number') {
        const path = this.books.get(next.pageBook)?.location
        delete next.pageBook
        if (path) next.pageBookPath = path
      }
      saved[id] = next
    }
    return saved
  }

  restoreOverrides(saved: Record<string, SavedOverride>): SceneOverrides {
    const overrides: SceneOverrides = {}
    for (const [id, override] of Object.entries(saved)) {
      const next: SceneOverrides[string] & { pageBookPath?: string } = { ...override }
      const path = next.pageBookPath
      delete next.pageBookPath
      if (path) next.pageBook = this.restoreBookId(path)
      overrides[id] = next
    }
    return overrides
  }

  private saveSlot(L: unknown): number {
    try {
      this.hooks.saveAuto(this.readSlot(L, 1), this.readImage(L))
      return 0
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not save that slot.')
    }
  }

  private loadSlot(L: unknown): number {
    try {
      this.hooks.loadAuto(this.readSlot(L, 1))
      return 0
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not load that slot.')
    }
  }

  private slotInfo(L: unknown): number {
    try {
      const info = this.hooks.autoInfo(this.readSlot(L, 1))
      if (!info) {
        lua.lua_pushnil(L)
        return 1
      }
      lua.lua_newtable(L)
      if (info.image) lua.lua_pushstring(L, S(info.image))
      else lua.lua_pushnil(L)
      lua.lua_setfield(L, -2, S('image'))
      lua.lua_pushstring(L, S(info.time))
      lua.lua_setfield(L, -2, S('time'))
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not read that slot.')
    }
  }

  private customSaveSlot(L: unknown): number {
    const top = lua.lua_gettop(L)
    try {
      const index = this.readSlot(L, 1)
      if (lua.lua_type(L, 2) !== lua.LUA_TTABLE || lua.lua_type(L, 3) !== lua.LUA_TTABLE) {
        throw new Error('customSaveSlot expects a table of values and a table of details.')
      }
      const data = this.readSaved(2, new Set(), 'customSaveSlot')
      const meta = this.readSaved(3, new Set(), 'customSaveSlot')
      if (data === omitted || meta === omitted) throw new Error('customSaveSlot expects a table of values and a table of details.')
      this.hooks.saveCustom(index, data, meta)
      return 0
    } catch (error) {
      lua.lua_settop(L, top)
      return this.fail(L, error instanceof Error ? error.message : 'Could not save that slot.')
    }
  }

  private customLoadSlot(L: unknown): number {
    try {
      const data = this.hooks.loadCustom(this.readSlot(L, 1))
      if (data === null) throw new Error('That save slot is empty.')
      this.pushSaved(data)
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not load that slot.')
    }
  }

  private customSlotInfo(L: unknown): number {
    try {
      const meta = this.hooks.customInfo(this.readSlot(L, 1))
      if (meta === null) {
        lua.lua_pushnil(L)
        return 1
      }
      this.pushSaved(meta)
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not read that slot.')
    }
  }

  private importSaves(): number {
    this.hooks.transferSaves('saves', 'import')
    return 0
  }

  private exportSaves(): number {
    this.hooks.transferSaves('saves', 'export')
    return 0
  }

  private importCustomSaves(): number {
    this.hooks.transferSaves('customSaves', 'import')
    return 0
  }

  private exportCustomSaves(): number {
    this.hooks.transferSaves('customSaves', 'export')
    return 0
  }

  private readSlot(L: unknown, index: number): number {
    const value = lua.lua_tonumber(L, index)
    if (typeof value !== 'number') throw new Error('A save slot starts at 1.')
    return slotNumber(value)
  }

  private readImage(L: unknown): string | null {
    const type = lua.lua_type(L, 2)
    if (lua.lua_gettop(L) < 2 || type === lua.LUA_TNIL || type === lua.LUA_TNONE) return null
    if (type !== lua.LUA_TSTRING) throw new Error('saveSlot expects an image path.')
    const path = lua.lua_tojsstring(L, 2)
    if (typeof path !== 'string' || !path) throw new Error('saveSlot expects an image path.')
    if (!findAssetByLocation(this.hooks.assets(), path, 'image')) throw new Error(`No image at "${path}".`)
    return path
  }

  private readSaved(index: number, seen: Set<unknown>, label: string): SavedValue | typeof omitted {
    const type = lua.lua_type(this.state, index)
    if (type === lua.LUA_TNIL || type === lua.LUA_TNONE) return null
    if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(this.state, index) === true
    if (type === lua.LUA_TNUMBER) return lua.lua_tonumber(this.state, index)
    if (type === lua.LUA_TSTRING) {
      const text = lua.lua_tojsstring(this.state, index)
      return typeof text === 'string' ? text : omitted
    }
    if (type !== lua.LUA_TTABLE) return omitted
    const abs = lua.lua_absindex(this.state, index)
    const kind = this.tableKind(abs)
    if (kind === 'collection') {
      const id = this.markerNumber(abs, '__id')
      const working = this.collections.get(id)
      const path = this.collectionPaths.get(id)
      if (!working || !path) throw new Error('That collection is no longer loaded.')
      return { $: 'collection', path, changes: saveWorkingCollection(working) }
    }
    if (kind === 'book') {
      const path = this.books.get(this.markerNumber(abs, '__id'))?.location
      if (!path) throw new Error('That book is no longer loaded.')
      return { $: 'book', path }
    }
    if (kind === 'page') {
      const bookId = this.markerNumber(abs, '__book')
      const path = this.markerString(abs, '__page')
      const book = this.books.get(bookId)?.location
      if (!book || !path) throw new Error('That page is no longer loaded.')
      return { $: 'page', book, path }
    }
    if (kind === 'entry') return omitted
    if (!kind && this.objects.has(this.markerNumber(abs, '__id'))) return omitted
    const pointer = lua.lua_topointer(this.state, abs)
    if (pointer != null) {
      if (seen.has(pointer)) throw new Error(`${label} cannot contain a table that refers to itself.`)
      seen.add(pointer)
    }
    const entries: { key: string | null; index: number | null; value: SavedValue }[] = []
    lua.lua_pushnil(this.state)
    while (lua.lua_next(this.state, abs) !== 0) {
      const keyType = lua.lua_type(this.state, -2)
      let key: string | null = null
      let position: number | null = null
      if (keyType === lua.LUA_TSTRING) {
        const text = lua.lua_tojsstring(this.state, -2)
        key = typeof text === 'string' ? text : null
      } else if (keyType === lua.LUA_TNUMBER) {
        const number = lua.lua_tonumber(this.state, -2)
        if (Number.isInteger(number) && number >= 1) position = number
      }
      if (key === null && position === null) {
        lua.lua_pop(this.state, 1)
        continue
      }
      const value = this.readSaved(-1, seen, label)
      lua.lua_pop(this.state, 1)
      if (value === omitted) {
        if (position !== null) entries.push({ key: null, index: position, value: null })
        continue
      }
      entries.push({ key, index: position, value })
    }
    const indexes = entries.map((entry) => entry.index).filter((entry): entry is number => entry !== null).sort((a, b) => a - b)
    const array = entries.length > 0 && indexes.length === entries.length && indexes.every((entry, position) => entry === position + 1)
    if (array) return entries.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((entry) => entry.value)
    if (entries.length === 0) return {}
    const record: { [key: string]: SavedValue } = {}
    for (const entry of entries) record[entry.key ?? String(entry.index)] = entry.value
    return record
  }

  private pushSaved(value: SavedValue): void {
    if (value === null) {
      lua.lua_pushnil(this.state)
      return
    }
    if (typeof value === 'boolean') {
      lua.lua_pushboolean(this.state, value)
      return
    }
    if (typeof value === 'number') {
      lua.lua_pushnumber(this.state, value)
      return
    }
    if (typeof value === 'string') {
      lua.lua_pushstring(this.state, S(value))
      return
    }
    if (Array.isArray(value)) {
      lua.lua_createtable(this.state, value.length, 0)
      value.forEach((item, index) => {
        this.pushSaved(item)
        lua.lua_rawseti(this.state, -2, index + 1)
      })
      return
    }
    const record = value as { $?: unknown; path?: unknown; changes?: unknown; book?: unknown }
    const keys = Object.keys(value)
    if (record.$ === 'collection' && keys.length === 3 && typeof record.path === 'string' && typeof record.changes === 'string') {
      this.pushRestoredCollection(record.path, record.changes)
      return
    }
    if (record.$ === 'book' && keys.length === 2 && typeof record.path === 'string') {
      this.pushRestoredBook(record.path)
      return
    }
    if (record.$ === 'page' && keys.length === 3 && typeof record.book === 'string' && typeof record.path === 'string') {
      this.pushRestoredPage(record.book, record.path)
      return
    }
    lua.lua_newtable(this.state)
    for (const [key, item] of Object.entries(value)) {
      this.pushSaved(item)
      const index = Number(key)
      if (String(index) === key && Number.isInteger(index) && index >= 1) lua.lua_rawseti(this.state, -2, index)
      else lua.lua_setfield(this.state, -2, S(key))
    }
  }

  private pushRestoredCollection(path: string, changes: string): void {
    const asset = findAssetByLocation(this.hooks.assets(), path, 'collection')
    if (!asset || asset.type !== 'collection') throw new Error(`No collection at "${path}".`)
    const problem = collectionLoadError(asset)
    if (problem) throw new Error(problem)
    const id = this.nextId
    this.nextId += 1
    const working = createWorkingCollection(asset)
    loadWorkingCollection(working, changes)
    this.collections.set(id, working)
    this.collectionPaths.set(id, path)
    this.pushLocked(this.state, (state) => this.collectionIndex(state), [id], 'collection', id)
  }

  private pushRestoredBook(path: string): number {
    const asset = findAssetByLocation(this.hooks.assets(), path, 'book')
    if (!asset || asset.type !== 'book') throw new Error(`No book at "${path}".`)
    const id = this.nextId
    this.nextId += 1
    this.books.set(id, snapshotBook(asset))
    this.pushBook(this.state, id)
    return id
  }

  private pushRestoredPage(book: string, path: string): void {
    const id = this.restoreBookId(book)
    const loaded = this.books.get(id)
    if (!loaded || !findPage(loaded, path)) throw new Error(`No page at "${path}".`)
    this.pushPage(this.state, id, path)
  }

  private restoreBookId(path: string): number {
    const asset = findAssetByLocation(this.hooks.assets(), path, 'book')
    if (!asset || asset.type !== 'book') throw new Error(`No book at "${path}".`)
    const id = this.nextId
    this.nextId += 1
    this.books.set(id, snapshotBook(asset))
    return id
  }

  private tableKind(index: number): string | null {
    if (!lua.lua_getmetatable(this.state, index)) return null
    lua.lua_getfield(this.state, -1, S('__kind'))
    const kind = lua.lua_type(this.state, -1) === lua.LUA_TSTRING ? lua.lua_tojsstring(this.state, -1) : null
    lua.lua_pop(this.state, 2)
    return typeof kind === 'string' ? kind : null
  }

  private markerNumber(index: number, field: string): number {
    if (!lua.lua_getmetatable(this.state, index)) return 0
    lua.lua_getfield(this.state, -1, S(field))
    const id = lua.lua_type(this.state, -1) === lua.LUA_TNUMBER ? lua.lua_tointeger(this.state, -1) : 0
    lua.lua_pop(this.state, 2)
    return id
  }

  private markerString(index: number, field: string): string {
    if (!lua.lua_getmetatable(this.state, index)) return ''
    lua.lua_getfield(this.state, -1, S(field))
    const text = lua.lua_type(this.state, -1) === lua.LUA_TSTRING ? lua.lua_tojsstring(this.state, -1) : ''
    lua.lua_pop(this.state, 2)
    return typeof text === 'string' ? text : ''
  }

  private openMenu(L: unknown): number {
    const location = lua.lua_tojsstring(L, 1)
    if (typeof location !== 'string' || !location) return this.fail(L, 'game.openMenu expects an asset path.')
    try {
      this.hooks.openLocation(location)
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not open that menu.')
    }
    return 0
  }

  private openModal(L: unknown): number {
    const location = lua.lua_tojsstring(L, 1)
    if (typeof location !== 'string' || !location) return this.fail(L, 'game.openModal expects a menu path.')
    try {
      this.hooks.openModal(location)
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not open that modal.')
    }
    return 0
  }

  private closeModal(L: unknown): number {
    try {
      const object = this.readProxy(L, 1)
      if (!object || object.kind !== 'menu') throw new Error('A modal is required.')
      this.hooks.closeModal(object.frame)
      return 0
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not close that modal.')
    }
  }

  private loadCollection(L: unknown): number {
    const location = lua.lua_tojsstring(L, 1)
    if (typeof location !== 'string' || !location) return this.fail(L, 'game.loadCollection expects a collection path.')
    try {
      const asset = findAssetByLocation(this.hooks.assets(), location, 'collection')
      if (!asset || asset.type !== 'collection') throw new Error(`No collection at "${location}".`)
      const problem = collectionLoadError(asset)
      if (problem) throw new Error(problem)
      const id = this.nextId
      this.nextId += 1
      this.collections.set(id, createWorkingCollection(asset))
      this.collectionPaths.set(id, location)
      this.pushLocked(L, (state) => this.collectionIndex(state), [id], 'collection', id)
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not load that collection.')
    }
  }

  private loadBook(L: unknown): number {
    const location = lua.lua_tojsstring(L, 1)
    if (typeof location !== 'string' || !location) return this.fail(L, 'game.loadBook expects a book path.')
    try {
      const asset = findAssetByLocation(this.hooks.assets(), location, 'book')
      if (!asset || asset.type !== 'book') throw new Error(`No book at "${location}".`)
      const id = this.nextId
      this.nextId += 1
      this.books.set(id, snapshotBook(asset))
      this.pushBook(L, id)
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not load that book.')
    }
  }

  buildPages(frame: PlayFrame): Record<string, PageDisplay> {
    const menu = this.menu(frame.menuId)
    const pages: Record<string, PageDisplay> = {}
    if (!menu) return pages
    visitPieces(menu, this.hooks.assets(), ({ instanceId, component }) => {
      if (component.type !== 'pageViewer') return
      pages[instanceId] = this.displayViewer(frame, instanceId, component)
    })
    return pages
  }

  private displayViewer(frame: PlayFrame, instanceId: string, component: Extract<MenuComponent, { type: 'pageViewer' }>): PageDisplay {
    const found = this.viewerContent(frame, instanceId, component)
    if (!found) return { blocks: [], missing: this.viewerMissing(frame, instanceId, component) }
    const inputs = frame.overrides[instanceId]?.pageInputs ?? {}
    const visible = new Map<string, boolean>()
    const values = new Map<string, string>()
    const self: RuntimeObject = { kind: 'component', frame, componentId: instanceId }
    for (const script of doodadScripts(found.page)) {
      const result = this.callPageFunction(script.script, script.kind === 'visible' ? 'visible' : 'value', self, script.kind === 'visible' ? 'Condition' : 'Evaluate')
      if (script.kind === 'visible') visible.set(script.id, result === true)
      else values.set(script.id, pageText(result))
    }
    const full = playDisplay(found.page, this.imageAssets(), inputs, visible, values)
    const reveal = this.noteReveal(frame, instanceId, displayLength(full.blocks))
    if (!this.viewerProgressive(frame, instanceId)) return full
    return clipDisplay(full, reveal.shown)
  }

  private viewerMissing(frame: PlayFrame, instanceId: string, component: Extract<MenuComponent, { type: 'pageViewer' }>): string {
    const override = frame.overrides[instanceId]
    const hasBook = override?.pageBook !== undefined || (override && 'bookRef' in override ? override.bookRef : component.bookId)
    if (!hasBook) return 'Choose a book'
    if (!(override?.pagePath ?? component.pagePath)) return 'Choose a page'
    return 'Missing page'
  }

  private viewerContent(
    frame: PlayFrame,
    componentId: string,
    component: Extract<MenuComponent, { type: 'pageViewer' }>
  ): { fields: PageField[]; page: BookPage } | null {
    const override = frame.overrides[componentId]
    const loaded = override?.pageBook !== undefined ? this.books.get(override.pageBook) : undefined
    const assetBook = loaded ? null : this.viewerAssetBook(frame, componentId, component)
    const book = loaded ?? assetBook
    if (!book) return null
    const path = override?.pagePath ?? component.pagePath
    const found = path ? findPage(book, path) : null
    if (!found) return null
    return { fields: book.fields, page: found.page }
  }

  private viewerAssetBook(frame: PlayFrame, instanceId: string, component: Extract<MenuComponent, { type: 'pageViewer' }>): LoadedBook | null {
    const override = frame.overrides[instanceId]
    if (override && 'bookRef' in override) {
      if (!override.bookRef) return null
      const asset = findAssetByLocation(this.hooks.assets(), override.bookRef, 'book')
      return asset?.type === 'book' ? snapshotBook(asset) : null
    }
    const asset = component.bookId ? this.hooks.assets().find((item) => item.id === component.bookId) : undefined
    return asset?.type === 'book' ? snapshotBook(asset) : null
  }

  private imageAssets(): ImageAsset[] {
    return this.hooks.assets().flatMap((asset) => (asset.type === 'image' ? [asset] : []))
  }

  private pushBook(L: unknown, id: number): void {
    lua.lua_newtable(L)
    lua.lua_newtable(L)
    lua.lua_pushinteger(L, id)
    lua.lua_setfield(L, -2, S('__id'))
    lua.lua_pushstring(L, S('book'))
    lua.lua_setfield(L, -2, S('__kind'))
    lua.lua_pushinteger(L, id)
    lua.lua_pushcclosure(L, (state: unknown) => this.bookIndex(state), 1)
    lua.lua_setfield(L, -2, S('__index'))
    lua.lua_pushcfunction(L, (state: unknown) => this.fail(state, 'Books cannot be changed from a script.'))
    lua.lua_setfield(L, -2, S('__newindex'))
    lua.lua_setmetatable(L, -2)
  }

  private bookIndex(L: unknown): number {
    const id = lua.lua_tointeger(L, lua.lua_upvalueindex(1))
    const key = lua.lua_type(L, 2) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, 2) : ''
    if (key === 'type') {
      lua.lua_pushstring(L, S('book'))
      return 1
    }
    if (key === 'path') {
      lua.lua_pushstring(L, S(this.books.get(id)?.location ?? ''))
      return 1
    }
    if (key !== 'openPage') {
      lua.lua_pushnil(L)
      return 1
    }
    lua.lua_pushinteger(L, id)
    lua.lua_pushcclosure(L, (state: unknown) => this.bookOpenPage(state), 1)
    return 1
  }

  private bookOpenPage(L: unknown): number {
    try {
      const book = this.books.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
      if (!book) throw new Error('That book is no longer loaded.')
      if (lua.lua_type(L, 2) !== lua.LUA_TSTRING) throw new Error('openPage expects a chapter/page path.')
      const path = lua.lua_tojsstring(L, 2)
      if (typeof path !== 'string' || !findPage(book, path)) throw new Error(`No page at "${typeof path === 'string' ? path : ''}".`)
      this.pushPage(L, lua.lua_tointeger(L, lua.lua_upvalueindex(1)), path)
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not open that page.')
    }
  }

  private pushPage(L: unknown, bookId: number, path: string): void {
    lua.lua_newtable(L)
    lua.lua_newtable(L)
    lua.lua_pushinteger(L, bookId)
    lua.lua_setfield(L, -2, S('__book'))
    lua.lua_pushstring(L, S(path))
    lua.lua_setfield(L, -2, S('__page'))
    lua.lua_pushstring(L, S('page'))
    lua.lua_setfield(L, -2, S('__kind'))
    lua.lua_pushinteger(L, bookId)
    lua.lua_pushstring(L, S(path))
    lua.lua_pushcclosure(L, (state: unknown) => this.pageIndex(state), 2)
    lua.lua_setfield(L, -2, S('__index'))
    lua.lua_pushcfunction(L, (state: unknown) => this.fail(state, 'Books cannot be changed from a script.'))
    lua.lua_setfield(L, -2, S('__newindex'))
    lua.lua_setmetatable(L, -2)
  }

  private pageIndex(L: unknown): number {
    const key = lua.lua_type(L, 2) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, 2) : ''
    if (key === 'type') {
      lua.lua_pushstring(L, S('page'))
      return 1
    }
    if (key === 'path') {
      lua.lua_pushvalue(L, lua.lua_upvalueindex(2))
      return 1
    }
    if (key !== 'get') {
      lua.lua_pushnil(L)
      return 1
    }
    lua.lua_pushvalue(L, lua.lua_upvalueindex(1))
    lua.lua_pushvalue(L, lua.lua_upvalueindex(2))
    lua.lua_pushcclosure(L, (state: unknown) => this.pageGet(state), 2)
    return 1
  }

  private pageGet(L: unknown): number {
    try {
      const book = this.books.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
      const path = lua.lua_tojsstring(L, lua.lua_upvalueindex(2))
      const found = book && typeof path === 'string' ? findPage(book, path) : null
      if (!book || !found) throw new Error('That page is no longer loaded.')
      const fieldName = this.readFieldName(L, 2)
      const field = book.fields.find((item) => item.name === fieldName)
      if (!field) throw new Error(`No field "${fieldName}".`)
      this.pushPageField(L, field, found.page)
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not read that field.')
    }
  }

  private pushPageField(L: unknown, field: PageField, page: BookPage): void {
    const value = pageFieldValue(field, page)
    if (field.type !== 'bookPage') {
      this.pushValue(L, value)
      return
    }
    const ref = typeof value === 'string' ? decodeBookPage(value) : null
    if (!ref?.book || !ref.page) {
      lua.lua_pushstring(L, S(''))
      return
    }
    lua.lua_newtable(L)
    lua.lua_pushstring(L, S(ref.book))
    lua.lua_setfield(L, -2, S('book'))
    lua.lua_pushstring(L, S(ref.page))
    lua.lua_setfield(L, -2, S('page'))
  }

  private gameLoadPage(L: unknown): number {
    try {
      const object = this.readProxy(L, 1)
      if (!object || object.kind !== 'component') throw new Error('game.loadPage expects a page viewer.')
      const component = this.component(object)
      if (component?.type !== 'pageViewer') throw new Error('game.loadPage expects a page viewer.')
      const ref = this.readBookPageValue(L, 2)
      const asset = findAssetByLocation(this.hooks.assets(), ref.book, 'book')
      if (!asset || asset.type !== 'book') throw new Error(`No book at "${ref.book}".`)
      const loaded = snapshotBook(asset)
      if (!findPage(loaded, ref.page)) throw new Error(`No page at "${ref.page}".`)
      const id = this.nextId
      this.nextId += 1
      this.books.set(id, loaded)
      this.showLoadedPage(object, id, ref.page)
      return 0
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not load that page.')
    }
  }

  private readBookPageValue(L: unknown, index: number): { book: string; page: string } {
    if (lua.lua_type(L, index) !== lua.LUA_TTABLE) throw new Error('game.loadPage expects a book and a page.')
    const abs = lua.lua_absindex(L, index)
    lua.lua_getfield(L, abs, S('book'))
    const book = lua.lua_type(L, -1) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, -1) : ''
    lua.lua_pop(L, 1)
    lua.lua_getfield(L, abs, S('page'))
    const page = lua.lua_type(L, -1) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, -1) : ''
    lua.lua_pop(L, 1)
    if (typeof book !== 'string' || !book || typeof page !== 'string' || !page) throw new Error('game.loadPage expects a book and a page.')
    return { book, page }
  }

  private showLoadedPage(object: { frame: PlayFrame; componentId: string }, bookId: number, path: string): void {
    const current = { ...(object.frame.overrides[object.componentId] ?? {}) }
    current.pageBook = bookId
    current.pagePath = path
    current.pageInputs = {}
    delete current.bookRef
    object.frame.overrides[object.componentId] = current
    this.runPageLoad(object.frame, object.componentId)
    this.hooks.changed()
  }

  private viewerLoadPage(L: unknown): number {
    try {
      const object = this.objects.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
      if (!object || object.kind !== 'component') throw new Error('loadPage expects a page viewer.')
      const bookId = this.readBookId(L, 2)
      const book = this.books.get(bookId)
      if (!book) throw new Error('That book is no longer loaded.')
      if (lua.lua_type(L, 3) !== lua.LUA_TSTRING) throw new Error('loadPage expects a chapter/page path.')
      const path = lua.lua_tojsstring(L, 3)
      if (typeof path !== 'string' || !findPage(book, path)) throw new Error(`No page at "${typeof path === 'string' ? path : ''}".`)
      this.showLoadedPage(object, bookId, path)
      return 0
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not load that page.')
    }
  }

  private viewerGet(L: unknown): number {
    try {
      const object = this.objects.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
      if (!object || object.kind !== 'component') throw new Error('No page is loaded.')
      const component = this.component(object)
      if (component?.type !== 'pageViewer') throw new Error('No page is loaded.')
      const found = this.viewerContent(object.frame, object.componentId, component)
      if (!found) throw new Error('No page is loaded.')
      const fieldName = this.readFieldName(L, 2)
      const field = found.fields.find((item) => item.name === fieldName)
      if (!field) throw new Error(`No field "${fieldName}".`)
      this.pushPageField(L, field, found.page)
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not read that field.')
    }
  }

  private viewerGetInput(L: unknown): number {
    try {
      const object = this.objects.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
      if (!object || object.kind !== 'component') throw new Error('No page is loaded.')
      const component = this.component(object)
      if (component?.type !== 'pageViewer') throw new Error('No page is loaded.')
      const found = this.viewerContent(object.frame, object.componentId, component)
      if (!found) throw new Error('No page is loaded.')
      const key = this.readFieldName(L, 2)
      const value = inputValue(found.page, key, object.frame.overrides[object.componentId]?.pageInputs ?? {})
      if (value === null) throw new Error(`No input "${key}".`)
      this.pushValue(L, value)
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not read that input.')
    }
  }

  private readBookId(L: unknown, index: number): number {
    if (lua.lua_type(L, index) !== lua.LUA_TTABLE || !lua.lua_getmetatable(L, index)) throw new Error('A book is required.')
    lua.lua_getfield(L, -1, S('__id'))
    const id = lua.lua_type(L, -1) === lua.LUA_TNUMBER ? lua.lua_tointeger(L, -1) : 0
    lua.lua_pop(L, 2)
    if (!this.books.has(id)) throw new Error('A book is required.')
    return id
  }

  private callPageFunction(source: string, name: string, self: RuntimeObject, label: string): ScriptValue | undefined {
    const top = lua.lua_gettop(this.state)
    const env = this.newEnv(null)
    try {
      this.setSelf(env, self)
      this.runChunk(source, label, env)
      this.pushRef(env)
      lua.lua_pushstring(this.state, S(name))
      lua.lua_rawget(this.state, -2)
      if (!lua.lua_isfunction(this.state, -1)) {
        this.hooks.log('error', `${label}: ${name}() is missing.`)
        return undefined
      }
      lua.lua_remove(this.state, -2)
      if (lua.lua_pcall(this.state, 0, 1, 0) !== lua.LUA_OK) {
        this.hooks.log('error', `${label}: ${this.errorText()}`)
        return undefined
      }
      try {
        return this.readValue(this.state, -1)
      } catch (error) {
        this.hooks.log('error', `${label}: ${error instanceof Error ? error.message : 'A string is required.'}`)
        return undefined
      }
    } catch (error) {
      this.hooks.log('error', `${label}: ${error instanceof Error ? error.message : 'Script error'}`)
      return undefined
    } finally {
      lua.lua_settop(this.state, top)
      this.unref(env)
    }
  }

  private collectionIndex(L: unknown): number {
    const id = lua.lua_tointeger(L, lua.lua_upvalueindex(1))
    const key = lua.lua_type(L, 2) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, 2) : ''
    if (key === 'type') {
      lua.lua_pushstring(L, S('collection'))
      return 1
    }
    if (key === 'path') {
      lua.lua_pushstring(L, S(this.collectionPaths.get(id) ?? ''))
      return 1
    }
    const method =
      key === 'get'
        ? this.collectionGet
        : key === 'find'
          ? this.collectionFind
          : key === 'set'
            ? this.collectionSet
            : key === 'add'
              ? this.collectionAdd
              : key === 'remove'
                ? this.collectionRemove
                : key === 'save'
                  ? this.collectionSave
                  : key === 'load'
                    ? this.collectionLoad
                    : null
    if (!method) {
      lua.lua_pushnil(L)
      return 1
    }
    lua.lua_pushinteger(L, id)
    lua.lua_pushcclosure(L, (state: unknown) => method.call(this, state), 1)
    return 1
  }

  private collectionGet(L: unknown): number {
    const working = this.collections.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
    const key = working ? this.lookupValue(L, 2) : null
    const entry = working && key !== null ? findWorkingEntry(working, key) : null
    if (!working || !entry) {
      lua.lua_pushnil(L)
      return 1
    }
    this.pushEntry(L, lua.lua_tointeger(L, lua.lua_upvalueindex(1)), entry.uid)
    return 1
  }

  private collectionFind(L: unknown): number {
    const id = lua.lua_tointeger(L, lua.lua_upvalueindex(1))
    const working = this.collections.get(id)
    if (!working) {
      lua.lua_createtable(L, 0, 0)
      return 1
    }
    if (lua.lua_type(L, 2) !== lua.LUA_TSTRING) return this.fail(L, 'find expects a field name.')
    const fieldName = lua.lua_tojsstring(L, 2)
    const field = typeof fieldName === 'string' ? working.fields.find((item) => item.name === fieldName) : null
    if (!field || typeof fieldName !== 'string') return this.fail(L, `No field "${typeof fieldName === 'string' ? fieldName : ''}".`)
    const value = this.lookupValue(L, 3)
    const matches = value === null ? [] : working.entries.filter((entry) => !entry.removed && workingFieldValue(working, entry, field.name) === value)
    lua.lua_createtable(L, matches.length, 0)
    matches.forEach((entry, index) => {
      this.pushEntry(L, id, entry.uid)
      lua.lua_rawseti(L, -2, index + 1)
    })
    return 1
  }

  private collectionSet(L: unknown): number {
    try {
      const working = this.requireWorking(L)
      const key = this.readScalar(L, 2)
      const fieldName = this.readFieldName(L, 3)
      const entry = findWorkingEntry(working, key)
      if (!entry) throw new Error('No entry for that master key.')
      const field = working.fields.find((item) => item.name === fieldName)
      if (!field) throw new Error(`No field "${fieldName}".`)
      if (field.id === working.masterKeyId) throw new Error('The master key cannot be changed.')
      setWorkingField(working, entry, fieldName, this.readFieldValue(L, 4, field))
      return 0
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not set that value.')
    }
  }

  private collectionAdd(L: unknown): number {
    try {
      const working = this.requireWorking(L)
      const entry = addWorkingEntry(working, this.readScalar(L, 2))
      this.pushEntry(L, lua.lua_tointeger(L, lua.lua_upvalueindex(1)), entry.uid)
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not add that entry.')
    }
  }

  private collectionRemove(L: unknown): number {
    try {
      removeWorkingEntryByKey(this.requireWorking(L), this.readScalar(L, 2))
      return 0
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not remove that entry.')
    }
  }

  private collectionSave(L: unknown): number {
    try {
      this.pushValue(L, saveWorkingCollection(this.requireWorking(L)))
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not save that collection.')
    }
  }

  private collectionLoad(L: unknown): number {
    try {
      const working = this.requireWorking(L)
      if (lua.lua_type(L, 2) !== lua.LUA_TSTRING) throw new Error('load expects a save string.')
      const saved = lua.lua_tojsstring(L, 2)
      if (typeof saved !== 'string') throw new Error('load expects a save string.')
      loadWorkingCollection(working, saved)
      return 0
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not load that save.')
    }
  }

  private entryIndex(L: unknown): number {
    const key = lua.lua_type(L, 2) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, 2) : ''
    const method = key === 'get' ? this.entryGet : key === 'set' ? this.entrySet : key === 'remove' ? this.entryRemove : null
    if (!method) {
      lua.lua_pushnil(L)
      return 1
    }
    lua.lua_pushvalue(L, lua.lua_upvalueindex(1))
    lua.lua_pushvalue(L, lua.lua_upvalueindex(2))
    lua.lua_pushcclosure(L, (state: unknown) => method.call(this, state), 2)
    return 1
  }

  private entryGet(L: unknown): number {
    try {
      const { working, entry } = this.entryFrom(L)
      const fieldName = this.readFieldName(L, 2)
      this.pushValue(L, workingFieldValue(working, entry, fieldName))
      return 1
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not read that field.')
    }
  }

  private entrySet(L: unknown): number {
    try {
      const { working, entry } = this.entryFrom(L)
      const fieldName = this.readFieldName(L, 2)
      const field = working.fields.find((item) => item.name === fieldName)
      if (!field) throw new Error(`No field "${fieldName}".`)
      if (field.id === working.masterKeyId) throw new Error('The master key cannot be changed.')
      setWorkingField(working, entry, fieldName, this.readFieldValue(L, 3, field))
      return 0
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not set that value.')
    }
  }

  private entryRemove(L: unknown): number {
    try {
      const { entry } = this.entryFrom(L)
      removeWorkingEntry(entry)
      return 0
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not remove that entry.')
    }
  }

  private requireWorking(L: unknown): WorkingCollection {
    const working = this.collections.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
    if (!working) throw new Error('That collection is no longer loaded.')
    return working
  }

  private entryFrom(L: unknown): { working: WorkingCollection; entry: WorkingEntry } {
    const working = this.requireWorking(L)
    const entry = working.entries.find((item) => item.uid === lua.lua_tointeger(L, lua.lua_upvalueindex(2)))
    if (!entry || entry.removed) throw new Error('That entry has been removed.')
    return { working, entry }
  }

  private pushEntry(L: unknown, collectionId: number, uid: number): void {
    this.pushLocked(L, (state) => this.entryIndex(state), [collectionId, uid], 'entry')
  }

  private readFieldName(L: unknown, index: number): string {
    if (lua.lua_type(L, index) !== lua.LUA_TSTRING) throw new Error('A field name is required.')
    const name = lua.lua_tojsstring(L, index)
    if (typeof name !== 'string') throw new Error('A field name is required.')
    return name
  }

  private readFieldValue(L: unknown, index: number, field: { name: string; type: 'text' | 'boolean' }): CollectionScalar {
    const type = lua.lua_type(L, index)
    if (field.type === 'boolean') {
      if (type !== lua.LUA_TBOOLEAN) throw new Error(`${field.name} expects true or false.`)
      return lua.lua_toboolean(L, index) === true
    }
    if (type !== lua.LUA_TSTRING) throw new Error(`${field.name} expects text.`)
    const text = lua.lua_tojsstring(L, index)
    if (typeof text !== 'string') throw new Error(`${field.name} expects text.`)
    return text
  }

  private readScalar(L: unknown, index: number): CollectionScalar {
    const type = lua.lua_type(L, index)
    if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, index) === true
    if (type === lua.LUA_TSTRING) {
      const text = lua.lua_tojsstring(L, index)
      if (typeof text === 'string') return text
    }
    throw new Error('Collection values are text or true or false.')
  }

  private lookupValue(L: unknown, index: number): string | boolean | null {
    const type = lua.lua_type(L, index)
    if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, index) === true
    if (type === lua.LUA_TSTRING) {
      const text = lua.lua_tojsstring(L, index)
      return typeof text === 'string' ? text : null
    }
    return null
  }

  private pushLocked(L: unknown, index: (state: unknown) => number, upvalues: number[], kind: string, id?: number): void {
    lua.lua_newtable(L)
    lua.lua_newtable(L)
    for (const value of upvalues) lua.lua_pushinteger(L, value)
    lua.lua_pushcclosure(L, index, upvalues.length)
    lua.lua_setfield(L, -2, S('__index'))
    lua.lua_pushcfunction(L, (state: unknown) => this.fail(state, kind === 'collection' ? 'Collections cannot be changed from a script.' : 'That value cannot be changed from a script.'))
    lua.lua_setfield(L, -2, S('__newindex'))
    lua.lua_pushstring(L, S(kind))
    lua.lua_setfield(L, -2, S('__kind'))
    if (id !== undefined) {
      lua.lua_pushinteger(L, id)
      lua.lua_setfield(L, -2, S('__id'))
    }
    lua.lua_setmetatable(L, -2)
  }

  private newEnv(parentRef: number | null): number {
    lua.lua_newtable(this.state)
    lua.lua_newtable(this.state)
    if (parentRef === null) lua.lua_pushglobaltable(this.state)
    else this.pushRef(parentRef)
    lua.lua_setfield(this.state, -2, S('__index'))
    lua.lua_setmetatable(this.state, -2)
    return lauxlib.luaL_ref(this.state, lua.LUA_REGISTRYINDEX)
  }

  private pushRawField(envRef: number, key: string): boolean {
    this.pushRef(envRef)
    lua.lua_pushstring(this.state, S(key))
    lua.lua_rawget(this.state, -2)
    lua.lua_remove(this.state, -2)
    if (lua.lua_isnil(this.state, -1)) {
      lua.lua_pop(this.state, 1)
      return false
    }
    return true
  }

  private pushRef(ref: number): void {
    lua.lua_rawgeti(this.state, lua.LUA_REGISTRYINDEX, ref)
  }

  private unref(ref: number): void {
    lauxlib.luaL_unref(this.state, lua.LUA_REGISTRYINDEX, ref)
  }

  private setCurrentMenu(object: RuntimeObject | null): void {
    this.menuFrame = object?.kind === 'menu' ? object.frame : null
    lua.lua_getglobal(this.state, S('game'))
    if (object) this.pushProxy(object)
    else lua.lua_pushnil(this.state)
    lua.lua_setfield(this.state, -2, S('currentMenu'))
    lua.lua_pop(this.state, 1)
  }

  private setCurrentModal(object: RuntimeObject | null): void {
    this.modalFrame = object?.kind === 'menu' ? object.frame : null
    lua.lua_getglobal(this.state, S('game'))
    if (object) this.pushProxy(object)
    else lua.lua_pushnil(this.state)
    lua.lua_setfield(this.state, -2, S('currentModal'))
    lua.lua_pop(this.state, 1)
  }

  private readProxy(L: unknown, index: number): RuntimeObject | null {
    if (lua.lua_type(L, index) !== lua.LUA_TTABLE || !lua.lua_getmetatable(L, index)) return null
    lua.lua_getfield(L, -1, S('__id'))
    const id = lua.lua_type(L, -1) === lua.LUA_TNUMBER ? lua.lua_tointeger(L, -1) : 0
    lua.lua_pop(L, 2)
    return this.objects.get(id) ?? null
  }

  private refreshProperties(frame: PlayFrame): void {
    const menu = this.menu(frame.menuId)
    const compiled = this.compiled.get(frame)
    if (!menu || !compiled) return
    this.bindTree(menu.components, '', [], compiled)
  }

  private bindTree(components: MenuComponent[], parent: string, stack: string[], compiled: CompiledMenu): void {
    for (const component of components) {
      const id = parent ? `${parent}/${component.id}` : component.id
      if (component.type === 'composite' && component.compositeId && !stack.includes(component.compositeId)) {
        const asset = compositeById(this.hooks.assets(), component.compositeId)
        const env = compiled.composites.get(id)
        if (env !== undefined && asset) this.bindProperties(env, component, asset)
        if (asset) this.bindTree(asset.components, id, [...stack, asset.id], compiled)
        continue
      }
      if (component.type === 'composite') continue
      const env = compiled.components.get(id)
      if (env !== undefined) this.bindProperties(env, component, null)
    }
  }

  private bindProperties(envRef: number, component: MenuComponent, asset: CompositeAsset | null): void {
    const shared = asset ? sourceFor(this.hooks.assets(), asset.scriptId) : sourceFor(this.hooks.assets(), component.scriptId)
    const local = asset ? asset.script : component.script
    const values = component.properties ?? {}
    for (const property of componentProperties(shared, local)) {
      this.pushRef(envRef)
      this.pushScriptProperty(property.type, values[property.name])
      lua.lua_setfield(this.state, -2, S(property.name))
      lua.lua_pop(this.state, 1)
    }
  }

  private pushScriptProperty(type: ScriptPropertyType, value: string | boolean | number | undefined): void {
    if (type === 'boolean') {
      lua.lua_pushboolean(this.state, value === true)
      return
    }
    if (type === 'integer' || type === 'float') {
      const number = scriptPropertyNumber(value, type === 'integer')
      if (type === 'integer') lua.lua_pushinteger(this.state, number)
      else lua.lua_pushnumber(this.state, number)
      return
    }
    if (type === 'bookPage') {
      const ref = typeof value === 'string' ? decodeBookPage(value) : null
      if (!ref?.book || !ref.page) {
        lua.lua_pushstring(this.state, S(''))
        return
      }
      lua.lua_newtable(this.state)
      lua.lua_pushstring(this.state, S(ref.book))
      lua.lua_setfield(this.state, -2, S('book'))
      lua.lua_pushstring(this.state, S(ref.page))
      lua.lua_setfield(this.state, -2, S('page'))
      return
    }
    lua.lua_pushstring(this.state, S(typeof value === 'string' ? value : ''))
  }

  private setSelf(envRef: number, object: RuntimeObject): void {
    this.pushRef(envRef)
    this.pushProxy(object)
    lua.lua_setfield(this.state, -2, S('self'))
    lua.lua_pop(this.state, 1)
  }

  private pushProxy(object: RuntimeObject): void {
    const id = this.nextId
    this.nextId += 1
    this.objects.set(id, object)
    lua.lua_newtable(this.state)
    lua.lua_newtable(this.state)
    lua.lua_pushinteger(this.state, id)
    lua.lua_pushcclosure(this.state, (L: unknown) => this.indexProxy(L), 1)
    lua.lua_setfield(this.state, -2, S('__index'))
    lua.lua_pushinteger(this.state, id)
    lua.lua_pushcclosure(this.state, (L: unknown) => this.newIndexProxy(L), 1)
    lua.lua_setfield(this.state, -2, S('__newindex'))
    lua.lua_pushinteger(this.state, id)
    lua.lua_setfield(this.state, -2, S('__id'))
    lua.lua_setmetatable(this.state, -2)
  }

  private indexProxy(L: unknown): number {
    const object = this.objects.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
    const key = lua.lua_type(L, 2) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, 2) : ''
    if (!object || typeof key !== 'string') {
      lua.lua_pushnil(L)
      return 1
    }
    if (object.kind === 'menu') {
      const component = this.componentByHandle(object.frame, key)
      if (!component) {
        lua.lua_pushnil(L)
        return 1
      }
      this.pushPiece(object.frame, component.id, component)
      return 1
    }
    if (object.kind === 'composite') {
      const asset = this.compositeAsset(object.frame, object.instanceId)
      const child = key ? asset?.components.find((item) => item.handle === key) : undefined
      if (child) {
        this.pushPiece(object.frame, `${object.instanceId}/${child.id}`, child)
        return 1
      }
      const menu = this.menu(object.frame.menuId)
      const piece = menu ? resolvePiece(menu, this.hooks.assets(), object.instanceId) : null
      if (!piece) {
        lua.lua_pushnil(L)
        return 1
      }
      if (key === 'enabled' || key === 'visible') {
        this.pushValue(L, readComponentProperty(piece.component, object.frame.overrides[object.instanceId], this.hooks.assets(), key))
        return 1
      }
      const env = this.compiled.get(object.frame)?.composites.get(object.instanceId)
      if (env !== undefined && this.pushRawField(env, key)) return 1
      lua.lua_pushnil(L)
      return 1
    }
    if (key === 'click') {
      const clicked = this.component(object)
      if (clicked?.type !== 'button' && clicked?.type !== 'image') {
        lua.lua_pushnil(L)
        return 1
      }
      lua.lua_pushinteger(L, lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
      lua.lua_pushcclosure(L, (state: unknown) => this.clickProxy(state), 1)
      return 1
    }
    const component = this.component(object)
    if (!component) {
      lua.lua_pushnil(L)
      return 1
    }
    if (component.type === 'pageViewer' && key === 'finished') {
      lua.lua_pushboolean(L, this.viewerFinished(object.frame, object.componentId))
      return 1
    }
    if (component.type === 'pageViewer' && (key === 'loadPage' || key === 'get' || key === 'getInput' || key === 'start' || key === 'stop' || key === 'resume' || key === 'finish')) {
      const method =
        key === 'loadPage'
          ? this.viewerLoadPage
          : key === 'get'
            ? this.viewerGet
            : key === 'getInput'
              ? this.viewerGetInput
              : key === 'start'
                ? this.viewerStart
                : key === 'stop'
                  ? this.viewerStop
                  : key === 'resume'
                    ? this.viewerResume
                    : this.viewerFinish
      lua.lua_pushinteger(L, lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
      lua.lua_pushcclosure(L, (state: unknown) => method.call(this, state), 1)
      return 1
    }
    if (component.type === 'pageViewer' && !pageViewerOwn.has(key) && this.pushViewerFunction(L, object.frame, object.componentId, key)) return 1
    if (component.type === 'pageViewer' && key === 'book') {
      const bookId = object.frame.overrides[object.componentId]?.pageBook
      if (bookId !== undefined) {
        this.pushValue(L, this.books.get(bookId)?.location ?? null)
        return 1
      }
    }
    this.pushValue(L, readComponentProperty(component, object.frame.overrides[object.componentId], this.hooks.assets(), key))
    return 1
  }

  private newIndexProxy(L: unknown): number {
    const object = this.objects.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
    const key = lua.lua_type(L, 2) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, 2) : ''
    if (!object || typeof key !== 'string') return this.fail(L, 'That value cannot be changed from a script.')
    if (object.kind === 'composite') {
      const asset = this.compositeAsset(object.frame, object.instanceId)
      if (key && asset?.components.some((item) => item.handle === key)) return this.fail(L, 'That value cannot be changed from a script.')
      if (key === 'enabled' || key === 'visible') {
        try {
          const menu = this.menu(object.frame.menuId)
          if (!menu) throw new Error('That menu is no longer open.')
          writeComponentProperty(menu, object.instanceId, object.frame.overrides, key, this.readValue(L, 3), this.hooks.assets())
          this.hooks.changed()
        } catch (error) {
          return this.fail(L, error instanceof Error ? error.message : 'Could not update that value.')
        }
        return 0
      }
      const env = this.compiled.get(object.frame)?.composites.get(object.instanceId)
      if (env === undefined) return this.fail(L, 'That value cannot be changed from a script.')
      this.pushRef(env)
      lua.lua_pushvalue(this.state, 3)
      lua.lua_setfield(this.state, -2, S(key))
      lua.lua_pop(this.state, 1)
      return 0
    }
    if (object.kind !== 'component') return this.fail(L, 'That value cannot be changed from a script.')
    const component = this.component(object)
    if (component?.type === 'pageViewer' && key === 'finished') return this.fail(L, 'finished cannot be changed.')
    if (component?.type === 'pageViewer' && lua.lua_isfunction(L, 3) && !pageViewerOwn.has(key)) {
      this.storeViewerFunction(object.frame, object.componentId, key)
      return 0
    }
    try {
      const menu = this.menu(object.frame.menuId)
      if (!menu) throw new Error('That menu is no longer open.')
      writeComponentProperty(menu, object.componentId, object.frame.overrides, key, this.readValue(L, 3), this.hooks.assets())
      if (component?.type === 'pageViewer' && key === 'progressive') this.syncProgressive(object.frame, object.componentId)
      this.hooks.changed()
      if (component?.type === 'pageViewer' && (key === 'book' || key === 'page')) this.runPageLoad(object.frame, object.componentId)
    } catch (error) {
      return this.fail(L, error instanceof Error ? error.message : 'Could not update that value.')
    }
    return 0
  }

  private clickProxy(L: unknown): number {
    const object = this.objects.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
    if (object?.kind === 'component') this.activate(object.frame, object.componentId)
    return 0
  }

  private pushValue(L: unknown, value: ScriptValue): void {
    if (typeof value === 'string') lua.lua_pushstring(L, S(value))
    else if (typeof value === 'boolean') lua.lua_pushboolean(L, value)
    else if (typeof value === 'number') lua.lua_pushnumber(L, value)
    else if (Array.isArray(value)) {
      lua.lua_createtable(L, value.length, 0)
      value.forEach((item, index) => {
        lua.lua_pushstring(L, S(item))
        lua.lua_rawseti(L, -2, index + 1)
      })
    } else lua.lua_pushnil(L)
  }

  private readValue(L: unknown, index: number): ScriptValue {
    const type = lua.lua_type(L, index)
    if (type === lua.LUA_TNIL || type === lua.LUA_TNONE) return null
    if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, index) === true
    if (type === lua.LUA_TNUMBER) return lua.lua_tonumber(L, index)
    if (type === lua.LUA_TSTRING) return lua.lua_tojsstring(L, index)
    if (type === lua.LUA_TTABLE) return this.readStringList(L, index)
    throw new Error('Scripts can set text, numbers, lists of text, paths, and true or false.')
  }

  private readStringList(L: unknown, index: number): string[] {
    const abs = lua.lua_absindex(L, index)
    const list: string[] = []
    for (let item = 1; ; item += 1) {
      lua.lua_rawgeti(L, abs, item)
      if (lua.lua_type(L, -1) === lua.LUA_TNIL) {
        lua.lua_pop(L, 1)
        break
      }
      if (lua.lua_type(L, -1) !== lua.LUA_TSTRING) {
        lua.lua_pop(L, 1)
        throw new Error('A list of text is required.')
      }
      const text = lua.lua_tojsstring(L, -1)
      lua.lua_pop(L, 1)
      if (typeof text !== 'string') throw new Error('A list of text is required.')
      list.push(text)
    }
    return list
  }

  private fail(L: unknown, message: string): number {
    lauxlib.luaL_error(L, S(message.replace(/%/g, '%%')))
    return 0
  }

  private errorText(): string {
    const text = lua.lua_tojsstring(this.state, -1)
    return typeof text === 'string' ? text : 'Script error'
  }

  private menu(menuId: string): MenuAsset | null {
    const asset = this.hooks.assets().find((item) => item.id === menuId)
    return asset?.type === 'menu' ? asset : null
  }

  loadPages(frame: PlayFrame): void {
    const menu = this.menu(frame.menuId)
    if (!menu) return
    visitPieces(menu, this.hooks.assets(), ({ instanceId, component }) => {
      if (component.type === 'pageViewer') this.runPageLoad(frame, instanceId)
    })
  }

  private runPageLoad(frame: PlayFrame, componentId: string): void {
    const component = this.component({ frame, componentId })
    if (component?.type !== 'pageViewer') return
    const found = this.viewerContent(frame, componentId, component)
    this.dropMethods(frame, componentId)
    if (!found) {
      this.reveals.get(frame)?.delete(componentId)
      return
    }
    this.beginReveal(frame, componentId)
    const source = found.page.script ?? ''
    if (!source.trim()) return
    const label = `${found.page.name} onLoad`
    const top = lua.lua_gettop(this.state)
    const env = this.newEnv(null)
    try {
      this.runChunk(source, label, env)
      this.pushRef(env)
      lua.lua_pushstring(this.state, S('onLoad'))
      lua.lua_rawget(this.state, -2)
      if (!lua.lua_isfunction(this.state, -1)) {
        this.hooks.log('error', `${label}: onLoad() is missing.`)
        return
      }
      lua.lua_remove(this.state, -2)
      this.pushProxy({ kind: 'component', frame, componentId })
      if (lua.lua_pcall(this.state, 1, 0, 0) !== lua.LUA_OK) {
        this.hooks.log('error', `${label}: ${this.errorText()}`)
      }
    } catch (error) {
      this.hooks.log('error', `${label}: ${error instanceof Error ? error.message : 'Script error'}`)
    } finally {
      lua.lua_settop(this.state, top)
      this.unref(env)
    }
  }

  advanceText(frames: PlayFrame[], elapsedMs: number): boolean {
    const elapsed = Math.min(Math.max(elapsedMs, 0), 500)
    if (elapsed <= 0) return false
    let changed = false
    for (const frame of frames) {
      const viewers = this.reveals.get(frame)
      if (!viewers) continue
      for (const [componentId, reveal] of viewers) {
        if (!reveal.playing || !this.viewerProgressive(frame, componentId)) continue
        if (reveal.total < 0) this.measureReveal(frame, componentId)
        if (reveal.shown >= reveal.total) {
          reveal.playing = false
          reveal.carry = 0
          continue
        }
        reveal.carry += (elapsed / 1000) * this.viewerRate(frame, componentId)
        const steps = Math.floor(reveal.carry)
        if (steps <= 0) continue
        reveal.carry -= steps
        reveal.shown = Math.min(reveal.total, reveal.shown + steps)
        if (reveal.shown >= reveal.total) {
          reveal.playing = false
          reveal.carry = 0
        }
        changed = true
      }
    }
    return changed
  }

  private viewerStart(L: unknown): number {
    return this.viewerCommand(L, 'start')
  }

  private viewerStop(L: unknown): number {
    return this.viewerCommand(L, 'stop')
  }

  private viewerResume(L: unknown): number {
    return this.viewerCommand(L, 'resume')
  }

  private viewerFinish(L: unknown): number {
    return this.viewerCommand(L, 'finish')
  }

  private viewerCommand(L: unknown, action: 'start' | 'stop' | 'resume' | 'finish'): number {
    const object = this.objects.get(lua.lua_tointeger(L, lua.lua_upvalueindex(1)))
    if (!object || object.kind !== 'component') return this.fail(L, 'No page is loaded.')
    const component = this.component(object)
    if (component?.type !== 'pageViewer') return this.fail(L, 'No page is loaded.')
    const reveal = this.ensureReveal(object.frame, object.componentId)
    if (action === 'start') {
      this.setProgressive(object.frame, object.componentId, true)
      reveal.shown = 0
      reveal.carry = 0
      reveal.playing = true
    } else if (action === 'stop') {
      reveal.playing = false
      reveal.carry = 0
    } else if (action === 'resume') {
      if (this.viewerProgressive(object.frame, object.componentId) && (reveal.total < 0 || reveal.shown < reveal.total)) reveal.playing = true
    } else {
      if (reveal.total < 0) this.measureReveal(object.frame, object.componentId)
      if (reveal.total >= 0) reveal.shown = reveal.total
      reveal.playing = false
      reveal.carry = 0
    }
    this.hooks.changed()
    return 0
  }

  private syncProgressive(frame: PlayFrame, componentId: string): void {
    const reveal = this.ensureReveal(frame, componentId)
    if (this.viewerProgressive(frame, componentId)) {
      reveal.shown = 0
      reveal.carry = 0
      reveal.total = -1
      reveal.playing = true
      return
    }
    reveal.playing = false
    reveal.carry = 0
    if (reveal.total >= 0) reveal.shown = reveal.total
  }

  private beginReveal(frame: PlayFrame, componentId: string): void {
    const reveal = this.ensureReveal(frame, componentId)
    reveal.shown = 0
    reveal.carry = 0
    reveal.total = -1
    reveal.playing = this.viewerProgressive(frame, componentId)
  }

  private noteReveal(frame: PlayFrame, componentId: string, total: number): TextReveal {
    const reveal = this.ensureReveal(frame, componentId)
    const wasComplete = reveal.total >= 0 && !reveal.playing && reveal.shown >= reveal.total
    reveal.total = total
    if (wasComplete || reveal.shown > total) reveal.shown = total
    if (reveal.shown >= total) {
      reveal.playing = false
      reveal.carry = 0
    }
    return reveal
  }

  private measureReveal(frame: PlayFrame, componentId: string): void {
    const component = this.component({ frame, componentId })
    if (component?.type !== 'pageViewer') return
    if (!this.viewerContent(frame, componentId, component)) {
      const reveal = this.ensureReveal(frame, componentId)
      reveal.total = 0
      reveal.shown = 0
      reveal.playing = false
      return
    }
    this.displayViewer(frame, componentId, component)
  }

  private viewerFinished(frame: PlayFrame, componentId: string): boolean {
    if (!this.viewerProgressive(frame, componentId)) return true
    const reveal = this.reveals.get(frame)?.get(componentId)
    if (!reveal) return true
    if (reveal.total < 0) return false
    return reveal.shown >= reveal.total
  }

  private viewerProgressive(frame: PlayFrame, componentId: string): boolean {
    const component = this.component({ frame, componentId })
    if (component?.type !== 'pageViewer') return false
    const override = frame.overrides[componentId]?.progressive
    return typeof override === 'boolean' ? override : component.progressive
  }

  private viewerRate(frame: PlayFrame, componentId: string): number {
    const component = this.component({ frame, componentId })
    if (component?.type !== 'pageViewer') return 1
    const override = frame.overrides[componentId]?.rate
    const rate = typeof override === 'number' ? override : component.rate
    return rate > 0 ? rate : 1
  }

  private setProgressive(frame: PlayFrame, componentId: string, value: boolean): void {
    const current = { ...(frame.overrides[componentId] ?? {}) }
    current.progressive = value
    frame.overrides[componentId] = current
  }

  private ensureReveal(frame: PlayFrame, componentId: string): TextReveal {
    let viewers = this.reveals.get(frame)
    if (!viewers) {
      viewers = new Map()
      this.reveals.set(frame, viewers)
    }
    const existing = viewers.get(componentId)
    if (existing) return existing
    const reveal: TextReveal = { shown: 0, total: -1, playing: false, carry: 0 }
    viewers.set(componentId, reveal)
    return reveal
  }

  private ensureMethods(frame: PlayFrame, componentId: string): number {
    let tables = this.pageMethods.get(frame)
    if (!tables) {
      tables = new Map()
      this.pageMethods.set(frame, tables)
    }
    const existing = tables.get(componentId)
    if (existing !== undefined) return existing
    lua.lua_newtable(this.state)
    const ref = lauxlib.luaL_ref(this.state, lua.LUA_REGISTRYINDEX)
    tables.set(componentId, ref)
    return ref
  }

  private dropMethods(frame: PlayFrame, componentId: string): void {
    const tables = this.pageMethods.get(frame)
    const ref = tables?.get(componentId)
    if (!tables || ref === undefined) return
    this.unref(ref)
    tables.delete(componentId)
  }

  private dropFrameMethods(frame: PlayFrame): void {
    const tables = this.pageMethods.get(frame)
    if (!tables) return
    for (const ref of tables.values()) this.unref(ref)
    this.pageMethods.delete(frame)
  }

  private storeViewerFunction(frame: PlayFrame, componentId: string, key: string): void {
    const ref = this.ensureMethods(frame, componentId)
    this.pushRef(ref)
    lua.lua_pushvalue(this.state, 3)
    lua.lua_setfield(this.state, -2, S(key))
    lua.lua_pop(this.state, 1)
  }

  private pushViewerFunction(L: unknown, frame: PlayFrame, componentId: string, key: string): boolean {
    const ref = this.pageMethods.get(frame)?.get(componentId)
    if (ref === undefined) return false
    this.pushRef(ref)
    lua.lua_getfield(L, -1, S(key))
    lua.lua_remove(L, -2)
    if (lua.lua_type(L, -1) === lua.LUA_TNIL) {
      lua.lua_pop(L, 1)
      return false
    }
    return true
  }

  private component(object: { frame: PlayFrame; componentId: string }): MenuComponent | null {
    const menu = this.menu(object.frame.menuId)
    if (!menu) return null
    return resolvePiece(menu, this.hooks.assets(), object.componentId)?.component ?? null
  }

  private compositeAsset(frame: PlayFrame, id: string): CompositeAsset | null {
    const menu = this.menu(frame.menuId)
    const piece = menu ? resolvePiece(menu, this.hooks.assets(), id) : null
    if (piece?.component.type !== 'composite') return null
    return compositeById(this.hooks.assets(), piece.component.compositeId)
  }

  private pushPiece(frame: PlayFrame, id: string, component: MenuComponent): void {
    if (component.type === 'composite') this.pushProxy({ kind: 'composite', frame, instanceId: id })
    else this.pushProxy({ kind: 'component', frame, componentId: id })
  }

  private componentByHandle(frame: PlayFrame, handle: string): MenuComponent | null {
    if (!handle) return null
    return this.menu(frame.menuId)?.components.find((item) => item.handle === handle) ?? null
  }
}

function sourceFor(assets: Asset[], scriptId: string | null): string {
  if (!scriptId) return ''
  const asset = assets.find((item) => item.id === scriptId)
  return asset?.type === 'script' ? asset.source : ''
}

function scriptStamp(menu: MenuAsset, assets: Asset[]): string {
  const canvas = (components: MenuComponent[], script: string, scriptId: string | null, stack: string[]): unknown => ({
    script,
    shared: sourceFor(assets, scriptId),
    components: components.map((component) => {
      const nested = component.type === 'composite' ? compositeById(assets, component.compositeId) : null
      const cycle = nested ? stack.includes(nested.id) : false
      return {
        id: component.id,
        handle: component.handle,
        script: component.type === 'composite' ? '' : component.script,
        shared: component.type === 'composite' ? '' : sourceFor(assets, component.scriptId),
        nested: nested && !cycle ? canvas(nested.components, nested.script, nested.scriptId, [...stack, nested.id]) : null
      }
    })
  })
  return JSON.stringify(canvas(menu.components, menu.script, menu.scriptId, [menu.id]))
}
