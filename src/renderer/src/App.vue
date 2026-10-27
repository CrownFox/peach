<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sameProjectPath, type RecentProject } from '@shared/recent'
import { usePlayStore } from '@/stores/play'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { GAME_PROPERTIES_WINDOW } from '@shared/workspace'
import { isCanvas } from '@shared/types'
import AssetBrowser from './components/AssetBrowser.vue'
import BookEditor from './components/BookEditor.vue'
import CollectionEditor from './components/CollectionEditor.vue'
import EditorCanvas from './components/EditorCanvas.vue'
import GameView from './components/GameView.vue'
import InspectorPanel from './components/InspectorPanel.vue'
import MenuEditor from './components/MenuEditor.vue'
import ScriptEditor from './components/ScriptEditor.vue'
import Modal from './components/Modal.vue'
import ProjectTree from './components/ProjectTree.vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import { nextTabScroll, tabWheelDelta } from './tabStrip'

const project = useProjectStore()
const session = useSessionStore()
const play = usePlayStore()
const creating = ref(false)
const tabStrip = ref<HTMLElement | null>(null)
const recentAnchor = ref<HTMLElement | null>(null)
const recentOpen = ref(false)
const projectName = ref('Untitled Game')
const recents = ref<RecentProject[]>([])

const openMenus = computed(() =>
  project.workspace.openMenuIds.flatMap((id) => {
    const asset = project.asset(id)
    return asset?.type === 'menu' ? [asset] : []
  })
)
const openComposites = computed(() =>
  project.workspace.openCompositeIds.flatMap((id) => {
    const asset = project.asset(id)
    return asset?.type === 'composite' ? [asset] : []
  })
)
const openScenes = computed(() =>
  project.workspace.openSceneIds.flatMap((id) => {
    const asset = project.asset(id)
    return asset?.type === 'scene' ? [asset] : []
  })
)
const openCollections = computed(() =>
  project.workspace.openCollectionIds.flatMap((id) => {
    const asset = project.asset(id)
    return asset?.type === 'collection' ? [asset] : []
  })
)
const openBooks = computed(() =>
  project.workspace.openBookIds.flatMap((id) => {
    const asset = project.asset(id)
    return asset?.type === 'book' ? [asset] : []
  })
)

function onRecentPointer(event: PointerEvent): void {
  if (!recentOpen.value) return
  const target = event.target
  if (target instanceof Node && recentAnchor.value?.contains(target)) return
  recentOpen.value = false
}

function onRecentKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') recentOpen.value = false
}

onMounted(async () => {
  window.addEventListener('pointerdown', onRecentPointer)
  window.addEventListener('keydown', onRecentKey)
  recents.value = await window.peach.listRecentProjects()
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onRecentPointer)
  window.removeEventListener('keydown', onRecentKey)
})

async function openProject(): Promise<void> {
  const dir = await window.peach.chooseDirectory()
  if (dir) await project.openProject(dir)
}

async function openRecent(dir: string): Promise<void> {
  const result = await project.openProject(dir)
  if (result === 'failed') recents.value = await window.peach.forgetRecentProject(dir)
  else if (result === 'opened') recents.value = await window.peach.listRecentProjects()
}

async function toggleRecent(): Promise<void> {
  if (recentOpen.value) {
    recentOpen.value = false
    return
  }
  recents.value = await window.peach.listRecentProjects()
  recentOpen.value = true
}

function currentRecent(path: string): boolean {
  return project.projectDir !== null && sameProjectPath(project.projectDir, path)
}

async function pickRecent(dir: string): Promise<void> {
  recentOpen.value = false
  if (currentRecent(dir)) return
  await openRecent(dir)
}

async function forgetRecent(dir: string): Promise<void> {
  recents.value = await window.peach.forgetRecentProject(dir)
}

async function confirmCreate(): Promise<void> {
  const parent = await window.peach.chooseDirectory()
  if (!parent) return
  const before = project.projectDir
  await project.createProject(parent, projectName.value)
  if (project.projectDir && project.projectDir !== before) creating.value = false
}

const activeScript = computed(() => (project.workspace.activeTab.startsWith('script:') ? project.workspace.activeTab.slice(7) : ''))

function tabTitle(id: string): string {
  return project.asset(id)?.name ?? 'Menu'
}

function onTabWheel(event: WheelEvent): void {
  const strip = tabStrip.value
  if (!strip || strip.scrollWidth <= strip.clientWidth) return
  const delta = tabWheelDelta(event.deltaX, event.deltaY, event.deltaMode)
  if (delta === 0) return
  strip.scrollLeft += delta
  event.preventDefault()
}

