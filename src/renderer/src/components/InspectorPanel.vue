<script setup lang="ts">
import { computed } from 'vue'
import { BUILTIN_FONTS } from '@shared/fonts'
import { isScriptHandle } from '@shared/handles'
import type { ComponentOverride } from '@shared/overrides'
import { assetLocation } from '@shared/paths'
import { compositeBlocked } from '@shared/composites'
import { applyIntrinsicSize, intrinsicSize } from '@shared/intrinsicSize'
import { fitTileSpan, mapSize, pruneCells, sameTileSize, tilesetById } from '@shared/tiles'
import { isCanvas, type ButtonComponent } from '@shared/types'
import { usePlayStore } from '@/stores/play'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { GAME_PROPERTIES_WINDOW } from '@shared/workspace'
import AssetSelect from './AssetSelect.vue'
import ComponentFields from './ComponentFields.vue'
import ScriptProperties from './ScriptProperties.vue'

const project = useProjectStore()
const session = useSessionStore()
const play = usePlayStore()

const menu = computed(() => {
  const tab = project.workspace.activeTab
  const prefix = tab.startsWith('menu:') ? 'menu:' : tab.startsWith('composite:') ? 'composite:' : tab.startsWith('scene:') ? 'scene:' : ''
  if (!prefix) return null
  const asset = project.asset(tab.slice(prefix.length))
  return asset && isCanvas(asset) ? asset : null
})
const selected = computed(() => menu.value?.components.find((component) => component.id === session.selectedComponentId) ?? null)
const naturalSize = computed(() => (selected.value ? intrinsicSize(selected.value, project.assets) : null))
const sizedComponent = computed(
  () =>
    selected.value?.type === 'image' ||
    selected.value?.type === 'button' ||
    selected.value?.type === 'panel' ||
    selected.value?.type === 'composite' ||
    selected.value?.type === 'tile'
)
const blockedComposites = computed(() => {
  if (!menu.value || selected.value?.type !== 'composite') return []
  const hostId = menu.value.type === 'composite' ? menu.value.id : null
  return project.assets.flatMap((asset) =>
    asset.type === 'composite' && compositeBlocked(project.assets, hostId, asset.id) ? [asset.id] : []
  )
})
const layers = computed(() => [...(menu.value?.components ?? [])].reverse())
const scriptKey = computed(() => (project.workspace.activeTab.startsWith('script:') ? project.workspace.activeTab.slice(7) : ''))
const focused = computed(() => {
  if (project.workspace.activeTab !== 'editor') return null
  const id = project.focusedWindow?.assetId ?? null
  return project.asset(id)
})

function menuName(id: string): string {
  const asset = project.asset(id)
  return asset ? assetLocation(asset.relativePath) : 'Missing menu'
}

function forget(key: keyof ComponentOverride): void {
  if (!menu.value || !selected.value) return
  play.clearOverride(menu.value.id, selected.value.id, key)
}

function openMenu(event: Event): void {
  play.open((event.target as HTMLSelectElement).value)
}

function numberValue(event: Event): number | null {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : null
}

function setRect(key: 'x' | 'y' | 'width' | 'height', event: Event): void {
  const value = numberValue(event)
  const canvas = menu.value
  if (!canvas || !selected.value || value === null) return
  project.patchComponent(canvas.id, selected.value.id, (component) => {
    const grid = canvas.snapToGrid ? canvas.gridSize : 0
    let next = Math.round(value)
    if ((key === 'x' || key === 'y') && grid > 0) next = Math.round(value / grid) * grid
    if ((key === 'width' || key === 'height') && component.type !== 'tilemap' && grid > 0) next = Math.round(value / grid) * grid
    component[key] = next
    if (component.type !== 'tilemap') return
    const tileset = tilesetById(project.assets, component.tilesetId)
    if (!tileset) return
    const fitted = fitTileSpan(component, tileset.tileWidth, tileset.tileHeight)
    component.x = fitted.x
    component.y = fitted.y
    component.width = fitted.width
    component.height = fitted.height
    const size = mapSize(component.width, component.height, tileset.tileWidth, tileset.tileHeight)
    component.cells = pruneCells(component.cells, size.cols, size.rows)
  })
  if (key === 'x' || key === 'y') forget(key)
  if (selected.value.type === 'tilemap' && (key === 'width' || key === 'height')) forget('cells')
}

