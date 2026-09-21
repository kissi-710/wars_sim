<script setup lang="ts">
import { ui } from '../store'

const KEYS: [string, string][] = [
  ['Space', '再生 / 一時停止'],
  ['.', '1 ターン進める(停止中)'],
  ['[  ]', '速度を下げる / 上げる'],
  ['+  -', 'ズームイン / アウト'],
  ['0 / Home', '全体表示'],
  ['矢印 / W A S D', 'マップ移動(Shift で高速)'],
  ['1〜8', '国 1〜8 の村へ移動'],
  ['F', '選択マスのユニットを追従 / 解除'],
  ['G', 'グリッド表示の切替'],
  ['M', 'ミニマップの切替'],
  ['L', 'ログの開閉'],
  ['Tab', 'サイドバーのタブ切替(国 / マス)'],
  ['Esc', '選択解除 / 追従解除 / ダイアログを閉じる'],
  ['?', 'このヘルプ'],
]
</script>

<template>
  <div v-if="ui.showHelp" class="modal-back" @click.self="ui.showHelp = false">
    <div class="modal" role="dialog" aria-label="ヘルプ">
      <h2>操作方法</h2>
      <h3>マップ</h3>
      <ul class="plain">
        <li><b>ホイール</b>: カーソル位置を中心にズーム(Shift+ホイールで横移動)</li>
        <li><b>ドラッグ</b>: 移動(離すと少し滑ります。設定で切替可) / <b>中ボタンドラッグ</b>も可</li>
        <li><b>ダブルクリック</b>: そのマスを中心に拡大(Shift で縮小)</li>
        <li><b>クリック</b>: マスを選択(建物なら占領判定範囲と作業範囲を表示)</li>
        <li><b>ミニマップ</b>: クリック / ドラッグでその位置へ移動</li>
        <li><b>タッチ</b>: 1 本指で移動、2 本指でピンチズーム</li>
      </ul>
      <h3>キーボード</h3>
      <table class="keys">
        <tbody>
          <tr v-for="[k, d] in KEYS" :key="k">
            <td><kbd>{{ k }}</kbd></td>
            <td>{{ d }}</td>
          </tr>
        </tbody>
      </table>
      <div class="modal-actions">
        <button class="btn primary" @click="ui.showHelp = false">閉じる</button>
      </div>
    </div>
  </div>
</template>