watch(tabStrip, (strip, _, onCleanup) => {
  if (!strip) return
  strip.addEventListener('wheel', onTabWheel, { passive: false })
  onCleanup(() => strip.removeEventListener('wheel', onTabWheel))
})

function revealActiveTab(): void {
  const strip = tabStrip.value
  const active = strip?.querySelector<HTMLElement>('.tab.active')
  if (!strip || !active) return
  const stripBox = strip.getBoundingClientRect()
  const tabBox = active.getBoundingClientRect()
  const itemLeft = strip.scrollLeft + (tabBox.left - stripBox.left)
  strip.scrollLeft = nextTabScroll(strip.scrollLeft, strip.clientWidth, itemLeft, tabBox.width)
}

watch(
  () => (project.isOpen ? project.workspace.activeTab : ''),
  () => {
    void nextTick(revealActiveTab)
  }
)

function scriptTitle(key: string): string {
  if (key.startsWith('asset:')) return project.asset(key.slice(6))?.name ?? 'Script'
  if (key.startsWith('menu:')) {
    const menu = project.asset(key.slice(5))
    return menu ? `${menu.name} script` : 'Script'
  }
  if (key.startsWith('composite:')) {
    const asset = project.asset(key.slice(10))
    return asset ? `${asset.name} script` : 'Script'
  }
  if (key.startsWith('scene:')) {
    const asset = project.asset(key.slice(6))
    return asset ? `${asset.name} script` : 'Script'
  }
  if (key.startsWith('doodad:')) return 'Insert script'
  if (key.startsWith('pagescript:')) return 'Page script'
  const [, menuId, componentId] = key.split(':')
  const menu = project.asset(menuId ?? null)
  const component = menu && isCanvas(menu) ? menu.components.find((item) => item.id === componentId) : null
  return component ? `${component.name} script` : 'Script'
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">Peach</div>
      <div v-if="project.meta" class="project-title">{{ project.meta.name }}</div>
      <div class="top-actions">
        <button class="btn quiet" type="button" :disabled="project.busy" @click="creating = true">New</button>
        <button class="btn quiet" type="button" :disabled="project.busy" @click="openProject">Open</button>
        <div ref="recentAnchor" class="recent-anchor">
          <button class="btn quiet" type="button" :disabled="project.busy" :aria-expanded="recentOpen" @click="toggleRecent">Recent</button>
          <div v-if="recentOpen" class="recent-menu">
            <p v-if="recents.length === 0" class="recent-empty">No recent projects</p>
            <div v-for="item in recents" :key="item.path" class="recent-row">
              <button class="recent-open" type="button" :class="{ current: currentRecent(item.path) }" :title="item.path" @click="pickRecent(item.path)">
                <span class="recent-name">{{ item.name }}<span v-if="currentRecent(item.path)" class="recent-current">Current</span></span>
                <span class="recent-path">{{ item.path }}</span>
              </button>
              <button class="recent-forget" type="button" title="Remove from recent projects" @click="forgetRecent(item.path)">×</button>
            </div>
          </div>
        </div>
        <button class="btn" type="button" :disabled="!project.isOpen || project.busy" @click="project.exportGame()">Export</button>
      </div>
      <div class="spacer"></div>
      <div v-if="project.isOpen" class="save-state">{{ project.saveState }}</div>
    </header>
    <button v-if="session.banner" class="banner" :class="{ error: session.bannerTone === 'error' }" type="button" @click="session.clearBanner()">
      {{ session.banner }}
    </button>

    <WelcomeScreen
      v-if="!project.isOpen"
      :recents="recents"
      @new="creating = true"
      @open="openProject"
      @open-recent="openRecent"
      @forget-recent="forgetRecent"
    />
    <div v-else class="workspace">
      <aside class="tree-pane">
        <div class="pane-label">Project</div>
        <button
          class="tree-row properties-entry"
          :class="{ selected: project.focusedWindow?.assetId === GAME_PROPERTIES_WINDOW && project.workspace.activeTab === 'editor' }"
          type="button"
          @click="project.openGameProperties()"
        >
          <span class="row-name">Properties</span>
        </button>
        <ProjectTree />
      </aside>
      <main class="center-pane">
        <div ref="tabStrip" class="tab-strip">
          <button class="tab" :class="{ active: project.workspace.activeTab === 'game' }" type="button" @click="project.setTab('game')">
            <span>Game</span>
          </button>
          <button class="tab" :class="{ active: project.workspace.activeTab === 'editor' }" type="button" @click="project.setTab('editor')">
            <span>Editor</span>
          </button>
          <button
            v-for="menu in openMenus"
            :key="menu.id"
            class="tab"
            :class="{ active: project.workspace.activeTab === `menu:${menu.id}` }"
            type="button"
            @click="project.setTab(`menu:${menu.id}`)"
          >
            <span>{{ tabTitle(menu.id) }}</span>
            <span class="tab-close" @click.stop="project.closeMenu(menu.id)">×</span>
          </button>
          <button
            v-for="item in openComposites"
            :key="item.id"
            class="tab"
            :class="{ active: project.workspace.activeTab === `composite:${item.id}` }"
            type="button"
            @click="project.setTab(`composite:${item.id}`)"
          >
            <span>{{ tabTitle(item.id) }}</span>
            <span class="tab-close" @click.stop="project.closeComposite(item.id)">×</span>
          </button>
          <button
            v-for="item in openScenes"
            :key="item.id"
            class="tab"
            :class="{ active: project.workspace.activeTab === `scene:${item.id}` }"
            type="button"
            @click="project.setTab(`scene:${item.id}`)"
          >
            <span>{{ tabTitle(item.id) }}</span>
            <span class="tab-close" @click.stop="project.closeScene(item.id)">×</span>
          </button>
          <button
            v-for="item in openCollections"
            :key="item.id"
            class="tab"
            :class="{ active: project.workspace.activeTab === `collection:${item.id}` }"
            type="button"
            @click="project.setTab(`collection:${item.id}`)"
          >
            <span>{{ item.name }}</span>
            <span class="tab-close" @click.stop="project.closeCollection(item.id)">×</span>
          </button>
          <button
            v-for="item in openBooks"
            :key="item.id"
            class="tab"
            :class="{ active: project.workspace.activeTab === `book:${item.id}` }"
            type="button"
            @click="project.setTab(`book:${item.id}`)"
          >
            <span>{{ item.name }}</span>
            <span class="tab-close" @click.stop="project.closeBook(item.id)">×</span>
          </button>
          <button
            v-for="key in project.workspace.openScriptTabs"
            :key="key"
            class="tab"
            :class="{ active: project.workspace.activeTab === `script:${key}` }"
            type="button"
            @click="project.setTab(`script:${key}`)"
          >
            <span>{{ scriptTitle(key) }}</span>
            <span class="tab-close" @click.stop="project.closeScriptTab(key)">×</span>
          </button>
        </div>
        <div class="tab-body">
          <GameView :key="project.projectDir ?? ''" v-show="project.workspace.activeTab === 'game'" />
          <EditorCanvas :key="project.projectDir ?? ''" v-show="project.workspace.activeTab === 'editor'" />
          <MenuEditor
            v-for="menu in openMenus"
            v-show="project.workspace.activeTab === `menu:${menu.id}`"
            :key="`${project.projectDir}:${menu.id}`"
            :menu-id="menu.id"
          />
          <MenuEditor
            v-for="item in openComposites"
            v-show="project.workspace.activeTab === `composite:${item.id}`"
            :key="`${project.projectDir}:${item.id}`"
            :menu-id="item.id"
          />
          <MenuEditor
            v-for="item in openScenes"
            v-show="project.workspace.activeTab === `scene:${item.id}`"
            :key="`${project.projectDir}:${item.id}`"
            :menu-id="item.id"
          />
          <CollectionEditor
            v-for="item in openCollections"
            v-show="project.workspace.activeTab === `collection:${item.id}`"
            :key="`${project.projectDir}:${item.id}`"
            :collection-id="item.id"
          />
          <BookEditor
            v-for="item in openBooks"
            v-show="project.workspace.activeTab === `book:${item.id}`"
            :key="`${project.projectDir}:${item.id}`"
            :book-id="item.id"
          />
          <ScriptEditor
            v-if="project.workspace.openScriptTabs.length > 0"
            v-show="activeScript"
            :key="project.projectDir ?? ''"
            :tab="activeScript || project.workspace.openScriptTabs[0] || ''"
          />
        </div>
      </main>
      <aside class="inspector-pane">
        <div class="pane-label">Inspector</div>
        <InspectorPanel />
      </aside>
    </div>
    <footer v-if="project.isOpen" class="status">
      <span>{{ project.projectDir }}</span>
      <span class="spacer"></span>
      <span>{{ play.currentId ? 'Playing' : 'Game idle' }}</span>
    </footer>

    <Modal v-if="creating" title="New project" confirm-label="Choose folder" @cancel="creating = false" @confirm="confirmCreate">
      <label class="field">
        <span class="field-label">Name</span>
        <input v-model="projectName" autofocus />
      </label>
    </Modal>
    <AssetBrowser />
  </div>
</template>
