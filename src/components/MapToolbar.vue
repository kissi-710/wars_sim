<script setup lang="ts">
import { ref } from 'vue'
import { cameraCommands, ui } from '../store'
import Icon from './Icon.vue'
import type { HeatMode, Layers } from '../render/mapRenderer'

const menuOpen = ref(false)

const LAYER_ITEMS: { key: keyof Layers; label: string }[] = [
  { key: 'territory', label: '領土' },
  { key: 'borders', label: '国境線' },
  { key: 'grid', label: 'グリッド(拡大時)' },
  { key: 'buildings', label: '建物' },
  { key: 'units', label: 'ユニット' },
  { key: 'battles', label: '戦闘マーカー' },
  { key: 'labels', label: '国名ラベル(縮小時)' },
  { key: 'occupyRange', label: '占領判定範囲(選択した建物)' },
  { key: 'workRange', label: '作業範囲(選択した建物)' },
]

const HEATS: { id: HeatMode; label: string }[] = [
  { id: 'none', label: 'なし' },
  { id: 'civilian', label: '民間人密度' },
  { id: 'soldier', label: '軍人密度' },
]

function toggle(key: keyof Layers): void {
  ;(ui.layers[key] as boolean) = !ui.layers[key]
}
</script>

<template>
  <div class="map-toolbar">
    <div class="btn-group">
      <button class="btn icon" title="ズームイン(+)" @click="cameraCommands.push('zoomIn')"><Icon name="zoomIn" :size="16" /></button>
      <button class="btn icon" title="ズームアウト(-)" @click="cameraCommands.push('zoomOut')"><Icon name="zoomOut" :size="16" /></button>
    </div>
    <button class="btn" title="全体表示(0 / Home)" @click="cameraCommands.push('fit')"><Icon name="fit" :size="15" />全体</button>
    <span class="sep" />
    <div class="menu-wrap">
      <button class="btn" :class="{ active: menuOpen }" @click="menuOpen = !menuOpen">
        <Icon name="layers" :size="15" />レイヤー<Icon name="chevronDown" :size="13" />
      </button>
      <div v-if="menuOpen" class="menu" @mouseleave="menuOpen = false">
        <label v-for="it in LAYER_ITEMS" :key="it.key" class="menu-item">
          <input type="checkbox" :checked="ui.layers[it.key] as boolean" @change="toggle(it.key)" />
          {{ it.label }}
        </label>
        <div class="menu-sep">ヒートマップ</div>
        <label v-for="h in HEATS" :key="h.id" class="menu-item">
          <input type="radio" name="heat" :checked="ui.layers.heat === h.id" @change="ui.layers.heat = h.id" />
          {{ h.label }}
        </label>
        <div class="menu-sep"></div>
        <label class="menu-item">
          <input type="checkbox" v-model="ui.minimap" />
          ミニマップ
        </label>
      </div>
    </div>
    <button
      v-if="ui.followUnitId >= 0"
      class="btn warn"
      title="追従を解除"
      @click="ui.followUnitId = -1"
    >
      <Icon name="crosshair" :size="14" />追従中<Icon name="close" :size="12" />
    </button>
    <label class="auto-cam" title="戦闘・占領・滅亡などの見どころへ自動でカメラを移動する">
      <input type="checkbox" v-model="ui.autoCamera" /> オートカメラ
    </label>
  </div>
</template>
