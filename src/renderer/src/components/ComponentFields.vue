<script setup lang="ts">
import { computed } from 'vue'
import { BUILTIN_FONTS } from '@shared/fonts'
import { createId } from '@shared/ids'
import type { ComponentOverride } from '@shared/overrides'
import type { MenuComponent } from '@shared/types'
import { usePlayStore } from '@/stores/play'
import { useProjectStore } from '@/stores/project'
import AssetSelect from './AssetSelect.vue'

const props = defineProps<{ menuId: string; component: MenuComponent }>()
const project = useProjectStore()
const play = usePlayStore()
const pagePaths = computed(() => {
  if (props.component.type !== 'pageViewer' || !props.component.bookId) return []
  const book = project.asset(props.component.bookId)
  if (book?.type !== 'book') return []
  return book.chapters.flatMap((chapter) => chapter.pages.map((page) => `${chapter.name}/${page.name}`))
})

function patch(recipe: (component: MenuComponent) => void): void {
  project.patchComponent(props.menuId, props.component.id, recipe)
}

function forget(key: keyof ComponentOverride): void {
  play.clearOverride(props.menuId, props.component.id, key)
}

function numberValue(event: Event): number | null {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : null
}

function setBook(id: string | null): void {
  patch((component) => {
    if (component.type !== 'pageViewer') return
    component.bookId = id
    component.pagePath = ''
  })
  forget('bookRef')
  forget('pagePath')
  forget('pageBook')
  forget('pageInputs')
}

function setPagePath(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  patch((component) => {
    if (component.type === 'pageViewer') component.pagePath = value
  })
  forget('pagePath')
  forget('pageBook')
  forget('pageInputs')
}

function setProgressive(event: Event): void {
  const progressive = (event.target as HTMLInputElement).checked
  patch((component) => {
    if (component.type === 'pageViewer') component.progressive = progressive
  })
  forget('progressive')
}

function setScrollable(event: Event): void {
  const scrollable = (event.target as HTMLInputElement).checked
  patch((component) => {
    if (component.type === 'pageViewer') component.scrollable = scrollable
  })
  forget('scrollable')
}

function setTextRate(event: Event): void {
  const value = numberValue(event)
  if (value === null) return
  patch((component) => {
    if (component.type === 'pageViewer') component.rate = Math.min(1000, Math.max(1, value))
  })
  forget('rate')
}

function setPanel(id: string | null): void {
  patch((component) => {
    if (component.type !== 'image' && component.type !== 'button' && component.type !== 'composite') component.panelId = id
  })
  forget('panelRef')
}

function setText(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  patch((component) => {
    if (component.type === 'label' || component.type === 'toggle') component.text = value
  })
  forget('text')
}

function setFont(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  patch((component) => {
    if ('fontFamily' in component) component.fontFamily = value
  })
}

function setFontSize(event: Event): void {
  const value = numberValue(event)
  if (value === null) return
  patch((component) => {
    const min = component.type === 'pageViewer' ? 1 : 8
    if ('fontFamily' in component) component.fontSize = Math.min(80, Math.max(min, value))
  })
}

function setColor(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  patch((component) => {
    if ('color' in component) component.color = value
  })
}

function setFill(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  patch((component) => {
    if (component.type === 'meter' || component.type === 'slider') component.fillColor = value
  })
}

function setRange(key: 'min' | 'max' | 'value' | 'step', event: Event): void {
  const value = numberValue(event)
  if (value === null) return
  patch((component) => {
    if (component.type !== 'meter' && component.type !== 'slider') return
    if (key === 'step') {
      if (component.type === 'slider') component.step = value
      return
    }
    component[key] = value
  })
  if (key !== 'step') forget(key)
}

function setStringValue(event: Event): void {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  patch((component) => {
    if (component.type === 'text' || component.type === 'textarea') component.value = value
  })
  forget('value')
}

function setPlaceholder(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  patch((component) => {
    if (component.type === 'text' || component.type === 'textarea') component.placeholder = value
  })
}

function setToggle(event: Event): void {
  const value = (event.target as HTMLInputElement).checked
  patch((component) => {
    if (component.type === 'toggle') component.value = value
  })
  forget('value')
}

function setMode(event: Event): void {
  const mode = (event.target as HTMLSelectElement).value === 'any' ? 'any' : 'one'
  patch((component) => {
    if (component.type !== 'toggleGroup') return
    component.mode = mode
    if (mode === 'one') component.selected = component.selected.slice(0, 1)
  })
  forget('value')
}

function setDropdown(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  patch((component) => {
    if (component.type === 'dropdown') component.value = value
  })
  forget('value')
}

function setOptionLabel(id: string, event: Event): void {
  const label = (event.target as HTMLInputElement).value
  patch((component) => {
    if (component.type !== 'dropdown' && component.type !== 'toggleGroup') return
    const option = component.options.find((item) => item.id === id)
    if (option) option.label = label
  })
}

function addOption(): void {
  patch((component) => {
    if (component.type !== 'dropdown' && component.type !== 'toggleGroup') return
    component.options.push({ id: createId(), label: 'Option' })
  })
}

function removeOption(id: string): void {
  patch((component) => {
    if (component.type !== 'dropdown' && component.type !== 'toggleGroup') return
    component.options = component.options.filter((option) => option.id !== id)
    if (component.type === 'dropdown' && component.value === id) component.value = component.options[0]?.id ?? ''
    if (component.type === 'toggleGroup') component.selected = component.selected.filter((item) => item !== id)
  })
  forget('value')
}

