import { CONFIG, PERSONALITY_IDS } from './config'
import { Rng } from './rng'
import {
  NO_BUILDING,
  NO_OWNER,
  NO_UNIT,
  type Building,
  type BuildingKind,
  type Country,
  type CountryFields,
  type GameOptions,
  type PersonalityId,
  type Stance,
  type Unit,
  type UnitKind,
  type World,
} from './types'

const CAP = CONFIG.units.cellCapacity

export function idx(world: World, x: number, y: number): number {
  return y * world.width + x
}

export function inBounds(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height
}

export function levelOf(country: Country) {
  return CONFIG.levels[country.level - 1]!
}

// ---------------------------------------------------------------------------
// ユニット・マスの操作
// ---------------------------------------------------------------------------

export function cellHasRoom(world: World, i: number): boolean {
  return world.buildingAt[i] === NO_BUILDING && (world.cellCount[i] as number) < CAP
}

/** マス i に owner 以外の国のユニットがいるか */
export function cellHasEnemy(world: World, i: number, owner: number): boolean {
  const n = world.cellCount[i] as number
  for (let k = 0; k < n; k++) {
    const u = world.units.get(world.cellUnits[i * CAP + k] as number)
    if (u && u.owner !== owner) return true
  }
  return false
}

export function unitsAt(world: World, i: number): Unit[] {
  const out: Unit[] = []
  const n = world.cellCount[i] as number
  for (let k = 0; k < n; k++) {
    const u = world.units.get(world.cellUnits[i * CAP + k] as number)
    if (u) out.push(u)
  }
  return out
}

function slotAdd(world: World, i: number, id: number): void {
  const n = world.cellCount[i] as number
  world.cellUnits[i * CAP + n] = id
  world.cellCount[i] = n + 1
}

function slotRemove(world: World, i: number, id: number): void {
  const n = world.cellCount[i] as number
  const base = i * CAP
  for (let k = 0; k < n; k++) {
    if (world.cellUnits[base + k] === id) {
      world.cellUnits[base + k] = world.cellUnits[base + n - 1] as number
      world.cellUnits[base + n - 1] = NO_UNIT
      world.cellCount[i] = n - 1
      return
    }
  }
}

export function spawnUnit(
  world: World,
  owner: number,
  kind: UnitKind,
  x: number,
  y: number,
  stance: Stance,
): Unit | null {
  const i = idx(world, x, y)
  if (!cellHasRoom(world, i)) return null
  const soldier = kind === 'soldier'
  const hp = soldier ? CONFIG.units.soldierHp : CONFIG.units.civilianHp
  const country = world.countries[owner]!
  const u: Unit = {
    id: world.nextUnitId++,
    kind,
    owner,
    x,
    y,
    px: x,
    py: y,
    hp,
    maxHp: hp,
    atk: soldier ? levelOf(country).equipAtk * CONFIG.personalities[country.personality].attackMul : CONFIG.units.civilianAtk,
    stance,
    starving: false,
    lastHitBy: NO_OWNER,
  }
  world.units.set(u.id, u)
  slotAdd(world, i, u.id)
  return u
}

export function removeUnit(world: World, u: Unit): void {
  slotRemove(world, idx(world, u.x, u.y), u.id)
  world.units.delete(u.id)
}

/** 移動先の検証は呼び出し側で行う */
export function moveUnit(world: World, u: Unit, x: number, y: number): void {
  slotRemove(world, idx(world, u.x, u.y), u.id)
  u.x = x
  u.y = y
  slotAdd(world, idx(world, x, y), u.id)
}

/** マスの領有国を変更(領土マス数も更新) */
export function setCellOwner(world: World, i: number, newOwner: number): void {
  const old = world.owner[i] as number
  if (old === newOwner) return
  if (old !== NO_OWNER) world.countries[old]!.land--
  world.owner[i] = newOwner
  if (newOwner !== NO_OWNER) world.countries[newOwner]!.land++
}

