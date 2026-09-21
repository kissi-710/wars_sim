import { CONFIG } from '../core/config'
import { NO_BUILDING, NO_OWNER, type Building, type BuildingKind, type World } from '../core/types'
import { visibleCells, worldToScreen, type ViewSize, type Viewport } from './viewport'

export type HeatMode = 'none' | 'civilian' | 'soldier'

export interface Layers {
  territory: boolean
  borders: boolean
  grid: boolean
  buildings: boolean
  units: boolean
  battles: boolean
  labels: boolean
  occupyRange: boolean
  workRange: boolean
  heat: HeatMode
}

export const defaultLayers = (): Layers => ({
  territory: true,
  borders: true,
  grid: true,
  buildings: true,
  units: true,
  battles: true,
  labels: true,
  occupyRange: true,
  workRange: true,
  heat: 'none',
})

/** クリックで出す波紋(ログの座標ジャンプ・占領など) */
export interface Ping {
  x: number
  y: number
  t0: number
  color: string
}

export interface RenderInput {
  world: World
  vp: Viewport
  size: ViewSize
  dpr: number
  layers: Layers
  selectedCell: number
  hoverCell: number
  highlightCountry: number
  pings: Ping[]
  now: number
  /** 0〜1。ユニットを前のマスから補間して描く(1 = 補間なし) */
  interp: number
  /** 追従しているユニットのマス強調用 */
  followUnitId: number
}

type RGB = [number, number, number]

const BASE: RGB = [27, 33, 45]
const NEUTRAL: RGB = [31, 37, 49]
const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]

const KIND_COLOR: Record<BuildingKind, string> = {
  village: '#fff2c4',
  house: '#f0c894',
  mine: '#b9c4d2',
  farm: '#b4e57f',
  workshop: '#ffbe6b',
}
const KIND_GLYPH: Record<Exclude<BuildingKind, 'village'>, string> = {
  house: '住',
  mine: '鉱',
  farm: '畑',
  workshop: '工',
}
const VILLAGE_GLYPH = ['村', '街', '都']

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function css(c: RGB, a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
}

function lighten(c: RGB, t: number): RGB {
  return mix(c, WHITE, t)
}
function darken(c: RGB, t: number): RGB {
  return mix(c, BLACK, t)
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}