function toggleSelected(id: string, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  patch((component) => {
    if (component.type !== 'toggleGroup') return
    if (component.mode === 'one') component.selected = checked ? [id] : []
    else if (checked) component.selected = component.selected.includes(id) ? component.selected : [...component.selected, id]
    else component.selected = component.selected.filter((item) => item !== id)
  })
  forget('value')
}
</script>

<template>
  <AssetSelect
    v-if="component.type !== 'image' && component.type !== 'button' && component.type !== 'composite'"
    label="Panel"
    type="panel"
    clearable
    :model-value="component.panelId"
    @update:model-value="setPanel"
  />
  <template v-if="component.type === 'pageViewer'">
    <AssetSelect label="Book" type="book" clearable :model-value="component.bookId" @update:model-value="setBook" />
    <label class="field">
      <span class="field-label">Page</span>
      <select :value="component.pagePath" @change="setPagePath">
        <option value="">Choose a page</option>
        <option v-for="path in pagePaths" :key="path" :value="path">{{ path }}</option>
      </select>
    </label>
    <label class="check">
      <input type="checkbox" :checked="component.progressive" @change="setProgressive" />
      <span>Progressive text</span>
    </label>
    <label class="check">
      <input type="checkbox" :checked="component.scrollable" @change="setScrollable" />
      <span>Scrollable</span>
    </label>
    <label class="field">
      <span class="field-label">Characters / second</span>
      <input type="number" min="1" max="1000" :value="component.rate" @change="setTextRate" />
    </label>
  </template>
  <template v-if="component.type === 'label' || component.type === 'toggle'">
    <label class="field">
      <span class="field-label">Text</span>
      <input :value="component.text" @input="setText" />
    </label>
  </template>
  <label v-if="component.type === 'toggle'" class="check">
    <input type="checkbox" :checked="component.value" @change="setToggle" />
    <span>On</span>
  </label>
  <template v-if="component.type === 'text' || component.type === 'textarea'">
    <label class="field">
      <span class="field-label">Value</span>
      <textarea v-if="component.type === 'textarea'" :value="component.value" rows="4" @change="setStringValue"></textarea>
      <input v-else :value="component.value" @change="setStringValue" />
    </label>
    <label class="field">
      <span class="field-label">Placeholder</span>
      <input :value="component.placeholder" @change="setPlaceholder" />
    </label>
  </template>
  <template v-if="component.type === 'meter' || component.type === 'slider'">
    <div class="grid-2">
      <label class="field"><span class="field-label">Min</span><input type="number" :value="component.min" @change="setRange('min', $event)" /></label>
      <label class="field"><span class="field-label">Max</span><input type="number" :value="component.max" @change="setRange('max', $event)" /></label>
      <label class="field"><span class="field-label">Value</span><input type="number" :value="component.value" @change="setRange('value', $event)" /></label>
      <label v-if="component.type === 'slider'" class="field">
        <span class="field-label">Step</span>
        <input type="number" min="0" :value="component.step" @change="setRange('step', $event)" />
      </label>
    </div>
    <label class="field">
      <span class="field-label">Fill</span>
      <input type="color" :value="component.fillColor" @input="setFill" />
    </label>
  </template>
  <template v-if="component.type === 'toggleGroup'">
    <label class="field">
      <span class="field-label">Mode</span>
      <select :value="component.mode" @change="setMode">
        <option value="one">One</option>
        <option value="any">Any</option>
      </select>
    </label>
  </template>
  <template v-if="component.type === 'dropdown'">
    <label class="field">
      <span class="field-label">Value</span>
      <select :value="component.value" @change="setDropdown">
        <option value="">None</option>
        <option v-for="option in component.options" :key="option.id" :value="option.id">{{ option.label }}</option>
      </select>
    </label>
  </template>
  <template v-if="component.type === 'dropdown' || component.type === 'toggleGroup'">
    <div class="field-label">Options</div>
    <div v-for="option in component.options" :key="option.id" class="option-row">
      <label v-if="component.type === 'toggleGroup'" class="check">
        <input type="checkbox" :checked="component.selected.includes(option.id)" @change="toggleSelected(option.id, $event)" />
      </label>
      <input :value="option.label" @change="setOptionLabel(option.id, $event)" />
      <button class="btn quiet" type="button" @click="removeOption(option.id)">×</button>
    </div>
    <button class="btn" type="button" @click="addOption">Add option</button>
  </template>
  <template v-if="'fontFamily' in component">
    <label class="field">
      <span class="field-label">Font</span>
      <select :value="component.fontFamily" @change="setFont">
        <option v-for="font in BUILTIN_FONTS" :key="font.value" :value="font.value">{{ font.label }}</option>
      </select>
    </label>
    <div class="grid-2">
      <label class="field">
        <span class="field-label">Font size %</span>
        <input type="number" :min="component.type === 'pageViewer' ? 1 : 8" max="80" :value="component.fontSize" @change="setFontSize" />
      </label>
      <label class="field">
        <span class="field-label">Text color</span>
        <input type="color" :value="component.color" @input="setColor" />
      </label>
    </div>
  </template>
</template>