/** 軍人のみ: 友軍の民間人がいるマスには、満員でも入れる(位置を入れ替える) */
export function hasFriendlyCivilian(world: World, i: number, owner: number): boolean {
  const n = world.cellCount[i] as number
  for (let k = 0; k < n; k++) {
    const u = world.units.get(world.cellUnits[i * CAP + k] as number)
    if (u && u.owner === owner && u.kind === 'civilian') return true
  }
  return false
}

/** ユニット u がマス i へ入れるか(建物が無く、空きがある。軍人は友軍の民間人と入れ替われる) */
export function canEnter(world: World, u: Unit, i: number): boolean {
  if (world.buildingAt[i] !== NO_BUILDING) return false
  if ((world.cellCount[i] as number) < CAP) return true
  return u.kind === 'soldier' && hasFriendlyCivilian(world, i, u.owner)
}

/** a と b の位置を入れ替える(満員のマスへ軍人が入るとき、友軍の民間人と交代する) */
export function swapUnits(world: World, a: Unit, b: Unit): void {
  const ia = idx(world, a.x, a.y)
  const ib = idx(world, b.x, b.y)
  const na = world.cellCount[ia] as number
  const nb = world.cellCount[ib] as number
  let sa = -1
  let sb = -1
  for (let k = 0; k < na; k++) if (world.cellUnits[ia * CAP + k] === a.id) sa = k
  for (let k = 0; k < nb; k++) if (world.cellUnits[ib * CAP + k] === b.id) sb = k
  if (sa < 0 || sb < 0) return
  world.cellUnits[ia * CAP + sa] = b.id
  world.cellUnits[ib * CAP + sb] = a.id
  const ax = a.x
  const ay = a.y
  a.x = b.x
  a.y = b.y
  b.px = b.x
  b.py = b.y
  b.x = ax
  b.y = ay
}

/** マス i の敵ユニット(owner 以外)を out に追加する */
function collectEnemies(world: World, i: number, owner: number, out: Unit[]): void {
  const n = world.cellCount[i] as number
  for (let k = 0; k < n; k++) {
    const u = world.units.get(world.cellUnits[i * CAP + k] as number)
    if (u && u.owner !== owner) out.push(u)
  }
}

/**
 * 攻撃範囲内の敵ユニット。軍人 = 自分のマス + 上下左右(reach)、民間人 = 自分のマスのみ。
 * (満員のマスへ入れなくても、隣から攻撃できる)
 */
export function enemiesInReach(world: World, u: Unit, out: Unit[] = []): Unit[] {
  out.length = 0
  const W = world.width
  const i = u.y * W + u.x
  collectEnemies(world, i, u.owner, out)
  if (u.kind === 'soldier') {
    const r = CONFIG.military.reach
    for (let d = 1; d <= r; d++) {
      if (u.x - d >= 0) collectEnemies(world, i - d, u.owner, out)
      if (u.x + d < W) collectEnemies(world, i + d, u.owner, out)
      if (u.y - d >= 0) collectEnemies(world, i - d * W, u.owner, out)
      if (u.y + d < world.height) collectEnemies(world, i + d * W, u.owner, out)
    }
  }
  return out
}

/** 攻撃範囲に敵がいる(=交戦中で、その場を動かない)か */
export function isEngaged(world: World, u: Unit): boolean {
  const W = world.width
  const i = u.y * W + u.x
  if (cellHasEnemy(world, i, u.owner)) return true
  if (u.kind !== 'soldier') return false
  const r = CONFIG.military.reach
  for (let d = 1; d <= r; d++) {
    if (u.x - d >= 0 && cellHasEnemy(world, i - d, u.owner)) return true
    if (u.x + d < W && cellHasEnemy(world, i + d, u.owner)) return true
    if (u.y - d >= 0 && cellHasEnemy(world, i - d * W, u.owner)) return true
    if (u.y + d < world.height && cellHasEnemy(world, i + d * W, u.owner)) return true
  }
  return false
}

/** 人口の上限(領土に比例)。住居・村はこれに達すると民間人を生産しない */
export function populationCap(country: Country): number {
  return Math.max(CONFIG.population.minCap, Math.floor(country.land * CONFIG.population.density))
}

