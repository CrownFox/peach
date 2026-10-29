import { describe, expect, it } from 'vitest'
import { componentSurface, fileSurface, scriptDocs } from './runtime'
import { createAsset, createMenuComponent } from './assets'
import type { MenuAsset, ScriptAsset } from './types'

describe('shared asset classes', () => {
  it('lists inherited fields once, and hides a Z field box', () => {
    const button = componentSurface('button').shared.map((entry) => entry.name)
    expect(button).toContain('width')
    expect(button).toContain('enabled')
    expect(button).not.toContain('text')
    const field = [...componentSurface('zField').shared, ...componentSurface('zField').own].map((entry) => entry.name)
    expect(field).toContain('visible')
    expect(field).toContain('enabled')
    expect(field).toContain('new')
    expect(field).not.toContain('width')
    expect(fileSurface().map((entry) => entry.name)).toEqual(['type', 'name', 'path'])
  })

  it('documents the script that is open', () => {
    const menu = scriptDocs([], 'menu:main')
    expect(menu[0]?.title).toBe('Menu')
    const names = menu.flatMap((doc) => doc.blocks.flatMap((block) => block.entries.map((entry) => entry.name)))
    expect(names).toContain('onLoad')
    expect(names).toContain('onUpdate')
    expect(names).not.toContain('onShow')
    const scene = scriptDocs([], 'scene:town').flatMap((doc) => doc.blocks.flatMap((block) => block.entries.map((entry) => entry.name)))
    expect(scene).toContain('onShow')
    const picture = createMenuComponent('image', [])
    picture.id = 'picture'
    const canvas = createAsset('menu', 'Main', 'Main.menu.json', 'main') as MenuAsset
    canvas.components = [picture]
    const image = scriptDocs([canvas], 'component:main:picture').flatMap((doc) => doc.blocks.flatMap((block) => block.entries.map((entry) => entry.name)))
    expect(image).toContain('onInteract')
    expect(image).toContain('width')
    const imageDocs = scriptDocs([canvas], 'component:main:picture')
    expect(imageDocs[0]?.blocks.map((block) => block.label)).toEqual(['Events', 'Properties', 'Calls'])
    const properties = imageDocs[0]?.blocks.find((block) => block.label === 'Properties')?.entries.map((entry) => entry.name) ?? []
    expect(properties.indexOf('width')).toBeLessThan(properties.indexOf('image'))
    const unused = scriptDocs([], 'asset:shared')
    expect(unused[0]?.note).toContain('assigned')
    const shared = createAsset('script', 'Shared', 'Shared.script.json', 'shared') as ScriptAsset
    const button = createMenuComponent('button', [])
    button.scriptId = 'shared'
    canvas.components = [button]
    const hosts = scriptDocs([canvas, shared], 'asset:shared')
    expect(hosts.map((doc) => doc.title)).toContain('Button')
  })
})
