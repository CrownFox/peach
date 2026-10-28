import { defineStore } from 'pinia'
import { PlaySession } from '@shared/playSession'
import { saveFileName, storageSavePort, type SaveKind, type SavePort } from '@shared/saves'
import type { PageDisplay } from '@shared/books'
import type { ComponentOverride, SceneOverrides, ScriptValue } from '@shared/overrides'
import type { Asset } from '@shared/types'

let session: PlaySession | null = null
let publishing = false

export const usePlayStore = defineStore('play', {
  state: () => ({
    history: [] as string[],
    index: 0,
    pressedId: null as string | null,
    logs: [] as { tone: 'message' | 'error'; text: string }[],
    overrides: {} as SceneOverrides,
    pages: {} as Record<string, PageDisplay>,
    modals: [] as { menuId: string; overrides: SceneOverrides }[],
    assetsOf: (() => []) as () => Asset[],
    projectDir: null as string | null
  }),
  getters: {
    currentId(state): string | null {
      return state.history[state.index] ?? null
    },
    canBack(state): boolean {
      return state.index > 0
    },
    canForward(state): boolean {
      return state.index < state.history.length - 1
    }
  },
  actions: {
    bindAssets(assetsOf: () => Asset[]) {
      this.assetsOf = assetsOf
      if (session) session.assetsOf = assetsOf
    },
    bindProject(projectDir: string | null) {
      this.projectDir = projectDir
    },
    reset(entryId: string | null) {
      session?.dispose()
      session = new PlaySession()
      session.attachSaves(this.projectDir ? editorSavePort(this.projectDir) : null)
      session.assetsOf = this.assetsOf
      session.onChange = () => this.publish()
      session.reset(entryId)
      this.pressedId = null
      this.publish()
    },
    open(menuId: string) {
      if (!menuId) return
      session?.navigate(menuId)
      this.publish()
    },
    back() {
      session?.back()
      this.publish()
    },
    forward() {
      session?.forward()
      this.publish()
    },
    jump(index: number) {
      session?.jump(index)
      this.publish()
    },
    activate(componentId: string) {
      session?.activate(componentId)
      this.publish()
    },
    pressKey(code: string, edge: 'down' | 'up', fire = true): boolean {
      const handled = session?.pressKey(code, edge, fire) ?? false
      if (handled && fire) this.publish()
      return handled
    },
    setTyping(typing: boolean) {
      session?.setTyping(typing)
    },
    setDisplayScale(scale: number) {
      session?.setDisplayScale(scale)
    },
    setPointer(point: { x: number; y: number } | null, viewport: { width: number; height: number }) {
      session?.setPointer(point, viewport)
    },
    pointerDown() {
      session?.pointerDown()
    },
    pointerUp() {
      session?.pointerUp()
    },
    tick(elapsedMs: number) {
      session?.tick(elapsedMs)
    },
    advanceText(elapsedMs: number) {
      session?.advanceText(elapsedMs)
    },
    setControl(componentId: string, value: ScriptValue) {
      session?.setControl(componentId, value)
      this.publish()
    },
    clearOverride(menuId: string, componentId: string, key: keyof ComponentOverride) {
      session?.clearOverride(menuId, componentId, key)
      this.publish()
    },
    prune(menuIds: Set<string>) {
      session?.prune(menuIds)
      this.publish()
    },
    setPageInput(componentId: string, key: string, value: string) {
      session?.setPageInput(componentId, key, value)
      this.publish()
    },
    publish() {
      if (!session || publishing) return
      publishing = true
      try {
        session.refreshPages()
        this.history = session.frames.map((frame) => frame.menuId)
        this.index = session.index
        this.logs = [...session.logs]
        this.overrides = session.currentOverrides()
        this.modals = session.modals.map((frame) => ({ menuId: frame.menuId, overrides: { ...frame.overrides } }))
        this.pages = session.pages
      } finally {
        publishing = false
      }
    }
  }
})

function editorSavePort(projectDir: string): SavePort {
  const stored = storageSavePort(`peach-saves:${projectDir}`)
  return {
    read: stored.read,
    write: stored.write,
    pickImport: (_kind: SaveKind, accept) => {
      void window.peach.readTextFile().then((text) => {
        if (text != null) accept(text)
      })
    },
    pickExport: (kind, text) => {
      void window.peach.writeTextFile(saveFileName(kind), text)
    }
  }
}
