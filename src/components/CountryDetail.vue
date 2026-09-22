<script setup lang="ts">
import { computed } from 'vue'
import { CONFIG } from '../core/config'
import { nextLevelProgress } from '../core/systems/civilization'
import { buildingCap } from '../core/systems/construction'
import { countBuildings, levelOf, populationCap } from '../core/world'
import { focusCell, panelVersion, sim, ui } from '../store'
import { KIND_LABEL, fmt, levelName, personalityLabel } from '../ui/format'
import LineChart from './charts/LineChart.vue'

const d = computed(() => {
  void panelVersion.value
  const w = sim.world
  const c = w.countries[ui.selectedCountry]
  if (!c) return null
  const p = CONFIG.personalities[c.personality]
  const lvl = levelOf(c)
  const total = c.civilians + c.soldiers
  const counts = countBuildings(w, c.id)
  const upkeep = c.soldiers * CONFIG.military.upkeepFood
  const samples = w.samples[c.id] ?? []
  const xs = samples.map((s) => s.turn)
  const villages = [...w.buildings.values()].filter((b) => b.owner === c.id && b.kind === 'village')
  return {
    c,
    p,
    lvl,
    next: nextLevelProgress(c),
    ratio: total > 0 ? c.soldiers / total : 0,
    target: c.mobilized ? p.mobRatio : p.ratio,
    counts,
    upkeep,
    villages,
    popCap: populationCap(c),
    enemy: c.warTarget >= 0 ? (w.countries[c.warTarget] ?? null) : null,
    xs,
    landS: [{ name: '領土', color: c.color, data: samples.map((s) => s.land) }],
    popS: [
      { name: '民間人', color: '#8fd3ff', data: samples.map((s) => s.civilians) },
      { name: '軍人', color: '#ff8a6b', data: samples.map((s) => s.soldiers) },
    ],
    resS: [
      { name: '食料', color: '#a6dd6f', data: samples.map((s) => s.food) },
      { name: '鉱物', color: '#c4ccd6', data: samples.map((s) => s.ore) },
      { name: '装備', color: '#ffb35c', data: samples.map((s) => s.equipment) },
    ],
  }
})

const KINDS = ['house', 'farm', 'mine', 'workshop'] as const
const POSTURE_LABEL = { attack: '侵攻', defend: '防衛', peace: '平時(開拓・待機)' } as const

function pct(now: number, need: number): number {
  return need <= 0 ? 100 : Math.max(0, Math.min(100, (now / need) * 100))
}

function signed(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2)
}

function go(x: number, y: number): void {
  focusCell(x, y, { select: false })
}
</script>

