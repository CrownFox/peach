<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { isInside, parentPath } from '@shared/paths'
import type { AssetType, TreeNode } from '@shared/types'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import Modal from './Modal.vue'
import TreeBranch from './TreeBranch.vue'

const project = useProjectStore()
const session = useSessionStore()
const menu = ref<{ x: number; y: number; node: TreeNode; blank: boolean } | null>(null)
const deleting = ref<TreeNode | null>(null)
const dragPath = ref<string | null>(null)
const markPath = ref<string | null>(null)
const destFolder = ref<string | null>(null)
let pending: { path: string; x: number; y: number } | null = null
let pointer = { x: 0, y: 0 }
let expandTimer: ReturnType<typeof setTimeout> | null = null
let expandTarget = ''
let scrollTimer: ReturnType<typeof setInterval> | null = null
let scrollDirection = 0

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || project.busy) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('input, [data-twist], .context-menu, .modal, .modal-backdrop')) return
  const row = target.closest('.tree-row')
  const path = row?.getAttribute('data-path')
  if (!path || session.renamingPath === path) return
  pending = { path, x: event.clientX, y: event.clientY }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event: PointerEvent): void {
  pointer = { x: event.clientX, y: event.clientY }
  if (pending && dragPath.value === null) {
    if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 5) return
    dragPath.value = pending.path
    pending = null
    window.addEventListener('keydown', onDragKey)
  }
  if (!dragPath.value) return
  updateDrop(event.clientX, event.clientY)
  scrollTree(event.clientY)
}

function onPointerUp(): void {
  const source = dragPath.value
  const dest = destFolder.value
  const moved = source !== null && dest !== null
  stopDrag()
  if (!moved || source === null || dest === null) return
  window.addEventListener('click', swallowClick, true)
  void project.moveNode(source, dest)
}

function onDragKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') stopDrag()
}

function swallowClick(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  window.removeEventListener('click', swallowClick, true)
}

function stopDrag(): void {
  pending = null
  dragPath.value = null
  markPath.value = null
  destFolder.value = null
  clearExpand()
  scrollDirection = 0
  if (scrollTimer) clearInterval(scrollTimer)
  scrollTimer = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('keydown', onDragKey)
}

function updateDrop(x: number, y: number): void {
  const sourcePath = dragPath.value
  const source = sourcePath ? findNode(project.tree, sourcePath) : null
  const hit = document.elementFromPoint(x, y)
  const pane = document.querySelector('.tree-pane')
  if (!source || !(hit instanceof Element) || !pane?.contains(hit)) {
    markPath.value = null
    destFolder.value = null
    clearExpand()
    return
  }
  const row = hit.closest('.tree-row')
  const path = row?.getAttribute('data-path')
  const node = path != null ? findNode(project.tree, path) : null
  const dest = node?.kind === 'folder' ? node.relativePath : node?.kind === 'asset' ? parentPath(node.relativePath) : ''
  const hoverFolder = node?.kind === 'folder' ? node.relativePath : ''
  if (!canDrop(source, dest)) {
    markPath.value = null
    destFolder.value = null
    if (source.kind === 'folder' && hoverFolder && isInside(source.relativePath, hoverFolder)) clearExpand()
    else queueExpand(hoverFolder)
    return
  }
  markPath.value = node?.relativePath ?? null
  destFolder.value = dest
  queueExpand(hoverFolder)
}

function canDrop(source: TreeNode, dest: string): boolean {
  if (parentPath(source.relativePath) === dest) return false
  if (source.kind === 'folder' && isInside(source.relativePath, dest)) return false
  return true
}

function queueExpand(folder: string): void {
  if (!folder || project.workspace.expanded.includes(folder) || folder === dragPath.value) {
    clearExpand()
    return
  }
  if (expandTarget === folder) return
  clearExpand()
  expandTarget = folder
  expandTimer = setTimeout(() => {
    expandTarget = ''
    project.expandFolder(folder)
  }, 450)
}

function clearExpand(): void {
  if (expandTimer) clearTimeout(expandTimer)
  expandTimer = null
  expandTarget = ''
}

function scrollTree(clientY: number): void {
  const pane = document.querySelector('.tree-pane')
  if (!(pane instanceof HTMLElement)) return
  const rect = pane.getBoundingClientRect()
  if (clientY < rect.top + 28) scrollDirection = -1
  else if (clientY > rect.bottom - 28) scrollDirection = 1
  else scrollDirection = 0
  if (scrollDirection !== 0 && !scrollTimer) {
    scrollTimer = setInterval(() => {
      const host = document.querySelector('.tree-pane')
      if (!(host instanceof HTMLElement) || scrollDirection === 0) return
      host.scrollTop += scrollDirection * 16
      updateDrop(pointer.x, pointer.y)
    }, 32)
  }
}

