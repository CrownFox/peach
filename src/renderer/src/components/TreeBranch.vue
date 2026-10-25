<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { TreeNode } from '@shared/types'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import TreeBranch from './TreeBranch.vue'

const props = withDefaults(
  defineProps<{
    node: TreeNode
    ancestors?: boolean[]
    elbow?: boolean
    last?: boolean
    dragPath?: string | null
    markPath?: string | null
  }>(),
  { ancestors: () => [], elbow: false, last: true, dragPath: null, markPath: null }
)
const project = useProjectStore()
const session = useSessionStore()
const renameInput = ref<HTMLInputElement | null>(null)
let skipBlur = false
let committing = false

const isExpanded = computed(() => project.workspace.expanded.includes(props.node.relativePath))
const childAncestors = computed(() => (props.elbow ? [...props.ancestors, !props.last] : []))
const selected = () => session.selectedTreePath === props.node.relativePath
const renaming = () => session.renamingPath === props.node.relativePath

async function focusRename(): Promise<void> {
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

watch(
  () => session.renamingPath,
  (path) => {
    if (path === props.node.relativePath) void focusRename()
  }
)

onMounted(() => {
  if (session.renamingPath === props.node.relativePath) void focusRename()
})

function select(): void {
  session.selectedTreePath = props.node.relativePath
}

function toggle(): void {
  project.toggleExpanded(props.node.relativePath)
}

function open(): void {
  if (props.node.kind === 'asset' && props.node.assetId) project.openAsset(props.node.assetId)
  else toggle()
}

function commitRename(event: Event): void {
  if (skipBlur || committing) {
    skipBlur = false
    return
  }
  committing = true
  const value = (event.target as HTMLInputElement).value
  session.renamingPath = null
  void project.rename(props.node.relativePath, value).finally(() => {
    committing = false
  })
}

function cancelRename(): void {
  skipBlur = true
  session.renamingPath = null
}

function badge(): string {
  if (props.node.assetType === 'menu') return 'M'
  if (props.node.assetType === 'button') return 'B'
  if (props.node.assetType === 'panel') return 'P'
  if (props.node.assetType === 'script') return 'S'
  if (props.node.assetType === 'collection') return 'C'
  if (props.node.assetType === 'book') return 'Bk'
  if (props.node.assetType === 'composite') return 'Cp'
  return 'I'
}
</script>

<template>
  <div class="tree-branch" :class="{ 'is-open': node.kind === 'folder' && isExpanded }">
    <div
      class="tree-row"
      :class="{ selected: selected(), 'is-dragging': dragPath === node.relativePath, 'is-drop': markPath === node.relativePath }"
      :data-path="node.relativePath"
      @click="select"
      @dblclick="open"
      @contextmenu.prevent
    >
      <span
        v-for="(continues, index) in ancestors"
        :key="index"
        class="tree-cell"
        :class="{ pass: continues }"
        aria-hidden="true"
      ></span>
      <span v-if="elbow" class="tree-cell elbow" :class="{ last }" aria-hidden="true"></span>
      <button v-if="node.kind === 'folder'" class="tree-cell twist" type="button" data-twist @click.stop="toggle">
        {{ isExpanded ? '▾' : '▸' }}
      </button>
      <span v-else class="tree-cell file-mark" aria-hidden="true">•</span>
      <span v-if="node.kind === 'folder'" class="tree-cell badge folder" data-type="folder" aria-hidden="true">
        <svg v-if="isExpanded" viewBox="0 0 16 16">
          <path class="folder-back" d="M1.2 3.2c0-.6.5-1 1.1-1h3.1l1.2 1.3h7c.6 0 1.1.4 1.1 1V6H1.2V3.2z" />
          <path d="M.4 6.2h15.1L13.9 13c-.1.5-.5.8-1 .8H1.5c-.5 0-.9-.3-1-.8L.4 6.2z" />
        </svg>
        <svg v-else viewBox="0 0 16 16">
          <path d="M1.2 3.6c0-.7.6-1.2 1.2-1.2h3.1L6.8 3.8h6.8c.7 0 1.2.5 1.2 1.2v7.2c0 .7-.5 1.2-1.2 1.2H2.4c-.7 0-1.2-.5-1.2-1.2V3.6z" />
        </svg>
      </span>
      <span v-else class="tree-cell badge" :data-type="node.assetType">{{ badge() }}</span>
      <input
        v-if="renaming()"
        ref="renameInput"
        :value="node.name"
        @click.stop
        @keydown.enter="commitRename"
        @keydown.esc="cancelRename"
        @blur="commitRename"
      />
      <span v-else class="row-name">{{ node.name }}</span>
      <span v-if="node.assetId && node.assetId === project.meta?.entryMenuId" class="entry-mark">Entry</span>
    </div>
    <template v-if="node.kind === 'folder' && isExpanded">
      <TreeBranch
        v-for="(child, index) in node.children"
        :key="child.relativePath"
        :node="child"
        :ancestors="childAncestors"
        :elbow="true"
        :last="index === node.children.length - 1"
        :drag-path="dragPath"
        :mark-path="markPath"
      />
    </template>
  </div>
</template>
