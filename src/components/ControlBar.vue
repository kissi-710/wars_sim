<script setup lang="ts">
import { computed } from 'vue'
import { SPEEDS, panelVersion, setSpeed, sim, state, step, togglePlay, ui } from '../store'

const turn = computed(() => {
  void panelVersion.value
  return sim.world.turn
})
const winner = computed(() => {
  void panelVersion.value
  const w = sim.world
  return w.winner === null ? null : w.countries[w.winner]
})
</script>

<template>
  <header class="controlbar">
    <button class="btn primary" :title="state.playing ? '一時停止(Space)' : '再生(Space)'" @click="togglePlay">
      {{ state.playing ? '⏸ 停止' : '▶ 再生' }}
    </button>
    <button class="btn" :disabled="state.playing" title="1ターン進める(.)" @click="step">⏭ 1ターン</button>

    <div class="btn-group" role="group" aria-label="速度">
      <button
        v-for="(sp, i) in SPEEDS"
        :key="sp.label"
        class="btn"
        :class="{ active: state.speedIndex === i }"
        :title="sp.tps ? `${sp.tps} ターン/秒` : '可能な限り速く'"
        @click="setSpeed(i)"
      >
        {{ sp.label }}
      </button>
    </div>

    <span class="turn mono">T:{{ turn }}</span>
    <span v-if="winner" class="winner"><i class="dot" :style="{ background: winner.color }" />{{ winner.name }}の勝利</span>

    <span class="spacer" />

    <span class="dim mono seed" title="シード(同じシードなら同じ展開になります)">seed {{ state.settings.seedText }}</span>
    <span class="dim mono perf">{{ state.fps }}fps / {{ state.tps }}tps</span>

    <button class="btn" title="新規ゲーム" @click="ui.showNewGame = true">⟲ 新規</button>
    <button class="btn icon" title="設定" @click="ui.showSettings = true">⚙</button>
    <button class="btn icon" title="ヘルプ(?)" @click="ui.showHelp = true">?</button>
  </header>
</template>