function setName(event: Event): void {
  if (!menu.value || !selected.value) return
  const value = (event.target as HTMLInputElement).value
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    component.name = value
  })
}

function setButtonText(event: Event): void {
  patchButton((component) => {
    component.text = (event.target as HTMLInputElement).value
  })
  forget('text')
}

function setFont(event: Event): void {
  patchButton((component) => {
    component.fontFamily = (event.target as HTMLSelectElement).value
  })
}

function setFontSize(event: Event): void {
  const value = numberValue(event)
  if (value === null) return
  patchButton((component) => {
    component.fontSize = Math.min(80, Math.max(8, value))
  })
}

function setColor(event: Event): void {
  patchButton((component) => {
    component.color = (event.target as HTMLInputElement).value
  })
}

function setImage(id: string | null): void {
  if (!menu.value || !selected.value) return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type !== 'image') return
    component.imageId = id
    if (id) applyIntrinsicSize(component, project.assets)
  })
  forget('imageRef')
}

function setImageFit(event: Event): void {
  const fit = (event.target as HTMLSelectElement).value === 'tile' ? 'tile' : 'stretch'
  if (!menu.value || selected.value?.type !== 'image') return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type === 'image') component.fit = fit
  })
}

function setTint(event: Event): void {
  const tint = (event.target as HTMLInputElement).value
  if (!menu.value || !selected.value) return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    component.tint = tint
  })
  forget('tint')
}

function setColliderShape(event: Event): void {
  const shape = (event.target as HTMLSelectElement).value === 'circle' ? 'circle' : 'square'
  if (!menu.value || !selected.value) return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type === 'collider') component.shape = shape
  })
}

function setColliderTags(event: Event): void {
  const tags = (event.target as HTMLInputElement).value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
  if (!menu.value || !selected.value) return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type === 'collider') component.tags = tags
  })
}

function setColliderEnabled(event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked
  if (!menu.value || !selected.value) return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type === 'collider') component.enabled = enabled
  })
  forget('enabled')
}

function setVisible(event: Event): void {
  const visible = (event.target as HTMLInputElement).checked
  if (!menu.value || !selected.value) return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    component.visible = visible
  })
  forget('visible')
}

function setButtonAsset(id: string | null): void {
  patchButton((component) => {
    component.buttonId = id
    if (id) applyIntrinsicSize(component, project.assets)
  })
  forget('buttonRef')
}

function resetSize(): void {
  if (!menu.value || !selected.value) return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    applyIntrinsicSize(component, project.assets)
  })
}

function setHandle(event: Event): void {
  if (!menu.value || !selected.value) return
  const input = event.target as HTMLInputElement
  const handle = input.value.trim()
  if (handle && !isScriptHandle(handle)) {
    session.fail('A script id uses letters, numbers, and underscores, and cannot start with a number.')
    input.value = selected.value.handle
    return
  }
  const taken = menu.value.components.some((component) => component.id !== selected.value?.id && component.handle === handle)
  if (handle && taken) {
    session.fail('That script id is already used on this menu.')
    input.value = selected.value.handle
    return
  }
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    component.handle = handle
  })
}

function setComposite(id: string | null): void {
  if (!menu.value || selected.value?.type !== 'composite') return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type !== 'composite') return
    component.compositeId = id
    if (id) applyIntrinsicSize(component, project.assets)
  })
}

function setCompositeEnabled(event: Event): void {
  if (!menu.value || selected.value?.type !== 'composite') return
  const enabled = (event.target as HTMLInputElement).checked
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type === 'composite') component.enabled = enabled
  })
  forget('enabled')
}

function openComposite(): void {
  if (selected.value?.type !== 'composite' || !selected.value.compositeId) return
  project.openAsset(selected.value.compositeId)
}

