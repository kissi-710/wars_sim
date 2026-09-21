import { CONFIG } from '../config'
import { setCellOwner } from '../world'
import type { World } from '../types'

/**
 * 領土の更新: ユニットが 1 つの国だけのマスは、その国のものになる(spec §3.3)。
 * 敵と同居中のマスは、戦闘が決着するまで変わらない。
 */
export function updateTerritory(world: World): void {
  const cap = CONFIG.units.cellCapacity
  const size = world.width * world.height
  for (let i = 0; i < size; i++) {
    const n = world.cellCount[i] as number
    if (n === 0) continue
    const first = world.units.get(world.cellUnits[i * cap] as number)
    if (!first) continue
    let same = true
    for (let k = 1; k < n; k++) {
      const u = world.units.get(world.cellUnits[i * cap + k] as number)
      if (u && u.owner !== first.owner) {
        same = false
        break
      }
    }
    if (same && world.owner[i] !== first.owner) setCellOwner(world, i, first.owner)
  }
}
