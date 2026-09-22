// 開発用: 多数シードを回し、既定ターン数の時点を「決着」「収束中(領土が動いている)」
// 「膠着(直近 2 ウィンドウでほぼ動いていない)」に分類する。決着のつきやすさを測るためのもの。
//   npx tsx scripts/stalecheck.ts [seeds=60] [turns=1500] [start=1]
import { stepWorld } from '../src/core/sim'
import type { World } from '../src/core/types'
import { createWorld } from '../src/core/world'
import { applyOverrides } from './overrides'

applyOverrides()

const seeds = Number(process.argv[2] ?? 60)
const turns = Number(process.argv[3] ?? 1500)
const start = Number(process.argv[4] ?? 1)
const WINDOW = 300
/** 直近 2 ウィンドウの領土移動が、全領土に対してこの割合未満なら「膠着」とみなす */
const STALE_RATIO = 0.03

let decided = 0
let converging = 0
let stalemate = 0
const stalemateSeeds: number[] = []
const decidedTurns: number[] = []

for (let s = 0; s < seeds; s++) {
  const seed = start + s
  const w: World = createWorld({ seed, countryCount: 3, personalities: ['warlike', 'balanced', 'peaceful'] })
  const history: number[][] = []
  for (let t = 1; t <= turns; t++) {
    stepWorld(w)
    if (t % WINDOW === 0) history.push(w.countries.map((c) => c.land))
    if (w.winner !== null) break
  }
  if (w.winner !== null) {
    decided++
    decidedTurns.push(w.turn)
    continue
  }
  if (history.length >= 2) {
    const a = history[history.length - 2]!
    const b = history[history.length - 1]!
    const totalChange = a.reduce((sum, v, i) => sum + Math.abs((b[i] as number) - v), 0)
    const totalLand = b.reduce((s2, v) => s2 + v, 0)
    if (totalChange / Math.max(1, totalLand) < STALE_RATIO) {
      stalemate++
      stalemateSeeds.push(seed)
      continue
    }
  }
  converging++
}

const pct = (n: number) => `${((n / seeds) * 100).toFixed(1)}%`
console.log(`\n=== 決着のつきやすさ: ${seeds} シード × 最大 ${turns} ターン ===`)
console.log(`決着 ${decided}(${pct(decided)})  収束中 ${converging}(${pct(converging)})  膠着 ${stalemate}(${pct(stalemate)})`)
if (decidedTurns.length > 0) {
  console.log(`決着までの平均ターン: ${(decidedTurns.reduce((a, b) => a + b, 0) / decidedTurns.length).toFixed(0)}`)
}
if (stalemateSeeds.length > 0) console.log(`膠着シード: ${stalemateSeeds.join(', ')}`)
