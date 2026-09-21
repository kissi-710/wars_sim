<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { camera } from '../camera-instance'
import { MapRenderer } from '../render/mapRenderer'
import { screenToWorld } from '../render/viewport'
import {
  cameraCommands,
  cameraRequests,
  pings,
  pushToast,
  sim,
  ui,
  worldId,
} from '../store'

const wrap = ref<HTMLDivElement>()
const cv = ref<HTMLCanvasElement>()
const grabbing = ref(false)

let renderer: MapRenderer
let raf = 0
let lastT = 0
let lastTick = -1
let lastAlpha = -1
let lastCam = -1
let dirty = true
let animating = false
const keys = new Set<string>()

const emit = defineEmits<{ (e: 'ready'): void }>()

function markDirty(): void {
  dirty = true
}

function cellAt(sx: number, sy: number): number {
  const w = sim.world
  const p = screenToWorld(camera.vp, camera.size, sx, sy)
  const x = Math.floor(p.x)
  const y = Math.floor(p.y)
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return -1
  return y * w.width + x
}

// --- ポインタ操作 ------------------------------------------------------------

const ptrs = new Map<number, { x: number; y: number }>()
let pressed = false
let dragged = false
let downX = 0
let downY = 0
let downButton = 0
let pinchDist = 0

function local(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
  const r = cv.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function onPointerDown(e: PointerEvent): void {
  cv.value!.setPointerCapture(e.pointerId)
  const p = local(e)
  ptrs.set(e.pointerId, p)
  camera.stopInertia()
  if (ptrs.size === 1) {
    pressed = true
    dragged = e.button === 1
    downX = p.x
    downY = p.y
    downButton = e.button
    if (dragged) grabbing.value = true
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()] as [{ x: number; y: number }, { x: number; y: number }]
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
    dragged = true
  }
}

function onPointerMove(e: PointerEvent): void {
  const p = local(e)
  const prev = ptrs.get(e.pointerId)
  if (!prev) {
    // ホバー(ボタンを押していない)
    const i = cellAt(p.x, p.y)
    if (i !== ui.hoverCell) ui.hoverCell = i
    return
  }
  ptrs.set(e.pointerId, p)

  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()] as [{ x: number; y: number }, { x: number; y: number }]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    if (pinchDist > 0) camera.zoomAtPoint(dist / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2)
    pinchDist = dist
    camera.pan(p.x - prev.x, p.y - prev.y)
    return
  }

  if (!pressed) return
  if (!dragged && Math.hypot(p.x - downX, p.y - downY) > 4) {
    dragged = true
    grabbing.value = true
  }
  if (dragged) {
    camera.dragMove(p.x - prev.x, p.y - prev.y, performance.now())
  }
}

function onPointerUp(e: PointerEvent): void {
  const p = local(e)
  ptrs.delete(e.pointerId)
  if (ptrs.size > 0) {
    pinchDist = 0
    return
  }
  if (pressed) {
    if (!dragged && downButton === 0) {
      const i = cellAt(p.x, p.y)
      ui.selectedCell = i
      if (i >= 0) {
        ui.sidebarTab = 'cell'
        ui.sidebarOpen = true
      }
    } else {
      camera.dragRelease(ui.inertia, performance.now())
    }
  }
  pressed = false
  dragged = false
  grabbing.value = false
}

function onPointerLeave(): void {
  if (!pressed && ui.hoverCell !== -1) ui.hoverCell = -1
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const p = local(e)
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
  if (e.shiftKey) {
    camera.pan(-(e.deltaY + e.deltaX) * unit, 0)
    return
  }
  camera.zoomAtPoint(Math.exp(-e.deltaY * unit * 0.0016), p.x, p.y)
}

function onDblClick(e: MouseEvent): void {
  const p = local(e)
  camera.zoomToPoint(e.shiftKey ? 0.5 : 2, p.x, p.y)
}

// --- キー操作 ----------------------------------------------------------------

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

function onKeyDown(e: KeyboardEvent): void {
  if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return
  if (ui.showNewGame || ui.showHelp || ui.showSettings) return
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'Shift'].includes(k)) {
    keys.add(k)
    if (k.startsWith('Arrow')) e.preventDefault()
    ui.followUnitId = k === 'Shift' ? ui.followUnitId : -1
    return
  }
  if (k === '+' || k === '=') camera.zoomCenter(1.25)
  else if (k === '-' || k === '_') camera.zoomCenter(1 / 1.25)
  else if (k === '0' || k === 'Home') camera.fit()
}

function onKeyUp(e: KeyboardEvent): void {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  keys.delete(k)
}

function onBlur(): void {
  keys.clear()
}

// --- 描画ループ ---------------------------------------------------------------

function frame(t: number): void {
  const dt = Math.min(100, t - lastT || 16)
  lastT = t
  const w = sim.world

  for (const cmd of cameraCommands.splice(0)) {
    if (cmd === 'fit') camera.fit()
    else if (cmd === 'zoomIn') camera.zoomCenter(1.25)
    else camera.zoomCenter(1 / 1.25)
  }
  for (const r of cameraRequests.splice(0)) {
    camera.jumpTo(r.x, r.y, r.scale)
  }

  let follow: { x: number; y: number } | null = null
  if (ui.followUnitId >= 0) {
    const u = w.units.get(ui.followUnitId)
    if (!u) {
      pushToast('追従していたユニットが消滅した', '#ffd43b')
      ui.followUnitId = -1
    } else {
      follow = {
        x: u.px + (u.x - u.px) * sim.alpha + 0.5,
        y: u.py + (u.y - u.py) * sim.alpha + 0.5,
      }
    }
  }

  const moved = camera.update(t, dt, keys, follow)
  const needs =
    moved ||
    dirty ||
    animating ||
    camera.version !== lastCam ||
    sim.tick !== lastTick ||
    sim.alpha !== lastAlpha ||
    ui.followUnitId >= 0

  if (needs && cv.value) {
    animating = renderer.draw({
      world: w,
      vp: camera.vp,
      size: camera.size,
      dpr: window.devicePixelRatio || 1,
      layers: ui.layers,
      selectedCell: ui.selectedCell,
      hoverCell: ui.hoverCell,
      highlightCountry: ui.highlightCountry,
      pings,
      now: t,
      interp: sim.alpha,
      followUnitId: ui.followUnitId,
    })
    lastTick = sim.tick
    lastAlpha = sim.alpha
    lastCam = camera.version
    dirty = false
  }
  raf = requestAnimationFrame(frame)
}

let ro: ResizeObserver | null = null

onMounted(() => {
  renderer = new MapRenderer(cv.value!)
  camera.setMap({ width: sim.world.width, height: sim.world.height })
  ro = new ResizeObserver(() => {
    const r = wrap.value!.getBoundingClientRect()
    camera.setSize(r.width, r.height)
    markDirty()
  })
  ro.observe(wrap.value!)
  cv.value!.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  raf = requestAnimationFrame(frame)
  emit('ready')
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  cv.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
})

watch(
  () => [ui.selectedCell, ui.hoverCell, ui.highlightCountry, ui.followUnitId, { ...ui.layers }, worldId.value],
  markDirty,
  { deep: true },
)
</script>

<template>
  <div ref="wrap" class="map-wrap" :class="{ grabbing }">
    <canvas
      ref="cv"
      class="map-canvas"
      tabindex="0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @dblclick="onDblClick"
      @contextmenu.prevent
    />
  </div>
</template>
