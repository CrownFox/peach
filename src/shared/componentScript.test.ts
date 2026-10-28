import { describe, expect, it } from 'vitest'
import { componentScriptTemplate } from './componentScript'

describe('component script template', () => {
  it('starts a button with the click function and the fields a button accepts', () => {
    const source = componentScriptTemplate('button')
    expect(source).toContain('function onInteract()')
    expect(source).toContain('self.text')
    expect(source).toContain('self.enabled')
    expect(source).toContain('self.button')
    expect(source).toContain('self.defaultImage')
    expect(source).toContain('self.pressedImage')
    expect(source).toContain('self.disabledImage')
    expect(source).toContain('self:click()')
    expect(source).not.toContain('self.image ')
  })

  it('starts an input with onChange and leaves a label without a hook', () => {
    expect(componentScriptTemplate('text')).toContain('function onChange()')
    expect(componentScriptTemplate('text')).toContain('self.value')
    expect(componentScriptTemplate('label')).toContain('self.text')
    expect(componentScriptTemplate('label')).not.toContain('function onChange()')
    expect(componentScriptTemplate('meter')).toContain('self.value')
    expect(componentScriptTemplate('meter')).not.toContain('function onChange()')
  })

  it('starts an image with the click function and the image field', () => {
    const source = componentScriptTemplate('image')
    expect(source).toContain('function onInteract()')
    expect(source).toContain('self.image')
    expect(source).toContain('self:click()')
    expect(source).toContain('self.enabled')
    expect(source).not.toContain('self.text')
  })
})
