// 開発用: 3 国戦の経過を詳しく表示する。 npx tsx scripts/inspect.ts [seed] [turns]
import { stepWorld } from '../src/core/sim'
import { countBuildings, createWorld } from '../src/core/world'
import { applyOverrides } from './overrides'

applyOverrides()

const seed = Number(process.argv[2] ?? 1)
const turns = Number(process.argv[3] ?? 1500)
const w = createWorld({ seed, countryCount: 3, personalities: ['warlike', 'balanced', 'peaceful'] })
let eqMade = [0, 0, 0]
for (let t = 1; t <= turns; t++) {
  const before = w.countries.map((c) => c.stock.equipment)
  stepWorld(w)
  void before
  if (t % 100 === 0) {
    console.log(`--- T${t}`)
    for (const c of w.countries) {
      const b = countBuildings(w, c.id)
      const ws = [...w.buildings.values()].filter((x) => x.owner === c.id && x.kind === 'workshop')
      console.log(
        `${c.name}[${c.personality}] Lv${c.level} land=${c.land} civ=${c.civilians} sol=${c.soldiers} food=${c.stock.food.toFixed(0)}(${c.flowFood.toFixed(1)}) ore=${c.stock.ore.toFixed(0)}(${c.flowOre.toFixed(1)}) eq=${c.stock.equipment} mob=${c.mobilized} ` +
          `H${b.house} F${b.farm} M${b.mine} W${b.workshop} village=${b.village} wsStatus=${ws.map((x) => x.status + ':' + x.workers).join(',')} K${c.counters.kills}/D${c.counters.soldierDeaths + c.counters.civilianDeaths} occ${c.counters.occupied}/lost${c.counters.lost}`,
      )
    }
  }
}
void eqMade
