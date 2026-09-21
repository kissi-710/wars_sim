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

const BG = '#0b0e13'
const NEUTRAL: [number, number, number] = [36, 42, 51]

const KIND_COLOR: Record<BuildingKind, string> = {
  village: '#fff6d6',
  house: '#e0b98a',
  mine: '#aab4c0',
  farm: '#a6dd6f',
  workshop: '#ffb35c',
}
const KIND_GLYPH: Record<Exclude<BuildingKind, 'village'>, string> = {
  house: '住',
  mine: '鉱',
  farm: '畑',
  workshop: '工',
}
const VILLAGE_GLYPH = ['村', '街', '都']

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function css(c: [number, number, number], a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
}

const WHITE: [number, number, number] = [255, 255, 255]
const BLACK: [number, number, number] = [0, 0, 0]

export class MapRenderer {
  private ctx: CanvasRenderingContext2D
  private off: HTMLCanvasElement
  private offCtx: CanvasRenderingContext2D
  private img: ImageData | null = null
  private lastKey = ''
  private centroids: { id: number; x: number; y: number }[] = []
  private centroidTurn = -1
  private colorCache: [number, number, number][] = []

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.off = document.createElement('canvas')
    this.offCtx = this.off.getContext('2d')!
  }

  private colors(world: World): [number, number, number][] {
    if (this.colorCache.length !== world.countries.length) {
      this.colorCache = world.countries.map((c) => hexToRgb(c.color))
    }
    return this.colorCache
  }

  /** 領土レイヤー(1 マス = 1px)を更新する */
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
      let rgb: [number, number, number] = NEUTRAL
      const o = world.owner[i] as number
      if (layers.territory && o !== NO_OWNER) {
        rgb = mix(NEUTRAL, colors[o] as [number, number, number], 0.72)
        if (highlightCountry >= 0 && o !== highlightCountry) rgb = mix(rgb, BLACK, 0.6)
        else if (highlightCountry >= 0 && o === highlightCountry) rgb = mix(rgb, WHITE, 0.12)
      }
      if (layers.heat !== 'none') {
        const n = world.cellCount[i] as number
        let cnt = 0
        for (let k = 0; k < n; k++) {
          const u = world.units.get(world.cellUnits[i * cap + k] as number)
          if (u && u.kind === (layers.heat === 'civilian' ? 'civilian' : 'soldier')) cnt++
        }
        rgb = mix([20, 24, 30], layers.heat === 'civilian' ? [80, 200, 255] : [255, 90, 70], cnt / 4)
      }
      data[i * 4] = rgb[0]
      data[i * 4 + 1] = rgb[1]
      data[i * 4 + 2] = rgb[2]
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
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, size.width, size.height)

    const s = vp.scale
    const W = world.width
    const H = world.height
    const o = worldToScreen(vp, size, 0, 0)
    let animating = false

    // 領土
    this.updateTerritory(inp)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(this.off, 0, 0, W, H, o.x, o.y, W * s, H * s)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.strokeRect(o.x - 0.5, o.y - 0.5, W * s + 1, H * s + 1)

    const v = visibleCells(vp, size, { width: W, height: H })
    const colors = this.colors(world)

    // 国境線
    if (layers.borders && s >= 3) {
      ctx.beginPath()
      for (let y = v.y0; y <= v.y1; y++) {
        for (let x = v.x0; x <= v.x1; x++) {
          const i = y * W + x
          const a = world.owner[i] as number
          if (x < W - 1) {
            const b = world.owner[i + 1] as number
            if (a !== b && (a !== NO_OWNER || b !== NO_OWNER)) {
              ctx.moveTo(o.x + (x + 1) * s, o.y + y * s)
              ctx.lineTo(o.x + (x + 1) * s, o.y + (y + 1) * s)
            }
          }
          if (y < H - 1) {
            const b = world.owner[i + W] as number
            if (a !== b && (a !== NO_OWNER || b !== NO_OWNER)) {
              ctx.moveTo(o.x + x * s, o.y + (y + 1) * s)
              ctx.lineTo(o.x + (x + 1) * s, o.y + (y + 1) * s)
            }
          }
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'
      ctx.lineWidth = s >= 12 ? 2 : 1
      ctx.stroke()
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
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

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
      ctx.strokeStyle = `rgba(255,70,70,${pulse})`
      ctx.lineWidth = Math.max(1.5, s * 0.08)
      for (const i of world.fightCells) {
        const x = i % W
        const y = (i / W) | 0
        if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue
        animating = true
        if (s < 6) {
          ctx.fillStyle = `rgba(255,70,70,${pulse})`
          ctx.fillRect(o.x + x * s, o.y + y * s, Math.max(2, s), Math.max(2, s))
        } else {
          ctx.strokeRect(o.x + x * s + 0.5, o.y + y * s + 0.5, s - 1, s - 1)
        }
      }
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
        ctx.strokeStyle = 'rgba(255,120,80,0.9)'
        ctx.lineWidth = Math.max(1, s * 0.05)
        ctx.stroke()
      }
    }

    // 国名ラベル
    if (layers.labels && s < 8) {
      this.updateCentroids(world)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `bold ${Math.max(10, Math.min(16, s * 3))}px system-ui, sans-serif`
      for (const c of this.centroids) {
        const p = worldToScreen(vp, size, c.x, c.y)
        const name = world.countries[c.id]!.name
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0,0,0,0.75)'
        ctx.strokeText(name, p.x, p.y)
        ctx.fillStyle = '#fff'
        ctx.fillText(name, p.x, p.y)
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
      ctx.strokeStyle = '#ffd43b'
      ctx.lineWidth = 2
      ctx.strokeRect(o.x + sx * s + 1, o.y + sy * s + 1, s - 2, s - 2)
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

  private drawRanges(
    ctx: CanvasRenderingContext2D,
    inp: RenderInput,
    b: Building,
    o: { x: number; y: number },
  ): void {
    const { world, layers, vp } = inp
    const s = vp.scale
    const W = world.width
    if (layers.occupyRange) {
      const R = CONFIG.occupation.radius
      ctx.fillStyle = 'rgba(255,60,60,0.28)'
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const x = b.x + dx
          const y = b.y + dy
          if ((dx === 0 && dy === 0) || x < 0 || y < 0 || x >= W || y >= world.height) continue
          const ow = world.owner[y * W + x] as number
          if (ow !== NO_OWNER && ow !== b.owner) ctx.fillRect(o.x + x * s, o.y + y * s, s, s)
        }
      }
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = 'rgba(255,90,90,0.95)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(o.x + (b.x - R) * s, o.y + (b.y - R) * s, (2 * R + 1) * s, (2 * R + 1) * s)
      ctx.setLineDash([])
    }
    if (layers.workRange) {
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = 'rgba(90,220,120,0.95)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(o.x + (b.x - 1) * s, o.y + (b.y - 1) * s, 3 * s, 3 * s)
      ctx.setLineDash([])
    }
  }

  private drawBuilding(
    ctx: CanvasRenderingContext2D,
    world: World,
    b: Building,
    x: number,
    y: number,
    s: number,
    colors: [number, number, number][],
  ): void {
    const kc = KIND_COLOR[b.kind]
    if (s < 3) {
      ctx.fillStyle = kc
      ctx.fillRect(x, y, Math.max(1.5, s), Math.max(1.5, s))
      return
    }
    const pad = Math.max(0.5, s * 0.1)
    ctx.fillStyle = kc
    ctx.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2)
    if (s >= 6) {
      ctx.strokeStyle = css(mix(colors[b.owner] as [number, number, number], BLACK, 0.25))
      ctx.lineWidth = Math.max(1, s * 0.09)
      ctx.strokeRect(x + pad, y + pad, s - pad * 2, s - pad * 2)
    }
    if (s >= 14) {
      const glyph = b.kind === 'village' ? VILLAGE_GLYPH[world.countries[b.owner]!.level - 1] : KIND_GLYPH[b.kind]
      ctx.fillStyle = '#1a1d23'
      ctx.font = `bold ${s * 0.55}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(glyph as string, x + s / 2, y + s / 2 + s * 0.03)
    }
    if (s >= 20) {
      const def = CONFIG.buildings[b.kind]
      if (def.cycle > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(x + pad, y + s - pad - s * 0.09, s - pad * 2, s * 0.09)
        ctx.fillStyle = '#4dd08a'
        ctx.fillRect(x + pad, y + s - pad - s * 0.09, (s - pad * 2) * Math.min(1, b.progress / def.cycle), s * 0.09)
      }
      if (b.status !== 'ok') {
        ctx.fillStyle = '#ff5a5a'
        ctx.beginPath()
        ctx.arc(x + s - pad - s * 0.09, y + pad + s * 0.09, s * 0.07, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  private drawUnits(
    ctx: CanvasRenderingContext2D,
    inp: RenderInput,
    v: { x0: number; y0: number; x1: number; y1: number },
    o: { x: number; y: number },
    colors: [number, number, number][],
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
          const c = colors[first.owner] as [number, number, number]
          const size = Math.max(1.5, s * 0.55)
          ctx.fillStyle = first.kind === 'soldier' ? css(mix(c, BLACK, 0.4)) : css(mix(c, WHITE, 0.65))
          ctx.fillRect(o.x + x * s + (s - size) / 2, o.y + y * s + (s - size) / 2, size, size)
          continue
        }
        for (let k = 0; k < n; k++) {
          const u = world.units.get(world.cellUnits[i * cap + k] as number)
          if (!u) continue
          const c = colors[u.owner] as [number, number, number]
          const qx = (k & 1) * 0.5 + 0.25
          const qy = (k >> 1) * 0.5 + 0.25
          // 前のマスからの補間(同じマスの中の配置は新しいマス基準)
          const ix = u.px + (x - u.px) * a
          const iy = u.py + (y - u.py) * a
          const cx = o.x + (ix + qx) * s
          const cy = o.y + (iy + qy) * s
          const r = s * 0.2
          if (u.kind === 'soldier') {
            ctx.fillStyle = css(mix(c, BLACK, 0.4))
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'
            ctx.lineWidth = Math.max(1, s * 0.04)
            ctx.strokeRect(cx - r, cy - r, r * 2, r * 2)
          } else {
            ctx.fillStyle = css(mix(c, WHITE, 0.65))
            ctx.beginPath()
            ctx.arc(cx, cy, r, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = 'rgba(0,0,0,0.6)'
            ctx.lineWidth = Math.max(1, s * 0.04)
            ctx.stroke()
          }
          if (s >= 20 && u.hp < u.maxHp) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)'
            ctx.fillRect(cx - r, cy + r + 1, r * 2, 3)
            ctx.fillStyle = u.hp / u.maxHp > 0.5 ? '#4dd08a' : '#ff8a4d'
            ctx.fillRect(cx - r, cy + r + 1, r * 2 * Math.max(0, u.hp / u.maxHp), 3)
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
