import { CONFIG } from '../config'
import { pushEvent } from '../events'
import { enemiesInReach, removeUnit } from '../world'
import type { BattleRecord, Unit, World } from '../types'

/** 戦闘のまとまりを区切るマス数(この範囲内の戦闘は 1 件にまとめてログに出す) */
const BLOCK = 8
/** 戦闘が途切れてからログに確定するまでのターン数 */
const IDLE_TURNS = 4
/** 1 ターンに記録する攻撃線の上限(描画負荷の抑制) */
const MAX_HITS = 3000

function pairKey(a: number, b: number): number {
  return a < b ? a * 256 + b : b * 256 + a
}

function regionKey(world: World, i: number): number {
  const x = i % world.width
  const y = (i / world.width) | 0
  return ((y / BLOCK) | 0) * Math.ceil(world.width / BLOCK) + ((x / BLOCK) | 0)
}

/**
 * 攻撃対象の選択。
 * - 民間人: 同じマスの敵からランダム。
 * - 軍人: 攻撃範囲(自分のマス + 上下左右)の敵のうち、軍人を優先し、残り HP が最も少ない敵を集中攻撃する
 *   (すでに味方の攻撃で倒れる見込みの敵は避ける)。
 */
function chooseTarget(world: World, a: Unit, targets: Unit[], pending: Map<number, number>): Unit {
  if (a.kind !== 'soldier') return targets[world.rng.int(targets.length)] as Unit
  let best: Unit | null = null
  let bestKey = Infinity
  for (const t of targets) {
    const remain = t.hp - (pending.get(t.id) ?? 0)
    if (remain <= 0) continue
    // 軍人を優先(民間人は +1000)。同じ種別なら残り HP が少ないほど優先
    const key = (t.kind === 'soldier' ? 0 : 1000) + remain
    if (key < bestKey) {
      bestKey = key
      best = t
    }
  }
  return best ?? (targets[world.rng.int(targets.length)] as Unit)
}

/**
 * 戦闘(spec §8): 各ユニットが攻撃範囲内の敵を 1 体攻撃し、ダメージは同時に適用する。
 * 軍人の攻撃範囲は「自分のマスと上下左右の隣接マス」、民間人は「自分のマス」。
 * ダメージ = 攻撃力 ×(自国領に立っているなら防衛補正)。HP ≤ 0 で消滅。
 */
export function resolveCombat(world: World): void {
  world.fightCells.clear()
  world.hits.length = 0

  const pending = new Map<number, number>()
  const hitBy = new Map<number, number>()
  const buf: Unit[] = []
  const W = world.width

  for (const a of world.units.values()) {
    const targets = enemiesInReach(world, a, buf)
    if (targets.length === 0) continue
    const t = chooseTarget(world, a, targets, pending)
    const from = a.y * W + a.x
    const to = t.y * W + t.x
    const bonus = world.owner[from] === a.owner ? CONFIG.military.defenseBonus : 1
    pending.set(t.id, (pending.get(t.id) ?? 0) + a.atk * bonus)
    hitBy.set(t.id, a.owner)
    world.fightCells.add(from)
    world.fightCells.add(to)
    if (world.hits.length < MAX_HITS * 2) world.hits.push(from, to)

    // 接触(初めて戦った国の組)
    const key = pairKey(a.owner, t.owner)
    if (!world.contactPairs.has(key)) {
      world.contactPairs.add(key)
      pushEvent(world, 'contact', 'normal', [a.owner, t.owner], { x: to % W, y: (to / W) | 0 })
    }
  }

  for (const [id, d] of pending) {
    const u = world.units.get(id)
    if (!u) continue
    const at = u.y * W + u.x
    const rk = regionKey(world, at)
    let rec = world.battles.get(rk)
    if (!rec) {
      rec = { start: world.turn, last: world.turn, countries: [], losses: {}, pos: { x: u.x, y: u.y } } as BattleRecord
      world.battles.set(rk, rec)
    }
    rec.last = world.turn
    if (!rec.countries.includes(u.owner)) rec.countries.push(u.owner)
    const hb = hitBy.get(id) as number
    if (!rec.countries.includes(hb)) rec.countries.push(hb)

    u.hp -= d
    u.lastHitBy = hb
    if (u.hp > 0) continue
    const c = world.countries[u.owner]!
    if (u.kind === 'soldier') c.counters.soldierDeaths++
    else c.counters.civilianDeaths++
    world.countries[hb]!.counters.kills++
    rec.losses[u.owner] = (rec.losses[u.owner] ?? 0) + 1
    removeUnit(world, u)
  }

  // しばらく戦闘が無い区域は、まとめ行として確定する
  for (const [rk, rec] of world.battles) {
    if (world.turn - rec.last < IDLE_TURNS) continue
    world.battles.delete(rk)
    let total = 0
    const data: Record<string, number | string> = { duration: rec.last - rec.start + 1 }
    for (const c of rec.countries) {
      const l = rec.losses[c] ?? 0
      total += l
      data[`l${c}`] = l
    }
    data.total = total
    if (total === 0) continue
    pushEvent(world, 'battle', total >= CONFIG.events.bigBattleLosses ? 'normal' : 'minor', rec.countries, rec.pos, data)
  }
}
