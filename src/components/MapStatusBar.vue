<script setup lang="ts">
import { computed } from 'vue'
import { NO_BUILDING, NO_OWNER } from '../core/types'
import { camera } from '../camera-instance'
import { panelVersion, sim, ui } from '../store'
import { KIND_LABEL, levelName } from '../ui/format'

const info = computed(() => {
  void panelVersion.value
  const w = sim.world
  const i = ui.hoverCell
  if (i < 0) return null
  const x = i % w.width
  const y = (i / w.width) | 0
  const o = w.owner[i] as number
  const owner = o === NO_OWNER ? null : w.countries[o]!
  const bid = w.buildingAt[i] as number
  const b = bid === NO_BUILDING ? null : w.buildings.get(bid)
  const n = w.cellCount[i] as number
  let civ = 0
  let sol = 0
  for (let k = 0; k < n; k++) {
    const u = w.units.get(w.cellUnits[i * 4 + k] as number)
    if (u) (u.kind === 'soldier' ? sol++ : civ++)
  }
  return {
    x,
    y,
    owner,
    building: b ? (b.kind === 'village' ? levelName(w.countries[b.owner]!.level) : KIND_LABEL[b.kind]) : null,
    civ,
    sol,
  }
})

const zoomText = computed(() => {
  void panelVersion.value
  return `${camera.vp.scale.toFixed(1)} px/マス`
})
</script>

<template>
  <div class="statusbar">
    <template v-if="info">
      <span class="mono">({{ info.x }}, {{ info.y }})</span>
      <span v-if="info.owner" class="chip"><i class="dot" :style="{ background: info.owner.color }" />{{ info.owner.name }}領</span>
      <span v-else class="dim">無所有</span>
      <span v-if="info.building">建物: {{ info.building }}</span>
      <span v-if="info.civ + info.sol > 0">民間人×{{ info.civ }} 軍人×{{ info.sol }}</span>
    </template>
    <span v-else class="dim">マップにカーソルを合わせると情報が表示されます</span>
    <span class="spacer" />
    <span class="dim mono">{{ zoomText }}</span>
  </div>
</template>
