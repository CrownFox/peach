import { defineStore } from 'pinia'
import { doodadScripts } from '@shared/books'
import { createMenuComponent, duplicateMenuComponent } from '@shared/assets'
import { canvasComponents, findComponent, placeInCanvas, type LayerPlace } from '@shared/zField'
import { componentScriptTemplate } from '@shared/componentScript'
import { joinPath } from '@shared/paths'
import { buildTree, expandFolderPath } from '@shared/tree'
import { defaultWorkspace, GAME_PROPERTIES_WINDOW } from '@shared/workspace'
import type { Asset, AssetType, MenuComponent, ProjectSnapshot, WorkspaceWindow } from '@shared/types'
import { isCanvas, isMenu } from '@shared/types'
import { ipcError } from '@/ipcError'
import { usePlayStore } from './play'
import { useSessionStore } from './session'

const assetTimers = new Map<string, ReturnType<typeof setTimeout>>()
let workspaceTimer: ReturnType<typeof setTimeout> | null = null

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    projectDir: null as string | null,
    meta: null as ProjectSnapshot['meta'] | null,
    folders: [] as string[],
    assets: [] as Asset[],
    workspace: defaultWorkspace(),
    warnings: [] as string[],
    busy: false,
    saveState: 'Saved'
  }),
  getters: {
    isOpen: (state) => state.projectDir !== null,
    tree: (state) => buildTree(state.folders, state.assets),
    menus: (state) => state.assets.filter(isMenu),
    entryMenu: (state) => state.assets.find((asset) => isMenu(asset) && asset.id === state.meta?.entryMenuId) ?? null,
    focusedWindow(state): WorkspaceWindow | null {
      return [...state.workspace.windows].sort((left, right) => right.z - left.z)[0] ?? null
    }
  },
  actions: {
    asset(id: string | null): Asset | null {
      if (!id) return null
      return this.assets.find((asset) => asset.id === id) ?? null
    },
    applySnapshot(snapshot: ProjectSnapshot, resetPlay = false, openFolder?: string) {
      this.projectDir = snapshot.projectDir
      this.meta = snapshot.meta
      this.folders = snapshot.folders
      this.assets = snapshot.assets
      this.workspace =
        openFolder === undefined
          ? snapshot.workspace
          : { ...snapshot.workspace, expanded: expandFolderPath(snapshot.workspace.expanded, openFolder) }
      this.warnings = snapshot.warnings
      this.workspace.openScriptTabs = this.workspace.openScriptTabs.filter((tab) => this.scriptTabAlive(tab))
      if (this.workspace.activeTab.startsWith('script:') && !this.workspace.openScriptTabs.includes(this.workspace.activeTab.slice(7))) {
        this.workspace.activeTab = 'game'
      }
      const play = usePlayStore()
      play.bindProject(snapshot.projectDir)
      play.bindAssets(() => this.assets)
      if (resetPlay) play.reset(snapshot.meta.entryMenuId)
      else play.prune(new Set(snapshot.assets.filter(isMenu).map((menu) => menu.id)))
      const session = useSessionStore()
      if (session.selectedComponentId && !this.componentExists(session.selectedComponentId)) {
        session.selectedComponentId = null
      }
    },
    componentExists(componentId: string): boolean {
      return this.assets.some((asset) => isCanvas(asset) && canvasComponents(asset.components).some((component) => component.id === componentId))
    },
    async openProject(dir: string): Promise<'opened' | 'unsaved' | 'failed'> {
      let result: 'opened' | 'unsaved' | 'failed' = 'failed'
      await this.run(async () => {
        if (this.projectDir && !(await this.flushAll())) {
          result = 'unsaved'
          return
        }
        const snapshot = await window.peach.openProject(dir)
        this.applySnapshot(snapshot, true)
        this.releaseVisit()
        const session = useSessionStore()
        if (snapshot.warnings.length > 0) session.info(snapshot.warnings.join(' '))
        result = 'opened'
      })
      return result
    },
    async createProject(parentDir: string, name: string) {
      await this.run(async () => {
        if (this.projectDir && !(await this.flushAll())) return
        const snapshot = await window.peach.createProject(parentDir, name)
        this.applySnapshot(snapshot, true)
        this.releaseVisit()
      })
    },
    releaseVisit(): void {
      const session = useSessionStore()
      session.clearBanner()
      session.selectedTreePath = ''
      session.selectedComponentId = null
      session.tilemapEdit = null
      session.renamingPath = null
      session.focusNameAssetId = null
    },
    async createFolder(parentRelative: string) {
      this.expandFolder(parentRelative)
      await this.structural(async () => {
        const result = await window.peach.createFolder(this.requireDir(), parentRelative)
        this.applySnapshot(result.snapshot, false, parentRelative)
        const session = useSessionStore()
        session.selectedTreePath = result.createdPath ?? parentRelative
        session.renamingPath = result.createdPath ?? null
      })
    },
    async createAsset(parentRelative: string, type: AssetType) {
      this.expandFolder(parentRelative)
      await this.structural(async () => {
        const result = await window.peach.createAsset(this.requireDir(), parentRelative, type)
        this.applySnapshot(result.snapshot, false, parentRelative)
        if (result.createdId) this.openAsset(result.createdId)
        const session = useSessionStore()
        session.selectedTreePath = result.createdPath ?? parentRelative
        const editsNameInEditor = type === 'image' || type === 'button' || type === 'panel'
        session.renamingPath = editsNameInEditor ? null : (result.createdPath ?? null)
        session.focusNameAssetId = editsNameInEditor ? (result.createdId ?? null) : null
      })
    },
    expandFolder(folderPath: string) {
      const expanded = expandFolderPath(this.workspace.expanded, folderPath)
      const same =
        expanded.length === this.workspace.expanded.length &&
        expanded.every((path, index) => path === this.workspace.expanded[index])
      if (same) return
      this.workspace = { ...this.workspace, expanded }
      this.scheduleWorkspace()
    },
    async moveNode(relativePath: string, destFolder: string) {
      const destination = joinPath(destFolder, relativePath.split('/').pop() ?? '')
      await this.structural(async () => {
        const snapshot = await window.peach.moveNode(this.requireDir(), relativePath, destFolder)
        this.applySnapshot(snapshot)
        useSessionStore().selectedTreePath = destination
      })
    },
    async rename(relativePath: string, name: string) {
      const trimmed = name.trim()
      if (!trimmed) return
      await this.structural(async () => {
        const snapshot = await window.peach.renameNode(this.requireDir(), relativePath, trimmed)
        this.applySnapshot(snapshot)
      })
    },
    async duplicate(relativePath: string) {
      await this.structural(async () => {
        const snapshot = await window.peach.duplicateNode(this.requireDir(), relativePath)
        this.applySnapshot(snapshot)
      })
    },
    async deleteNode(relativePath: string) {
      await this.structural(async () => {
        const snapshot = await window.peach.deleteNode(this.requireDir(), relativePath)
        this.applySnapshot(snapshot)
      })
    },
    async setEntry(menuId: string) {
      if (!this.meta) return
      const previous = this.meta.entryMenuId
      const meta = cloneData({ ...this.meta, entryMenuId: menuId })
      this.meta = meta
      await this.run(async () => {
        try {
          await window.peach.saveMeta(this.requireDir(), meta)
        } catch (error) {
          if (this.meta) this.meta = { ...this.meta, entryMenuId: previous }
          throw error
        }
      })
    },
    async updateMeta(patch: { name?: string; author?: string }) {
      if (!this.meta) return
      const previous = { name: this.meta.name, author: this.meta.author }
      const meta = cloneData({ ...this.meta, ...patch })
      this.meta = meta
      await this.run(async () => {
        try {
          await window.peach.saveMeta(this.requireDir(), meta)
        } catch (error) {
          if (this.meta) this.meta = { ...this.meta, ...previous }
          throw error
        }
      })
    },
    openGameProperties() {
      this.ensureWindow(GAME_PROPERTIES_WINDOW, 420, 520)
      this.focusWindow(GAME_PROPERTIES_WINDOW)
      this.setTab('editor')
    },
    async importGameIcon() {
      const source = await window.peach.chooseImage()
      if (!source) return
      await this.structural(async () => {
        const snapshot = await window.peach.importGameIcon(this.requireDir(), source)
        this.applySnapshot(snapshot)
      })
    },
    async clearGameIcon() {
      await this.structural(async () => {
        const snapshot = await window.peach.clearGameIcon(this.requireDir())
        this.applySnapshot(snapshot)
      })
    },
    async importImage(relativePath: string, sourcePath: string) {
      await this.structural(async () => {
        const snapshot = await window.peach.importImage(this.requireDir(), relativePath, sourcePath)
        this.applySnapshot(snapshot)
      })
    },
    async exportGame() {
      const parent = (this.projectDir ?? '').replace(/[\\/][^\\/]+$/, '')
      const destination = await window.peach.chooseExportDirectory(parent)
      if (!destination) return
      await this.run(async () => {
        await this.flushAll()
        const result = await window.peach.exportGame(this.requireDir(), destination)
        const session = useSessionStore()
        const extra = result.warnings.length > 0 ? ` ${result.warnings[0]}` : ''
        session.info(`Exported to ${result.directory}.${extra}`)
      })
    },
    openAsset(id: string) {
      const asset = this.asset(id)
      if (!asset) return
      if (asset.type === 'menu') {
        if (!this.workspace.openMenuIds.includes(id)) this.workspace.openMenuIds.push(id)
        this.workspace.activeTab = `menu:${id}`
      } else if (asset.type === 'collection') {
        if (!this.workspace.openCollectionIds.includes(id)) this.workspace.openCollectionIds.push(id)
        this.workspace.activeTab = `collection:${id}`
      } else if (asset.type === 'book') {
        if (!this.workspace.openBookIds.includes(id)) this.workspace.openBookIds.push(id)
        this.workspace.activeTab = `book:${id}`
      } else if (asset.type === 'composite') {
        if (!this.workspace.openCompositeIds.includes(id)) this.workspace.openCompositeIds.push(id)
        this.workspace.activeTab = `composite:${id}`
      } else if (asset.type === 'scene') {
        if (!this.workspace.openSceneIds.includes(id)) this.workspace.openSceneIds.push(id)
        this.workspace.activeTab = `scene:${id}`
      } else if (asset.type === 'script') {
        this.openScriptTab(`asset:${id}`)
        return
      } else {
        const wide = asset.type === 'button' || asset.type === 'panel' || asset.type === 'tileset'
        const height = asset.type === 'button' ? 700 : asset.type === 'panel' || asset.type === 'tileset' ? 720 : 520
        this.ensureWindow(id, wide ? 560 : 440, height)
        this.workspace.activeTab = 'editor'
      }
      this.scheduleWorkspace()
    },
    openScriptTab(key: string) {
      if (!this.workspace.openScriptTabs.includes(key)) this.workspace.openScriptTabs.push(key)
      this.workspace.activeTab = `script:${key}`
      this.scheduleWorkspace()
    },
    closeScriptTab(key: string) {
      this.workspace.openScriptTabs = this.workspace.openScriptTabs.filter((tab) => tab !== key)
      if (this.workspace.activeTab === `script:${key}`) this.workspace.activeTab = 'editor'
      this.scheduleWorkspace()
    },
    createComponentScript(menuId: string, componentId: string) {
      const menu = this.asset(menuId)
      const component = menu && isCanvas(menu) ? findComponent(menu.components, componentId) : null
      if (!component || component.script.trim()) return
      this.patchComponent(menuId, componentId, (item) => {
        item.script = componentScriptTemplate(item.type)
      })
      this.openScriptTab(`component:${menuId}:${componentId}`)
    },
    deleteComponentScript(menuId: string, componentId: string) {
      this.patchComponent(menuId, componentId, (item) => {
        item.script = ''
      })
      this.closeScriptTab(`component:${menuId}:${componentId}`)
    },
    setScriptSource(key: string, source: string) {
      if (key.startsWith('asset:')) {
        this.patchAsset(key.slice(6), (asset) => {
          if (asset.type === 'script') asset.source = source
        })
        return
      }
      if (key.startsWith('menu:')) {
        this.patchAsset(key.slice(5), (asset) => {
          if (asset.type === 'menu') asset.script = source
        })
        return
      }
      if (key.startsWith('composite:')) {
        this.patchAsset(key.slice(10), (asset) => {
          if (asset.type === 'composite') asset.script = source
        })
        return
      }
      if (key.startsWith('scene:')) {
        this.patchAsset(key.slice(6), (asset) => {
          if (asset.type === 'scene') asset.script = source
        })
        return
      }
      if (key.startsWith('component:')) {
        const [, menuId, componentId] = key.split(':')
        if (menuId && componentId) this.patchComponent(menuId, componentId, (component) => {
          component.script = source
        })
        return
      }
      if (key.startsWith('pagescript:')) {
        const [, bookId, pageId] = key.split(':')
        if (!bookId || !pageId) return
        this.patchAsset(bookId, (asset) => {
          if (asset.type !== 'book') return
          for (const chapter of asset.chapters) {
            const page = chapter.pages.find((item) => item.id === pageId)
            if (page) page.script = source
          }
        })
        return
      }
      if (key.startsWith('doodad:')) {
        const [, bookId, pageId, doodadId] = key.split(':')
        if (!bookId || !pageId || !doodadId) return
        this.patchAsset(bookId, (asset) => {
          if (asset.type !== 'book') return
          for (const chapter of asset.chapters) {
            const page = chapter.pages.find((item) => item.id === pageId)
            if (!page) continue
            for (const block of page.blocks) {
              if (block.type === 'conditional' && block.id === doodadId) block.script = source
              const paragraphs = block.type === 'paragraph' ? [block] : block.blocks
              for (const paragraph of paragraphs) {
                for (const run of paragraph.runs) {
                  if (run.type === 'evaluate' && run.id === doodadId) run.script = source
                }
              }
            }
          }
        })
      }
    },
    scriptTabAlive(key: string): boolean {
      if (key.startsWith('asset:')) return this.asset(key.slice(6))?.type === 'script'
      if (key.startsWith('menu:')) return this.asset(key.slice(5))?.type === 'menu'
      if (key.startsWith('composite:')) return this.asset(key.slice(10))?.type === 'composite'
      if (key.startsWith('scene:')) return this.asset(key.slice(6))?.type === 'scene'
      if (key.startsWith('component:')) {
        const [, menuId, componentId] = key.split(':')
        const menu = this.asset(menuId ?? null)
        return !!menu && isCanvas(menu) && canvasComponents(menu.components).some((component) => component.id === componentId)
      }
      if (key.startsWith('pagescript:')) {
        const [, bookId, pageId] = key.split(':')
        const book = this.asset(bookId ?? null)
        if (book?.type !== 'book' || !pageId) return false
        return book.chapters.some((chapter) => chapter.pages.some((page) => page.id === pageId))
      }
      if (key.startsWith('doodad:')) {
        const [, bookId, pageId, doodadId] = key.split(':')
        const book = this.asset(bookId ?? null)
        if (book?.type !== 'book' || !pageId || !doodadId) return false
        const page = book.chapters.flatMap((chapter) => chapter.pages).find((item) => item.id === pageId)
        return !!page && doodadScripts(page).some((item) => item.id === doodadId)
      }
      return false
    },
    scriptSource(key: string): string {
      if (key.startsWith('asset:')) {
        const asset = this.asset(key.slice(6))
        return asset?.type === 'script' ? asset.source : ''
      }
      if (key.startsWith('menu:')) {
        const asset = this.asset(key.slice(5))
        return asset?.type === 'menu' ? asset.script : ''
      }
      if (key.startsWith('composite:')) {
        const asset = this.asset(key.slice(10))
        return asset?.type === 'composite' ? asset.script : ''
      }
      if (key.startsWith('scene:')) {
        const asset = this.asset(key.slice(6))
        return asset?.type === 'scene' ? asset.script : ''
      }
      if (key.startsWith('component:')) {
        const [, menuId, componentId] = key.split(':')
        const menu = this.asset(menuId ?? null)
        const component = menu && isCanvas(menu) ? findComponent(menu.components, componentId) : null
        return component?.script ?? ''
      }
      if (key.startsWith('pagescript:')) {
        const [, bookId, pageId] = key.split(':')
        const book = this.asset(bookId ?? null)
        if (book?.type !== 'book' || !pageId) return ''
        const page = book.chapters.flatMap((chapter) => chapter.pages).find((item) => item.id === pageId)
        return page?.script ?? ''
      }
      if (key.startsWith('doodad:')) {
        const [, bookId, pageId, doodadId] = key.split(':')
        const book = this.asset(bookId ?? null)
        if (book?.type !== 'book' || !pageId || !doodadId) return ''
        const page = book.chapters.flatMap((chapter) => chapter.pages).find((item) => item.id === pageId)
        return page ? (doodadScripts(page).find((item) => item.id === doodadId)?.script ?? '') : ''
      }
      return ''
    },
    ensureWindow(assetId: string, width: number, height: number) {
      const existing = this.workspace.windows.find((window) => window.assetId === assetId)
      const max = Math.max(0, ...this.workspace.windows.map((window) => window.z))
      if (existing) {
        existing.z = max + 1
        return
      }
      const offset = (this.workspace.windows.length % 8) * 26
      this.workspace.windows.push({ assetId, x: 40 + offset, y: 36 + offset, width, height, z: max + 1 })
    },
    focusWindow(assetId: string) {
      const target = this.workspace.windows.find((window) => window.assetId === assetId)
      if (!target) return
      target.z = Math.max(0, ...this.workspace.windows.map((window) => window.z)) + 1
      this.scheduleWorkspace()
    },
    moveWindow(assetId: string, x: number, y: number) {
      const target = this.workspace.windows.find((window) => window.assetId === assetId)
      if (!target) return
      target.x = Math.round(x)
      target.y = Math.round(y)
      this.scheduleWorkspace()
    },
    resizeWindow(assetId: string, rect: { x: number; y: number; width: number; height: number }) {
      const target = this.workspace.windows.find((window) => window.assetId === assetId)
      if (!target) return
      target.x = Math.round(rect.x)
      target.y = Math.round(rect.y)
      target.width = Math.max(320, Math.round(rect.width))
      target.height = Math.max(240, Math.round(rect.height))
      this.scheduleWorkspace()
    },
    closeWindow(assetId: string) {
      this.workspace.windows = this.workspace.windows.filter((window) => window.assetId !== assetId)
      this.scheduleWorkspace()
    },
    closeMenu(id: string) {
      this.workspace.openMenuIds = this.workspace.openMenuIds.filter((menuId) => menuId !== id)
      if (this.workspace.activeTab === `menu:${id}`) this.workspace.activeTab = 'editor'
      if (useSessionStore().selectedComponentId) {
        const menu = this.asset(id)
        if (menu && isCanvas(menu) && canvasComponents(menu.components).some((component) => component.id === useSessionStore().selectedComponentId)) {
          useSessionStore().selectedComponentId = null
        }
      }
      this.scheduleWorkspace()
    },
    closeComposite(id: string) {
      this.workspace.openCompositeIds = this.workspace.openCompositeIds.filter((compositeId) => compositeId !== id)
      if (this.workspace.activeTab === `composite:${id}`) this.workspace.activeTab = 'editor'
      if (useSessionStore().selectedComponentId) {
        const canvas = this.asset(id)
        if (canvas && isCanvas(canvas) && canvasComponents(canvas.components).some((component) => component.id === useSessionStore().selectedComponentId)) {
          useSessionStore().selectedComponentId = null
        }
      }
      this.scheduleWorkspace()
    },
    closeScene(id: string) {
      this.workspace.openSceneIds = this.workspace.openSceneIds.filter((sceneId) => sceneId !== id)
      if (this.workspace.activeTab === `scene:${id}`) this.workspace.activeTab = 'editor'
      if (useSessionStore().selectedComponentId) {
        const canvas = this.asset(id)
        if (canvas && isCanvas(canvas) && canvasComponents(canvas.components).some((component) => component.id === useSessionStore().selectedComponentId)) {
          useSessionStore().selectedComponentId = null
        }
      }
      this.scheduleWorkspace()
    },
    closeCollection(id: string) {
      this.workspace.openCollectionIds = this.workspace.openCollectionIds.filter((collectionId) => collectionId !== id)
      if (this.workspace.activeTab === `collection:${id}`) this.workspace.activeTab = 'editor'
      this.scheduleWorkspace()
    },
    openPage(bookId: string, pageId: string) {
      const key = `${bookId}/${pageId}`
      if (!this.workspace.openPageTabs.includes(key)) this.workspace.openPageTabs.push(key)
      this.workspace.activeTab = `page:${key}`
      this.scheduleWorkspace()
    },
    closePage(key: string) {
      this.workspace.openPageTabs = this.workspace.openPageTabs.filter((tab) => tab !== key)
      const [bookId, pageId] = key.split('/')
      this.workspace.openScriptTabs = this.workspace.openScriptTabs.filter(
        (tab) => !tab.startsWith(`doodad:${bookId}:${pageId}:`) && tab !== `pagescript:${bookId}:${pageId}`
      )
      const active = this.workspace.activeTab
      if (
        active === `page:${key}` ||
        active.startsWith(`script:doodad:${bookId}:${pageId}:`) ||
        active === `script:pagescript:${bookId}:${pageId}`
      ) {
        this.workspace.activeTab = 'editor'
      }
      this.scheduleWorkspace()
    },
    closeBook(id: string) {
      this.workspace.openBookIds = this.workspace.openBookIds.filter((bookId) => bookId !== id)
      const pages = this.workspace.openPageTabs.filter((tab) => tab.startsWith(`${id}/`))
      this.workspace.openPageTabs = this.workspace.openPageTabs.filter((tab) => !tab.startsWith(`${id}/`))
      this.workspace.openScriptTabs = this.workspace.openScriptTabs.filter(
        (tab) => !tab.startsWith(`doodad:${id}:`) && !tab.startsWith(`pagescript:${id}:`)
      )
      const active = this.workspace.activeTab
      if (
        active === `book:${id}` ||
        pages.some((tab) => active === `page:${tab}`) ||
        active.startsWith(`script:doodad:${id}:`) ||
        active.startsWith(`script:pagescript:${id}:`)
      ) {
        this.workspace.activeTab = 'editor'
      }
      this.scheduleWorkspace()
    },
    setTab(tab: string) {
      this.workspace.activeTab = tab
      this.scheduleWorkspace()
    },
    toggleExpanded(relativePath: string) {
      const expanded = new Set(this.workspace.expanded)
      if (expanded.has(relativePath)) expanded.delete(relativePath)
      else expanded.add(relativePath)
      this.workspace.expanded = [...expanded]
      this.scheduleWorkspace()
    },
    patchAsset(id: string, recipe: (asset: Asset) => void) {
      const index = this.assets.findIndex((asset) => asset.id === id)
      const current = this.assets[index]
      if (!current) return
      const next = cloneData(current)
      recipe(next)
      this.assets[index] = next
      this.scheduleAssetSave(id)
    },
    patchComponent(menuId: string, componentId: string, recipe: (component: MenuComponent) => void) {
      this.patchAsset(menuId, (asset) => {
        if (!isCanvas(asset)) return
        const component = findComponent(asset.components, componentId)
        if (!component) return
        recipe(component)
        component.x = Math.round(component.x)
        component.y = Math.round(component.y)
        component.width = Math.round(component.width)
        component.height = Math.round(component.height)
      })
    },
    addComponent(menuId: string, type: MenuComponent['type']) {
      let created = ''
      this.patchAsset(menuId, (asset) => {
        if (!isCanvas(asset)) return
        const component = createMenuComponent(type, asset.components)
        created = component.id
        asset.components.push(component)
      })
      if (created) useSessionStore().selectedComponentId = created
    },
    addFieldComponent(menuId: string, fieldId: string, type: MenuComponent['type']) {
      if (type === 'zField') return
      let created = ''
      this.patchAsset(menuId, (asset) => {
        if (!isCanvas(asset)) return
        if (type === 'sceneViewer' && asset.type === 'scene') return
        const field = asset.components.find((item) => item.id === fieldId)
        if (!field || field.type !== 'zField') return
        const component = createMenuComponent(type, canvasComponents(asset.components))
        component.z = 0
        field.children.push(component)
        created = component.id
      })
      if (created) useSessionStore().selectedComponentId = created
    },
    duplicateComponent(menuId: string, componentId: string) {
      let created = ''
      this.patchAsset(menuId, (asset) => {
        if (!isCanvas(asset)) return
        const index = asset.components.findIndex((item) => item.id === componentId)
        const source = asset.components[index]
        if (source && index >= 0) {
          const copy = duplicateMenuComponent(source, asset.components, asset.width, asset.height)
          created = copy.id
          asset.components.splice(index + 1, 0, copy)
          return
        }
        for (const field of asset.components) {
          if (field.type !== 'zField') continue
          const childIndex = field.children.findIndex((item) => item.id === componentId)
          const child = field.children[childIndex]
          if (!child || childIndex < 0) continue
          const copy = duplicateMenuComponent(child, field.children, asset.width, asset.height, asset.components)
          created = copy.id
          field.children.splice(childIndex + 1, 0, copy)
          return
        }
      })
      if (created) useSessionStore().selectedComponentId = created
    },
    removeComponent(menuId: string, componentId: string) {
      this.patchAsset(menuId, (asset) => {
        if (!isCanvas(asset)) return
        asset.components = asset.components.flatMap((component) => {
          if (component.id === componentId) return []
          if (component.type === 'zField') component.children = component.children.filter((child) => child.id !== componentId)
          return [component]
        })
      })
      const session = useSessionStore()
      if (session.tilemapEdit === `${menuId}/${componentId}`) session.tilemapEdit = null
      if (session.zFieldEdit === `${menuId}/${componentId}`) session.zFieldEdit = null
      if (session.selectedComponentId && !this.componentExists(session.selectedComponentId)) session.selectedComponentId = null
    },
    placeComponent(menuId: string, componentId: string, targetId: string, place: LayerPlace) {
      this.patchAsset(menuId, (asset) => {
        if (!isCanvas(asset)) return
        placeInCanvas(asset.components, componentId, targetId, place)
      })
    },
    moveComponent(menuId: string, componentId: string, direction: -1 | 1) {
      this.patchAsset(menuId, (asset) => {
        if (!isCanvas(asset)) return
        const index = asset.components.findIndex((component) => component.id === componentId)
        if (index >= 0) {
          const nextIndex = index + direction
          if (nextIndex < 0 || nextIndex >= asset.components.length) return
          const [component] = asset.components.splice(index, 1)
          if (component) asset.components.splice(nextIndex, 0, component)
          return
        }
        for (const field of asset.components) {
          if (field.type !== 'zField') continue
          const childIndex = field.children.findIndex((child) => child.id === componentId)
          const nextIndex = childIndex + direction
          if (childIndex < 0 || nextIndex < 0 || nextIndex >= field.children.length) continue
          const [child] = field.children.splice(childIndex, 1)
          if (child) field.children.splice(nextIndex, 0, child)
          return
        }
      })
    },
    scheduleAssetSave(id: string) {
      const timer = assetTimers.get(id)
      if (timer) clearTimeout(timer)
      this.saveState = 'Saving'
      assetTimers.set(
        id,
        setTimeout(() => {
          assetTimers.delete(id)
          void this.flushAsset(id)
        }, 200)
      )
    },
    scheduleWorkspace() {
      if (workspaceTimer) clearTimeout(workspaceTimer)
      this.saveState = 'Saving'
      workspaceTimer = setTimeout(() => {
        workspaceTimer = null
        void this.flushWorkspace()
      }, 250)
    },
    async flushAsset(id: string): Promise<boolean> {
      const asset = this.asset(id)
      if (!asset || !this.projectDir) return true
      try {
        await window.peach.saveAsset(this.projectDir, cloneData(asset))
        if (assetTimers.size === 0 && !workspaceTimer) this.saveState = 'Saved'
        return true
      } catch (error) {
        this.saveState = 'Not saved'
        useSessionStore().fail(ipcError(error))
        return false
      }
    },
    async flushWorkspace(): Promise<boolean> {
      if (!this.projectDir) return true
      try {
        await window.peach.saveWorkspace(this.projectDir, cloneData(this.workspace))
        if (assetTimers.size === 0) this.saveState = 'Saved'
        return true
      } catch (error) {
        this.saveState = 'Not saved'
        useSessionStore().fail(ipcError(error))
        return false
      }
    },
    async flushAll(): Promise<boolean> {
      const ids = [...assetTimers.keys()]
      for (const id of ids) {
        const timer = assetTimers.get(id)
        if (timer) clearTimeout(timer)
        assetTimers.delete(id)
      }
      const saved = await Promise.all(ids.map((id) => this.flushAsset(id)))
      if (workspaceTimer) {
        clearTimeout(workspaceTimer)
        workspaceTimer = null
        saved.push(await this.flushWorkspace())
      }
      return saved.every(Boolean)
    },
    async structural(work: () => Promise<void>) {
      await this.run(async () => {
        await this.flushAll()
        await work()
      })
    },
    async run(work: () => Promise<void>) {
      this.busy = true
      try {
        await work()
      } catch (error) {
        useSessionStore().fail(ipcError(error))
      } finally {
        this.busy = false
      }
    },
    requireDir(): string {
      if (!this.projectDir) throw new Error('Open a project first.')
      return this.projectDir
    }
  }
})
