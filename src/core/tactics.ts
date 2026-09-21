import { CONFIG } from './config'
import type { World } from './types'

/**
 * 軍人の分布(国別の積分画像)。指定範囲の敵味方の軍人数を O(1) で数える。
 * 撤退判断や、民間人の危険回避に使う。ターンごとに 1 度だけ作る。
 */
export interface SoldierMap {
  W: number
  H: number
  total: Int32Array
  byCountry: (Int32Array | null)[]
}

function prefix(W: number, H: number, cells: Uint16Array): Int32Array {
  const stride = W + 1
  const sat = new Int32Array(stride * (H + 1))
  for (let y = 0; y < H; y++) {
    let row = 0
    for (let x = 0; x < W; x++) {
      row += cells[y * W + x] as number
      sat[(y + 1) * stride + (x + 1)] = (sat[y * stride + (x + 1)] as number) + row
    }
  }
  return sat
}

export function buildSoldierMap(world: World): SoldierMap {
  const W = world.width
  const H = world.height
  const n = world.countries.length
  const cells: (Uint16Array | null)[] = new Array(n).fill(null)
  const all = new Uint16Array(W * H)
  for (const u of world.units.values()) {
    if (u.kind !== 'soldier') continue
    let g = cells[u.owner]
    if (!g) {
      g = new Uint16Array(W * H)
      cells[u.owner] = g
    }
    const i = u.y * W + u.x
    g[i] = (g[i] as number) + 1
    all[i] = (all[i] as number) + 1
  }
  return {
    W,
    H,
    total: prefix(W, H, all),
    byCountry: cells.map((g) => (g ? prefix(W, H, g) : null)),
  }
}

function rect(sat: Int32Array, W: number, H: number, x: number, y: number, r: number): number {
  const stride = W + 1
  const x0 = Math.max(0, x - r)
  const y0 = Math.max(0, y - r)
  const x1 = Math.min(W, x + r + 1)
  const y1 = Math.min(H, y + r + 1)
  return (
    (sat[y1 * stride + x1] as number) -
    (sat[y0 * stride + x1] as number) -
    (sat[y1 * stride + x0] as number) +
    (sat[y0 * stride + x0] as number)
  )
}

/** (x, y) の周囲 r マス(チェビシェフ距離)にいる、owner の味方軍人と、それ以外の国の軍人の数 */
export function localBalance(map: SoldierMap, owner: number, x: number, y: number, r: number): { friends: number; foes: number } {
  const total = rect(map.total, map.W, map.H, x, y, r)
  const own = map.byCountry[owner]
  const friends = own ? rect(own, map.W, map.H, x, y, r) : 0
  return { friends, foes: total - friends }
}

/** 撤退すべきか: 周囲の敵軍人が一定数以上で、味方の retreatRatio 倍を超えている */
export function shouldRetreat(map: SoldierMap, owner: number, x: number, y: number): boolean {
  const t = CONFIG.tactics
  const { friends, foes } = localBalance(map, owner, x, y, t.radius)
  return foes >= t.retreatFoes && foes > friends * t.retreatRatio
}
