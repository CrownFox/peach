import type { ComponentOverride } from './overrides'

export type SaveKind = 'saves' | 'customSaves'

export type SavedValue =
  | null
  | boolean
  | number
  | string
  | SavedValue[]
  | { [key: string]: SavedValue }
  | { $: 'collection'; path: string; changes: string }
  | { $: 'book'; path: string }
  | { $: 'page'; book: string; path: string }

export type SavedOverride = Omit<ComponentOverride, 'pageBook'> & { pageBookPath?: string }

export type SavedVisit = {
  menu: string
  overrides: Record<string, SavedOverride>
}

export type AutoSlot = {
  image: string | null
  time: string
  visits: SavedVisit[]
  state: SavedValue
}

export type CustomSlot = {
  data: SavedValue
  meta: SavedValue
}

export type SaveDocument = {
  kind: SaveKind
  slots: Record<string, AutoSlot | CustomSlot>
}

export type SavePort = {
  read(kind: SaveKind): string | null
  write(kind: SaveKind, text: string): void
  pickImport(kind: SaveKind, accept: (text: string) => void): void
  pickExport(kind: SaveKind, text: string): void
}

export function slotNumber(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error('A save slot starts at 1.')
  return value
}

export function emptyDocument(kind: SaveKind): SaveDocument {
  return { kind, slots: {} }
}

export function parseDocument(text: string, kind: SaveKind): SaveDocument {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('That save file could not be read.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('That save file could not be read.')
  const record = value as { kind?: unknown; slots?: unknown }
  if (record.kind !== 'saves' && record.kind !== 'customSaves') throw new Error('That save file could not be read.')
  if (record.kind !== kind) throw new Error('That file is for the other kind of save.')
  if (!record.slots || typeof record.slots !== 'object' || Array.isArray(record.slots)) throw new Error('That save file could not be read.')
  return { kind, slots: record.slots as SaveDocument['slots'] }
}

export function documentText(document: SaveDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`
}

export class SaveLibrary {
  private readonly documents: Record<SaveKind, SaveDocument>

  constructor(private readonly port: SavePort | null = null) {
    this.documents = {
      saves: this.stored('saves'),
      customSaves: this.stored('customSaves')
    }
  }

  putAuto(index: number, slot: AutoSlot): void {
    this.documents.saves.slots[String(index)] = slot
    this.persist('saves')
  }

  auto(index: number): AutoSlot | null {
    const slot = this.documents.saves.slots[String(index)]
    if (!slot || !('visits' in slot)) return null
    return slot
  }

  putCustom(index: number, slot: CustomSlot): void {
    this.documents.customSaves.slots[String(index)] = slot
    this.persist('customSaves')
  }

  custom(index: number): CustomSlot | null {
    const slot = this.documents.customSaves.slots[String(index)]
    if (!slot || !('data' in slot)) return null
    return slot
  }

  text(kind: SaveKind): string {
    return documentText(this.documents[kind])
  }

  replace(kind: SaveKind, text: string): void {
    this.documents[kind] = parseDocument(text, kind)
    this.persist(kind)
  }

  private stored(kind: SaveKind): SaveDocument {
    const text = this.port?.read(kind)
    if (!text) return emptyDocument(kind)
    try {
      return parseDocument(text, kind)
    } catch {
      return emptyDocument(kind)
    }
  }

  private persist(kind: SaveKind): void {
    this.port?.write(kind, this.text(kind))
  }
}

export function saveFileName(kind: SaveKind): string {
  return kind === 'saves' ? 'saves.json' : 'custom-saves.json'
}

export function storageSavePort(key: string): SavePort {
  const storage = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null
    }
  }
  return {
    read: (kind) => storage()?.getItem(`${key}:${kind}`) ?? null,
    write: (kind, text) => storage()?.setItem(`${key}:${kind}`, text),
    pickImport: (_kind, accept) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json,.json'
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        if (!file) return
        void file.text().then(accept)
      })
      input.click()
    },
    pickExport: (kind, text) => {
      const name = saveFileName(kind)
      const picker = (window as Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{ createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker
      if (!picker) {
        downloadText(name, text)
        return
      }
      void picker({ suggestedName: name })
        .then(async (handle) => {
          const writable = await handle.createWritable()
          await writable.write(text)
          await writable.close()
        })
        .catch(() => {})
    }
  }
}

function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function memorySavePort(): SavePort & { files: Record<SaveKind, string | null>; exported: string[] } {
  const files: Record<SaveKind, string | null> = { saves: null, customSaves: null }
  const exported: string[] = []
  return {
    files,
    exported,
    read: (kind) => files[kind],
    write: (kind, text) => {
      files[kind] = text
    },
    pickImport: (kind, accept) => {
      const text = files[kind]
      if (text) accept(text)
    },
    pickExport: (_kind, text) => {
      exported.push(text)
    }
  }
}
