import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    selectedTreePath: '',
    selectedComponentId: null as string | null,
    tilemapEdit: null as string | null,
    zFieldEdit: null as string | null,
    renamingPath: null as string | null,
    focusNameAssetId: null as string | null,
    banner: null as string | null,
    bannerTone: 'info' as 'info' | 'error'
  }),
  actions: {
    info(message: string) {
      this.banner = message
      this.bannerTone = 'info'
    },
    fail(message: string) {
      this.banner = message
      this.bannerTone = 'error'
    },
    clearBanner() {
      this.banner = null
    }
  }
})
