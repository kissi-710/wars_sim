<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Importance, SimEvent } from '../core/types'
import { addPing, focusCell, logFocusId, panelVersion, sim, ui, worldId } from '../store'
import { EVENT_CATEGORIES, EVENT_TYPE_LABEL, categoryOf, formatEvent } from '../ui/format'
import Icon from './Icon.vue'

const ROW = 24
const scroller = ref<HTMLDivElement>()
const scrollTop = ref(0)
const viewH = ref(200)
const follow = ref(true)

const importance = ref<'major' | 'normal' | 'all'>('normal')
const search = ref('')
const catOff = ref<Set<string>>(new Set())
const countryOff = ref<Set<number>>(new Set())

const rank: Record<Importance, number> = { major: 2, normal: 1, minor: 0 }

const rows = computed(() => {
  void panelVersion.value
  void worldId.value
  const w = sim.world
  const min = importance.value === 'major' ? 2 : importance.value === 'normal' ? 1 : 0
  const q = search.value.trim()
  const out: { ev: SimEvent; text: string }[] = []
  for (const ev of w.events) {
    if (rank[ev.importance] < min) continue
    if (catOff.value.has(categoryOf(ev.type))) continue
    if (ev.countries.length > 0 && ev.countries.every((c) => countryOff.value.has(c))) continue
    const text = formatEvent(ev, w)
    if (q && !text.includes(q) && !EVENT_TYPE_LABEL[ev.type].includes(q)) continue
    out.push({ ev, text })
  }
  return out
})

const range = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / ROW) - 4)
  const end = Math.min(rows.value.length, Math.ceil((scrollTop.value + viewH.value) / ROW) + 4)
  return { start, end }
})

const visible = computed(() => rows.value.slice(range.value.start, range.value.end).map((r, k) => ({ ...r, idx: range.value.start + k })))

function onScroll(): void {
  const el = scroller.value!
  scrollTop.value = el.scrollTop
  viewH.value = el.clientHeight
  follow.value = el.scrollTop + el.clientHeight >= el.scrollHeight - ROW * 1.5
}

function toBottom(): void {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  () => rows.value.length,
  async () => {
    if (!follow.value) return
    await nextTick()
    toBottom()
  },
)

watch(logFocusId, async (id) => {
  if (id < 0) return
  const i = rows.value.findIndex((r) => r.ev.id === id)
  if (i >= 0 && scroller.value) {
    follow.value = false
    await nextTick()
    scroller.value.scrollTop = Math.max(0, i * ROW - scroller.value.clientHeight / 2)
    flash.value = id
    setTimeout(() => {
      if (flash.value === id) flash.value = -1
    }, 1800)
  }
  logFocusId.value = -1
})

const flash = ref(-1)

onMounted(() => {
  viewH.value = scroller.value?.clientHeight ?? 200
  toBottom()
  const ro = new ResizeObserver(() => {
    viewH.value = scroller.value?.clientHeight ?? 200
  })
  ro.observe(scroller.value!)
})

function toggleCat(id: string): void {
  const s = new Set(catOff.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  catOff.value = s
}

function toggleCountry(id: number): void {
  const s = new Set(countryOff.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  countryOff.value = s
}

function jump(ev: SimEvent): void {
  if (!ev.pos) return
  focusCell(ev.pos.x, ev.pos.y)
  const c = sim.world.countries[ev.countries[0] ?? 0]
  addPing(ev.pos.x, ev.pos.y, c?.color ?? '#ffffff')
}

function color(ev: SimEvent, k: number): string {
  const id = ev.countries[k]
  return id === undefined ? 'transparent' : (sim.world.countries[id]?.color ?? 'transparent')
}
</script>

<template>
  <section class="logpanel">
    <div class="log-head">
      <strong><Icon name="list" :size="15" />ログ</strong>
      <div class="btn-group">
        <button class="btn tiny" :class="{ active: importance === 'major' }" @click="importance = 'major'">重大のみ</button>
        <button class="btn tiny" :class="{ active: importance === 'normal' }" @click="importance = 'normal'">通常以上</button>
        <button class="btn tiny" :class="{ active: importance === 'all' }" @click="importance = 'all'">すべて</button>
      </div>
      <span class="chips">
        <button
          v-for="c in EVENT_CATEGORIES"
          :key="c.id"
          class="chip-btn"
          :class="{ off: catOff.has(c.id) }"
          @click="toggleCat(c.id)"
        >
          {{ c.label }}
        </button>
      </span>
      <span class="chips">
        <button
          v-for="c in sim.world.countries"
          :key="c.id"
          class="chip-btn country"
          :class="{ off: countryOff.has(c.id) }"
          :title="c.name"
          @click="toggleCountry(c.id)"
        >
          <i class="dot" :style="{ background: c.color }" />
        </button>
      </span>
      <input v-model="search" class="search" type="search" placeholder="検索" />
      <span class="spacer" />
      <label class="dim"><input v-model="follow" type="checkbox" @change="follow && toBottom()" /> 自動追尾</label>
      <small class="dim mono">{{ rows.length }}件</small>
      <button class="btn tiny icon" title="ログを閉じる(L)" @click="ui.logOpen = false"><Icon name="chevronDown" :size="14" /></button>
    </div>
    <div ref="scroller" class="log-scroll" @scroll="onScroll">
      <div class="log-spacer" :style="{ height: rows.length * ROW + 'px' }">
        <div
          v-for="r in visible"
          :key="r.ev.id"
          class="log-row"
          :class="[r.ev.importance, { flash: flash === r.ev.id, clickable: !!r.ev.pos }]"
          :style="{ top: r.idx * ROW + 'px', height: ROW + 'px' }"
          @click="jump(r.ev)"
        >
          <span class="mono dim turn">T{{ r.ev.turn }}</span>
          <span class="dots">
            <i class="dot" :style="{ background: color(r.ev, 0) }" />
            <i v-if="r.ev.countries.length > 1" class="dot" :style="{ background: color(r.ev, 1) }" />
          </span>
          <span class="tag small" :class="'cat-' + categoryOf(r.ev.type)">{{ EVENT_TYPE_LABEL[r.ev.type] }}</span>
          <span class="text">{{ r.text }}</span>
          <span v-if="r.ev.pos" class="mono dim pos">({{ r.ev.pos.x }},{{ r.ev.pos.y }})</span>
        </div>
      </div>
      <p v-if="rows.length === 0" class="hint dim log-empty">まだ表示するイベントがありません。再生すると、占領・戦闘・発展などがここに流れます。</p>
    </div>
  </section>
</template>
