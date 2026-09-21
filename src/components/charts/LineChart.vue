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
  { height: 70, title: '' },
)

const W = 300
const PAD_L = 34
const PAD_R = 6
const PAD_T = 6
const PAD_B = 14

const view = computed(() => {
  const n = props.xs.length
  let max = 1
  for (const s of props.series) for (const v of s.data) if (v > max) max = v
  const niceMax = max <= 10 ? Math.ceil(max) : Math.ceil(max / 10 ** (String(Math.floor(max)).length - 1)) * 10 ** (String(Math.floor(max)).length - 1)
  const iw = W - PAD_L - PAD_R
  const ih = props.height - PAD_T - PAD_B
  const x = (i: number) => PAD_L + (n <= 1 ? 0 : (i / (n - 1)) * iw)
  const y = (v: number) => PAD_T + ih - (v / niceMax) * ih
  const lines = props.series.map((s) => ({
    name: s.name,
    color: s.color,
    points: s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
  }))
  return { niceMax, lines, iw, ih, x0: props.xs[0] ?? 0, x1: props.xs[n - 1] ?? 0 }
})
</script>

<template>
  <div class="chart">
    <div v-if="title" class="chart-title">{{ title }}</div>
    <svg :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none" class="chart-svg" :style="{ height: height + 'px' }">
      <line :x1="PAD_L" :x2="W - PAD_R" :y1="PAD_T + view.ih" :y2="PAD_T + view.ih" class="axis" />
      <line :x1="PAD_L" :x2="PAD_L" :y1="PAD_T" :y2="PAD_T + view.ih" class="axis" />
      <line :x1="PAD_L" :x2="W - PAD_R" :y1="PAD_T" :y2="PAD_T" class="grid" />
      <text :x="PAD_L - 3" :y="PAD_T + 4" text-anchor="end" class="tick">{{ view.niceMax.toLocaleString() }}</text>
      <text :x="PAD_L - 3" :y="PAD_T + view.ih" text-anchor="end" class="tick">0</text>
      <text :x="PAD_L" :y="height - 2" text-anchor="start" class="tick">T{{ view.x0 }}</text>
      <text :x="W - PAD_R" :y="height - 2" text-anchor="end" class="tick">T{{ view.x1 }}</text>
      <polyline
        v-for="l in view.lines"
        :key="l.name"
        :points="l.points"
        fill="none"
        :stroke="l.color"
        stroke-width="1.6"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <div class="legend">
      <span v-for="s in series" :key="s.name"><i class="dot" :style="{ background: s.color }" />{{ s.name }}</span>
    </div>
  </div>
</template>
