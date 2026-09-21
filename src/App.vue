<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import ControlBar from './components/ControlBar.vue'
import HelpDialog from './components/HelpDialog.vue'
import LogPanel from './components/LogPanel.vue'
import MapArea from './components/MapArea.vue'
import NewGameDialog from './components/NewGameDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import SideBar from './components/SideBar.vue'
import ToastHost from './components/ToastHost.vue'
import { unitsAt } from './core/world'
import {
  focusCell,
  pushToast,
  setSpeed,
  sim,
  startLoop,
  state,
  step,
  togglePlay,
  ui,
} from './store'

// --- 分割バー(サイドバー幅・ログ高さ) -----------------------------------------
function dragSplit(e: PointerEvent, axis: 'x' | 'y'): void {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  const start = axis === 'x' ? e.clientX : e.clientY
  const base = axis === 'x' ? ui.sidebarWidth : ui.logHeight
  const move = (ev: PointerEvent): void => {
    const d = (axis === 'x' ? ev.clientX : ev.clientY) - start
    if (axis === 'x') ui.sidebarWidth = Math.max(260, Math.min(680, base - d))
    else ui.logHeight = Math.max(90, Math.min(560, base - d))
  }
  const up = (): void => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

// --- ショートカット -------------------------------------------------------------
function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

function jumpToCountry(id: number): void {
  const w = sim.world
  if (id >= w.countries.length) return
  for (const b of w.buildings.values()) {
    if (b.owner === id && b.kind === 'village') {
      focusCell(b.x, b.y, { select: false })
      ui.selectedCountry = id
      ui.sidebarTab = 'country'
      return
    }
  }
}

function toggleFollow(): void {
  if (ui.followUnitId >= 0) {
    ui.followUnitId = -1
    return
  }
  if (ui.selectedCell >= 0) {
    const us = unitsAt(sim.world, ui.selectedCell)
    if (us.length > 0) {
      ui.followUnitId = us[0]!.id
      return
    }
  }
  pushToast('追従するには、ユニットのいるマスを選択してください', '#ffd43b')
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (ui.showNewGame || ui.showHelp || ui.showSettings) {
      ui.showNewGame = ui.showHelp = ui.showSettings = false
    } else if (ui.followUnitId >= 0) ui.followUnitId = -1
    else ui.selectedCell = -1
    return
  }
  if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return
  if (ui.showNewGame || ui.showHelp || ui.showSettings) return
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  switch (k) {
    case ' ':
      e.preventDefault()
      togglePlay()
      break
    case '.':
      if (!state.playing) step()
      break
    case '[':
      setSpeed(state.speedIndex - 1)
      break
    case ']':
      setSpeed(state.speedIndex + 1)
      break
    case 'l':
      ui.logOpen = !ui.logOpen
      break
    case 'g':
      ui.layers.grid = !ui.layers.grid
      break
    case 'm':
      ui.minimap = !ui.minimap
      break
    case 'f':
      toggleFollow()
      break
    case 'Tab':
      e.preventDefault()
      ui.sidebarOpen = true
      ui.sidebarTab = ui.sidebarTab === 'country' ? 'cell' : 'country'
      break
    case '?':
      ui.showHelp = true
      break
    default:
      if (/^[1-8]$/.test(k)) jumpToCountry(Number(k) - 1)
  }
}

onMounted(() => {
  startLoop()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app">
    <ControlBar />
    <div class="main">
      <div class="left">
        <MapArea />
        <template v-if="ui.logOpen">
          <div class="split-h" title="ドラッグで高さを変更" @pointerdown="dragSplit($event, 'y')" />
          <div class="log-wrap" :style="{ height: ui.logHeight + 'px' }"><LogPanel /></div>
        </template>
        <button v-else class="dock-btn bottom" @click="ui.logOpen = true">▲ ログを開く(L)</button>
      </div>
      <template v-if="ui.sidebarOpen">
        <div class="split-v" title="ドラッグで幅を変更" @pointerdown="dragSplit($event, 'x')" />
        <div class="side-wrap" :style="{ width: ui.sidebarWidth + 'px' }"><SideBar /></div>
      </template>
      <button v-else class="dock-btn side" @click="ui.sidebarOpen = true">◀</button>
    </div>
    <ToastHost />
    <NewGameDialog />
    <HelpDialog />
    <SettingsDialog />
  </div>
</template>
