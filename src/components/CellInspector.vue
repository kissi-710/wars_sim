<script setup lang="ts">
import { computed } from 'vue'
import { CONFIG } from '../core/config'
import { peopleEfficiency } from '../core/systems/efficiency'
import { occupationInfo } from '../core/systems/occupation'
import { NO_BUILDING, NO_OWNER } from '../core/types'
import { levelOf, unitsAt } from '../core/world'
import { logFocusId, panelVersion, sim, ui, worldId } from '../store'
import { EVENT_TYPE_LABEL, KIND_LABEL, STATUS_LABEL, formatEvent, levelName } from '../ui/format'

const info = computed(() => {
  void panelVersion.value
  void worldId.value
  const w = sim.world
  const i = ui.selectedCell
  if (i < 0 || i >= w.width * w.height) return null
  const x = i % w.width
  const y = (i / w.width) | 0
  const o = w.owner[i] as number
  const owner = o === NO_OWNER ? null : w.countries[o]!
  const bid = w.buildingAt[i] as number
  const b = bid === NO_BUILDING ? null : (w.buildings.get(bid) ?? null)

  let building = null
  if (b) {
    const c = w.countries[b.owner]!
    const def = CONFIG.buildings[b.kind]
    const lvl = levelOf(c)
    const occ = occupationInfo(w, b)
    building = {
      b,
      def,
      c,
      label: b.kind === 'village' ? `${levelName(c.level)}(村)` : KIND_LABEL[b.kind],
      status: STATUS_LABEL[b.status],
      ok: b.status === 'ok',
      people: peopleEfficiency(b.workers),
      levelMul: lvl.efficiency,
      occ,
      occRows: occ.counts
        .map((n, id) => ({ id, n, c: w.countries[id]! }))
        .filter((r) => r.n > 0)
        .sort((p, q) => q.n - p.n),
      progress: def.cycle > 0 ? Math.min(1, b.progress / def.cycle) : null,
    }
  }

  const units = unitsAt(w, i).map((u) => ({
    u,
    country: w.countries[u.owner]!,
  }))
  const owners = new Set(units.map((x) => x.u.owner))
  const contested = owners.size >= 2
  const battle = contested
    ? [...owners].map((id) => {
        const us = units.filter((x) => x.u.owner === id)
        return {
          country: w.countries[id]!,
          count: us.length,
          hp: us.reduce((a, x) => a + x.u.hp, 0),
          home: o === id,
        }
      })
    : null

  const recent: typeof w.events = []
  for (let k = w.events.length - 1; k >= 0 && recent.length < 5; k--) {
    const ev = w.events[k]!
    if (ev.pos && ev.pos.x === x && ev.pos.y === y) recent.push(ev)
  }

  return { x, y, owner, building, units, battle, fight: w.fightCells.has(i), recent, world: w }
})

function jumpLog(id: number): void {
  ui.logOpen = true
  logFocusId.value = id
}

function follow(id: number): void {
  ui.followUnitId = id
}
</script>

