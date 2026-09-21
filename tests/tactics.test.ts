import { describe, expect, it } from 'vitest'
import { CONFIG } from '../src/core/config'
import { buildSoldierMap, shouldRetreat } from '../src/core/tactics'
import { resolveCombat } from '../src/core/systems/combat'
import { computeEfficiency } from '../src/core/systems/efficiency'
import { produce } from '../src/core/systems/production'
import { strength, updateStrategy } from '../src/core/systems/strategy'
import {
  addBuilding,
  canEnter,
  enemiesInReach,
  idx,
  isEngaged,
  populationCap,
  refreshPopulation,
  spawnUnit,
  swapUnits,
} from '../src/core/world'
import { claim, emptyWorld } from './helpers'

describe('軍人の攻撃範囲(自分のマス + 上下左右)', () => {
  it('軍人は隣接 4 マスの敵まで届く。斜めと 2 マス先は届かない', () => {
    const w = emptyWorld()
    const s = spawnUnit(w, 0, 'soldier', 10, 10, 'attack')!
    for (const [x, y] of [
      [11, 10],
      [9, 10],
      [10, 11],
      [10, 9],
    ] as const) {
      spawnUnit(w, 1, 'civilian', x, y, 'work')
    }
    spawnUnit(w, 1, 'civilian', 11, 11, 'work') // 斜め
    spawnUnit(w, 1, 'civilian', 12, 10, 'work') // 2 マス先
    expect(enemiesInReach(w, s)).toHaveLength(4)
    spawnUnit(w, 1, 'civilian', 10, 10, 'work') // 同じマス
    expect(enemiesInReach(w, s)).toHaveLength(5)
  })

  it('民間人は同じマスの敵にしか届かない', () => {
    const w = emptyWorld()
    const c = spawnUnit(w, 0, 'civilian', 10, 10, 'work')!
    spawnUnit(w, 1, 'soldier', 11, 10, 'attack')
    expect(enemiesInReach(w, c)).toHaveLength(0)
    expect(isEngaged(w, c)).toBe(false)
    spawnUnit(w, 1, 'soldier', 10, 10, 'attack')
    expect(enemiesInReach(w, c)).toHaveLength(1)
    expect(isEngaged(w, c)).toBe(true)
  })

  it('満員(民間人 4 体)のマスにも、隣から攻撃できる', () => {
    const w = emptyWorld()
    const s = spawnUnit(w, 0, 'soldier', 10, 10, 'attack')!
    const civs = [0, 1, 2, 3].map(() => spawnUnit(w, 1, 'civilian', 11, 10, 'work')!)
    expect(spawnUnit(w, 1, 'civilian', 11, 10, 'work')).toBeNull()
    resolveCombat(w)
    const dmg = civs.reduce((a, c) => a + (10 - c.hp), 0)
    expect(dmg).toBe(s.atk)
    expect(w.fightCells.has(idx(w, 11, 10))).toBe(true)
    expect(w.hits.slice(0, 2)).toEqual([idx(w, 10, 10), idx(w, 11, 10)])
  })

  it('攻撃範囲に敵がいる軍人は交戦中として扱われる', () => {
    const w = emptyWorld()
    const s = spawnUnit(w, 0, 'soldier', 10, 10, 'attack')!
    expect(isEngaged(w, s)).toBe(false)
    spawnUnit(w, 1, 'civilian', 10, 11, 'work')
    expect(isEngaged(w, s)).toBe(true)
  })

  it('自国領に立って攻撃すると防衛補正がかかる(隣接攻撃でも)', () => {
    const w = emptyWorld()
    claim(w, 0, 10, 10, 10, 10)
    spawnUnit(w, 0, 'soldier', 10, 10, 'attack')
    const t = spawnUnit(w, 1, 'soldier', 11, 10, 'attack')!
    resolveCombat(w)
    // 自軍の攻撃は ×1.25、相手(無所有地に立つ)は ×1.0
    expect(t.hp).toBeCloseTo(20 - 6 * CONFIG.military.defenseBonus, 9)
  })

  it('軍人は敵軍人を優先し、倒れる見込みの敵を避けて攻撃を分散する(集中攻撃)', () => {
    const w = emptyWorld()
    spawnUnit(w, 0, 'soldier', 10, 10, 'attack')
    spawnUnit(w, 0, 'soldier', 10, 10, 'attack')
    const weak = spawnUnit(w, 1, 'soldier', 11, 10, 'attack')!
    weak.hp = 5
    const strong = spawnUnit(w, 1, 'soldier', 9, 10, 'attack')!
    const civ = spawnUnit(w, 1, 'civilian', 10, 11, 'work')!
    resolveCombat(w)
    expect(w.units.has(weak.id)).toBe(false) // 1 人目が弱った敵を撃破
    // 2 人目は、すでに倒れる見込みの敵ではなく、別の敵軍人を狙う(民間人ではない)
    expect(strong.hp).toBeLessThan(20)
    expect(civ.hp).toBe(10)
  })
})

