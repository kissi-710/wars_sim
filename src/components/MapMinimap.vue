<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { camera } from '../camera-instance'
import { NO_OWNER } from '../core/types'
import { visibleCells } from '../render/viewport'
import { panelVersion, sim, worldId } from '../store'

const PX = 1.6 // 1 マスあたりの CSS px
const cv = ref<HTMLCanvasElement>()
let raf = 0
let lastPanel = -1
let lastCam = -1
let lastWorld = -1
let off: HTMLCanvasElement | null = null
let dragging = false

function drawTerritory(): void {
  const w = sim.world
  if (!off) {
    off = document.createElement('canvas')
  }
  off.width = w.width
  off.height = w.height
  const octx = off.getContext('2d')!
  const img = octx.createImageData(w.width, w.height)
  const colors = w.countries.map((c) => {
    const n = parseInt(c.color.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  })
  for (let i = 0; i < w.width * w.height; i++) {
    const o = w.owner[i] as number
    const c = o === NO_OWNER ? [36, 42, 51] : (colors[o] as number[])
    img.data[i * 4] = c[0] as number
    img.data[i * 4 + 1] = c[1] as number
    img.data[i * 4 + 2] = c[2] as number
    img.data[i * 4 + 3] = 255
  }
  octx.putImageData(img, 0, 0)
}

function draw(): void {
  const canvas = cv.value
  if (!canvas) return
  const w = sim.world
  const dpr = window.devicePixelRatio || 1
  const cw = Math.round(w.width * PX)
  const ch = Math.round(w.height * PX)
  if (canvas.width !== cw * dpr) {
    canvas.width = cw * dpr
    canvas.height = ch * dpr
    canvas.style.width = `${cw}px`
    canvas.style.height = `${ch}px`
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
  if (panelVersion.value !== lastPanel || worldId.value !== lastWorld || !off) drawTerritory()
  ctx.clearRect(0, 0, cw, ch)
  ctx.drawImage(off!, 0, 0, w.width, w.height, 0, 0, cw, ch)

  const v = visibleCells(camera.vp, camera.size, { width: w.width, height: w.height })
  const a = (camera.vp.cx - camera.size.width / 2 / camera.vp.scale) * PX
  const b = (camera.vp.cy - camera.size.height / 2 / camera.vp.scale) * PX
  const rw = (camera.size.width / camera.vp.scale) * PX
  const rh = (camera.size.height / camera.vp.scale) * PX
  void v
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.strokeRect(a, b, rw, rh)
}

function loop(): void {
  if (panelVersion.value !== lastPanel || camera.version !== lastCam || worldId.value !== lastWorld) {
    draw()
    lastPanel = panelVersion.value
    lastCam = camera.version
    lastWorld = worldId.value
  }
  raf = requestAnimationFrame(loop)
}

function moveTo(e: PointerEvent): void {
  const r = cv.value!.getBoundingClientRect()
  camera.centerNow((e.clientX - r.left) / PX, (e.clientY - r.top) / PX)
}

function down(e: PointerEvent): void {
  dragging = true
  cv.value!.setPointerCapture(e.pointerId)
  moveTo(e)
}
function move(e: PointerEvent): void {
  if (dragging) moveTo(e)
}
function up(): void {
  dragging = false
}

onMounted(() => {
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="minimap" title="ミニマップ(クリック/ドラッグで移動)">
    <canvas ref="cv" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" />
  </div>
</template>