<template>
  <div class="cell-panel">
    <p v-if="!info" class="hint dim">マップのマスをクリックすると、そのマスの詳細(建物・ユニット・占領状況)が表示されます。</p>
    <template v-else>
      <div class="section">
        <div class="section-title mono">マス ({{ info.x }}, {{ info.y }})</div>
        <div class="kv">
          <span>領有国</span>
          <b v-if="info.owner"><i class="dot" :style="{ background: info.owner.color }" />{{ info.owner.name }}</b>
          <b v-else class="dim">無所有</b>
        </div>
      </div>

      <div v-if="info.building" class="section">
        <div class="section-title">建物: {{ info.building.label }}</div>
        <div class="kv">
          <span>所有国</span>
          <b><i class="dot" :style="{ background: info.building.c.color }" />{{ info.building.c.name }}</b>
        </div>
        <div class="kv">
          <span>稼働状況</span>
          <b :class="info.building.ok ? 'pos' : 'neg'">{{ info.building.status }}</b>
        </div>
        <div class="kv">
          <span>周囲の自国民間人</span>
          <b>{{ info.building.b.workers }} / {{ CONFIG.efficiency.fullPeople }}
            <small v-if="info.building.def.minWorkers > 0" class="dim">(稼働に最低 {{ info.building.def.minWorkers }})</small>
          </b>
        </div>
        <div class="kv">
          <span>生産効率</span>
          <b>{{ (info.building.b.efficiency * 100).toFixed(0) }}%</b>
        </div>
        <div class="formula dim">
          人数効率 {{ (info.building.people * 100).toFixed(0) }}% × 文明補正 {{ (info.building.levelMul * 100).toFixed(0) }}%
        </div>
        <div v-if="info.building.progress !== null" class="bar-row">
          <span>進捗</span>
          <div class="bar"><i :style="{ width: info.building.progress * 100 + '%' }" /></div>
          <small class="mono">{{ info.building.b.progress.toFixed(1) }}/{{ info.building.def.cycle }}</small>
        </div>
        <div v-else class="kv">
          <span>毎ターン出力</span>
          <b>
            <template v-if="info.building.def.outFood > 0">食料 +{{ (info.building.def.outFood * info.building.b.efficiency).toFixed(2) }}</template>
            <template v-if="info.building.def.outOre > 0">鉱物 +{{ (info.building.def.outOre * info.building.b.efficiency).toFixed(2) }}</template>
          </b>
        </div>

        <div class="subtitle">占領判定(半径 {{ CONFIG.occupation.radius }} マス = {{ info.building.occ.total }} マス中)</div>
        <div v-for="r in info.building.occRows" :key="r.id" class="kv">
          <span><i class="dot" :style="{ background: r.c.color }" />{{ r.c.name }}{{ r.id === info.building.b.owner ? '(所有国)' : '' }}</span>
          <b v-if="r.id === info.building.b.owner">{{ r.n }}</b>
          <b v-else :class="{ neg: r.n >= info.building.occ.need }">{{ r.n }} / {{ info.building.occ.need }}</b>
        </div>
        <small class="dim">敵国が {{ info.building.occ.need }} マス以上を領有すると占領されます</small>
        <div class="toggles">
          <label><input type="checkbox" v-model="ui.layers.occupyRange" /> 占領範囲を表示</label>
          <label><input type="checkbox" v-model="ui.layers.workRange" /> 作業範囲を表示</label>
        </div>
      </div>

      <div v-if="info.fight && !info.battle" class="section">
        <div class="section-title alert">戦闘があったマス</div>
        <small class="dim">軍人は自分のマスと上下左右の隣接マスを攻撃できます(直近のターンに攻撃・被弾がありました)</small>
      </div>
      <div v-if="info.battle" class="section">
        <div class="section-title alert">戦闘中</div>
        <div v-for="r in info.battle" :key="r.country.id" class="kv">
          <span><i class="dot" :style="{ background: r.country.color }" />{{ r.country.name }}</span>
          <b>{{ r.count }}体 / HP {{ r.hp.toFixed(1) }}<small v-if="r.home" class="pos"> 自国領(攻撃 ×{{ CONFIG.military.defenseBonus }})</small></b>
        </div>
      </div>

      <div v-if="info.units.length > 0" class="section">
        <div class="section-title">ユニット({{ info.units.length }} / {{ CONFIG.units.cellCapacity }})</div>
        <div v-for="r in info.units" :key="r.u.id" class="unit-row">
          <i class="dot" :style="{ background: r.country.color }" />
          <span class="unit-kind">{{ r.u.kind === 'soldier' ? '軍人' : '民間人' }}</span>
          <div class="hpbar" :title="`HP ${r.u.hp.toFixed(1)}/${r.u.maxHp}`">
            <i :style="{ width: (r.u.hp / r.u.maxHp) * 100 + '%' }" />
          </div>
          <small class="mono">{{ Math.ceil(r.u.hp) }}/{{ r.u.maxHp }}</small>
          <small class="mono">攻{{ r.u.atk }}</small>
          <small v-if="r.u.starving" class="neg">飢餓</small>
          <span class="spacer" />
          <button class="btn tiny" :class="{ active: ui.followUnitId === r.u.id }" @click="follow(r.u.id)">追従</button>
        </div>
      </div>

      <div v-if="info.recent.length > 0" class="section">
        <div class="section-title">このマスの直近ログ</div>
        <button v-for="ev in info.recent" :key="ev.id" class="link-row" @click="jumpLog(ev.id)">
          <small class="mono dim">T{{ ev.turn }}</small>
          <span class="tag">{{ EVENT_TYPE_LABEL[ev.type] }}</span>
          <span>{{ formatEvent(ev, info.world) }}</span>
        </button>
      </div>

      <p v-if="!info.building && info.units.length === 0" class="hint dim">建物もユニットもありません。</p>
    </template>
  </div>
</template>