export class MapRenderer {
  private ctx: CanvasRenderingContext2D
  private off: HTMLCanvasElement
  private offCtx: CanvasRenderingContext2D
  private img: ImageData | null = null
  private lastKey = ''
  private centroids: { id: number; x: number; y: number }[] = []
  private centroidTurn = -1
  private colorCache: RGB[] = []

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.off = document.createElement('canvas')
    this.offCtx = this.off.getContext('2d')!
  }

  private colors(world: World): RGB[] {
    if (this.colorCache.length !== world.countries.length) {
      this.colorCache = world.countries.map((c) => hexToRgb(c.color))
    }
    return this.colorCache
  }

  /** 領土レイヤー(1 マス = 1px)を更新する。国色を落ち着かせて塗り、市松の微かな明暗で質感を出す。 */
  private updateTerritory(inp: RenderInput): void {
    const { world, layers, highlightCountry } = inp
    const key = `${world.turn}|${layers.territory}|${layers.heat}|${highlightCountry}|${world.countries.length}|${world.seed}`
    if (key === this.lastKey && this.img) return
    this.lastKey = key
    const W = world.width
    const H = world.height
    if (this.off.width !== W || this.off.height !== H || !this.img) {
      this.off.width = W
      this.off.height = H
      this.img = this.offCtx.createImageData(W, H)
    }
    const data = this.img.data
    const colors = this.colors(world)
    const cap = CONFIG.units.cellCapacity
    for (let i = 0; i < W * H; i++) {
      const x = i % W
      const y = (i / W) | 0
      const checker = (x + y) & 1 ? 3 : 0
      let rgb: RGB = NEUTRAL
      const o = world.owner[i] as number
      if (layers.territory && o !== NO_OWNER) {
        rgb = mix(BASE, colors[o] as RGB, 0.6)
        if (highlightCountry >= 0 && o !== highlightCountry) rgb = mix(rgb, BLACK, 0.62)
        else if (highlightCountry >= 0 && o === highlightCountry) rgb = mix(rgb, WHITE, 0.14)
      }
      if (layers.heat !== 'none') {
        const n = world.cellCount[i] as number
        let cnt = 0
        for (let k = 0; k < n; k++) {
          const u = world.units.get(world.cellUnits[i * cap + k] as number)
          if (u && u.kind === (layers.heat === 'civilian' ? 'civilian' : 'soldier')) cnt++
        }
        rgb = mix([18, 22, 30], layers.heat === 'civilian' ? [80, 200, 255] : [255, 90, 70], cnt / 4)
      }
      data[i * 4] = Math.min(255, rgb[0] + checker)
      data[i * 4 + 1] = Math.min(255, rgb[1] + checker)
      data[i * 4 + 2] = Math.min(255, rgb[2] + checker)
      data[i * 4 + 3] = 255
    }
    this.offCtx.putImageData(this.img, 0, 0)
  }

  private updateCentroids(world: World): void {
    if (this.centroidTurn === world.turn) return
    this.centroidTurn = world.turn
    const n = world.countries.length
    const sx = new Float64Array(n)
    const sy = new Float64Array(n)
    const cnt = new Float64Array(n)
    for (let i = 0; i < world.width * world.height; i++) {
      const o = world.owner[i] as number
      if (o === NO_OWNER) continue
      sx[o] = (sx[o] as number) + (i % world.width) + 0.5
      sy[o] = (sy[o] as number) + ((i / world.width) | 0) + 0.5
      cnt[o] = (cnt[o] as number) + 1
    }
    this.centroids = []
    for (let c = 0; c < n; c++) {
      if ((cnt[c] as number) >= 20 && world.countries[c]!.alive) {
        this.centroids.push({ id: c, x: (sx[c] as number) / (cnt[c] as number), y: (sy[c] as number) / (cnt[c] as number) })
      }
    }
  }

  /** 描画する。アニメーションが必要(戦闘マーカー・波紋)なら true を返す */
  draw(inp: RenderInput): boolean {
    const { world, vp, size, dpr, layers, now } = inp
    const canvas = this.canvas
    const pw = Math.max(1, Math.round(size.width * dpr))
    const ph = Math.max(1, Math.round(size.height * dpr))
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 背景: 中央がやや明るいラジアルグラデーション
    const bg = ctx.createRadialGradient(size.width / 2, size.height / 2, 0, size.width / 2, size.height / 2, Math.max(size.width, size.height) * 0.75)
    bg.addColorStop(0, '#111826')
    bg.addColorStop(1, '#070a0f')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, size.width, size.height)

    const s = vp.scale
    const W = world.width
    const H = world.height
    const o = worldToScreen(vp, size, 0, 0)
    let animating = false

    // 盤面の影
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 28
    ctx.shadowOffsetY = 6
    ctx.fillStyle = '#000'
    ctx.fillRect(o.x, o.y, W * s, H * s)
    ctx.restore()

    // 領土
    this.updateTerritory(inp)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(this.off, 0, 0, W, H, o.x, o.y, W * s, H * s)

    const v = visibleCells(vp, size, { width: W, height: H })
    const colors = this.colors(world)

    // 国境線: 各マスの「自国の内側」に国色の線を引く(隣り合う国が 2 色の縁取りになる)
    if (layers.borders && s >= 3) {
      const lw = s >= 20 ? 3 : s >= 8 ? 2 : 1.3
      const half = lw / 2
      const segs: number[][] = world.countries.map(() => [])
      for (let y = v.y0; y <= v.y1; y++) {
        for (let x = v.x0; x <= v.x1; x++) {
          const i = y * W + x
          const a = world.owner[i] as number
          if (a === NO_OWNER) continue
          const sg = segs[a] as number[]
          const px = o.x + x * s
          const py = o.y + y * s
          if (x < W - 1 && world.owner[i + 1] !== a) sg.push(px + s - half, py, px + s - half, py + s)
          if (x > 0 && world.owner[i - 1] !== a) sg.push(px + half, py, px + half, py + s)
          if (y < H - 1 && world.owner[i + W] !== a) sg.push(px, py + s - half, px + s, py + s - half)
          if (y > 0 && world.owner[i - W] !== a) sg.push(px, py + half, px + s, py + half)
        }
      }
      ctx.lineWidth = lw
      ctx.lineCap = 'butt'
      for (let a = 0; a < segs.length; a++) {
        const sg = segs[a] as number[]
        if (sg.length === 0) continue
        ctx.strokeStyle = css(lighten(colors[a] as RGB, 0.38), 0.95)
        ctx.beginPath()
        for (let k = 0; k < sg.length; k += 4) {
          ctx.moveTo(sg[k] as number, sg[k + 1] as number)
          ctx.lineTo(sg[k + 2] as number, sg[k + 3] as number)
        }
        ctx.stroke()
      }
    }

    // グリッド
    if (layers.grid && s >= 12) {
      ctx.beginPath()
      for (let x = v.x0; x <= v.x1 + 1; x++) {
        ctx.moveTo(o.x + x * s, o.y + v.y0 * s)
        ctx.lineTo(o.x + x * s, o.y + (v.y1 + 1) * s)
      }
      for (let y = v.y0; y <= v.y1 + 1; y++) {
        ctx.moveTo(o.x + v.x0 * s, o.y + y * s)
        ctx.lineTo(o.x + (v.x1 + 1) * s, o.y + y * s)
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // 盤面の縁
    ctx.strokeStyle = 'rgba(160,190,255,0.28)'
    ctx.lineWidth = 1
    ctx.strokeRect(o.x - 0.5, o.y - 0.5, W * s + 1, H * s + 1)

    // 選択した建物の範囲(占領判定・作業)
    const selB = inp.selectedCell >= 0 ? this.buildingAt(world, inp.selectedCell) : undefined
    if (selB) this.drawRanges(ctx, inp, selB, o)

    // 建物
    if (layers.buildings) {
      for (const b of world.buildings.values()) {
        if (b.x < v.x0 || b.x > v.x1 || b.y < v.y0 || b.y > v.y1) continue
        this.drawBuilding(ctx, world, b, o.x + b.x * s, o.y + b.y * s, s, colors)
      }
    }

    // ユニット
    if (layers.units && s >= 3) this.drawUnits(ctx, inp, v, o, colors)

    // 戦闘マーカー(このターンに攻撃・被弾があったマス)と、軍人の攻撃線
    if (layers.battles && world.fightCells.size > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(now / 140)
      const glow = world.fightCells.size <= 400 && s >= 6
      ctx.save()
      if (glow) {
        ctx.shadowColor = 'rgba(255,60,60,0.9)'
        ctx.shadowBlur = 10
      }
      ctx.strokeStyle = `rgba(255,86,86,${pulse})`
      ctx.lineWidth = Math.max(1.5, s * 0.07)
      for (const i of world.fightCells) {
        const x = i % W
        const y = (i / W) | 0
        if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue
        animating = true
        if (s < 6) {
          ctx.fillStyle = `rgba(255,70,70,${pulse})`
          ctx.fillRect(o.x + x * s, o.y + y * s, Math.max(2, s), Math.max(2, s))
        } else {
          ctx.strokeRect(o.x + x * s + 1, o.y + y * s + 1, s - 2, s - 2)
        }
      }
      ctx.restore()
      if (s >= 8) {
        ctx.beginPath()
        for (let k = 0; k < world.hits.length; k += 2) {
          const f = world.hits[k] as number
          const t = world.hits[k + 1] as number
          const fx = f % W
          const fy = (f / W) | 0
          const tx = t % W
          const ty = (t / W) | 0
          if ((fx < v.x0 && tx < v.x0) || (fx > v.x1 && tx > v.x1) || (fy < v.y0 && ty < v.y0) || (fy > v.y1 && ty > v.y1)) continue
          if (f === t) continue
          ctx.moveTo(o.x + (fx + 0.5) * s, o.y + (fy + 0.5) * s)
          ctx.lineTo(o.x + (tx + 0.5) * s, o.y + (ty + 0.5) * s)
        }
        ctx.strokeStyle = 'rgba(255,150,90,0.95)'
        ctx.lineWidth = Math.max(1.2, s * 0.055)
        ctx.lineCap = 'round'
        ctx.stroke()
        ctx.lineCap = 'butt'
      }
    }

    // ビネット(四隅を落として視線を中央へ)
    const vg = ctx.createRadialGradient(size.width / 2, size.height / 2, Math.min(size.width, size.height) * 0.35, size.width / 2, size.height / 2, Math.max(size.width, size.height) * 0.78)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.38)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, size.width, size.height)

    // 国名ラベル(縮小時): 国色の点つきのピル
    if (layers.labels && s < 8) {
      this.updateCentroids(world)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const fs = Math.max(11, Math.min(15, s * 3))
      ctx.font = `700 ${fs}px system-ui, "Hiragino Sans", "Yu Gothic UI", sans-serif`
      for (const c of this.centroids) {
        const p = worldToScreen(vp, size, c.x, c.y)
        const country = world.countries[c.id]!
        const tw = ctx.measureText(country.name).width
        const w = tw + fs * 1.5
        const h = fs * 1.7
        const x = p.x - w / 2
        const y = p.y - h / 2
        roundRectPath(ctx, x, y, w, h, h / 2)
        ctx.fillStyle = 'rgba(8,11,17,0.78)'
        ctx.fill()
        ctx.strokeStyle = css(lighten(colors[c.id] as RGB, 0.25), 0.85)
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x + fs * 0.75, p.y, fs * 0.28, 0, Math.PI * 2)
        ctx.fillStyle = country.color
        ctx.fill()
        ctx.fillStyle = '#f2f5fa'
        ctx.fillText(country.name, x + fs * 1.15, p.y + 0.5)
      }
    }

    // 選択・ホバー
    if (inp.hoverCell >= 0 && inp.hoverCell !== inp.selectedCell) {
      const hx = inp.hoverCell % W
      const hy = (inp.hoverCell / W) | 0
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1
      ctx.strokeRect(o.x + hx * s + 0.5, o.y + hy * s + 0.5, s - 1, s - 1)
    }
    if (inp.selectedCell >= 0) {
      const sx = inp.selectedCell % W
      const sy = (inp.selectedCell / W) | 0
      ctx.save()
      ctx.shadowColor = 'rgba(255,212,59,0.85)'
      ctx.shadowBlur = 12
      ctx.strokeStyle = '#ffd43b'
      ctx.lineWidth = 2
      ctx.strokeRect(o.x + sx * s + 1, o.y + sy * s + 1, s - 2, s - 2)
      ctx.restore()
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = 1
      ctx.strokeRect(o.x + sx * s + 3, o.y + sy * s + 3, Math.max(0, s - 6), Math.max(0, s - 6))
    }

    // 波紋(ping)
    const alive: Ping[] = []
    for (const p of inp.pings) {
      const age = (now - p.t0) / 1600
      if (age >= 1) continue
      alive.push(p)
      animating = true
      const c = worldToScreen(vp, size, p.x + 0.5, p.y + 0.5)
      const r = Math.max(8, s * 0.6) + age * Math.max(36, s * 3)
      ctx.strokeStyle = p.color.replace('1)', `${(1 - age).toFixed(2)})`)
      ctx.lineWidth = 3 * (1 - age) + 1
      ctx.beginPath()
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    inp.pings.length = 0
    inp.pings.push(...alive)

    return animating
  }

  private buildingAt(world: World, i: number): Building | undefined {
    const id = world.buildingAt[i] as number
    return id === NO_BUILDING ? undefined : world.buildings.get(id)
  }

  private drawRanges(ctx: CanvasRenderingContext2D, inp: RenderInput, b: Building, o: { x: number; y: number }): void {
    const { world, layers, vp } = inp
    const s = vp.scale
    const W = world.width
    if (layers.occupyRange) {
      const R = CONFIG.occupation.radius
      ctx.fillStyle = 'rgba(255,60,60,0.26)'
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const x = b.x + dx
          const y = b.y + dy
          if ((dx === 0 && dy === 0) || x < 0 || y < 0 || x >= W || y >= world.height) continue
          const ow = world.owner[y * W + x] as number
          if (ow !== NO_OWNER && ow !== b.owner) ctx.fillRect(o.x + x * s, o.y + y * s, s, s)
        }
      }
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = 'rgba(255,100,100,0.95)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(o.x + (b.x - R) * s, o.y + (b.y - R) * s, (2 * R + 1) * s, (2 * R + 1) * s)
      ctx.setLineDash([])
    }
    if (layers.workRange) {
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(100,230,140,0.95)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(o.x + (b.x - 1) * s, o.y + (b.y - 1) * s, 3 * s, 3 * s)
      ctx.setLineDash([])
    }
  }

  /** 建物: 丸みのあるタイル(上が明るいグラデーション)+ 国色の縁 + 影。村は一回り大きく、レベルを点で示す */
  private drawBuilding(
    ctx: CanvasRenderingContext2D,
    world: World,
    b: Building,
    x: number,
    y: number,
    s: number,
    colors: RGB[],
  ): void {
    const kc = hexToRgb(KIND_COLOR[b.kind])
    const owner = colors[b.owner] as RGB
    if (s < 3) {
      ctx.fillStyle = css(kc)
      ctx.fillRect(x, y, Math.max(1.5, s), Math.max(1.5, s))
      return
    }
    const village = b.kind === 'village'
    const pad = Math.max(0.4, s * (village ? 0.03 : 0.08))
    const w = s - pad * 2
    const r = Math.min(7, s * 0.2)
    if (s >= 10) {
      roundRectPath(ctx, x + pad + 0.5, y + pad + 1.5, w, w, r)
      ctx.fillStyle = 'rgba(0,0,0,0.38)'
      ctx.fill()
    }
    roundRectPath(ctx, x + pad, y + pad, w, w, r)
    if (s >= 8) {
      const g = ctx.createLinearGradient(0, y + pad, 0, y + pad + w)
      g.addColorStop(0, css(lighten(kc, 0.35)))
      g.addColorStop(1, css(darken(kc, 0.12)))
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = css(kc)
    }
    ctx.fill()
    if (s >= 6) {
      ctx.strokeStyle = css(darken(owner, 0.05))
      ctx.lineWidth = Math.max(1.4, s * (village ? 0.13 : 0.1))
      ctx.stroke()
    }
    if (s >= 14) {
      const level = world.countries[b.owner]!.level
      const glyph = village ? VILLAGE_GLYPH[level - 1] : KIND_GLYPH[b.kind as Exclude<BuildingKind, 'village'>]
      ctx.fillStyle = '#20232b'
      ctx.font = `800 ${s * (village ? 0.6 : 0.52)}px system-ui, "Hiragino Sans", "Yu Gothic UI", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(glyph as string, x + s / 2, y + s / 2 + s * 0.02)
      if (village && s >= 20) {
        // レベルを示す点(村 = 1、街 = 2、都市 = 3)
        for (let k = 0; k < level; k++) {
          ctx.beginPath()
          ctx.arc(x + s / 2 + (k - (level - 1) / 2) * s * 0.14, y + pad + s * 0.11, s * 0.045, 0, Math.PI * 2)
          ctx.fillStyle = '#c98a00'
          ctx.fill()
        }
      }
    }
    if (s >= 20) {
      const def = CONFIG.buildings[b.kind]
      if (def.cycle > 0) {
        const bx = x + pad + s * 0.08
        const bw = w - s * 0.16
        const by = y + s - pad - s * 0.12
        roundRectPath(ctx, bx, by, bw, s * 0.06, s * 0.03)
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fill()
        roundRectPath(ctx, bx, by, Math.max(s * 0.06, bw * Math.min(1, b.progress / def.cycle)), s * 0.06, s * 0.03)
        ctx.fillStyle = '#3ddc84'
        ctx.fill()
      }
      if (b.status !== 'ok') {
        ctx.beginPath()
        ctx.arc(x + s - pad - s * 0.1, y + pad + s * 0.1, s * 0.065, 0, Math.PI * 2)
        ctx.fillStyle = b.status === 'pop-cap' || b.status === 'stock-cap' ? '#ffb020' : '#ff5a5a'
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }

  private drawUnits(
    ctx: CanvasRenderingContext2D,
    inp: RenderInput,
    v: { x0: number; y0: number; x1: number; y1: number },
    o: { x: number; y: number },
    colors: RGB[],
  ): void {
    const { world, vp } = inp
    const s = vp.scale
    const W = world.width
    const cap = CONFIG.units.cellCapacity
    const a = inp.interp
    for (let y = v.y0; y <= v.y1; y++) {
      for (let x = v.x0; x <= v.x1; x++) {
        const i = y * W + x
        const n = world.cellCount[i] as number
        if (n === 0) continue
        if (s < 8) {
          const first = world.units.get(world.cellUnits[i * cap] as number)
          if (!first) continue
          const c = colors[first.owner] as RGB
          const size = Math.max(1.5, s * 0.55)
          ctx.fillStyle = first.kind === 'soldier' ? css(darken(c, 0.45)) : css(lighten(c, 0.7))
          ctx.fillRect(o.x + x * s + (s - size) / 2, o.y + y * s + (s - size) / 2, size, size)
          continue
        }
        for (let k = 0; k < n; k++) {
          const u = world.units.get(world.cellUnits[i * cap + k] as number)
          if (!u) continue
          const c = colors[u.owner] as RGB
          const qx = (k & 1) * 0.5 + 0.25
          const qy = (k >> 1) * 0.5 + 0.25
          // 前のマスからの補間(同じマスの中の配置は新しいマス基準)
          const ix = u.px + (x - u.px) * a
          const iy = u.py + (y - u.py) * a
          const cx = o.x + (ix + qx) * s
          const cy = o.y + (iy + qy) * s
          const r = s * 0.2
          if (s >= 14) {
            ctx.fillStyle = 'rgba(0,0,0,0.28)'
            ctx.beginPath()
            ctx.ellipse(cx, cy + r * 0.95, r * 0.95, r * 0.42, 0, 0, Math.PI * 2)
            ctx.fill()
          }
          if (u.kind === 'soldier') {
            roundRectPath(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.35)
            ctx.fillStyle = css(darken(c, 0.32))
            ctx.fill()
            ctx.strokeStyle = 'rgba(255,255,255,0.92)'
            ctx.lineWidth = Math.max(1, s * 0.05)
            ctx.stroke()
            if (s >= 16) {
              // 兜の印(上部の細い帯)
              ctx.fillStyle = css(lighten(c, 0.45), 0.9)
              ctx.fillRect(cx - r * 0.6, cy - r * 0.55, r * 1.2, r * 0.28)
            }
          } else {
            ctx.beginPath()
            ctx.arc(cx, cy, r, 0, Math.PI * 2)
            ctx.fillStyle = css(lighten(c, 0.68))
            ctx.fill()
            ctx.strokeStyle = css(darken(c, 0.5), 0.9)
            ctx.lineWidth = Math.max(1, s * 0.05)
            ctx.stroke()
          }
          if (s >= 20 && u.hp < u.maxHp) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)'
            ctx.fillRect(cx - r, cy + r + 2, r * 2, 3)
            ctx.fillStyle = u.hp / u.maxHp > 0.5 ? '#4dd08a' : '#ff8a4d'
            ctx.fillRect(cx - r, cy + r + 2, r * 2 * Math.max(0, u.hp / u.maxHp), 3)
          }
          if (u.id === inp.followUnitId) {
            ctx.strokeStyle = '#ffd43b'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
      }
    }
  }
}
