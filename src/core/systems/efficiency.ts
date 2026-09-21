import { CONFIG } from '../config'
import { levelOf } from '../world'
import type { World } from '../types'

const CAP = CONFIG.units.cellCapacity

/** 人数効率: 周囲 8 マスの自国民間人 n → 1.0 + min(n, 16) / 16(0 人で 100%、16 人で 200%) */
export function peopleEfficiency(n: number): number {
  return 1 + Math.min(n, CONFIG.efficiency.fullPeople) / CONFIG.efficiency.fullPeople
}

/** 建物の周囲 8 マスにいる自国の民間人の数(軍人は数えない) */
export function countWorkers(world: World, x: number, y: number, owner: number): number {
  const W = world.width
  const H = world.height
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const cx = x + dx
      const cy = y + dy
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue
      const i = cy * W + cx
      const cnt = world.cellCount[i] as number
      for (let k = 0; k < cnt; k++) {
        const u = world.units.get(world.cellUnits[i * CAP + k] as number)
        if (u && u.owner === owner && u.kind === 'civilian') n++
      }
    }
  }
  return n
}

/** 全建物の workers と最終効率を更新する */
export function computeEfficiency(world: World): void {
  for (const b of world.buildings.values()) {
    const c = world.countries[b.owner]!
    b.workers = countWorkers(world, b.x, b.y, b.owner)
    b.efficiency = peopleEfficiency(b.workers) * levelOf(c).efficiency * CONFIG.personalities[c.personality].economyMul
  }
}
