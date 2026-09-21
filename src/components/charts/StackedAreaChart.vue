<script setup lang="ts">
import { computed } from 'vue'

export interface AreaSeries {
  name: string
  color: string
  data: number[]
}

const props = withDefaults(
  defineProps<{
    xs: number[]
    series: AreaSeries[]
    height?: number
    title?: string
    /** 縦軸の最大(マス総数など) */
    max: number
  }>(),
  { height: 64, title: '' },
)

const W = 300
const PAD_L = 4
const PAD_R = 4
const PAD_T = 3
const PAD_B = 12

const view = computed(() => {
  const n = props.xs.length
  const iw = W - PAD_L - PAD_R
  const ih = props.height - PAD_T - PAD_B
  const x = (i: number) => PAD_L + (n <= 1 ? 0 : (i / (n - 1)) * iw)
  const y = (v: number) => PAD_T + ih - (v / Math.max(1, props.max)) * ih
  const base = new Array<number>(n).fill(0)
  const areas = props.series.map((s) => {
    const top = s.data.map((v, i) => (base[i] as number) + v)
    const fwd = top.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    const back = base.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse()
    for (let i = 0; i < n; i++) base[i] = top[i] as number
    return { name: s.name, color: s.color, points: [...fwd, ...back].join(' ') }
  })
  return { areas, x0: props.xs[0] ?? 0, x1: props.xs[n - 1] ?? 0 }
})
</script>

<template>
  <div class="chart">
    <div v-if="title" class="chart-title">{{ title }}</div>
    <svg :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none" class="chart-svg" :style="{ height: height + 'px' }">
      <rect :x="PAD_L" :y="PAD_T" :width="W - PAD_L - PAD_R" :height="height - PAD_T - PAD_B" class="area-bg" />
      <polygon v-for="a in view.areas" :key="a.name" :points="a.points" :fill="a.color" fill-opacity="0.85" />
      <text :x="PAD_L" :y="height - 2" class="tick">T{{ view.x0 }}</text>
      <text :x="W - PAD_R" :y="height - 2" text-anchor="end" class="tick">T{{ view.x1 }}</text>
    </svg>
  </div>
</template>
