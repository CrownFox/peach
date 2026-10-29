<script setup lang="ts">
import { computed } from 'vue'
import { emptyInputStyle, type PageInputStyle } from '@shared/inputStyle'
import { useProjectStore } from '@/stores/project'
import InputStyleEditor from './InputStyleEditor.vue'

const project = useProjectStore()
const style = computed(() => project.meta?.inputStyle ?? emptyInputStyle())

function onChange(next: PageInputStyle): void {
  void project.updateMeta({ inputStyle: next })
}
</script>

<template>
  <InputStyleEditor
    v-if="project.meta"
    show-kind
    layer="global"
    :text="style.text"
    :dropdown="style.dropdown"
    hint="This is the game style for text fields and dropdowns on pages. Write declarations, or &:hover, &:focus, and &:disabled. A page viewer or one field can add to it."
    @change="onChange"
  />
</template>
