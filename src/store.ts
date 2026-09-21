import { reactive, ref, watch } from 'vue'
import { CONFIG } from './core/config'
import { hashSeed } from './core/rng'
import { stepWorld } from './core/sim'
import type { GameOptions, PersonalityId, SimEvent, World } from './core/types'
import { createWorld } from './core/world'
import { defaultLayers, type Ping } from './render/mapRenderer'

// ---------------------------------------------------------------------------
// シミュレーション本体(Vue のリアクティブにしない。パネルは panelVersion を購読する)
// ---------------------------------------------------------------------------

export interface NewGameSettings {
  seedText: string
  countryCount: number
  personalities: (PersonalityId | 'random')[]
}

export const SPEEDS = [
  { label: '1x', tps: 10 },
  { label: '2x', tps: 20 },
  { label: '5x', tps: 50 },
  { label: '10x', tps: 100 },
  { label: 'MAX', tps: 0 },
] as const

function randomSeedText(): string {
  return String(Math.floor(Math.random() * 1_000_000))
}

function optionsOf(s: NewGameSettings): GameOptions {
  const asNumber = /^\d+$/.test(s.seedText) ? Number(s.seedText) : hashSeed(s.seedText)
  return { seed: asNumber >>> 0, countryCount: s.countryCount, personalities: s.personalities }
}

const initialSettings: NewGameSettings = {
  seedText: randomSeedText(),
  countryCount: CONFIG.defaultCountryCount,
  personalities: [],
}

export const sim = {
  world: createWorld(optionsOf(initialSettings)),
  /** ステップ数(描画側が変化を検知する) */
  tick: 0,
  /** 0〜1: 次のターンまでの補間位置 */
  alpha: 1,
}

/** パネル更新用(最大 5Hz)。ワールドを作り直したら worldId も増える。 */
export const panelVersion = ref(0)
export const worldId = ref(0)
/** ログでスクロールして強調するイベント ID(マス詳細の直近ログなどから設定) */
export const logFocusId = ref(-1)

export const state = reactive({
  playing: false,
  speedIndex: 0,
  fps: 0,
  tps: 0,
  settings: { ...initialSettings } as NewGameSettings,
})

// ---------------------------------------------------------------------------
// UI 状態
// ---------------------------------------------------------------------------

export type SidebarTab = 'country' | 'cell'

export interface Toast {
  id: number
  text: string
  color: string
}

const PREFS_KEY = 'wars_sim.prefs.v1'

function loadPrefs(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const prefs = loadPrefs()
const pref = <T>(key: string, fallback: T): T => (prefs[key] !== undefined ? (prefs[key] as T) : fallback)

export const ui = reactive({
  selectedCell: -1,
  selectedCountry: -1,
  hoverCell: -1,
  /** 国ハイライト(ホバー) */
  highlightCountry: -1,
  sidebarTab: 'country' as SidebarTab,
  sidebarOpen: pref('sidebarOpen', true),
  sidebarWidth: pref('sidebarWidth', 360),
  logOpen: pref('logOpen', true),
  logHeight: pref('logHeight', 200),
  layers: { ...defaultLayers(), ...pref<Partial<ReturnType<typeof defaultLayers>>>('layers', {}) },
  minimap: pref('minimap', true),
  inertia: pref('inertia', true),
  interpolate: pref('interpolate', true),
  toasts: pref('toasts', true),
  autoCamera: pref('autoCamera', false),
  followUnitId: -1,
  showNewGame: false,
  showHelp: false,
  showSettings: false,
  toastList: [] as Toast[],
})

function savePrefs(): void {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        sidebarOpen: ui.sidebarOpen,
        sidebarWidth: ui.sidebarWidth,
        logOpen: ui.logOpen,
        logHeight: ui.logHeight,
        layers: ui.layers,
        minimap: ui.minimap,
        inertia: ui.inertia,
        interpolate: ui.interpolate,
        toasts: ui.toasts,
        autoCamera: ui.autoCamera,
      }),
    )
  } catch {
    /* 保存できなくても動作に影響しない */
  }
}

watch(
  () => [
    ui.sidebarOpen,
    ui.sidebarWidth,
    ui.logOpen,
    ui.logHeight,
    { ...ui.layers },
    ui.minimap,
    ui.inertia,
    ui.interpolate,
    ui.toasts,
    ui.autoCamera,
  ],
  savePrefs,
  { deep: true },
)

// ---------------------------------------------------------------------------
// エフェクト・トースト・カメラ連携
// ---------------------------------------------------------------------------

export const pings: Ping[] = []