<template>
  <div v-if="d" class="detail">
    <div class="section-title">
      <i class="dot lg" :style="{ background: d.c.color }" />{{ d.c.name }} の詳細
    </div>

    <div class="section">
      <div class="kv"><span>性格</span><b>{{ personalityLabel(d.c.personality) }}</b></div>
      <div class="kv"><span>攻撃性</span><b>{{ d.p.aggression }}</b></div>
      <div class="kv">
        <span>目標軍人比率</span>
        <b>平時 {{ Math.round(d.p.ratio * 100) }}% / 総動員時 {{ Math.round(d.p.mobRatio * 100) }}%</b>
      </div>
      <div class="kv"><span>装備の備蓄上限</span><b>{{ d.p.stockCap }}</b></div>
      <div class="kv">
        <span>{{ d.villages.length > 1 ? '村(拠点)' : '村(拠点)' }}</span>
        <b v-if="d.villages.length === 0" class="dim">なし</b>
        <span v-else class="links">
          <button v-for="v in d.villages" :key="v.id" class="link" @click="go(v.x, v.y)">({{ v.x }},{{ v.y }})</button>
        </span>
      </div>
      <div v-if="d.c.mobilized" class="note alert">総動員中(自国領に敵軍人 / 建物を占領された)</div>
    </div>

    <div class="section">
      <div class="section-title">文明レベル: {{ levelName(d.c.level) }}(Lv{{ d.c.level }})</div>
      <div class="kv"><span>生産効率</span><b>×{{ d.lvl.efficiency.toFixed(2) }}</b></div>
      <div class="kv"><span>新規装備の攻撃力</span><b>{{ d.lvl.equipAtk }}</b></div>
      <template v-if="d.next">
        <div class="next-title">次: {{ d.next.name }}(領土・食料・鉱物がすべて必要)</div>
        <div class="bar-row">
          <span>領土</span>
          <div class="bar"><i :style="{ width: pct(d.next.land.now, d.next.land.need) + '%' }" /></div>
          <small class="mono">{{ fmt(d.next.land.now) }}/{{ d.next.land.need }}</small>
        </div>
        <div class="bar-row">
          <span>食料</span>
          <div class="bar"><i :style="{ width: pct(d.next.food.now, d.next.food.need) + '%' }" /></div>
          <small class="mono">{{ fmt(d.next.food.now) }}/{{ d.next.food.need }}</small>
        </div>
        <div class="bar-row">
          <span>鉱物</span>
          <div class="bar"><i :style="{ width: pct(d.next.ore.now, d.next.ore.need) + '%' }" /></div>
          <small class="mono">{{ fmt(d.next.ore.now) }}/{{ d.next.ore.need }}</small>
        </div>
      </template>
      <div v-else class="dim">最高レベルに到達</div>
    </div>

    <div class="section">
      <div class="section-title">人口</div>
      <div class="kv"><span>民間人</span><b>{{ fmt(d.c.civilians) }}</b></div>
      <div class="kv"><span>軍人</span><b>{{ fmt(d.c.soldiers) }}</b></div>
      <div class="kv">
        <span>人口 / 上限(領土 × {{ CONFIG.population.density }})</span>
        <b :class="{ warn: d.c.civilians + d.c.soldiers >= d.popCap }">{{ fmt(d.c.civilians + d.c.soldiers) }} / {{ fmt(d.popCap) }}</b>
      </div>
      <div class="ratio">
        <div class="ratio-bar">
          <i class="fill" :style="{ width: d.ratio * 100 + '%' }" />
          <i class="target" :style="{ left: d.target * 100 + '%' }" title="目標軍人比率" />
        </div>
        <small class="dim">軍人比率 {{ (d.ratio * 100).toFixed(1) }}% / 目標 {{ Math.round(d.target * 100) }}%</small>
      </div>
    </div>

    <div class="section">
      <div class="section-title">戦略</div>
      <div class="kv">
        <span>現在の構え</span>
        <b :class="d.c.posture === 'attack' ? 'neg' : ''">{{ POSTURE_LABEL[d.c.posture] }}</b>
      </div>
      <div class="kv">
        <span>攻撃目標</span>
        <b v-if="d.enemy"><i class="dot" :style="{ background: d.enemy.color }" />{{ d.enemy.name }}<small v-if="d.c.snipe" class="neg"> (村を直接狙う)</small></b>
        <b v-else class="dim">なし</b>
      </div>
    </div>

    <div class="section">
      <div class="section-title">資源(在庫と毎ターン収支)</div>
      <div class="kv">
        <span>食料</span>
        <b>
          {{ fmt(d.c.stock.food, 1) }}
          <small :class="d.c.flowFood < 0 ? 'neg' : 'pos'">{{ signed(d.c.flowFood) }}/T</small>
        </b>
      </div>
      <div class="kv"><span class="dim">└ うち軍人の維持費</span><small class="neg">-{{ d.upkeep.toFixed(2) }}/T</small></div>
      <div class="kv">
        <span>鉱物</span>
        <b>
          {{ fmt(d.c.stock.ore, 1) }}
          <small :class="d.c.flowOre < 0 ? 'neg' : 'pos'">{{ signed(d.c.flowOre) }}/T</small>
        </b>
      </div>
      <div class="kv"><span>装備</span><b>{{ d.c.stock.equipment }} / {{ d.p.stockCap }}</b></div>
      <div v-if="d.c.flowFood < 0 && d.c.soldiers > 0" class="note alert">食料収支が赤字(通常時は軍人化を停止)</div>
    </div>

    <div class="section">
      <div class="section-title">建物(現在数 / 個数上限)</div>
      <div class="note dim">上限は最大領土 {{ fmt(d.c.peakLand) }} マスに比例(領土が減っても下がりません)</div>
      <div class="kv"><span>{{ levelName(d.c.level) }}(村)</span><b>{{ d.counts.village }}</b></div>
      <div v-for="k in KINDS" :key="k" class="kv">
        <span>{{ KIND_LABEL[k] }}</span>
        <b :class="{ warn: d.counts[k] >= buildingCap(d.c, k) }">{{ d.counts[k] }} / {{ buildingCap(d.c, k) }}</b>
      </div>
      <div v-if="d.c.buildingCount === 0" class="note alert">
        建物を 1 つも持っていません({{ d.c.noBuildingTurns }} ターン経過 / {{ CONFIG.collapse.graceTurns }} ターンで孤立崩壊が始まり、全ユニットが弱っていきます)
      </div>
    </div>

    <div class="section">
      <div class="section-title">戦績</div>
      <div class="kv"><span>撃破数</span><b>{{ d.c.counters.kills }}</b></div>
      <div class="kv"><span>戦死(民間人 / 軍人)</span><b>{{ d.c.counters.civilianDeaths }} / {{ d.c.counters.soldierDeaths }}</b></div>
      <div class="kv"><span>占領した建物</span><b>{{ d.c.counters.occupied }}</b></div>
      <div class="kv"><span>奪われた建物</span><b>{{ d.c.counters.lost }}</b></div>
      <div class="kv"><span>飢餓による損失</span><b>{{ d.c.counters.starved }}</b></div>
    </div>

    <div class="section">
      <div class="section-title">推移</div>
      <LineChart :xs="d.xs" :series="d.landS" title="領土(マス)" />
      <LineChart :xs="d.xs" :series="d.popS" title="人口" />
      <LineChart :xs="d.xs" :series="d.resS" title="資源" />
    </div>
  </div>
</template>
