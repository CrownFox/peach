/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

import type { PeachApi } from '@shared/api'

declare global {
  interface Window {
    peach: PeachApi
  }
}

export {}
