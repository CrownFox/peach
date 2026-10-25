<script setup lang="ts">
import { computed } from 'vue'
import { BUILTIN_FONTS } from '@shared/fonts'
import { isScriptHandle } from '@shared/handles'
import type { ComponentOverride } from '@shared/overrides'
import { assetLocation } from '@shared/paths'
import { compositeBlocked } from '@shared/composites'
import { isCanvas, type ButtonComponent } from '@shared/types'
import { usePlayStore } from '@/stores/play'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import AssetSelect from './AssetSelect.vue'
import ComponentFields from './ComponentFields.vue'

const project = useProjectStore()
const session = useSessionStore()
const play = usePlayStore()

const menu = computed(() => {
  const tab = project.workspace.activeTab
  const prefix = tab.startsWith('menu:') ? 'menu:' : tab.startsWith('composite:') ? 'composite:' : ''
  if (!prefix) return null
  const asset = project.asset(tab.slice(prefix.length))
  return asset && isCanvas(asset) ? asset : null
})
const selected = computed(() => menu.value?.components.find((component) => component.id === session.selectedComponentId) ?? null)
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
  if (!menu.value || !selected.value || value === null) return
  project.patchComponent(menu.value.id, selected.value.id, (component) => {
    component[key] = value
  })
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
    if (component.type === 'image') component.imageId = id
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
  })
  forget('buttonRef')
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
    if (component.type === 'composite') component.compositeId = id
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
          v-if="selected.type !== 'image' && selected.type !== 'button' && selected.type !== 'composite'"
          :menu-id="menu.id"
          :component="selected"
        />
      </template>
      <p v-else class="tree-hint">Select a component to edit its rectangle, asset, and label.</p>
    </template>

    <template v-else-if="scriptKey">
      <p>Script</p>
      <p class="tree-hint">Hooks are <code>onLoad</code> on a menu or composite, <code>onInteract</code> on a button or image, and <code>onChange</code> on an input. A local script replaces functions from the script asset it references. Use <code>game.state</code> for values that should last across menus, including a collection loaded with <code>game.loadCollection</code>.</p>
    </template>

    <template v-else-if="project.workspace.activeTab.startsWith('collection:')">
      <p>Collection</p>
      <p class="tree-hint">Edit the template and the entries in the collection tab. A script loads it with <code>game.loadCollection</code>, changes that copy with <code>set</code>, <code>add</code>, and <code>remove</code>, and keeps the changes with <code>save</code> and <code>load</code>.</p>
    </template>

    <template v-else-if="project.workspace.activeTab.startsWith('book:')">
      <p>Book</p>
      <p class="tree-hint">Chapters hold pages. Page data is a field list shared by every page. A script loads the book with <code>game.loadBook</code> and opens a page with <code>openPage</code>.</p>
    </template>

    <template v-else-if="project.workspace.activeTab.startsWith('page:')">
      <p>Page</p>
      <p class="tree-hint">Format the writing with the toolbar. Images, conditions, evaluates, text fields, and dropdowns sit in the text. Select one to edit it. A page viewer shows this page in the game.</p>
    </template>

    <template v-else-if="focused">
      <p>{{ focused.type }} asset</p>
      <p>{{ focused.name }}</p>
      <p class="tree-hint">{{ focused.relativePath }}</p>
    </template>
    <p v-else class="tree-hint">Open an image, button, or panel from the project tree.</p>
  </div>
</template>
