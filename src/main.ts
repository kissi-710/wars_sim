import { createApp } from 'vue'
import App from './App.vue'
import { sim, step } from './store'
import './style.css'

// 開発用: ブラウザのコンソールからワールドを触れるようにする
if (import.meta.env.DEV) {
  ;(window as unknown as { __wars: unknown }).__wars = { sim, step }
}

createApp(App).mount('#app')
