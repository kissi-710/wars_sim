import { pushEvent } from './events'
import { refreshFields } from './fields'
import { recordStats } from './stats'
import { refreshPopulation } from './world'
import { updateCivilization } from './systems/civilization'
import { resolveCombat } from './systems/combat'
import { construct } from './systems/construction'
import { computeEfficiency } from './systems/efficiency'
import { updateMobilization } from './systems/mobilization'
import { moveUnits } from './systems/movement'
import { checkOccupation } from './systems/occupation'
import { updateStrategy } from './systems/strategy'
import { produce } from './systems/production'
import { updateTerritory } from './systems/territory'
import { applyUpkeep } from './systems/upkeep'
import type { World } from './types'

/** 生存判定: 村が 0 個 かつ ユニットが 0 体 で滅亡。生存国が 1 つになったら勝利。 */
function checkEnd(world: World): void {
  for (const c of world.countries) {
    if (c.alive && c.villages === 0 && c.civilians + c.soldiers === 0) {
      c.alive = false
      c.mobilized = false
      pushEvent(world, 'extinct', 'major', [c.id], undefined)
    }
  }
  if (world.winner === null && world.countries.length >= 2) {
    const alive = world.countries.filter((c) => c.alive)
    if (alive.length === 1) {
      world.winner = alive[0]!.id
      pushEvent(world, 'victory', 'major', [alive[0]!.id], undefined)
    }
  }
}

/**
 * 1 ターン進める。処理順は固定(docs/spec.md §9)。
 * 0 戦略 → 1 建設 → 2 効率 → 3 生産 → 4 維持費 → 5 総動員・軍人化 → 6 AI・7 移動 → 8 戦闘
 * → 9 領土 → 10 占領 → 11 文明レベル → 12 滅亡/勝利・統計
 */
export function stepWorld(world: World): void {
  refreshPopulation(world)

  updateStrategy(world)
  construct(world)

  computeEfficiency(world)

  const food0 = world.countries.map((c) => c.stock.food)
  const ore0 = world.countries.map((c) => c.stock.ore)
  produce(world)
  applyUpkeep(world)
  for (const c of world.countries) {
    if (!c.alive) continue
    c.flowFood += (c.stock.food - (food0[c.id] as number) - c.flowFood) * 0.05
    c.flowOre += (c.stock.ore - (ore0[c.id] as number) - c.flowOre) * 0.05
  }

  updateMobilization(world)

  refreshFields(world)
  moveUnits(world)

  resolveCombat(world)
  updateTerritory(world)
  checkOccupation(world)
  for (const c of world.countries) if (c.land > c.peakLand) c.peakLand = c.land
  updateCivilization(world)

  refreshPopulation(world)
  checkEnd(world)

  world.turn++
  recordStats(world)
}