describe('満員のマスへの入れ替え', () => {
  it('軍人は、友軍の民間人がいる満員マスへ入れる。民間人や他国で満員のマスには入れない', () => {
    const w = emptyWorld()
    const sol = spawnUnit(w, 0, 'soldier', 10, 10, 'attack')!
    const civ = spawnUnit(w, 0, 'civilian', 5, 5, 'work')!
    const target = idx(w, 11, 10)
    for (let k = 0; k < 4; k++) spawnUnit(w, 0, 'civilian', 11, 10, 'work')
    expect(canEnter(w, sol, target)).toBe(true)
    expect(canEnter(w, civ, target)).toBe(false)

    const w2 = emptyWorld()
    const s2 = spawnUnit(w2, 0, 'soldier', 10, 10, 'attack')!
    for (let k = 0; k < 4; k++) spawnUnit(w2, 1, 'civilian', 11, 10, 'work')
    expect(canEnter(w2, s2, idx(w2, 11, 10))).toBe(false)
  })

  it('入れ替えると、位置が交換され、マスの人数は変わらない', () => {
    const w = emptyWorld()
    const sol = spawnUnit(w, 0, 'soldier', 10, 10, 'attack')!
    spawnUnit(w, 0, 'civilian', 11, 10, 'work')
    spawnUnit(w, 0, 'civilian', 11, 10, 'work')
    spawnUnit(w, 0, 'civilian', 11, 10, 'work')
    const civ = spawnUnit(w, 0, 'civilian', 11, 10, 'work')!
    swapUnits(w, sol, civ)
    expect([sol.x, sol.y]).toEqual([11, 10])
    expect([civ.x, civ.y]).toEqual([10, 10])
    expect(w.cellCount[idx(w, 11, 10)]).toBe(4)
    expect(w.cellCount[idx(w, 10, 10)]).toBe(1)
  })
})

describe('人口の上限', () => {
  it('人口の上限は領土に比例する(最低保証あり)', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 39, 49) // 2000 マス
    expect(populationCap(w.countries[0]!)).toBe(Math.floor(2000 * CONFIG.population.density))
    expect(populationCap(w.countries[1]!)).toBe(CONFIG.population.minCap)
  })

  it('人口が上限に達すると、住居と村は民間人を生産しない', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 5, 5) // 36 マス → 上限は最低保証の 24
    const house = addBuilding(w, 'house', 0, 3, 3)
    const village = addBuilding(w, 'village', 0, 1, 1)
    w.countries[0]!.stock.food = 1000
    const cap = populationCap(w.countries[0]!)
    for (let k = 0; k < cap; k++) spawnUnit(w, 0, 'soldier', 10 + (k % 20), 10 + ((k / 20) | 0), 'attack')
    refreshPopulation(w)
    const before = w.units.size
    for (let t = 0; t < 40; t++) {
      computeEfficiency(w)
      produce(w)
    }
    expect(w.units.size).toBe(before)
    expect(house.status).toBe('pop-cap')
    expect(village.status).toBe('pop-cap')
  })
})

describe('国の戦略', () => {
  function setup(soldiersA: number, soldiersB: number, personality: 'warlike' | 'balanced' | 'peaceful') {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 9, 9)
    claim(w, 1, 10, 0, 19, 9)
    addBuilding(w, 'village', 0, 3, 3)
    addBuilding(w, 'village', 1, 15, 3)
    w.countries[0]!.personality = personality
    w.countries[0]!.soldiers = soldiersA
    w.countries[1]!.soldiers = soldiersB
    w.turn = 0
    updateStrategy(w)
    return w
  }

  it('好戦的は互角の隣国に侵攻するが、平和的は互角では侵攻しない', () => {
    const war = setup(10, 10, 'warlike')
    expect(war.countries[0]!.warTarget).toBe(1)
    expect(war.countries[0]!.posture).toBe('attack')
    expect(war.events.some((e) => e.type === 'declare')).toBe(true)
    const peace = setup(10, 10, 'peaceful')
    expect(peace.countries[0]!.warTarget).toBe(-1)
    expect(peace.countries[0]!.posture).toBe('defend')
  })

  it('平和的でも、相手が十分に弱ければ侵攻する', () => {
    expect(setup(20, 2, 'peaceful').countries[0]!.warTarget).toBe(1)
  })

  it('軍人が少ないうちは侵攻しない', () => {
    expect(setup(3, 0, 'warlike').countries[0]!.warTarget).toBe(-1)
  })

  it('相手がごく弱ければ村を直接狙う(首狩り)', () => {
    const w = setup(30, 0, 'warlike')
    expect(w.countries[0]!.snipe).toBe(true)
    expect(strength(w.countries[1]!)).toBe(0)
  })
})

describe('軍人の撤退判断', () => {
  it('周囲の敵軍人が 3 体以上で、味方の 1.8 倍を超えると撤退する', () => {
    const w = emptyWorld()
    spawnUnit(w, 0, 'soldier', 10, 10, 'attack')
    for (const x of [13, 13, 12]) spawnUnit(w, 1, 'soldier', x, 10, 'attack')
    expect(shouldRetreat(buildSoldierMap(w), 0, 10, 10)).toBe(true)
    spawnUnit(w, 0, 'soldier', 9, 10, 'attack')
    expect(shouldRetreat(buildSoldierMap(w), 0, 10, 10)).toBe(false)
  })
})