// ---------------------------------------------------------------------------
// 建物
// ---------------------------------------------------------------------------

export function addBuilding(world: World, kind: BuildingKind, owner: number, x: number, y: number): Building {
  const b: Building = {
    id: world.nextBuildingId++,
    kind,
    owner,
    x,
    y,
    progress: 0,
    workers: 0,
    efficiency: 1,
    status: 'ok',
  }
  const i = idx(world, x, y)
  world.buildings.set(b.id, b)
  world.buildingAt[i] = b.id
  setCellOwner(world, i, owner)
  return b
}

export function buildingAtCell(world: World, i: number): Building | undefined {
  const id = world.buildingAt[i] as number
  return id === NO_BUILDING ? undefined : world.buildings.get(id)
}

export function countBuildings(world: World, owner: number): Record<BuildingKind, number> {
  const c: Record<BuildingKind, number> = { village: 0, house: 0, mine: 0, farm: 0, workshop: 0 }
  for (const b of world.buildings.values()) if (b.owner === owner) c[b.kind]++
  return c
}

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------

/** 国ごとの民間人・軍人・村の数を数え直す */
export function refreshPopulation(world: World): void {
  for (const c of world.countries) {
    c.civilians = 0
    c.soldiers = 0
    c.villages = 0
    c.buildingCount = 0
  }
  for (const u of world.units.values()) {
    const c = world.countries[u.owner]!
    if (u.kind === 'soldier') c.soldiers++
    else c.civilians++
  }
  for (const b of world.buildings.values()) {
    const c = world.countries[b.owner]!
    if (b.kind === 'village') c.villages++
    c.buildingCount++
  }
}

// ---------------------------------------------------------------------------
// ワールド生成
// ---------------------------------------------------------------------------

function emptyFields(size: number): CountryFields {
  return {
    work: new Int16Array(size),
    expand: new Int16Array(size),
    attack: new Int16Array(size),
    defend: new Int16Array(size),
    home: new Int16Array(size),
    guard: new Int16Array(size),
    workAt: -999,
    expandAt: -999,
    attackAt: -999,
    defendAt: -999,
    homeAt: -999,
    guardAt: -999,
    attackFor: -2,
    hasWork: false,
    hasExpand: false,
    hasAttack: false,
    hasDefend: false,
    hasHome: false,
    hasGuard: false,
    understaffed: false,
  }
}

function assignPersonalities(rng: Rng, options: GameOptions): PersonalityId[] {
  const n = options.countryCount
  // 指定が無い国は 3 種を均等に巡回させる(偏りを避ける)
  const pool: PersonalityId[] = []
  while (pool.length < n) pool.push(...rng.shuffle([...PERSONALITY_IDS]))
  const out: PersonalityId[] = []
  let p = 0
  for (let i = 0; i < n; i++) {
    const want = options.personalities?.[i]
    if (want && want !== 'random') out.push(want)
    else out.push(pool[p++] as PersonalityId)
  }
  return out
}

/** 村どうしの最低距離を確保しながら、なるべく離して置く(best-candidate) */
function placeVillages(world: World, rng: Rng, n: number): { x: number; y: number }[] {
  const m = CONFIG.world.edgeMargin
  const pts: { x: number; y: number }[] = []
  for (let k = 0; k < n; k++) {
    let best: { x: number; y: number } | null = null
    let bestD = -1
    const samples = k === 0 ? 1 : 300
    for (let s = 0; s < samples; s++) {
      const x = m + rng.int(world.width - 2 * m)
      const y = m + rng.int(world.height - 2 * m)
      let d = Infinity
      for (const p of pts) d = Math.min(d, Math.hypot(p.x - x, p.y - y))
      if (d > bestD) {
        bestD = d
        best = { x, y }
      }
    }
    pts.push(best!)
  }
  return pts
}

function settlerStance(world: World): Stance {
  return world.rng.chance(CONFIG.ai.settlerRatio) ? 'expand' : 'work'
}

