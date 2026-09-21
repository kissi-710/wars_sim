<script setup lang="ts">
import { reactive, watch } from 'vue'
import { CONFIG } from '../core/config'
import type { PersonalityId } from '../core/types'
import { newGame, restartSameSeed, state, ui } from '../store'
import Icon from './Icon.vue'

type Choice = PersonalityId | 'random'

const form = reactive({
  seedText: state.settings.seedText,
  countryCount: state.settings.countryCount,
  personalities: Array.from({ length: CONFIG.maxCountries }, (_, i) => (state.settings.personalities[i] ?? 'random') as Choice),
})

watch(
  () => ui.showNewGame,
  (open) => {
    if (!open) return
    form.seedText = state.settings.seedText
    form.countryCount = state.settings.countryCount
    form.personalities = Array.from({ length: CONFIG.maxCountries }, (_, i) => (state.settings.personalities[i] ?? 'random') as Choice)
  },
)

function randomSeed(): void {
  form.seedText = String(Math.floor(Math.random() * 1_000_000))
}

function start(): void {
  const seedText = form.seedText.trim() || String(Math.floor(Math.random() * 1_000_000))
  newGame({
    seedText,
    countryCount: form.countryCount,
    personalities: form.personalities.slice(0, form.countryCount),
  })
  ui.showNewGame = false
}

function same(): void {
  restartSameSeed()
  ui.showNewGame = false
}

const OPTIONS: { id: Choice; label: string }[] = [
  { id: 'random', label: 'ランダム' },
  { id: 'warlike', label: CONFIG.personalities.warlike.label },
  { id: 'balanced', label: CONFIG.personalities.balanced.label },
  { id: 'peaceful', label: CONFIG.personalities.peaceful.label },
]
</script>

<template>
  <div v-if="ui.showNewGame" class="modal-back" @click.self="ui.showNewGame = false">
    <div class="modal" role="dialog" aria-label="新規ゲーム">
      <h2>新規ゲーム</h2>
      <label class="field">
        <span>シード</span>
        <span class="inline">
          <input v-model="form.seedText" class="input mono" type="text" placeholder="空欄ならランダム" />
          <button class="btn icon" title="ランダムなシード" @click="randomSeed"><Icon name="dice" :size="16" /></button>
        </span>
      </label>
      <p class="hint dim">同じシード・国数・性格なら、同じ展開になります。</p>
      <label class="field">
        <span>国の数</span>
        <select v-model.number="form.countryCount" class="input">
          <option v-for="n in CONFIG.maxCountries - CONFIG.minCountries + 1" :key="n" :value="n + CONFIG.minCountries - 1">
            {{ n + CONFIG.minCountries - 1 }}
          </option>
        </select>
      </label>
      <div class="field col">
        <span>国の性格</span>
        <div class="pers-grid">
          <template v-for="i in form.countryCount" :key="i">
            <span class="dot lg" :style="{ background: CONFIG.colors[i - 1] }" />
            <span>{{ CONFIG.names[i - 1] }}国</span>
            <select v-model="form.personalities[i - 1]" class="input">
              <option v-for="o in OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </template>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" @click="ui.showNewGame = false">キャンセル</button>
        <button class="btn" title="今のシード・設定で最初からやり直す" @click="same">同じ設定で最初から</button>
        <button class="btn primary" @click="start">開始</button>
      </div>
    </div>
  </div>
</template>