function setTileTileset(id: string | null): void {
  if (!menu.value || selected.value?.type !== 'tile') return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type !== 'tile') return
    component.tilesetId = id
    if (id) applyIntrinsicSize(component, project.assets)
  })
  forget('tilesetRef')
  forget('tileX')
  forget('tileY')
}

function setTileIndex(key: 'tileX' | 'tileY', event: Event): void {
  const value = numberValue(event)
  if (!menu.value || selected.value?.type !== 'tile' || value === null) return
  const index = Math.max(0, Math.floor(value))
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type === 'tile') component[key] = index
  })
  forget(key)
}

function setTilemapTileset(id: string | null): void {
  if (!menu.value || selected.value?.type !== 'tilemap') return
  const current = tilesetById(project.assets, selected.value.tilesetId)
  const next = tilesetById(project.assets, id)
  if (current && next && !sameTileSize(current, next)) {
    session.fail('That tileset uses a different tile size, so the palette was not changed.')
    return
  }
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type !== 'tilemap') return
    component.tilesetId = id
    if (!current && next) {
      const fitted = fitTileSpan(component, next.tileWidth, next.tileHeight)
      component.x = fitted.x
      component.y = fitted.y
      component.width = fitted.width
      component.height = fitted.height
      const size = mapSize(component.width, component.height, next.tileWidth, next.tileHeight)
      component.cells = pruneCells(component.cells, size.cols, size.rows)
    }
  })
  forget('tilesetRef')
  forget('cells')
}

function openTileset(id: string | null): void {
  if (id) project.openAsset(id)
}

const editingTilemap = computed(() => menu.value && selected.value ? session.tilemapEdit === `${menu.value.id}/${selected.value.id}` : false)

function editTilemap(): void {
  if (!menu.value || selected.value?.type !== 'tilemap') return
  const key = `${menu.value.id}/${selected.value.id}`
  session.tilemapEdit = session.tilemapEdit === key ? null : key
}

function setScene(id: string | null): void {
  if (!menu.value || selected.value?.type !== 'sceneViewer') return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type === 'sceneViewer') component.sceneId = id
  })
  forget('sceneRef')
}

function setView(key: 'viewX' | 'viewY' | 'scale', event: Event): void {
  const value = numberValue(event)
  if (!menu.value || selected.value?.type !== 'sceneViewer' || value === null) return
  const next = key === 'scale' ? Math.floor(value) : value
  if (key === 'scale' && next < 1) return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type === 'sceneViewer') component[key] = next
  })
  forget(key)
}

function setScaleWithViewer(event: Event): void {
  if (!menu.value || selected.value?.type !== 'sceneViewer') return
  const scaleWithViewer = (event.target as HTMLInputElement).checked
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    if (component.type === 'sceneViewer') component.scaleWithViewer = scaleWithViewer
  })
}

function openScene(): void {
  if (selected.value?.type !== 'sceneViewer' || !selected.value.sceneId) return
  project.openAsset(selected.value.sceneId)
}

function setEnabled(event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked
  patchButton((component) => {
    component.enabled = enabled
  })
  forget('enabled')
}

function setComponentScript(id: string | null): void {
  if (!menu.value || !selected.value) return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    component.scriptId = id
  })
}

function createComponentScript(): void {
  if (!menu.value || !selected.value) return
  project.createComponentScript(menu.value.id, selected.value.id)
}

function editComponentScript(): void {
  if (!menu.value || !selected.value) return
  project.openScriptTab(`component:${menu.value.id}:${selected.value.id}`)
}

function deleteComponentScript(): void {
  if (!menu.value || !selected.value) return
  project.deleteComponentScript(menu.value.id, selected.value.id)
}

function patchButton(recipe: (component: ButtonComponent) => void): void {
  if (!menu.value || selected.value?.type !== 'button') return
  const componentId = selected.value.id
  project.patchComponent(menu.value.id, componentId, (component) => {
    if (component.type === 'button') recipe(component)
  })
}
</script>

