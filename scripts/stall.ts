// 開発用: 膠着(全国が総動員・マスが民間人で埋まる)の調査。 npx tsx scripts/stall.ts [seed] [turns] [countries]
import { stepWorld } from '../src/core/sim'
import { createWorld } from '../src/core/world'

const seed = Number(process.argv[2] ?? 1)
const turns = Number(process.argv[3] ?? 3000)
const n = Number(process.argv[4] ?? 4)
const w = createWorld({ seed, countryCount: n })
let moved = 0
let prev = new Map<number, string>()
for (let t = 1; t <= turns; t++) {
  stepWorld(w)
  if (t % 300 === 0) {
    let full = 0
    let occupied = 0
    for (let i = 0; i < w.width * w.height; i++) {
      const c = w.cellCount[i]!
      if (c > 0) occupied++
      if (c >= 4) full++
    }
    moved = 0
    const cur = new Map<number, string>()
    for (const u of w.units.values()) {
      const k = `${u.x},${u.y}`
      cur.set(u.id, k)
      if (prev.get(u.id) !== k) moved++
    }
    prev = cur
    const mob = w.countries.filter((c) => c.mobilized).length
    const inEnemy = [...w.units.values()].filter((u) => u.kind === 'soldier' && w.owner[u.y * w.width + u.x] !== u.owner && w.owner[u.y * w.width + u.x] !== 255).length
    console.log(
      `T${t}: units=${w.units.size} civ=${w.countries.reduce((a, c) => a + c.civilians, 0)} sol=${w.countries.reduce((a, c) => a + c.soldiers, 0)} fullCells=${full} occCells=${occupied} movedSinceLast=${moved} mobilized=${mob}/${n} soldiersInEnemyLand=${inEnemy} eq=${w.countries.map((c) => c.stock.equipment).join('/')}`,
    )
  }
}

console.log('--- 最終状態')
for (const c of w.countries) {
  const ws = [...w.buildings.values()].filter((b) => b.owner === c.id && b.kind === 'workshop')
  const all = [...w.buildings.values()].filter((b) => b.owner === c.id)
  const status: Record<string, number> = {}
  for (const b of all) status[`${b.kind}:${b.status}`] = (status[`${b.kind}:${b.status}`] ?? 0) + 1
  console.log(
    `${c.name}[${c.personality}] Lv${c.level} land=${c.land} civ=${c.civilians} sol=${c.soldiers} food=${c.stock.food.toFixed(0)}(${c.flowFood.toFixed(1)}) ore=${c.stock.ore.toFixed(0)}(${c.flowOre.toFixed(1)}) eq=${c.stock.equipment} mob=${c.mobilized} workshops=${ws.length} ${JSON.stringify(status)}`,
  )
}
