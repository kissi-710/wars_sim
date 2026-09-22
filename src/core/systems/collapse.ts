import { CONFIG } from '../config'
import { pushEvent } from '../events'
import { removeUnit } from '../world'
import type { Unit, World } from '../types'

/**
 * 孤立崩壊(spec §7.4 / docs/spec.md §15.2 の「亡霊国家」対策):
 *
 * 建物を 1 つも持たない国は、生産手段(住居・畑・鉱山・工房・村)が無く経済を立て直せない。
 * 通常はすぐに新しい建物を建てるか占領するかで復帰するが、**领土の僻地に取り残されて
 * 誰にも見つからない・辿り着けない残党**になった場合、何百〜何千ターンも変化せず、
 * ゲームが永遠に決着しなくなることがあった(spec §15.2)。
 *
 * これを防ぐため、建物 0 の状態が `graceTurns` を超えて続いた国は、
 * 生き残っているユニット全員が毎ターン少しずつ弱っていく(直接手を下す敵がいなくても、
 * いずれ HP が尽きて消滅する)。猶予期間があるので、占領直後の一時的な建物 0 は問題にならない。
 */
export function applyCollapse(world: World): void {
  const cfg = CONFIG.collapse
  const bySoldierAndCivilian: Unit[] = []

  for (const c of world.countries) {
    if (!c.alive) continue
    if (c.buildingCount > 0) {
      c.noBuildingTurns = 0
      continue
    }
    c.noBuildingTurns++
    if (c.noBuildingTurns === cfg.graceTurns) {
      pushEvent(world, 'collapse', 'normal', [c.id], undefined, {})
    }
    if (c.noBuildingTurns < cfg.graceTurns) continue

    bySoldierAndCivilian.length = 0
    for (const u of world.units.values()) if (u.owner === c.id) bySoldierAndCivilian.push(u)
    for (const u of bySoldierAndCivilian) {
      u.hp -= cfg.hpDecayPerTurn
      if (u.hp > 0) continue
      if (u.kind === 'soldier') c.counters.soldierDeaths++
      else c.counters.civilianDeaths++
      removeUnit(world, u)
    }
  }
}
