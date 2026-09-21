import { CONFIG } from '../config'
import { cellHasEnemy, cellHasRoom, populationCap, spawnUnit } from '../world'
import type { Building, Stance, World } from '../types'

/** 建物の 8 近傍から、民間人を出現させられる空きマスを選ぶ(自国領・敵ユニット無し) */
function findSpawnCell(world: World, b: Building): number {
  const W = world.width
  const H = world.height
  const opts: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const x = b.x + dx
      const y = b.y + dy
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      const i = y * W + x
      if (world.owner[i] !== b.owner) continue
      if (!cellHasRoom(world, i) || cellHasEnemy(world, i, b.owner)) continue
      opts.push(i)
    }
  }
  return opts.length > 0 ? (opts[world.rng.int(opts.length)] as number) : -1
}

export function spawnStance(world: World): Stance {
  return world.rng.chance(CONFIG.ai.settlerRatio) ? 'expand' : 'work'
}

/** 各建物の稼働判定・進捗・消費・出力(spec §5.3) */
export function produce(world: World): void {
  for (const b of world.buildings.values()) {
    const c = world.countries[b.owner]!
    const def = CONFIG.buildings[b.kind]
    if (!c.alive) {
      b.status = 'inactive'
      continue
    }
    if (b.workers < def.minWorkers) {
      b.status = 'no-workers'
      continue
    }

    // 毎ターン出力(鉱山・畑)
    if (def.cycle === 0) {
      c.stock.ore += def.outOre * b.efficiency
      c.stock.food += def.outFood * b.efficiency
      b.status = 'ok'
      continue
    }

    // 人口が上限(領土に比例)に達したら、住居・村は民間人を生産しない
    if ((b.kind === 'house' || b.kind === 'village') && c.civilians + c.soldiers >= populationCap(c)) {
      b.progress = Math.min(b.progress, def.cycle)
      b.status = 'pop-cap'
      continue
    }

    // 周期式(村・住居・工房)
    if (b.kind === 'workshop' && c.stock.equipment >= CONFIG.personalities[c.personality].stockCap) {
      b.status = 'stock-cap'
      continue
    }
    if (def.foodCost > 0 && c.stock.food < def.foodCost) {
      b.status = 'no-food'
      continue
    }
    if (def.oreCost > 0 && c.stock.ore < def.oreCost) {
      b.status = 'no-ore'
      continue
    }

    b.progress += b.efficiency
    if (b.progress < def.cycle) {
      b.status = 'ok'
      continue
    }

    if (b.kind === 'workshop') {
      c.stock.equipment += 1
    } else {
      const cell = findSpawnCell(world, b)
      if (cell < 0) {
        b.progress = def.cycle
        b.status = 'no-space'
        continue
      }
      spawnUnit(world, b.owner, 'civilian', cell % world.width, (cell / world.width) | 0, spawnStance(world))
      c.civilians++
    }
    c.stock.food -= def.foodCost
    c.stock.ore -= def.oreCost
    b.progress -= def.cycle
    b.status = 'ok'
  }
}
