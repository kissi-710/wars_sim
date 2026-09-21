<script setup lang="ts">
import { computed } from 'vue'
import { SPEEDS, panelVersion, setSpeed, sim, state, step, togglePlay, ui } from '../store'
import Icon from './Icon.vue'

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
    <div class="brand" aria-label="wars_sim">
      <span class="logo"><i /><i /><i /><i /></span>
      <span class="brand-name">WARS<b>SIM</b></span>
    </div>

    <button class="btn primary play" :class="{ playing: state.playing }" :title="state.playing ? '一時停止(Space)' : '再生(Space)'" @click="togglePlay">
      <Icon :name="state.playing ? 'pause' : 'play'" :size="15" />
      {{ state.playing ? '停止' : '再生' }}
    </button>
    <button class="btn" :disabled="state.playing" title="1ターン進める(.)" @click="step">
      <Icon name="step" :size="14" />
      1ターン
    </button>

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

    <span class="turn-pill">
      <small>TURN</small>
      <b class="mono">{{ turn }}</b>
      <i v-if="state.playing" class="live" title="進行中" />
    </span>
    <span v-if="winner" class="winner"><i class="dot" :style="{ background: winner.color }" />{{ winner.name }}の勝利</span>

    <span class="spacer" />

    <span class="pill mono" title="シード(同じシードなら同じ展開になります)">seed {{ state.settings.seedText }}</span>
    <span class="pill mono" title="描画フレームレート / 1秒あたりのターン数">{{ state.fps }}fps · {{ state.tps }}tps</span>

    <button class="btn" title="新規ゲーム" @click="ui.showNewGame = true">
      <Icon name="restart" :size="15" />
      新規
    </button>
    <button class="btn icon" title="設定" @click="ui.showSettings = true"><Icon name="settings" :size="16" /></button>
    <button class="btn icon" title="ヘルプ(?)" @click="ui.showHelp = true"><Icon name="help" :size="16" /></button>
  </header>
</template>
