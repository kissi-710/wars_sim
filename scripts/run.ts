// 開発用: ヘッドレスで N ターン回して経過を表示する。 npx tsx scripts/run.ts [seed] [turns] [countries]
import { createWorld } from '../src/core/world'
import { stepWorld } from '../src/core/sim'

const seed = Number(process.argv[2] ?? 1)
const turns = Number(process.argv[3] ?? 1000)
const n = Number(process.argv[4] ?? 4)
const world = createWorld({ seed, countryCount: n })
const t0 = performance.now()
const line = () => {
  const cs = world.countries.map(
    (c) =>
      `${c.name}[${c.personality[0]}${c.level}${c.alive ? '' : 'x'}] land=${c.land} civ=${c.civilians} sol=${c.soldiers} f=${c.stock.food.toFixed(0)} o=${c.stock.ore.toFixed(0)} eq=${c.stock.equipment}${c.mobilized ? ' M' : ''}`,
  )
  console.log(`T${world.turn}: ${cs.join(' | ')}`)
}
line()
for (let t = 1; t <= turns; t++) {
  stepWorld(world)
  if (t % Math.max(1, Math.floor(turns / 10)) === 0) line()
  if (world.winner !== null) {
    console.log(`勝者: ${world.countries[world.winner]!.name} (T${world.turn})`)
    break
  }
}
console.log(`elapsed ${(performance.now() - t0).toFixed(0)}ms, events=${world.events.length}`)
