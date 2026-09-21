<script setup lang="ts">
import { ui } from '../store'
</script>

<template>
  <div v-if="ui.showSettings" class="modal-back" @click.self="ui.showSettings = false">
    <div class="modal" role="dialog" aria-label="設定">
      <h2>設定</h2>
      <label class="check"><input v-model="ui.inertia" type="checkbox" /> ドラッグの慣性(離した後に少し滑る)</label>
      <label class="check"><input v-model="ui.interpolate" type="checkbox" /> ユニットの移動を滑らかに補間(ゆっくり再生のときのみ)</label>
      <label class="check"><input v-model="ui.toasts" type="checkbox" /> 重大イベントのトースト通知</label>
      <label class="check"><input v-model="ui.autoCamera" type="checkbox" /> オートカメラ(戦闘・占領・滅亡などの見どころへ自動で移動)</label>
      <label class="check"><input v-model="ui.minimap" type="checkbox" /> ミニマップを表示</label>
      <p class="hint dim">設定はこのブラウザに保存されます。</p>
      <div class="modal-actions">
        <button class="btn primary" @click="ui.showSettings = false">閉じる</button>
      </div>
    </div>
  </div>
</template>
