import { buildSoldierMap } from '../tactics'
import { cellHasRoom, idx, moveUnit, swapUnits, unitsAt } from '../world'
import type { World } from '../types'
import { decideMove } from './ai'

/**
 * 全ユニットをランダム順に 1 体ずつ移動させる(枠の競合を逐次処理で解決)。
 * 軍人は、満員のマスでも友軍の民間人がいれば位置を入れ替えて入れる(民間人の渋滞で前線が動けなくなるのを防ぐ)。
 */
export function moveUnits(world: World): void {
  const map = buildSoldierMap(world)
  const ids = Array.from(world.units.keys())
  world.rng.shuffle(ids)
  for (const id of ids) {
    const u = world.units.get(id)
    if (!u) continue
    u.px = u.x
    u.py = u.y
    const dest = decideMove(world, u, map)
    if (dest < 0) continue
    const x = dest % world.width
    const y = (dest / world.width) | 0
    if (cellHasRoom(world, dest)) {
      moveUnit(world, u, x, y)
      continue
    }
    if (u.kind !== 'soldier') continue
    const civ = unitsAt(world, dest).find((o) => o.owner === u.owner && o.kind === 'civilian')
    if (civ && idx(world, civ.x, civ.y) === dest) swapUnits(world, u, civ)
  }
}
