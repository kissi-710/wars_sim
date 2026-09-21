// バランス検証(docs/spec.md §15): 画面なしで多数のシードを回し、性格ごとの勝率などを集計する。
//   npx tsx scripts/balance.ts [seeds=100] [turns=2000] [start=1]
// 3 国戦(好戦的/中庸/平和的が 1 国ずつ)を、性格の割り当てを 6 通りに回しながら実行する。
import { CONFIG } from '../src/core/config'
import { stepWorld } from '../src/core/sim'
import type { PersonalityId, World } from '../src/core/types'
import { createWorld } from '../src/core/world'
import { applyOverrides } from './overrides'

applyOverrides()

const seeds = Number(process.argv[2] ?? 100)
const turns = Number(process.argv[3] ?? 2000)
const start = Number(process.argv[4] ?? 1)

const IDS: PersonalityId[] = ['warlike', 'balanced', 'peaceful']
const PERMS: PersonalityId[][] = [
  ['warlike', 'balanced', 'peaceful'],
  ['warlike', 'peaceful', 'balanced'],
  ['balanced', 'warlike', 'peaceful'],
  ['balanced', 'peaceful', 'warlike'],
  ['peaceful', 'warlike', 'balanced'],
  ['peaceful', 'balanced', 'warlike'],
]

interface Agg {
  wins: number
  /** 決着がつかなかった対戦で、最終領土が最大だった回数 */
  leads: number
  survived: number
  landShare: number
  extinctTurn: number
  extinctCount: number
  kills: number
  deaths: number
  starved: number
  occupied: number
  soldiers: number
  civilians: number
  level: number
}

const agg: Record<PersonalityId, Agg> = {} as Record<PersonalityId, Agg>
for (const id of IDS) {
  agg[id] = {
    wins: 0,
    leads: 0,
    survived: 0,
    landShare: 0,
    extinctTurn: 0,
    extinctCount: 0,
    kills: 0,
    deaths: 0,
    starved: 0,
    occupied: 0,
    soldiers: 0,
    civilians: 0,
    level: 0,
  }
}

let decided = 0
let totalTurns = 0
const t0 = performance.now()

for (let s = 0; s < seeds; s++) {
  const seed = start + s
  const w: World = createWorld({ seed, countryCount: 3, personalities: PERMS[s % PERMS.length] })
  let winnerTurn = -1
  for (let t = 0; t < turns; t++) {
    stepWorld(w)
    if (w.winner !== null) {
      winnerTurn = w.turn
      break
    }
  }
  totalTurns += w.turn
  const landTotal = w.countries.reduce((a, c) => a + c.land, 0) || 1
  const extinctAt = new Map<number, number>()
  for (const ev of w.events) if (ev.type === 'extinct') extinctAt.set(ev.countries[0] as number, ev.turn)

  let leader = 0
  for (const c of w.countries) if (c.land > w.countries[leader]!.land) leader = c.id
  if (w.winner !== null) decided++

  for (const c of w.countries) {
    const a = agg[c.personality]
    if (w.winner === c.id) a.wins++
    if (w.winner === null && c.id === leader) a.leads++
    if (c.alive) a.survived++
    else {
      a.extinctCount++
      a.extinctTurn += extinctAt.get(c.id) ?? w.turn
    }
    a.landShare += c.land / landTotal
    a.kills += c.counters.kills
    a.deaths += c.counters.civilianDeaths + c.counters.soldierDeaths
    a.starved += c.counters.starved
    a.occupied += c.counters.occupied
    a.soldiers += c.soldiers
    a.civilians += c.civilians
    a.level += c.level
  }
  void winnerTurn
  if ((s + 1) % 10 === 0) process.stderr.write(`  ${s + 1}/${seeds} (${((performance.now() - t0) / 1000).toFixed(0)}s)\n`)
}

const pct = (n: number) => `${((n / seeds) * 100).toFixed(1)}%`
console.log(`\n=== バランス検証: 3 国戦 × ${seeds} シード(最大 ${turns} ターン)===`)
console.log(`決着(1 国のみ生存): ${decided}/${seeds}  平均ターン: ${(totalTurns / seeds).toFixed(0)}  所要: ${((performance.now() - t0) / 1000).toFixed(0)}s`)
console.log('性格        勝率    (未決着時の領土トップ)  生存率  平均領土%  平均滅亡T  撃破  戦死  飢餓死  占領  軍人  民間  Lv')
for (const id of IDS) {
  const a = agg[id]
  console.log(
    `${CONFIG.personalities[id].label.padEnd(6, '　')}  ` +
      `${pct(a.wins).padStart(6)}  ${pct(a.leads).padStart(10)}            ` +
      `${pct(a.survived).padStart(6)}  ${((a.landShare / seeds) * 100).toFixed(1).padStart(8)}  ` +
      `${(a.extinctCount ? a.extinctTurn / a.extinctCount : 0).toFixed(0).padStart(8)}  ` +
      `${(a.kills / seeds).toFixed(0).padStart(4)}  ${(a.deaths / seeds).toFixed(0).padStart(4)}  ${(a.starved / seeds).toFixed(0).padStart(5)}  ` +
      `${(a.occupied / seeds).toFixed(1).padStart(4)}  ${(a.soldiers / seeds).toFixed(0).padStart(4)}  ${(a.civilians / seeds).toFixed(0).padStart(4)}  ${(a.level / seeds).toFixed(1)}`,
  )
}
const top = IDS.map((id) => agg[id].wins + agg[id].leads)
console.log(`\n(勝ち + 領土トップ) の割合: ${IDS.map((id, i) => `${CONFIG.personalities[id].label} ${(((top[i] as number) / seeds) * 100).toFixed(0)}%`).join(' / ')}`)
console.log('目標: どの性格も 20〜45%(docs/spec.md §15)')
