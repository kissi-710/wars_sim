import { NO_BUILDING, NO_OWNER, NO_UNIT, type World } from '../src/core/types'
import { createWorld } from '../src/core/world'

/** 何も置かれていない世界(国だけがある)を作る。テストで状況を自由に組み立てるため。 */
export function emptyWorld(countryCount = 2, seed = 1): World {
  const w = createWorld({ seed, countryCount })
  w.units.clear()
  w.buildings.clear()
  w.cellCount.fill(0)
  w.cellUnits.fill(NO_UNIT)
  w.buildingAt.fill(NO_BUILDING)
  w.owner.fill(NO_OWNER)
  for (const c of w.countries) {
    c.land = 0
    c.civilians = 0
    c.soldiers = 0
    c.villages = 0
    c.stock = { food: 0, ore: 0, equipment: 0 }
  }
  w.events = []
  return w
}

/** (x0..x1, y0..y1) を国 c の領土にする */
export function claim(w: World, c: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w.width + x
      const old = w.owner[i] as number
      if (old !== NO_OWNER) w.countries[old]!.land--
      w.owner[i] = c
      w.countries[c]!.land++
    }
  }
}
