import { CONFIG } from '../config'
import { pushEvent } from '../events'
import { levelOf } from '../world'
import { NO_OWNER, type Unit, type World } from '../types'

/** 総動員の発動/解除と、装備を持たせて民間人を軍人に変える処理(spec §6.2) */
export function updateMobilization(world: World): void {
  const threatened = new Array<boolean>(world.countries.length).fill(false)
  for (const u of world.units.values()) {
    if (u.kind !== 'soldier') continue
    const o = world.owner[u.y * world.width + u.x] as number
    if (o !== NO_OWNER && o !== u.owner) threatened[o] = true
  }

  for (const c of world.countries) {
    if (!c.alive) continue
    const lostRecently = c.lostBuildingTurn >= world.turn - 1
    if (threatened[c.id] || lostRecently) {
      c.lastThreatTurn = world.turn
      if (!c.mobilized) {
        c.mobilized = true
        pushEvent(world, 'mobilize', 'normal', [c.id], undefined)
      }
    } else if (c.mobilized && world.turn - c.lastThreatTurn >= CONFIG.military.demobilizeAfter) {
      c.mobilized = false
      pushEvent(world, 'demobilize', 'normal', [c.id], undefined)
    }

    convert(world, c.id)
  }
}

function convert(world: World, cid: number): void {
  const c = world.countries[cid]!
  const p = CONFIG.personalities[c.personality]
  const total = c.civilians + c.soldiers
  if (total === 0 || c.stock.equipment < 1) return
  // 食料収支が赤字の間は軍人化を止める(自滅を避ける)。総動員中は続ける
  if (!c.mobilized && c.flowFood < 0) return

  const target = c.mobilized ? p.mobRatio : p.ratio
  const limit = c.mobilized ? CONFIG.military.convertPerTurnMobilized : CONFIG.military.convertPerTurn
  const need = Math.ceil(target * total - c.soldiers)
  const count = Math.min(limit, need, Math.floor(c.stock.equipment))
  if (count <= 0) return

  // 最寄り(=村の近く)の民間人から軍人にする
  let hx = 0
  let hy = 0
  for (const b of world.buildings.values()) {
    if (b.owner === cid && b.kind === 'village') {
      hx = b.x
      hy = b.y
      break
    }
  }
  const civs: { u: Unit; d: number }[] = []
  for (const u of world.units.values()) {
    if (u.owner === cid && u.kind === 'civilian') civs.push({ u, d: Math.abs(u.x - hx) + Math.abs(u.y - hy) })
  }
  civs.sort((a, b) => a.d - b.d || a.u.id - b.u.id)

  const atk = levelOf(c).equipAtk * p.attackMul
  let done = 0
  for (const { u } of civs) {
    if (done >= count) break
    const ratio = u.hp / u.maxHp
    u.kind = 'soldier'
    u.maxHp = CONFIG.units.soldierHp
    u.hp = u.maxHp * ratio
    u.atk = atk
    u.stance = world.rng.chance(p.aggression) ? 'attack' : 'expand'
    c.stock.equipment -= 1
    c.soldiers++
    c.civilians--
    done++
  }
  if (done > 0) pushEvent(world, 'convert', 'minor', [cid], undefined, { count: done })
}
