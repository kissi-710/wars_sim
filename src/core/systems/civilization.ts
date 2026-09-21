import { CONFIG } from '../config'
import { pushEvent } from '../events'
import type { Country, World } from '../types'

/** 次のレベルの条件(領土 かつ 食料在庫 かつ 鉱物在庫)を満たしているか */
export function nextLevelProgress(c: Country) {
  const next = CONFIG.levels[c.level]
  if (!next) return null
  return {
    name: next.name,
    land: { now: c.land, need: next.minLand },
    food: { now: c.stock.food, need: next.minFood },
    ore: { now: c.stock.ore, need: next.minOre },
    ok: c.land >= next.minLand && c.stock.food >= next.minFood && c.stock.ore >= next.minOre,
  }
}

/** 文明レベルの判定(上がるのみ。降格しない) */
export function updateCivilization(world: World): void {
  for (const c of world.countries) {
    if (!c.alive) continue
    for (;;) {
      const p = nextLevelProgress(c)
      if (!p || !p.ok) break
      c.level++
      pushEvent(world, 'levelUp', 'major', [c.id], undefined, { level: c.level, name: p.name })
    }
  }
}
