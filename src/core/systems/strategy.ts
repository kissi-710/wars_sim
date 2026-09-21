import { CONFIG } from '../config'
import { pushEvent } from '../events'
import { NO_OWNER, type Country, type World } from '../types'

/** 国の強さ(軍人の数 + 装備の在庫)。文明レベルが高いほど軍人 1 体が強い。 */
export function strength(c: Country): number {
  return c.soldiers * (1 + 0.15 * (c.level - 1)) + c.stock.equipment * CONFIG.strategy.equipPower
}

/** 国境の長さ: 領土が 4 近傍で接している辺の数(border[a * n + b])。 */
function borderLengths(world: World): Int32Array {
  const n = world.countries.length
  const W = world.width
  const H = world.height
  const border = new Int32Array(n * n)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const a = world.owner[i] as number
      if (a === NO_OWNER) continue
      if (x < W - 1) {
        const b = world.owner[i + 1] as number
        if (b !== NO_OWNER && b !== a) {
          border[a * n + b] = (border[a * n + b] as number) + 1
          border[b * n + a] = (border[b * n + a] as number) + 1
        }
      }
      if (y < H - 1) {
        const b = world.owner[i + W] as number
        if (b !== NO_OWNER && b !== a) {
          border[a * n + b] = (border[a * n + b] as number) + 1
          border[b * n + a] = (border[b * n + a] as number) + 1
        }
      }
    }
  }
  return border
}

/**
 * 国の戦略(一定間隔で見直す):
 *  - 攻撃目標: 国境が長く(近く)、自国より弱い国ほど有利。
 *  - 侵攻するか: 強さの比が、性格で決まるしきい値(好戦的ほど低い)以上のとき。軍人が少ないうちは侵攻しない。
 *  - 相手がごく弱ければ、村を直接狙う(首狩り)。
 */
export function updateStrategy(world: World): void {
  const cfg = CONFIG.strategy
  if (world.turn % cfg.interval !== 0) return
  const n = world.countries.length
  const border = borderLengths(world)

  for (const c of world.countries) {
    if (!c.alive) {
      c.warTarget = -1
      c.posture = 'peace'
      c.snipe = false
      continue
    }
    const aggr = CONFIG.personalities[c.personality].aggression
    const mine = strength(c)

    let best = -1
    let bestScore = -1
    let bestRatio = 0
    let touching = false
    for (const e of world.countries) {
      if (e.id === c.id || !e.alive) continue
      const b = border[c.id * n + e.id] as number
      if (b > 0) touching = true
      const ratio = mine / (strength(e) + 4)
      const near = b > 0 ? 1 + Math.min(b, 40) / 40 : 0.25
      const score = near * Math.min(ratio, 5)
      if (score > bestScore) {
        bestScore = score
        best = e.id
        bestRatio = ratio
      }
    }

    const threshold = cfg.thresholdBase - cfg.thresholdAggr * aggr
    const reachable = best >= 0 && ((border[c.id * n + best] as number) > 0 || aggr >= 0.5)
    const attack = reachable && c.soldiers >= cfg.minSoldiers && bestRatio >= threshold

    const prev = c.warTarget
    c.warTarget = attack ? best : -1
    c.snipe = attack && strength(world.countries[best]!) <= mine * cfg.snipeRatio
    c.posture = attack ? 'attack' : c.mobilized || touching ? 'defend' : 'peace'
    if (attack && prev !== best) {
      pushEvent(world, 'declare', 'normal', [c.id, best], undefined, { snipe: c.snipe ? 1 : 0 })
    }
  }
}
