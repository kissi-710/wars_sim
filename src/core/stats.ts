import { CONFIG } from './config'
import type { World } from './types'

/** 一定ターンごとに国別のサンプルを記録する。上限を超えたら間引いて長期間を保持する。 */
export function recordStats(world: World): void {
  if (world.turn % world.sampleInterval !== 0) return
  for (const c of world.countries) {
    world.samples[c.id]!.push({
      turn: world.turn,
      land: c.land,
      civilians: c.civilians,
      soldiers: c.soldiers,
      food: Math.round(c.stock.food),
      ore: Math.round(c.stock.ore),
      equipment: c.stock.equipment,
    })
  }
  if ((world.samples[0]?.length ?? 0) > CONFIG.stats.maxSamples) {
    world.samples = world.samples.map((s) => s.filter((_, i) => i % 2 === 0))
    world.sampleInterval *= 2
  }
}
