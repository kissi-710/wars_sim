import { CONFIG } from '../config'
import { pushEvent } from '../events'
import { setCellOwner } from '../world'
import { NO_OWNER, type Building, type World } from '../types'

export interface OccupationInfo {
  /** 半径内の対象マス数(建物自身を除く。マップ外は数えない) */
  total: number
  /** 国ごとの領有マス数(建物の所有国自身も含む) */
  counts: number[]
  /** 占領に必要なマス数(これ以上で占領) */
  need: number
}

/** 建物の占領判定範囲(半径 2 の 5×5 から自身を除く)の国別領有数 */
export function occupationInfo(world: World, b: Building): OccupationInfo {
  const R = CONFIG.occupation.radius
  const counts = new Array<number>(world.countries.length).fill(0)
  let total = 0
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx === 0 && dy === 0) continue
      const x = b.x + dx
      const y = b.y + dy
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue
      total++
      const o = world.owner[y * world.width + x] as number
      if (o !== NO_OWNER) counts[o] = (counts[o] as number) + 1
    }
  }
  return { total, counts, need: Math.floor(total * CONFIG.occupation.ratio) + 1 }
}

/**
 * 建物の占領判定(spec §5.4): 半径 2 のマスの過半数を敵国に奪われた建物は、その国のものになる。
 * 判定は全建物ぶんを先に集めてから適用する(連鎖は次ターン)。
 */
export function checkOccupation(world: World): void {
  const changes: { b: Building; to: number }[] = []
  for (const b of world.buildings.values()) {
    const info = occupationInfo(world, b)
    let best = -1
    let bestN = 0
    for (let e = 0; e < info.counts.length; e++) {
      if (e === b.owner || !world.countries[e]!.alive) continue
      const n = info.counts[e] as number
      if (n >= info.need && n > bestN) {
        best = e
        bestN = n
      }
    }
    if (best >= 0) changes.push({ b, to: best })
  }

  for (const { b, to } of changes) {
    const from = b.owner
    b.owner = to
    b.progress = 0
    setCellOwner(world, b.y * world.width + b.x, to)
    world.countries[to]!.counters.occupied++
    const victim = world.countries[from]!
    victim.counters.lost++
    victim.lostBuildingTurn = world.turn
    pushEvent(world, 'occupy', b.kind === 'village' ? 'major' : 'normal', [to, from], { x: b.x, y: b.y }, { kind: b.kind })
  }
}
