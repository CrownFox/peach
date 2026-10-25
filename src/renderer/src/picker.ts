import { ref } from 'vue'
import type { AssetType } from '@shared/types'

type PickerType = AssetType

type PickerRequest = {
  type: PickerType
  selectedId: string | null
  blockedIds: string[]
  resolve: (id: string | null) => void
}

export const pickerRequest = ref<PickerRequest | null>(null)

export function pickAsset(type: PickerType, selectedId: string | null, blockedIds: string[] = []): Promise<string | null> {
  return new Promise((resolve) => {
    pickerRequest.value = { type, selectedId, blockedIds, resolve }
  })
}

export function closePicker(id: string | null): void {
  pickerRequest.value?.resolve(id)
  pickerRequest.value = null
}
