<script setup lang="ts">
import { computed } from 'vue'

export interface ChartSeries {
  name: string
  color: string
  data: number[]
}

const props = withDefaults(
  defineProps<{
    xs: number[]
    series: ChartSeries[]
    height?: number
    title?: string
  }>(),
  { height: 76, title: '' },
)

const W = 300
const PAD_L = 34
const PAD_R = 8
const PAD_T = 8
const PAD_B = 15

// グラデーションの id をチャートごとに一意にする
const uid = `lc${Math.random().toString(36).slice(2, 8)}`

const view = computed(() => {
  const n = props.xs.length
  let max = 1
  for (const s of props.series) for (const v of s.data) if (v > max) max = v
  const mag = 10 ** (String(Math.floor(max)).length - 1)
  const niceMax = max <= 10 ? Math.ceil(max) : Math.ceil(max / mag) * mag
  const iw = W - PAD_L - PAD_R
  const ih = props.height - PAD_T - PAD_B
  const x = (i: number) => PAD_L + (n <= 1 ? 0 : (i / (n - 1)) * iw)
  const y = (v: number) => PAD_T + ih - (v / niceMax) * ih
  const base = PAD_T + ih
  const lines = props.series.map((s, k) => {
    const pts = s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    const area = n > 0 ? `${x(0).toFixed(1)},${base} ${pts.join(' ')} ${x(n - 1).toFixed(1)},${base}` : ''
    return { key: `${uid}-${k}`, name: s.name, color: s.color, points: pts.join(' '), area }
  })
  const grid = [0.25, 0.5, 0.75].map((f) => PAD_T + ih * f)
  return { niceMax, lines, grid, iw, ih, x0: props.xs[0] ?? 0, x1: props.xs[n - 1] ?? 0 }
})
</script>

<template>
  <div class="chart">
    <div v-if="title" class="chart-title">{{ title }}</div>
    <svg :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none" class="chart-svg" :style="{ height: height + 'px' }">
      <defs>
        <linearGradient v-for="l in view.lines" :id="l.key" :key="l.key" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="l.color" stop-opacity="0.34" />
          <stop offset="100%" :stop-color="l.color" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line v-for="g in view.grid" :key="g" :x1="PAD_L" :x2="W - PAD_R" :y1="g" :y2="g" class="grid" />
      <line :x1="PAD_L" :x2="W - PAD_R" :y1="PAD_T + view.ih" :y2="PAD_T + view.ih" class="axis" />
      <line :x1="PAD_L" :x2="PAD_L" :y1="PAD_T" :y2="PAD_T + view.ih" class="axis" />
      <text :x="PAD_L - 4" :y="PAD_T + 3" text-anchor="end" class="tick">{{ view.niceMax.toLocaleString() }}</text>
      <text :x="PAD_L - 4" :y="PAD_T + view.ih" text-anchor="end" class="tick">0</text>
      <text :x="PAD_L" :y="height - 3" text-anchor="start" class="tick">T{{ view.x0 }}</text>
      <text :x="W - PAD_R" :y="height - 3" text-anchor="end" class="tick">T{{ view.x1 }}</text>
      <polygon v-for="l in view.lines" :key="'a' + l.key" :points="l.area" :fill="`url(#${l.key})`" />
      <polyline
        v-for="l in view.lines"
        :key="l.name"
        :points="l.points"
        fill="none"
        :stroke="l.color"
        stroke-width="1.7"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <div class="legend">
      <span v-for="s in series" :key="s.name"><i class="dot" :style="{ background: s.color }" />{{ s.name }}</span>
    </div>
  </div>
</template>
