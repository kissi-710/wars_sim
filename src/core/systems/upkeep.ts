import { CONFIG } from '../config'
import { pushEvent } from '../events'
import { removeUnit } from '../world'
import type { Unit, World } from '../types'

/**
 * 軍人の維持費(食料)。民間人には維持費なし。
 * 支払えなかった軍人は飢餓ダメージを受け、HP が 0 になると消滅する。支払う順番はランダム。
 */
export function applyUpkeep(world: World): void {
  const cost = CONFIG.military.upkeepFood
  const soldiersBy: Unit[][] = world.countries.map(() => [])
  for (const u of world.units.values()) if (u.kind === 'soldier') soldiersBy[u.owner]!.push(u)

  for (const c of world.countries) {
    const soldiers = soldiersBy[c.id]!
    if (!c.alive || soldiers.length === 0) {
      c.starving = false
      continue
    }
    const total = soldiers.length * cost
    if (c.stock.food >= total) {
      c.stock.food -= total
      for (const u of soldiers) u.starving = false
      c.starving = false
      continue
    }

    world.rng.shuffle(soldiers)
    let starved = 0
    let lost = 0
    for (const u of soldiers) {
      if (c.stock.food >= cost) {
        c.stock.food -= cost
        u.starving = false
        continue
      }
      u.starving = true
      u.hp -= CONFIG.military.starveDamage
      starved++
      if (u.hp <= 0) {
        removeUnit(world, u)
        c.counters.soldierDeaths++
        c.counters.starved++
        lost++
      }
    }
    if (c.stock.food < 0) c.stock.food = 0
    if (starved > 0 && !c.starving) {
      c.starving = true
      pushEvent(world, 'starve', 'normal', [c.id], undefined, { soldiers: starved })
    }
    if (lost > 0) pushEvent(world, 'starve', 'minor', [c.id], undefined, { soldiers: starved, lost })
  }
}