<template>
  <div class="inspector">
    <template v-if="project.workspace.activeTab === 'game'">
      <p>Entry point: {{ project.entryMenu?.name ?? 'None' }}</p>
      <label class="field">
        <span class="field-label">Open menu</span>
        <select :value="play.currentId ?? ''" @change="openMenu">
          <option value="" disabled>Choose a menu</option>
          <option v-for="item in project.menus" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>
      <div class="inline-actions">
        <button class="btn" type="button" :disabled="!play.canBack" @click="play.back()">Back</button>
        <button class="btn" type="button" :disabled="!play.canForward" @click="play.forward()">Forward</button>
        <button class="btn" type="button" :disabled="!project.meta?.entryMenuId" @click="play.reset(project.meta?.entryMenuId ?? null)">Restart</button>
      </div>
      <div>
        <div class="field-label">Navigation</div>
        <ol v-if="play.history.length > 0" class="history">
          <li v-for="(id, index) in play.history" :key="`${id}-${index}`">
            <button type="button" :class="{ current: index === play.index }" @click="play.jump(index)">{{ menuName(id) }}</button>
          </li>
        </ol>
        <p v-else class="tree-hint">Navigation history will appear here.</p>
      </div>
      <div>
        <div class="field-label">Console</div>
        <div v-if="play.logs.length === 0" class="tree-hint">Print output and script errors appear here.</div>
        <div v-else class="console">
          <p v-for="(entry, index) in play.logs" :key="index" :class="entry.tone">{{ entry.text }}</p>
        </div>
      </div>
    </template>

    <template v-else-if="menu">
      <div>
        <div class="field-label">Components</div>
        <button
          v-for="component in layers"
          :key="component.id"
          class="layer"
          :class="{ selected: component.id === selected?.id }"
          type="button"
          @click="session.selectedComponentId = component.id"
        >
          <span>{{ component.name || 'Untitled' }}</span>
          <span>{{ component.type }}</span>
        </button>
        <p v-if="layers.length === 0" class="tree-hint">Right-click the canvas to add a component.</p>
      </div>
      <template v-if="selected">
        <label class="field">
          <span class="field-label">Name</span>
          <input :value="selected.name" @input="setName" />
        </label>
        <label class="field">
          <span class="field-label">Script id</span>
          <input :value="selected.handle" spellcheck="false" @change="setHandle" />
        </label>
        <template v-if="selected.type === 'collider'">
          <label class="field">
            <span class="field-label">Shape</span>
            <select :value="selected.shape" @change="setColliderShape">
              <option value="square">Square</option>
              <option value="circle">Circle</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">Tags</span>
            <input :value="selected.tags.join(', ')" spellcheck="false" @change="setColliderTags" />
          </label>
          <label class="check">
            <input type="checkbox" :checked="selected.enabled" @change="setColliderEnabled" />
            <span>Enabled</span>
          </label>
          <p class="tree-hint">A square fills this box. A circle is the ellipse that fills it. Separate tags with commas. The outline shows in the editor only.</p>
        </template>
        <template v-if="selected.type === 'tile'">
          <AssetSelect label="Tileset" type="tileset" clearable :model-value="selected.tilesetId" @update:model-value="setTileTileset" />
          <div class="grid-2">
            <label class="field"><span class="field-label">Tile X</span><input type="number" min="0" step="1" :value="selected.tileX" @change="setTileIndex('tileX', $event)" /></label>
            <label class="field"><span class="field-label">Tile Y</span><input type="number" min="0" step="1" :value="selected.tileY" @change="setTileIndex('tileY', $event)" /></label>
          </div>
          <button class="btn" type="button" :disabled="!selected.tilesetId" @click="openTileset(selected.tilesetId)">Open tileset</button>
          <p class="tree-hint">This box is one cell. A merged tile hangs out of it, and resizing stretches that picture.</p>
        </template>
        <template v-else-if="selected.type === 'tilemap'">
          <AssetSelect label="Tileset" type="tileset" clearable :model-value="selected.tilesetId" @update:model-value="setTilemapTileset" />
          <button class="btn" type="button" :disabled="!selected.tilesetId" @click="editTilemap">{{ editingTilemap ? 'Done painting' : 'Edit tiles' }}</button>
          <button class="btn" type="button" :disabled="!selected.tilesetId" @click="openTileset(selected.tilesetId)">Open tileset</button>
          <p class="tree-hint">Edit tiles paints this map in place. Width and height stay on whole tiles. A tileset with a different tile size is refused.</p>
        </template>
        <template v-if="selected.type === 'composite'">
          <AssetSelect
            label="Composite"
            type="composite"
            clearable
            :blocked-ids="blockedComposites"
            :model-value="selected.compositeId"
            @update:model-value="setComposite"
          />
          <label class="check">
            <input type="checkbox" :checked="selected.enabled" @change="setCompositeEnabled" />
            <span>Enabled</span>
          </label>
          <button class="btn" type="button" :disabled="!selected.compositeId" @click="openComposite">Open composite</button>
          <p class="tree-hint">X and Y place this composite's origin. Set the origin on the composite's canvas.</p>
        </template>
        <template v-else-if="selected.type === 'sceneViewer'">
          <AssetSelect label="Scene" type="scene" clearable :model-value="selected.sceneId" @update:model-value="setScene" />
          <label class="field"><span class="field-label">View X</span><input type="number" :value="selected.viewX" @change="setView('viewX', $event)" /></label>
          <label class="field"><span class="field-label">View Y</span><input type="number" :value="selected.viewY" @change="setView('viewY', $event)" /></label>
          <label class="field"><span class="field-label">Scale</span><input type="number" min="1" step="1" :value="selected.scale" @change="setView('scale', $event)" /></label>
          <label class="check">
            <input type="checkbox" :checked="selected.scaleWithViewer" @change="setScaleWithViewer" />
            <span>Scale with the viewer</span>
          </label>
          <p class="tree-hint">Scale is how many pixels one scene pixel occupies. With this on, a larger viewer enlarges those pixels. With this off, a larger viewer shows more of the scene.</p>
          <button class="btn" type="button" :disabled="!selected.sceneId" @click="openScene">Open scene</button>
          <AssetSelect label="Script" type="script" clearable :model-value="selected.scriptId" @update:model-value="setComponentScript" />
          <div class="stack-actions">
            <button class="btn" type="button" :disabled="selected.script.trim().length > 0" @click="createComponentScript">Create Script</button>
            <button class="btn" type="button" :disabled="selected.script.trim().length === 0" @click="editComponentScript">Edit Script</button>
            <button class="btn danger" type="button" :disabled="selected.script.trim().length === 0" @click="deleteComponentScript">Delete Script</button>
          </div>
        </template>
        <template v-else>
          <AssetSelect label="Script" type="script" clearable :model-value="selected.scriptId" @update:model-value="setComponentScript" />
          <div class="stack-actions">
            <button class="btn" type="button" :disabled="selected.script.trim().length > 0" @click="createComponentScript">Create Script</button>
            <button class="btn" type="button" :disabled="selected.script.trim().length === 0" @click="editComponentScript">Edit Script</button>
            <button class="btn danger" type="button" :disabled="selected.script.trim().length === 0" @click="deleteComponentScript">Delete Script</button>
          </div>
        </template>
        <div class="grid-2">
          <label class="field"><span class="field-label">X</span><input type="number" :value="selected.x" @change="setRect('x', $event)" /></label>
          <label class="field"><span class="field-label">Y</span><input type="number" :value="selected.y" @change="setRect('y', $event)" /></label>
          <label class="field"><span class="field-label">Width</span><input type="number" :value="selected.width" @change="setRect('width', $event)" /></label>
          <label class="field"><span class="field-label">Height</span><input type="number" :value="selected.height" @change="setRect('height', $event)" /></label>
        </div>
        <button v-if="sizedComponent" class="btn" type="button" :disabled="!naturalSize" @click="resetSize">Reset size</button>
        <label class="field">
          <span class="field-label">Color</span>
          <input type="color" :value="selected.tint" @input="setTint" />
        </label>
        <label class="check">
          <input type="checkbox" :checked="selected.visible" @change="setVisible" />
          <span>Visible</span>
        </label>
        <div class="inline-actions">
          <button class="btn" type="button" @click="project.moveComponent(menu.id, selected.id, 1)">Forward</button>
          <button class="btn" type="button" @click="project.moveComponent(menu.id, selected.id, -1)">Backward</button>
          <button class="btn danger" type="button" @click="project.removeComponent(menu.id, selected.id)">Delete</button>
        </div>
        <AssetSelect
          v-if="selected.type === 'image'"
          label="Image"
          type="image"
          clearable
          :model-value="selected.imageId"
          @update:model-value="setImage"
        />
        <label v-if="selected.type === 'image'" class="field">
          <span class="field-label">Fit</span>
          <select :value="selected.fit" @change="setImageFit">
            <option value="stretch">Stretch</option>
            <option value="tile">Tile</option>
          </select>
        </label>
        <template v-if="selected.type === 'button'">
          <AssetSelect
            label="Button"
            type="button"
            clearable
            :model-value="selected.buttonId"
            @update:model-value="setButtonAsset"
          />
          <label class="check">
            <input type="checkbox" :checked="selected.enabled" @change="setEnabled" />
            <span>Enabled</span>
          </label>
          <label class="field">
            <span class="field-label">Text</span>
            <input :value="selected.text" @input="setButtonText" />
          </label>
          <label class="field">
            <span class="field-label">Font</span>
            <select :value="selected.fontFamily" @change="setFont">
              <option v-for="font in BUILTIN_FONTS" :key="font.value" :value="font.value">{{ font.label }}</option>
            </select>
          </label>
          <div class="grid-2">
            <label class="field">
              <span class="field-label">Font size %</span>
              <input type="number" min="8" max="80" :value="selected.fontSize" @change="setFontSize" />
            </label>
            <label class="field">
              <span class="field-label">Text color</span>
              <input type="color" :value="selected.color" @input="setColor" />
            </label>
          </div>
        </template>
        <ComponentFields
          v-if="selected.type !== 'image' && selected.type !== 'button' && selected.type !== 'composite' && selected.type !== 'sceneViewer'"
          :menu-id="menu.id"
          :component="selected"
        />
        <ScriptProperties :menu-id="menu.id" :component="selected" />
      </template>
      <p v-else class="tree-hint">Select a component to edit its rectangle, asset, and label.</p>
    </template>

    <template v-else-if="scriptKey">
      <p>Script</p>
      <p class="tree-hint">Hooks are <code>onLoad</code> on a menu, scene, or composite, and <code>onUpdate</code> on a menu, scene, or composite. <code>onInteract</code> runs on a button or image, and <code>onChange</code> on an input. A local script replaces functions from the script asset it references. Use <code>game.state</code> for values that should last across menus, including a collection loaded with <code>game.loadCollection</code>.</p>
    </template>

    <template v-else-if="project.workspace.activeTab.startsWith('collection:')">
      <p>Collection</p>
      <p class="tree-hint">Edit the template and the entries in the collection tab. A script loads it with <code>game.loadCollection</code>, changes that copy with <code>set</code>, <code>add</code>, and <code>remove</code>, and keeps the changes with <code>save</code> and <code>load</code>.</p>
    </template>

    <template v-else-if="project.workspace.activeTab.startsWith('book:')">
      <p>Book</p>
      <p class="tree-hint">Chapters and pages are listed on the left. Click a page to edit it. Right-click a chapter or page to add, rename, duplicate, or delete. A new page stays in the tree until you click it. Page data is a field list shared by every page. A script loads the book with <code>game.loadBook</code> and opens a page with <code>openPage</code>.</p>
    </template>

    <template v-else-if="focused">
      <p>{{ focused.type }} asset</p>
      <p>{{ focused.name }}</p>
      <p class="tree-hint">{{ focused.relativePath }}</p>
    </template>
    <template v-else-if="project.focusedWindow?.assetId === GAME_PROPERTIES_WINDOW">
      <p>Properties</p>
      <p class="tree-hint">The title, icon, and author are edited in the Properties window.</p>
    </template>
    <p v-else class="tree-hint">Open an image, button, or panel from the project tree.</p>
  </div>
</template>