export function pingColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},1)`
}

export function addPing(x: number, y: number, color: string): void {
  pings.push({ x, y, t0: performance.now(), color: pingColor(color) })
}

let toastSeq = 1
export function pushToast(text: string, color: string): void {
  if (!ui.toasts) return
  const t: Toast = { id: toastSeq++, text, color }
  ui.toastList.push(t)
  if (ui.toastList.length > 4) ui.toastList.shift()
  setTimeout(() => {
    const i = ui.toastList.findIndex((x) => x.id === t.id)
    if (i >= 0) ui.toastList.splice(i, 1)
  }, 3500)
}

/** カメラ移動の要求(MapView が受け取る) */
export const cameraRequests: { x: number; y: number; scale?: number }[] = []
export function requestCameraJump(x: number, y: number, scale?: number): void {
  cameraRequests.push({ x, y, scale })
}
export const cameraCommands: ('fit' | 'zoomIn' | 'zoomOut')[] = []

/** ログ/マス選択から呼ぶ: 該当マスを選択し、カメラを移動して波紋を出す */
export function focusCell(x: number, y: number, opts: { select?: boolean; ping?: boolean; scale?: number } = {}): void {
  const w = sim.world
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return
  const i = y * w.width + x
  if (opts.select !== false) {
    ui.selectedCell = i
    ui.sidebarTab = 'cell'
    ui.sidebarOpen = true
  }
  requestCameraJump(x + 0.5, y + 0.5, opts.scale ?? 24)
  if (opts.ping !== false) {
    const o = w.owner[i] as number
    addPing(x, y, o < w.countries.length ? (w.countries[o]!.color) : '#ffffff')
  }
}

// ---------------------------------------------------------------------------
// 進行制御
// ---------------------------------------------------------------------------

let lastEventId = 0

function afterSteps(): void {
  const w = sim.world
  // 新しいイベントから演出(波紋・トースト)を出す
  for (let k = w.events.length - 1; k >= 0; k--) {
    const ev = w.events[k] as SimEvent
    if (ev.id <= lastEventId) break
    onNewEvent(ev, w)
  }
  const last = w.events[w.events.length - 1]
  if (last && last.id > lastEventId) lastEventId = last.id
}

function onNewEvent(ev: SimEvent, w: World): void {
  const main = w.countries[ev.countries[0] ?? 0]
  if (ev.type === 'occupy' && ev.pos) addPing(ev.pos.x, ev.pos.y, main?.color ?? '#ffffff')
  if (ev.importance === 'major' && main) {
    const text = eventToastText(ev, w)
    if (text) pushToast(text, main.color)
  }
  if (ui.autoCamera && ev.pos && (ev.importance === 'major' || ev.type === 'battle')) {
    requestCameraJump(ev.pos.x + 0.5, ev.pos.y + 0.5, 14)
  }
}

function eventToastText(ev: SimEvent, w: World): string {
  const a = w.countries[ev.countries[0] ?? 0]?.name ?? ''
  const b = w.countries[ev.countries[1] ?? 0]?.name ?? ''
  switch (ev.type) {
    case 'extinct':
      return `${a}が滅亡した`
    case 'victory':
      return `${a}の勝利`
    case 'levelUp':
      return `${a}が「${ev.data.name}」に発展`
    case 'occupy':
      return `${a}が${b}の${ev.data.kind === 'village' ? '村' : '建物'}を占領`
    default:
      return ''
  }
}

export function step(): void {
  stepWorld(sim.world)
  sim.tick++
  afterSteps()
  panelVersion.value++
}

export function newGame(settings?: NewGameSettings): void {
  const s = settings ?? state.settings
  state.settings = { ...s, personalities: [...s.personalities] }
  sim.world = createWorld(optionsOf(s))
  sim.tick++
  sim.alpha = 1
  lastEventId = 0
  pings.length = 0
  ui.selectedCell = -1
  ui.selectedCountry = -1
  ui.highlightCountry = -1
  ui.followUnitId = -1
  ui.toastList.length = 0
  worldId.value++
  panelVersion.value++
  state.playing = false
}

export function restartSameSeed(): void {
  newGame(state.settings)
}

export function newRandomGame(): void {
  newGame({ ...state.settings, seedText: randomSeedText() })
}

export function togglePlay(): void {
  state.playing = !state.playing
}

export function setSpeed(i: number): void {
  state.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i))
}

let acc = 0
let lastT = 0
let lastPanelT = 0
let fpsEma = 60
let tpsCount = 0
let tpsT = 0
let started = false

function frame(t: number): void {
  const dt = Math.min(100, t - lastT || 16)
  lastT = t
  fpsEma += (1000 / Math.max(1, dt) - fpsEma) * 0.1

  let steps = 0
  if (state.playing) {
    const sp = SPEEDS[state.speedIndex]!
    if (sp.tps === 0) {
      const start = performance.now()
      do {
        stepWorld(sim.world)
        steps++
      } while (performance.now() - start < 10 && steps < 400)
      sim.alpha = 1
    } else {
      acc += (dt / 1000) * sp.tps
      const n = Math.min(Math.floor(acc), 40)
      acc -= Math.floor(acc)
      for (let k = 0; k < n; k++) stepWorld(sim.world)
      steps = n
      // ゆっくり再生のときだけ、ターン間を補間して滑らかに見せる
      sim.alpha = ui.interpolate && sp.tps <= 20 && n <= 1 ? Math.min(1, acc) : 1
    }
    if (steps > 0) {
      sim.tick += steps
      tpsCount += steps
      afterSteps()
    }
  } else {
    sim.alpha = 1
    acc = 0
  }

  if (t - tpsT >= 1000) {
    state.tps = tpsCount
    state.fps = Math.round(fpsEma)
    tpsCount = 0
    tpsT = t
  }
  // パネルは最大 5Hz で更新
  if (t - lastPanelT >= 200) {
    lastPanelT = t
    panelVersion.value++
  }
  requestAnimationFrame(frame)
}

export function startLoop(): void {
  if (started) return
  started = true
  requestAnimationFrame(frame)
}
