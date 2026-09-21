import { CONFIG } from './config'
import { NO_BUILDING, NO_OWNER, type Country, type CountryFields, type World } from './types'

/** BFS の「到達不能」を表す値 */
export const INF = 32767

let queue = new Int32Array(0)

function bfs(world: World, dist: Int16Array, sources: number[], passable: (i: number) => boolean): void {
  const W = world.width
  const H = world.height
  if (queue.length < W * H) queue = new Int32Array(W * H)
  dist.fill(INF)
  let head = 0
  let tail = 0
  for (const s of sources) {
    if (dist[s] === INF) {
      dist[s] = 0
      queue[tail++] = s
    }
  }
  while (head < tail) {
    const i = queue[head++] as number
    const d = (dist[i] as number) + 1
    const x = i % W
    const y = (i / W) | 0
    if (x > 0 && dist[i - 1] === INF && passable(i - 1)) {
      dist[i - 1] = d
      queue[tail++] = i - 1
    }
    if (x < W - 1 && dist[i + 1] === INF && passable(i + 1)) {
      dist[i + 1] = d
      queue[tail++] = i + 1
    }
    if (y > 0 && dist[i - W] === INF && passable(i - W)) {
      dist[i - W] = d
      queue[tail++] = i - W
    }
    if (y < H - 1 && dist[i + W] === INF && passable(i + W)) {
      dist[i + W] = d
      queue[tail++] = i + W
    }
  }
}

function computeWork(world: World, c: number, f: CountryFields): void {
  const W = world.width
  const full = CONFIG.efficiency.fullPeople
  // 第 1 優先: 稼働に民間人が要る建物(鉱山/畑/工房)。無ければ 住居/村
  const tier1: number[] = []
  const tier2: number[] = []
  f.understaffed = false
  for (const b of world.buildings.values()) {
    if (b.owner !== c) continue
    const min = CONFIG.buildings[b.kind].minWorkers
    if (min > 0 && b.workers < min) f.understaffed = true
    if (b.workers >= full) continue
    const cellsOf = CONFIG.buildings[b.kind].minWorkers > 0 ? tier1 : tier2
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const x = b.x + dx
        const y = b.y + dy
        if (x < 0 || y < 0 || x >= W || y >= world.height) continue
        const j = y * W + x
        if (world.buildingAt[j] === NO_BUILDING && world.owner[j] === c) cellsOf.push(j)
      }
    }
  }
  const sources = tier1.length > 0 ? tier1 : tier2
  f.hasWork = sources.length > 0
  bfs(world, f.work, sources, (j) => world.buildingAt[j] === NO_BUILDING && world.owner[j] === c)
}

function computeExpand(world: World, c: number, f: CountryFields): void {
  const W = world.width
  const H = world.height
  const sources: number[] = []
  const seen = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    if (world.owner[i] !== c) continue
    const x = i % W
    const y = (i / W) | 0
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]
    for (const j of nb) {
      if (j >= 0 && !seen[j] && world.owner[j] === NO_OWNER && world.buildingAt[j] === NO_BUILDING) {
        seen[j] = 1
        sources.push(j)
      }
    }
  }
  f.hasExpand = sources.length > 0
  // 自国領と無所有地だけを通る(敵領へは入らない)
  bfs(world, f.expand, sources, (j) => {
    const o = world.owner[j]
    return world.buildingAt[j] === NO_BUILDING && (o === c || o === NO_OWNER)
  })
}

/** 攻撃目標: 戦略で選んだ国(warTarget)の建物の占領判定範囲。首狩りなら村だけ。 */
function computeAttack(world: World, country: Country, f: CountryFields): void {
  const W = world.width
  const H = world.height
  const R = CONFIG.occupation.radius
  const c = country.id
  const target = country.warTarget
  f.attackFor = target
  const sources: number[] = []
  if (target >= 0 && world.countries[target]!.alive) {
    let list = [...world.buildings.values()].filter((b) => b.owner === target)
    if (country.snipe) {
      const villages = list.filter((b) => b.kind === 'village')
      if (villages.length > 0) list = villages
    }
    for (const b of list) {
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const x = b.x + dx
          const y = b.y + dy
          if (x < 0 || y < 0 || x >= W || y >= H) continue
          const j = y * W + x
          if (world.buildingAt[j] === NO_BUILDING && world.owner[j] !== c) sources.push(j)
        }
      }
    }
  }
  f.hasAttack = sources.length > 0
  bfs(world, f.attack, sources, (j) => world.buildingAt[j] === NO_BUILDING)
}

function computeDefend(world: World, c: number, f: CountryFields): void {
  const sources: number[] = []
  for (const u of world.units.values()) {
    if (u.owner === c) continue
    const i = u.y * world.width + u.x
    if (world.owner[i] === c) sources.push(i)
  }
  f.hasDefend = sources.length > 0
  bfs(world, f.defend, sources, (j) => world.buildingAt[j] === NO_BUILDING)
}

/** 撤退先: 自国の建物のそば(自国領) */
function computeHome(world: World, c: number, f: CountryFields): void {
  const W = world.width
  const sources: number[] = []
  for (const b of world.buildings.values()) {
    if (b.owner !== c) continue
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = b.x + dx
      const y = b.y + dy
      if (x < 0 || y < 0 || x >= W || y >= world.height) continue
      const j = y * W + x
      if (world.buildingAt[j] === NO_BUILDING && world.owner[j] === c) sources.push(j)
    }
  }
  f.hasHome = sources.length > 0
  bfs(world, f.home, sources, (j) => world.buildingAt[j] === NO_BUILDING)
}

/** 警戒線: 自国領のうち、他の生存国の領土と接している国境沿いのマス */
function computeGuard(world: World, c: number, f: CountryFields): void {
  const W = world.width
  const H = world.height
  const sources: number[] = []
  for (let i = 0; i < W * H; i++) {
    if (world.owner[i] !== c || world.buildingAt[i] !== NO_BUILDING) continue
    const x = i % W
    const y = (i / W) | 0
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]
    for (const j of nb) {
      if (j < 0) continue
      const o = world.owner[j] as number
      if (o !== NO_OWNER && o !== c && world.countries[o]!.alive) {
        sources.push(i)
        break
      }
    }
  }
  f.hasGuard = sources.length > 0
  bfs(world, f.guard, sources, (j) => world.buildingAt[j] === NO_BUILDING && world.owner[j] === c)
}

/** 各国の距離場を、間隔が経過したものだけ再計算する */
export function refreshFields(world: World): void {
  const every = CONFIG.ai.fieldInterval
  for (const c of world.countries) {
    if (!c.alive) continue
    const f = world.fields[c.id]!
    if (world.turn - f.workAt >= every) {
      computeWork(world, c.id, f)
      f.workAt = world.turn
    }
    if (world.turn - f.expandAt >= every) {
      computeExpand(world, c.id, f)
      f.expandAt = world.turn
    }
    if (world.turn - f.attackAt >= every || f.attackFor !== c.warTarget) {
      computeAttack(world, c, f)
      f.attackAt = world.turn
    }
    if (world.turn - f.homeAt >= every) {
      computeHome(world, c.id, f)
      f.homeAt = world.turn
    }
    if (world.turn - f.guardAt >= every) {
      computeGuard(world, c.id, f)
      f.guardAt = world.turn
    }
    // 防衛は敵が動くので短い間隔で、総動員中のみ計算
    if (c.mobilized && world.turn - f.defendAt >= 2) {
      computeDefend(world, c.id, f)
      f.defendAt = world.turn
    } else if (!c.mobilized) {
      f.hasDefend = false
    }
  }
}
