import { CONFIG } from '../config'
import { pushEvent } from '../events'
import { addBuilding, countBuildings, populationCap } from '../world'
import { NO_BUILDING, type Country, type World } from '../types'

type Buildable = 'house' | 'farm' | 'mine' | 'workshop'
const BUILDABLE: Buildable[] = ['house', 'farm', 'mine', 'workshop']

/**
 * 建物の個数上限 = base + floor(これまでの最大領土 / perLand)。
 * 領土に比例して増え、領土が減っても下がらない(peakLand は減らない)。
 */
export function buildingCap(country: Country, kind: Buildable): number {
  const mul = kind === 'workshop' ? CONFIG.personalities[country.personality].workshopCapMul : 1
  const per = CONFIG.construction.capPerLand[kind]
  return Math.floor((CONFIG.construction.capBase[kind] + Math.floor(country.peakLand / per)) * mul)
}

function canAfford(c: Country, kind: Buildable): boolean {
  const cost = CONFIG.construction.cost[kind]
  return c.stock.ore >= cost.ore && c.stock.food >= cost.food
}

/**
 * 「今の国に何が必要か」の係数。食料収支・鉱物在庫・装備の需要・人口の空きから決める。
 * (例: 食料が赤字なら畑を優先、戦争中で装備が足りなければ工房を優先、人口が上限なら住居は不要)
 */
function needs(c: Country): Record<Buildable, number> {
  const p = CONFIG.personalities[c.personality]
  const pop = c.civilians + c.soldiers
  const popRoom = pop < populationCap(c) * 0.9
  const atWar = c.warTarget >= 0 || c.mobilized
  return {
    farm: c.flowFood < 0.5 ? 3 : c.stock.food < 40 ? 2 : 1,
    mine: c.stock.ore < 30 ? 2.5 : c.stock.ore < 150 ? 1.2 : 0.4,
    workshop: atWar && c.stock.equipment < p.stockCap * 0.5 ? 2 : c.stock.equipment < p.stockCap * 0.3 ? 1 : 0.4,
    house: !popRoom ? 0.05 : c.stock.food > 20 ? 1.5 : 0.6,
  }
}

/** 性格の重みと国の必要度に対して不足している種類を選ぶ(個数上限・資源を考慮) */
function chooseKind(world: World, c: Country): Buildable | null {
  const counts = countBuildings(world, c.id)
  const w = CONFIG.personalities[c.personality].weights
  const need = needs(c)
  const nonVillage = counts.house + counts.farm + counts.mine + counts.workshop
  const under = (k: Buildable) => counts[k] < buildingCap(c, k)

  // 全性格とも工房を最低 1 つは建てる(平和的でも装備の備蓄のため)
  let want: Buildable | null = null
  if (counts.workshop === 0 && nonVillage >= CONFIG.construction.workshopAfter && under('workshop')) {
    want = 'workshop'
  } else {
    let bestScore = -1
    for (const k of BUILDABLE) {
      if (!under(k)) continue
      const score = (w[k] * need[k]) / (counts[k] + 1)
      if (score > bestScore) {
        bestScore = score
        want = k
      }
    }
  }
  if (!want) return null
  if (canAfford(c, want)) return want

  // 買えないときは、ボトルネックの資源を増やす建物を優先する
  const cost = CONFIG.construction.cost[want]
  if (c.stock.ore < cost.ore && under('mine') && canAfford(c, 'mine')) return 'mine'
  if (c.stock.food < cost.food && under('farm') && canAfford(c, 'farm')) return 'farm'
  return null
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * (x, y) に建物を建てると、その 4 近傍のどれか(所有国を問わない)を完全に建物(またはマップ外)で
 * 囲んでしまわないか。囲むと、そのマスにいるユニットは誰にも攻撃されず、動くこともできず、
 * 永遠に取り残されて決着がつかなくなる(§5.4 の反省点)。1 マスでも密閉するなら、その場所には建てない。
 */
export function wouldSeal(world: World, x: number, y: number): boolean {
  const W = world.width
  const H = world.height
  for (const [dx, dy] of DIRS) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
    if (world.buildingAt[ny * W + nx] !== NO_BUILDING) continue // 既に建物ならそのマス自体は気にしない
    let sealedSides = 0
    for (const [ddx, ddy] of DIRS) {
      const mx = nx + ddx
      const my = ny + ddy
      if (mx < 0 || my < 0 || mx >= W || my >= H) {
        sealedSides++
        continue
      }
      if (mx === x && my === y) {
        sealedSides++ // これから建てようとしている建物
        continue
      }
      if (world.buildingAt[my * W + mx] !== NO_BUILDING) sealedSides++
    }
    if (sealedSides >= 4) return true
  }
  return false
}

/** 建設場所: 自国領の空きマスから、周囲の民間人が多く既存建物の近くを選ぶ。通路を塞がない。隣接マスを密閉しない */
function findSite(world: World, c: Country, kind: Buildable): number {
  const W = world.width
  const H = world.height
  const candidates: number[] = []
  for (let i = 0; i < W * H; i++) {
    if (world.owner[i] === c.id && world.buildingAt[i] === NO_BUILDING && world.cellCount[i] === 0) {
      candidates.push(i)
    }
  }
  if (candidates.length === 0) return -1

  const mine = [...world.buildings.values()].filter((b) => b.owner === c.id)
  const rng = world.rng
  const samples = Math.min(CONFIG.construction.candidateSamples, candidates.length)
  const needsWorkers = CONFIG.buildings[kind].minWorkers > 0
  let best = -1
  let bestScore = -Infinity

  for (let s = 0; s < samples; s++) {
    const i = candidates[rng.int(candidates.length)] as number
    const x = i % W
    const y = (i / W) | 0

    // 4 近傍のうち塞がっている(建物/マップ外)数。2 以上なら通路を塞ぐので避ける
    let blocked = 0
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || world.buildingAt[ny * W + nx] !== NO_BUILDING) blocked++
    }
    if (blocked >= 2) continue
    if (wouldSeal(world, x, y)) continue

    let civilians = 0
    let adjBuildings = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const j = ny * W + nx
        if (world.buildingAt[j] !== NO_BUILDING) adjBuildings++
        const cnt = world.cellCount[j] as number
        for (let k = 0; k < cnt; k++) {
          const u = world.units.get(world.cellUnits[j * CONFIG.units.cellCapacity + k] as number)
          if (u && u.owner === c.id && u.kind === 'civilian') civilians++
        }
      }
    }
    let nearest = Infinity
    for (const b of mine) nearest = Math.min(nearest, chebyshev(x, y, b.x, b.y))

    let score = civilians * (needsWorkers ? 1.5 : 0.5) - adjBuildings * 1.2 + rng.next()
    score += nearest <= 4 ? 3 : -Math.min(nearest, 20) * 0.3
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

/** 国 AI の建設(一定間隔・個数上限つき)。建設は即時完了。 */
export function construct(world: World): void {
  const every = CONFIG.construction.interval
  for (const c of world.countries) {
    if (!c.alive || (world.turn + c.id) % every !== 0) continue
    const kind = chooseKind(world, c)
    if (!kind) continue
    const site = findSite(world, c, kind)
    if (site < 0) continue
    const cost = CONFIG.construction.cost[kind]
    c.stock.ore -= cost.ore
    c.stock.food -= cost.food
    const x = site % world.width
    const y = (site / world.width) | 0
    addBuilding(world, kind, c.id, x, y)
    pushEvent(world, 'build', 'normal', [c.id], { x, y }, { kind })
  }
}