function onContext(event: MouseEvent): void {
  const row = (event.target as HTMLElement).closest('.tree-row')
  const path = row?.getAttribute('data-path')
  const node = path != null ? findNode(project.tree, path) : null
  if (node) session.selectedTreePath = node.relativePath
  else session.selectedTreePath = ''
  const target = node ?? project.tree
  menu.value = {
    x: Math.min(event.clientX, window.innerWidth - 200),
    y: Math.min(event.clientY, window.innerHeight - (node ? 440 : 48)),
    node: target,
    blank: node === null
  }
}

function findNode(node: TreeNode, path: string): TreeNode | null {
  if (node.relativePath === path) return node
  for (const child of node.children) {
    const found = findNode(child, path)
    if (found) return found
  }
  return null
}

function closeMenu(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest('.context-menu')) return
  menu.value = null
}

function create(type: AssetType | 'folder'): void {
  const node = menu.value?.node
  menu.value = null
  if (!node || node.kind !== 'folder') return
  if (type === 'folder') void project.createFolder(node.relativePath)
  else void project.createAsset(node.relativePath, type)
}

function openNode(): void {
  const node = menu.value?.node
  menu.value = null
  if (node?.assetId) project.openAsset(node.assetId)
}

function startRename(): void {
  const node = menu.value?.node
  menu.value = null
  if (!node || !node.relativePath) return
  session.renamingPath = node.relativePath
}

function duplicate(): void {
  const node = menu.value?.node
  menu.value = null
  if (node?.relativePath) void project.duplicate(node.relativePath)
}

function askDelete(): void {
  deleting.value = menu.value?.node ?? null
  menu.value = null
}

function confirmDelete(): void {
  const node = deleting.value
  deleting.value = null
  if (node?.relativePath) void project.deleteNode(node.relativePath)
}

function setEntry(): void {
  const node = menu.value?.node
  menu.value = null
  if (node?.assetId) void project.setEntry(node.assetId)
}

onMounted(() => {
  window.addEventListener('pointerdown', closeMenu)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', closeMenu)
  stopDrag()
})
</script>

<template>
  <div
    class="tree-fill"
    :class="{ 'is-dragging': dragPath !== null, 'is-root-drop': dragPath !== null && destFolder === '' }"
    @pointerdown="onPointerDown"
    @contextmenu.prevent="onContext"
  >
    <TreeBranch
      v-for="(child, index) in project.tree.children"
      :key="child.relativePath"
      :node="child"
      :last="index === project.tree.children.length - 1"
      :drag-path="dragPath"
      :mark-path="markPath"
    />
    <p v-if="project.tree.children.length === 0" class="tree-hint">Right-click to create a folder. Right-click a folder to add a menu, scene, composite, tileset, button, panel, image, script, collection, or book.</p>
    <div v-if="menu" class="context-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
      <button v-if="menu.blank" type="button" @click="create('folder')">New folder</button>
      <template v-else-if="menu.node.kind === 'folder'">
        <button type="button" @click="create('folder')">New folder</button>
        <button type="button" @click="create('menu')">New menu</button>
        <button type="button" @click="create('scene')">New scene</button>
        <button type="button" @click="create('tileset')">New tileset</button>
        <button type="button" @click="create('composite')">New composite</button>
        <button type="button" @click="create('button')">New button</button>
        <button type="button" @click="create('panel')">New panel</button>
        <button type="button" @click="create('image')">New image</button>
        <button type="button" @click="create('script')">New script</button>
        <button type="button" @click="create('collection')">New collection</button>
        <button type="button" @click="create('book')">New book</button>
      </template>
      <template v-else>
        <button type="button" @click="openNode">Open</button>
      </template>
      <template v-if="!menu.blank && menu.node.relativePath">
        <div class="menu-sep"></div>
        <button type="button" @click="startRename">Rename</button>
        <button type="button" @click="duplicate">Duplicate</button>
        <button type="button" @click="askDelete">Delete</button>
      </template>
      <template v-if="!menu.blank && menu.node.assetType === 'menu' && menu.node.assetId">
        <div class="menu-sep"></div>
        <button type="button" @click="setEntry">Set as entry point</button>
      </template>
    </div>
    <Modal
      v-if="deleting"
      title="Delete"
      confirm-label="Delete"
      danger
      @cancel="deleting = null"
      @confirm="confirmDelete"
    >
      <p>Delete {{ deleting.name }}? This cannot be undone.</p>
    </Modal>
  </div>
</template>
