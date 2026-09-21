import { createApp } from 'vue'
import App from './App.vue'
import { camera } from './camera-instance'
import { sim, step } from './store'
import './style.css'

// 開発用: ブラウザのコンソールからワールドを触れるようにする
if (import.meta.env.DEV) {
  ;(window as unknown as { __wars: unknown }).__wars = { sim, step, camera }
}

createApp(App).mount('#app')
