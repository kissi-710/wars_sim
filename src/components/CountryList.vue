<script setup lang="ts">
import { computed } from 'vue'
import { CONFIG } from '../core/config'
import { addPing, focusCell, panelVersion, sim, ui, worldId } from '../store'
import { fmt, levelName, personalityLabel } from '../ui/format'
import StackedAreaChart from './charts/StackedAreaChart.vue'
import CountryDetail from './CountryDetail.vue'

const rows = computed(() => {
  void panelVersion.value
  void worldId.value
  const w = sim.world
  return w.countries.map((c) => {
    const total = c.civilians + c.soldiers
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      alive: c.alive,
      personality: c.personality,
      level: c.level,
      mobilized: c.mobilized,
      starving: c.starving,
      land: c.land,
      civilians: c.civilians,
      soldiers: c.soldiers,
      ratio: total > 0 ? c.soldiers / total : 0,
      target: CONFIG.personalities[c.personality].ratio,
      food: c.stock.food,
      ore: c.stock.ore,
      equipment: c.stock.equipment,
    }
  })
})

const share = computed(() => {
  void panelVersion.value
  const total = sim.world.width * sim.world.height
  const used = rows.value.reduce((a, r) => a + r.land, 0)
  return { total, segs: rows.value.map((r) => ({ id: r.id, color: r.color, pct: (r.land / total) * 100, name: r.name })), neutral: ((total - used) / total) * 100 }
})

const history = computed(() => {
  void panelVersion.value
  const w = sim.world
  const xs = (w.samples[0] ?? []).map((s) => s.turn)
  const series = w.countries.map((c) => ({
    name: c.name,
    color: c.color,
    data: (w.samples[c.id] ?? []).map((s) => s.land),
  }))
  return { xs, series, max: w.width * w.height }
})

function select(id: number): void {
  ui.selectedCountry = ui.selectedCountry === id ? -1 : id
  ui.highlightCountry = ui.selectedCountry
}

function enter(id: number): void {
  ui.highlightCountry = id
}
function leave(): void {
  ui.highlightCountry = ui.selectedCountry
}

function jumpToVillage(id: number): void {
  for (const b of sim.world.buildings.values()) {
    if (b.owner === id && b.kind === 'village') {
      focusCell(b.x, b.y, { select: false, ping: false })
      addPing(b.x, b.y, sim.world.countries[id]!.color)
      return
    }
  }
}
</script>

<template>
  <div class="country-panel">
    <div class="section">
      <div class="section-title">領土シェアの推移</div>
      <StackedAreaChart :xs="history.xs" :series="history.series" :max="history.max" />
      <div class="sharebar" title="現在の領土シェア">
        <span
          v-for="s in share.segs"
          :key="s.id"
          class="sharebar-seg"
          :style="{ width: s.pct + '%', background: s.color }"
          :title="`${s.name}: ${s.pct.toFixed(1)}%`"
        />
        <span class="sharebar-seg neutral" :style="{ width: share.neutral + '%' }" title="無所有" />
      </div>
    </div>

    <div class="cards">
      <div
        v-for="r in rows"
        :key="r.id"
        class="card"
        :class="{ selected: ui.selectedCountry === r.id, dead: !r.alive }"
        :style="{ '--c': r.color }"
        @mouseenter="enter(r.id)"
        @mouseleave="leave"
        @click="select(r.id)"
      >
        <div class="card-head">
          <i class="dot lg" :style="{ background: r.color }" />
          <strong>{{ r.name }}</strong>
          <span class="tag" :class="'p-' + r.personality">{{ personalityLabel(r.personality) }}</span>
          <span class="tag lv">{{ levelName(r.level) }}</span>
          <span v-if="r.mobilized" class="tag alert">総動員</span>
          <span v-if="r.starving" class="tag alert">飢餓</span>
          <span v-if="!r.alive" class="tag dead">滅亡</span>
          <span class="spacer" />
          <button class="btn tiny" title="この国の村へ移動" @click.stop="jumpToVillage(r.id)">村へ</button>
        </div>
        <div class="card-grid">
          <div class="stat"><small>領土</small><b>{{ fmt(r.land) }}</b></div>
          <div class="stat"><small>民間人</small><b>{{ fmt(r.civilians) }}</b></div>
          <div class="stat">
            <small>軍人</small>
            <b>{{ fmt(r.soldiers) }} <em>{{ Math.round(r.ratio * 100) }}% / 目標{{ Math.round(r.target * 100) }}%</em></b>
          </div>
          <div class="stat"><small>食料</small><b>{{ fmt(r.food) }}</b></div>
          <div class="stat"><small>鉱物</small><b>{{ fmt(r.ore) }}</b></div>
          <div class="stat"><small>装備</small><b>{{ fmt(r.equipment) }}</b></div>
        </div>
        <div class="popbar" :title="`民間人 ${r.civilians} / 軍人 ${r.soldiers}`">
          <i :style="{ width: (1 - r.ratio) * 100 + '%' }" />
          <i :style="{ width: r.ratio * 100 + '%' }" />
        </div>
      </div>
    </div>

    <CountryDetail v-if="ui.selectedCountry >= 0" :key="ui.selectedCountry" />
    <p v-else class="hint dim">国カードをクリックすると詳細(文明レベルの進捗・資源収支・建物・戦績・推移グラフ)が表示されます。</p>
  </div>
</template>