export function createWorld(options: GameOptions): World {
  const width = CONFIG.width
  const height = CONFIG.height
  const size = width * height
  const n = Math.max(CONFIG.minCountries, Math.min(CONFIG.maxCountries, options.countryCount))
  const opts: GameOptions = { ...options, countryCount: n }
  const rng = new Rng(opts.seed)

  const personalities = assignPersonalities(rng, opts)
  const countries: Country[] = []
  for (let i = 0; i < n; i++) {
    countries.push({
      id: i,
      name: `${CONFIG.names[i]}国`,
      color: CONFIG.colors[i] as string,
      personality: personalities[i] as PersonalityId,
      alive: true,
      level: 1,
      stock: {
        food: CONFIG.world.initialFood,
        ore: CONFIG.world.initialOre,
        equipment: CONFIG.world.initialEquipment,
      },
      mobilized: false,
      starving: false,
      lastThreatTurn: -9999,
      lostBuildingTurn: -9999,
      flowFood: 0,
      flowOre: 0,
      land: 0,
      peakLand: 0,
      civilians: 0,
      soldiers: 0,
      villages: 0,
      buildingCount: 0,
      noBuildingTurns: 0,
      warTarget: -1,
      posture: 'peace',
      snipe: false,
      standoffTurns: 0,
      strategyAt: -999,
      counters: { kills: 0, civilianDeaths: 0, soldierDeaths: 0, occupied: 0, lost: 0, starved: 0 },
    })
  }

  const world: World = {
    width,
    height,
    turn: 0,
    seed: opts.seed,
    options: opts,
    rng,
    owner: new Uint8Array(size).fill(NO_OWNER),
    buildingAt: new Int32Array(size).fill(NO_BUILDING),
    cellCount: new Uint8Array(size),
    cellUnits: new Int32Array(size * CAP).fill(NO_UNIT),
    units: new Map(),
    buildings: new Map(),
    nextUnitId: 1,
    nextBuildingId: 1,
    countries,
    fields: countries.map(() => emptyFields(size)),
    samples: countries.map(() => []),
    sampleInterval: CONFIG.stats.interval,
    events: [],
    nextEventId: 1,
    battles: new Map(),
    fightCells: new Set(),
    hits: [],
    contactPairs: new Set(),
    winner: null,
  }

  const villages = placeVillages(world, rng, n)
  const R = CONFIG.world.initialRadius
  for (let c = 0; c < n; c++) {
    const v = villages[c]!
    // 初期領土
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = v.x + dx
        const y = v.y + dy
        if (inBounds(world, x, y)) setCellOwner(world, idx(world, x, y), c)
      }
    }
    addBuilding(world, 'village', c, v.x, v.y)

    // デフォルト建物: 距離 2 のマスから、互いに隣り合わない 3 か所へ 畑・鉱山・住居
    const ring2: { x: number; y: number }[] = []
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) ring2.push({ x: v.x + dx, y: v.y + dy })
      }
    }
    rng.shuffle(ring2)
    const kinds: BuildingKind[] = ['farm', 'mine', 'house']
    const placed: { x: number; y: number }[] = []
    for (const cell of ring2) {
      if (placed.length >= kinds.length) break
      if (placed.some((p) => Math.max(Math.abs(p.x - cell.x), Math.abs(p.y - cell.y)) <= 1)) continue
      addBuilding(world, kinds[placed.length] as BuildingKind, c, cell.x, cell.y)
      placed.push(cell)
    }

    // 初期民間人: 村の 8 近傍へ
    const ring1: { x: number; y: number }[] = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) ring1.push({ x: v.x + dx, y: v.y + dy })
    }
    rng.shuffle(ring1)
    for (let k = 0; k < CONFIG.world.initialCivilians; k++) {
      const cell = ring1[k % ring1.length]!
      spawnUnit(world, c, 'civilian', cell.x, cell.y, settlerStance(world))
    }
  }

  refreshPopulation(world)
  for (const c of countries) c.peakLand = c.land
  return world
}
