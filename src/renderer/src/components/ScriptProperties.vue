<script setup lang="ts">
import { computed } from 'vue'
import { assetLocationOf, findAssetByLocation } from '@shared/refs'
import { componentProperties, isAssetScriptProperty, scriptPropertyNumber } from '@shared/scriptProperties'
import type { AssetType } from '@shared/types'
import type { CompositeAsset, MenuComponent } from '@shared/types'
import { useProjectStore } from '@/stores/project'
import AssetSelect from './AssetSelect.vue'
import BookPageSelect from './BookPageSelect.vue'

const props = defineProps<{ menuId: string; component: MenuComponent }>()
const project = useProjectStore()

const fields = computed(() => {
  const asset = props.component.type === 'composite' ? compositeAsset(props.component.compositeId) : null
  if (props.component.type === 'composite' && !asset) return []
  const shared = asset ? scriptSource(asset.scriptId) : scriptSource(props.component.scriptId)
  const local = asset ? asset.script : props.component.script
  return componentProperties(shared, local)
})

function compositeAsset(id: string | null): CompositeAsset | null {
  const asset = id ? project.asset(id) : null
  return asset?.type === 'composite' ? asset : null
}

function scriptSource(id: string | null): string {
  const asset = id ? project.asset(id) : null
  return asset?.type === 'script' ? asset.source : ''
}

function stored(name: string): string | boolean | number | undefined {
  return props.component.properties?.[name]
}

function assetChoice(type: AssetType, name: string): string | null {
  const value = stored(name)
  return typeof value === 'string' && value ? (findAssetByLocation(project.assets, value, type)?.id ?? null) : null
}

function setProperty(name: string, value: string | boolean | number): void {
  project.patchComponent(props.menuId, props.component.id, (component) => {
    component.properties = { ...(component.properties ?? {}), [name]: value }
  })
}

function setAsset(name: string, id: string | null): void {
  setProperty(name, id ? (assetLocationOf(project.assets, id) ?? '') : '')
}
</script>

<template>
  <template v-for="field in fields" :key="field.name">
    <AssetSelect
      v-if="isAssetScriptProperty(field.type)"
      :label="field.label"
      clearable
      :type="field.type"
      :model-value="assetChoice(field.type, field.name)"
      @update:model-value="setAsset(field.name, $event)"
    />
    <BookPageSelect
      v-else-if="field.type === 'bookPage'"
      :label="field.label"
      :model-value="typeof stored(field.name) === 'string' ? String(stored(field.name)) : ''"
      @update:model-value="setProperty(field.name, $event)"
    />
    <label v-else class="field">
      <span class="field-label">{{ field.label }}</span>
      <input
        v-if="field.type === 'boolean'"
        type="checkbox"
        :checked="stored(field.name) === true"
        @change="setProperty(field.name, ($event.target as HTMLInputElement).checked)"
      />
      <input
        v-else-if="field.type === 'integer' || field.type === 'float'"
        type="number"
        :step="field.type === 'integer' ? 1 : 'any'"
        :value="scriptPropertyNumber(stored(field.name), field.type === 'integer')"
        @change="setProperty(field.name, scriptPropertyNumber(($event.target as HTMLInputElement).value, field.type === 'integer'))"
      />
      <input v-else :value="typeof stored(field.name) === 'string' ? stored(field.name) : ''" @change="setProperty(field.name, ($event.target as HTMLInputElement).value)" />
    </label>
  </template>
</template>
