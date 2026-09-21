import { CONFIG } from '../config'
import { INF } from '../fields'
import { localBalance, shouldRetreat, type SoldierMap } from '../tactics'
import { canEnter, cellHasEnemy, isEngaged } from '../world'
import { NO_OWNER, type Unit, type World } from '../types'

const DX = [1, -1, 0, 0]
const DY = [0, 0, 1, -1]

/** 4 近傍のうち、field が現在マスより小さい移動先(最小のもの。同値はランダム)。無ければ -1 */
function stepDown(world: World, u: Unit, field: Int16Array): number {
  const W = world.width
  const here = u.y * W + u.x
  const cur = field[here] as number
  let best = -1
  let bestD = cur
  let ties = 0
  for (let k = 0; k < 4; k++) {
    const x = u.x + (DX[k] as number)
    const y = u.y + (DY[k] as number)
    if (x < 0 || y < 0 || x >= W || y >= world.height) continue
    const j = y * W + x
    if (!canEnter(world, u, j)) continue
    const d = field[j] as number
    if (d >= INF || d >= cur) continue
    if (d < bestD) {
      bestD = d
      best = j
      ties = 1
    } else if (d === bestD) {
      ties++
      if (world.rng.int(ties) === 0) best = j
    }
  }
  return best
}

/** 4 近傍からランダムに 1 マス。ownOnly なら自国領のみ。敵のいるマスへは入らない */
function randomStep(world: World, u: Unit, ownOnly: boolean): number {
  const W = world.width
  const opts: number[] = []
  for (let k = 0; k < 4; k++) {
    const x = u.x + (DX[k] as number)
    const y = u.y + (DY[k] as number)
    if (x < 0 || y < 0 || x >= W || y >= world.height) continue
    const j = y * W + x
    if (!canEnter(world, u, j)) continue
    if (ownOnly && world.owner[j] !== u.owner) continue
    if (cellHasEnemy(world, j, u.owner)) continue
    opts.push(j)
  }
  return opts.length > 0 ? (opts[world.rng.int(opts.length)] as number) : -1
}

function civilianMove(world: World, u: Unit, map: SoldierMap): number {
  const f = world.fields[u.owner]!
  const here = u.y * world.width + u.x
  const rng = world.rng

  // 危険回避: 周囲 2 マスに敵軍人が多いときは、自国の建物のそばへ逃げる
  const bal = localBalance(map, u.owner, u.x, u.y, 2)
  if (bal.foes >= 2 && bal.foes > bal.friends && f.hasHome && (f.home[here] as number) > 0 && (f.home[here] as number) < INF) {
    const j = stepDown(world, u, f.home)
    if (j >= 0) return j
  }

  // 開拓者は、稼働できていない建物(作業員不足)がある間は作業員として働く。経済が回ってから領土を広げる
  const settler = u.stance === 'expand' && !(f.understaffed && f.hasWork)
  if (settler && f.hasExpand && (f.expand[here] as number) < INF) {
    if (rng.chance(CONFIG.ai.expandWander)) return randomStep(world, u, false)
    const j = stepDown(world, u, f.expand)
    if (j >= 0) return j
    return rng.chance(0.3) ? randomStep(world, u, false) : -1
  }

  if (f.hasWork) {
    const d = f.work[here] as number
    if (d === 0) return rng.chance(CONFIG.ai.workerWander) ? randomStep(world, u, true) : -1
    if (d < INF) {
      const j = stepDown(world, u, f.work)
      if (j >= 0) return j
      return rng.chance(0.3) ? randomStep(world, u, true) : -1
    }
  }
  return rng.chance(0.3) ? randomStep(world, u, true) : -1
}

/**
 * 軍人の行動(優先順):
 *  1. 周囲で圧倒的に不利なら撤退  2. 攻撃範囲に敵がいれば、その場で戦う(動かない)
 *  3. 総動員中は自国領の敵へ  4. 構えが「侵攻」なら攻撃目標へ(侵攻役は優先、他も無所有地が尽きたら合流)
 *  5. 無所有地を広げる  6. 国境の警戒線へ
 */
function soldierMove(world: World, u: Unit, map: SoldierMap): number {
  const c = world.countries[u.owner]!
  const f = world.fields[u.owner]!
  const W = world.width
  const here = u.y * W + u.x
  const rng = world.rng

  if (f.hasHome && shouldRetreat(map, u.owner, u.x, u.y) && (f.home[here] as number) > 0 && (f.home[here] as number) < INF) {
    const j = stepDown(world, u, f.home)
    if (j >= 0) return j
  }

  if (isEngaged(world, u)) return -1

  if (c.mobilized && f.hasDefend && (f.defend[here] as number) > 0 && (f.defend[here] as number) < INF) {
    const j = stepDown(world, u, f.defend)
    if (j >= 0) return j
  }

  const attacking = c.posture === 'attack' && f.hasAttack && (f.attack[here] as number) < INF
  const canExpand = f.hasExpand && (f.expand[here] as number) < INF

  if (attacking && u.stance === 'attack') {
    const j = stepDown(world, u, f.attack)
    if (j >= 0) return j
  }
  if (canExpand) {
    if (rng.chance(CONFIG.ai.expandWander)) {
      const r = randomStep(world, u, false)
      if (r >= 0) return r
    }
    const j = stepDown(world, u, f.expand)
    if (j >= 0) return j
  } else if (attacking) {
    // 無所有地が尽きたら、全員で侵攻に合流する
    const j = stepDown(world, u, f.attack)
    if (j >= 0) return j
  }
  if (f.hasGuard && (f.guard[here] as number) > 0 && (f.guard[here] as number) < INF) {
    const j = stepDown(world, u, f.guard)
    if (j >= 0) return j
  }
  return rng.chance(0.3) ? randomStep(world, u, true) : -1
}

/** ユニットの移動先マス(移動しないなら -1) */
export function decideMove(world: World, u: Unit, map: SoldierMap): number {
  const here = u.y * world.width + u.x
  if (u.kind === 'civilian') {
    // 民間人は同じマスに敵がいる間は動かない
    if (cellHasEnemy(world, here, u.owner)) return -1
    if (world.owner[here] === NO_OWNER && u.stance !== 'expand') {
      // 無所有地に迷い込んだ働き手は自国領を目指す(work 場がそこでは INF になるため)
      return randomStep(world, u, false)
    }
    return civilianMove(world, u, map)
  }
  return soldierMove(world, u, map)
}
