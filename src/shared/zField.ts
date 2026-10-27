import type { MenuComponent, ZFieldComponent } from './types'

export function readZ(component: MenuComponent, override: { z?: number } | undefined): number {
  const value = typeof override?.z === 'number' ? override.z : component.z
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function orderZChildren(
  children: readonly MenuComponent[],
  parent: string,
  overrides: Record<string, { z?: number } | undefined> | undefined
): MenuComponent[] {
  return children
    .map((child, index) => ({ child, index }))
    .filter((item) => item.child.type !== 'zField')
    .sort((left, right) => {
      const leftKey = parent ? `${parent}/${left.child.id}` : left.child.id
      const rightKey = parent ? `${parent}/${right.child.id}` : right.child.id
      const delta = readZ(left.child, overrides?.[leftKey]) - readZ(right.child, overrides?.[rightKey])
      return delta === 0 ? left.index - right.index : delta
    })
    .map((item) => item.child)
}

export function frontOrder(components: readonly MenuComponent[]): MenuComponent[] {
  const result: MenuComponent[] = []
  for (let index = components.length - 1; index >= 0; index -= 1) {
    const component = components[index]
    if (!component) continue
    if (component.type !== 'zField') {
      result.push(component)
      continue
    }
    const children = component.children
      .map((child, childIndex) => ({ child, childIndex }))
      .filter((item) => item.child.type !== 'zField')
      .sort((left, right) => {
        const delta = readZ(right.child, undefined) - readZ(left.child, undefined)
        return delta === 0 ? right.childIndex - left.childIndex : delta
      })
    for (const item of children) result.push(item.child)
  }
  return result
}

export function findInList(
  components: readonly MenuComponent[],
  id: string
): { component: MenuComponent; field: ZFieldComponent | null } | null {
  for (const component of components) {
    if (component.id === id) return { component, field: null }
    if (component.type !== 'zField') continue
    const child = component.children.find((item) => item.id === id && item.type !== 'zField')
    if (child) return { component: child, field: component }
  }
  return null
}

export function findComponent(components: readonly MenuComponent[], id: string): MenuComponent | null {
  return findInList(components, id)?.component ?? null
}

export function enclosingField(components: readonly MenuComponent[], id: string): ZFieldComponent | null {
  return findInList(components, id)?.field ?? null
}

export function canvasComponents(components: readonly MenuComponent[]): MenuComponent[] {
  return components.flatMap((component) =>
    component.type === 'zField' ? [component, ...component.children.filter((child) => child.type !== 'zField')] : [component]
  )
}

export function directPieces(components: readonly MenuComponent[]): MenuComponent[] {
  return canvasComponents(components)
}

export function findByHandle(components: readonly MenuComponent[], handle: string): MenuComponent | null {
  if (!handle) return null
  return canvasComponents(components).find((item) => item.handle === handle) ?? null
}

export function handleTaken(components: readonly MenuComponent[], handle: string, exceptId: string): boolean {
  if (!handle) return false
  return canvasComponents(components).some((item) => item.handle === handle && item.id !== exceptId)
}

export type LayerPlace = 'above' | 'below' | 'inside'

export function placeInCanvas(components: MenuComponent[], componentId: string, targetId: string, place: LayerPlace): boolean {
  if (!componentId || componentId === targetId) return false
  const source = slotOf(components, componentId)
  const target = slotOf(components, targetId)
  if (!source || !target) return false
  const moving = source.list[source.index]
  if (!moving) return false
  if (moving.type === 'zField' && (place === 'inside' || target.field)) return false
  if (place === 'inside') {
    const field = target.list[target.index]
    if (!field || field.type !== 'zField' || field.id === moving.id) return false
    if (source.list === field.children && source.index === field.children.length - 1) return false
    const [item] = source.list.splice(source.index, 1)
    if (!item || item.type === 'zField') return false
    if (typeof item.z !== 'number') item.z = 0
    field.children.push(item)
    return true
  }
  let insertAt = place === 'above' ? target.index + 1 : target.index
  const sameList = source.list === target.list
  if (sameList && source.index < insertAt) insertAt -= 1
  if (sameList && source.index === insertAt) return false
  const [item] = source.list.splice(source.index, 1)
  if (!item) return false
  if (target.field) {
    if (typeof item.z !== 'number') item.z = 0
  } else {
    delete item.z
  }
  target.list.splice(insertAt, 0, item)
  return true
}

function slotOf(components: MenuComponent[], id: string): { list: MenuComponent[]; index: number; field: ZFieldComponent | null } | null {
  const index = components.findIndex((component) => component.id === id)
  if (index >= 0) return { list: components, index, field: null }
  for (const component of components) {
    if (component.type !== 'zField') continue
    const childIndex = component.children.findIndex((child) => child.id === id && child.type !== 'zField')
    if (childIndex >= 0) return { list: component.children, index: childIndex, field: component }
  }
  return null
}
