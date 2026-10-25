import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { installSceneStyles } from '@shared/sceneCss'
import App from './App.vue'
import './styles.css'

installSceneStyles()
createApp(App).use(createPinia()).mount('#app')
