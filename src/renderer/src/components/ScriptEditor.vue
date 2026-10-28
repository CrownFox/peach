<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { editor } from 'monaco-editor/editor/editor.api.js'
import { useProjectStore } from '@/stores/project'
import { monacoApi, setScriptHints, type ScriptHints } from '@/script/monaco'
import { componentProperties } from '@shared/scriptProperties'
import { isCanvas, type CanvasAsset } from '@shared/types'
import { canvasComponents, findComponent } from '@shared/zField'

const props = defineProps<{ tab: string }>()
const project = useProjectStore()
const host = ref<HTMLElement | null>(null)
const models = new Map<string, editor.ITextModel>()
let codeEditor: editor.IStandaloneCodeEditor | null = null
let applying = false

function componentHandles(canvas: CanvasAsset, seen = new Set<string>()): ScriptHints['handles'] {
  if (seen.has(canvas.id)) return []
  const next = new Set(seen)
  next.add(canvas.id)
  return canvasComponents(canvas.components).flatMap((component) => {
    if (!component.handle) return []
    const handle: ScriptHints['handles'][number] = { name: component.handle, type: component.type }
    if (component.type === 'composite' && component.compositeId) {
      const asset = project.asset(component.compositeId)
      if (asset?.type === 'composite') handle.children = componentHandles(asset, next)
    }
    if (component.type === 'sceneViewer' && component.sceneId) {
      const asset = project.asset(component.sceneId)
      if (asset?.type === 'scene') handle.children = componentHandles(asset, next)
    }
    return [handle]
  })
}

function scriptHosts(scriptId: string): NonNullable<ScriptHints['hosts']> {
  const hosts: NonNullable<ScriptHints['hosts']> = []
  const seen = new Set<string>()
  const add = (host: NonNullable<ScriptHints['hosts']>[number]): void => {
    if (seen.has(host)) return
    seen.add(host)
    hosts.push(host)
  }
  for (const asset of project.assets) {
    if ((asset.type === 'menu' || asset.type === 'scene' || asset.type === 'composite') && asset.scriptId === scriptId) add(asset.type)
    if (!isCanvas(asset)) continue
    for (const component of canvasComponents(asset.components)) {
      if (component.scriptId === scriptId) add(component.type)
    }
  }
  return hosts
}

function referencedScript(id: string | null): string {
  const asset = id ? project.asset(id) : null
  return asset?.type === 'script' ? asset.source : ''
}

function hintsFor(tab: string): ScriptHints {
  if (tab.startsWith('menu:')) {
    const menu = project.asset(tab.slice(5))
    return { handles: menu && isCanvas(menu) ? componentHandles(menu) : [], self: 'menu' }
  }
  if (tab.startsWith('composite:')) {
    const canvas = project.asset(tab.slice(10))
    const composite = canvas?.type === 'composite' ? canvas : null
    return {
      handles: composite ? componentHandles(composite) : [],
      self: 'composite',
      suggestProperties: true,
      propertySources: [referencedScript(composite?.scriptId ?? null)]
    }
  }
  if (tab.startsWith('scene:')) {
    const canvas = project.asset(tab.slice(6))
    const scene = canvas?.type === 'scene' ? canvas : null
    return { handles: scene ? componentHandles(scene) : [], self: 'scene' }
  }
  if (tab.startsWith('component:')) {
    const [, menuId, componentId] = tab.split(':')
    const menu = project.asset(menuId ?? null)
    const canvas = menu && isCanvas(menu) ? menu : null
    const component = canvas ? findComponent(canvas.components, componentId ?? '') : null
    const handles = canvas ? componentHandles(canvas) : []
    const outerProperties = canvas?.type === 'composite' ? componentProperties(referencedScript(canvas.scriptId), canvas.script) : []
    const scene = component?.type === 'sceneViewer' && component.sceneId ? project.asset(component.sceneId) : null
    if (component) {
      return {
        handles,
        self: component.type,
        children: scene?.type === 'scene' ? componentHandles(scene) : [],
        suggestProperties: true,
        propertySources: [referencedScript(component.scriptId)],
        outerProperties
      }
    }
    return { handles, self: 'any' }
  }
  if (tab.startsWith('pagescript:')) return { handles: [], self: 'any', parent: 'pageViewer' }
  if (tab.startsWith('doodad:')) return { handles: [], self: 'pageViewer' }
  if (tab.startsWith('asset:')) {
    const id = tab.slice(6)
    const handles: ScriptHints['handles'] = []
    for (const asset of project.assets) {
      if (!isCanvas(asset)) continue
      const used = asset.scriptId === id || asset.components.some((component) => component.scriptId === id)
      if (used) handles.push(...componentHandles(asset))
    }
    const hosts = scriptHosts(id)
    return { handles, self: hosts.length === 1 ? hosts[0] : 'any', hosts: hosts.length > 1 ? hosts : undefined, suggestProperties: true }
  }
  return { handles: [], self: 'any' }
}

function modelFor(tab: string): editor.ITextModel {
  const existing = models.get(tab)
  if (existing) return existing
  const model = monacoApi().editor.createModel(project.scriptSource(tab), 'lua')
  models.set(tab, model)
  return model
}

function show(tab: string): void {
  if (!codeEditor) return
  setScriptHints(hintsFor(tab))
  const model = modelFor(tab)
  const source = project.scriptSource(tab)
  if (model.getValue() !== source) {
    applying = true
    model.setValue(source)
    applying = false
  }
  if (codeEditor.getModel() !== model) codeEditor.setModel(model)
}

onMounted(() => {
  if (!host.value) return
  const monaco = monacoApi()
  codeEditor = monaco.editor.create(host.value, {
    theme: 'peach',
    language: 'lua',
    fontSize: 14,
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
    wordBasedSuggestions: 'currentDocument',
    fixedOverflowWidgets: true,
    fontFamily: 'Cascadia Code, Consolas, monospace',
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    tabSize: 2,
    wordWrap: 'on',
    padding: { top: 12 }
  })
  codeEditor.onDidChangeModelContent(() => {
    if (applying || !codeEditor) return
    project.setScriptSource(props.tab, codeEditor.getValue())
  })
  show(props.tab)
})

watch(() => props.tab, (tab) => show(tab))
watch(() => project.scriptSource(props.tab), () => show(props.tab))
watch(
  () => project.workspace.openScriptTabs.slice(),
  (tabs) => {
    for (const [key, model] of models) {
      if (!tabs.includes(key)) {
        if (codeEditor?.getModel() === model) codeEditor.setModel(null)
        model.dispose()
        models.delete(key)
      }
    }
  }
)

onBeforeUnmount(() => {
  codeEditor?.dispose()
  for (const model of models.values()) model.dispose()
  models.clear()
})
</script>

<template>
  <div ref="host" class="script-editor"></div>
</template>
