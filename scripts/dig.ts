// 開発用: 特定シードの領土推移と国の状態を詳しく見る(膠着調査用)。
import { stepWorld } from '../src/core/sim'
import { createWorld } from '../src/core/world'
import { applyOverrides } from './overrides'
applyOverrides()
const seed = Number(process.argv[2] ?? 1)
const turns = Number(process.argv[3] ?? 1500)
const w = createWorld({ seed, countryCount: 3, personalities: ['warlike', 'balanced', 'peaceful'] })
for (let t = 1; t <= turns; t++) {
  stepWorld(w)
  if (t % 100 === 0 || t === turns) {
    console.log(`--- T${t}`)
    for (const c of w.countries) {
      console.log(
        `${c.name}[${c.personality}] alive=${c.alive} land=${c.land} civ=${c.civilians} sol=${c.soldiers} posture=${c.posture} target=${c.warTarget >= 0 ? w.countries[c.warTarget]!.name : '-'} snipe=${c.snipe} mob=${c.mobilized}`,
      )
    }
  }
}
