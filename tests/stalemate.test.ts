import { describe, expect, it } from 'vitest'
import { CONFIG } from '../src/core/config'
import { INF, refreshFields } from '../src/core/fields'
import { applyCollapse } from '../src/core/systems/collapse'
import { wouldSeal } from '../src/core/systems/construction'
import { strength, updateStrategy } from '../src/core/systems/strategy'
import { addBuilding, idx, refreshPopulation, spawnUnit } from '../src/core/world'
import { claim, emptyWorld } from './helpers'

// 決着がつかない問題(docs/spec.md §15.2)に対する 4 つの対策のテスト。

describe('残党狩り: 相手に建物が無いときの攻撃目標', () => {
  it('相手の建物が無ければ、相手の残存領土を直接の目標にする', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 20, 20)
    claim(w, 1, 50, 50, 52, 52) // カリムの残存領土(建物は無い)
    const c0 = w.countries[0]!
    c0.warTarget = 1
    w.turn = 100
    refreshFields(w)
    const f = w.fields[0]!
    expect(f.hasAttack).toBe(true)
    expect(f.attack[idx(w, 51, 51)]).toBe(0) // 相手領土そのものが目標(距離 0)
  })

  it('相手の領土も無ければ、相手ユニットの位置を目標にする', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 20, 20)
    const c0 = w.countries[0]!
    c0.warTarget = 1
    spawnUnit(w, 1, 'civilian', 60, 60, 'work') // 領土は持たないが、まだ生きているユニットがいる
    w.turn = 100
    refreshFields(w)
    const f = w.fields[0]!
    expect(f.hasAttack).toBe(true)
    expect(f.attack[idx(w, 60, 60)]).toBe(0)
  })

  it('相手に建物があれば、これまで通り建物の占領判定範囲を目標にする', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 20, 20)
    claim(w, 1, 50, 50, 55, 55)
    addBuilding(w, 'farm', 1, 52, 52)
    const c0 = w.countries[0]!
    c0.warTarget = 1
    w.turn = 100
    refreshFields(w)
    const f = w.fields[0]!
    expect(f.hasAttack).toBe(true)
    // 建物そのものは占領判定の対象外(占領は領土で決まる)なので、目標には含まれない
    expect(f.attack[idx(w, 52, 52)]).toBe(INF)
    // 建物の半径 2 マス以内は目標に含まれる
    expect(f.attack[idx(w, 53, 52)]).toBe(0)
  })
})

describe('建物による閉じ込め防止(wouldSeal)', () => {
  it('4 方向すべてを建物で囲むと判定される', () => {
    const w = emptyWorld()
    claim(w, 0, 8, 8, 12, 12)
    addBuilding(w, 'house', 0, 11, 10) // (10,10) の右
    addBuilding(w, 'house', 0, 9, 10) // (10,10) の左
    addBuilding(w, 'house', 0, 10, 11) // (10,10) の下
    // 上(10,9)に建てようとすると、(10,10) が 4 方向すべて建物になる
    expect(wouldSeal(w, 10, 9)).toBe(true)
  })

  it('3 方向までなら塞がず、閉じ込めにならない', () => {
    const w = emptyWorld()
    claim(w, 0, 8, 8, 12, 12)
    addBuilding(w, 'house', 0, 11, 10)
    addBuilding(w, 'house', 0, 9, 10)
    expect(wouldSeal(w, 10, 9)).toBe(false)
  })

  it('所有国を問わず、敵の残存マスを囲む配置も検出する', () => {
    const w = emptyWorld()
    claim(w, 0, 8, 8, 12, 12)
    claim(w, 1, 10, 10, 10, 10) // 敵の孤立したマス
    addBuilding(w, 'house', 0, 11, 10)
    addBuilding(w, 'house', 0, 9, 10)
    addBuilding(w, 'house', 0, 10, 11)
    expect(wouldSeal(w, 10, 9)).toBe(true)
  })
})

describe('戦争疲れ: 互角の睨み合いが続くと、しきい値が下がって開戦する', () => {
  function setup() {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 9, 9)
    claim(w, 1, 10, 0, 19, 9)
    addBuilding(w, 'village', 0, 3, 3)
    addBuilding(w, 'village', 1, 15, 3)
    const c0 = w.countries[0]!
    c0.personality = 'balanced' // 平時のしきい値 = 1.6 - 1.5*0.5 = 0.85
    c0.soldiers = 10
    w.countries[1]!.soldiers = 12 // ratio = 10/16 = 0.625 < 0.85(初期は開戦しない)
    return w
  }

  it('しきい値未達の間は standoffTurns が増え、開戦しない', () => {
    const w = setup()
    w.turn = 0
    updateStrategy(w)
    expect(w.countries[0]!.warTarget).toBe(-1)
    expect(w.countries[0]!.standoffTurns).toBe(1)
    w.turn += CONFIG.strategy.interval
    updateStrategy(w)
    expect(w.countries[0]!.standoffTurns).toBe(2)
  })

  it('見送りが積み重なると、しきい値が下がってやがて開戦する', () => {
    const w = setup()
    // ratio = 10/16 = 0.625。平時のしきい値 0.85 が見直しごとに 0.01 ずつ下がるので、
    // しばらく(20 回以上)は開戦せず、そのうち確実に開戦することだけを確認する。
    let turns = 0
    let rounds = 0
    for (; rounds < 200 && w.countries[0]!.warTarget < 0; rounds++) {
      w.turn = turns
      updateStrategy(w)
      turns += CONFIG.strategy.interval
    }
    expect(w.countries[0]!.warTarget).toBe(1)
    expect(w.countries[0]!.posture).toBe('attack')
    expect(rounds).toBeGreaterThan(20)
    expect(rounds).toBeLessThan(200)
    // 開戦した瞬間に戦争疲れはリセットされる
    expect(w.countries[0]!.standoffTurns).toBe(0)
  })

  it('開戦すると standoffTurns は 0 に戻る', () => {
    const w = setup()
    w.countries[0]!.standoffTurns = 50
    w.countries[0]!.soldiers = 100 // 圧倒的優勢にして、しきい値を待たずに即開戦させる
    w.turn = 0
    updateStrategy(w)
    expect(w.countries[0]!.warTarget).toBe(1)
    expect(w.countries[0]!.standoffTurns).toBe(0)
  })
})

describe('孤立崩壊: 建物を失った国は、猶予期間の後に弱っていく', () => {
  it('猶予期間中は HP が減らない', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 5, 5)
    const u = spawnUnit(w, 0, 'civilian', 2, 2, 'work')!
    refreshPopulation(w)
    for (let t = 0; t < CONFIG.collapse.graceTurns - 1; t++) applyCollapse(w)
    expect(u.hp).toBe(10)
    expect(w.countries[0]!.noBuildingTurns).toBe(CONFIG.collapse.graceTurns - 1)
  })

  it('猶予期間を過ぎると弱り始め、やがて消滅する', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 5, 5)
    const u = spawnUnit(w, 0, 'civilian', 2, 2, 'work')!
    refreshPopulation(w)
    const turnsToDie = CONFIG.collapse.graceTurns + Math.ceil(10 / CONFIG.collapse.hpDecayPerTurn) + 1
    for (let t = 0; t < turnsToDie; t++) applyCollapse(w)
    expect(w.units.has(u.id)).toBe(false)
    expect(w.countries[0]!.counters.civilianDeaths).toBe(1)
  })

  it('建物を 1 つでも持っていれば、崩壊しない(カウンタも 0 のまま)', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 5, 5)
    addBuilding(w, 'house', 0, 1, 1)
    const u = spawnUnit(w, 0, 'civilian', 2, 2, 'work')!
    refreshPopulation(w)
    for (let t = 0; t < CONFIG.collapse.graceTurns + 500; t++) applyCollapse(w)
    expect(u.hp).toBe(10)
    expect(w.countries[0]!.noBuildingTurns).toBe(0)
  })

  it('死んだ国(alive=false)は対象にならない', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 5, 5)
    const u = spawnUnit(w, 0, 'civilian', 2, 2, 'work')!
    w.countries[0]!.alive = false
    refreshPopulation(w)
    for (let t = 0; t < CONFIG.collapse.graceTurns + 500; t++) applyCollapse(w)
    expect(u.hp).toBe(10)
  })
})

describe('strength() は文明レベルと装備在庫を反映する', () => {
  it('レベルが高いほど、同じ軍人数でも強さが高い', () => {
    const w = emptyWorld()
    const c = w.countries[0]!
    c.soldiers = 10
    c.level = 1
    const lv1 = strength(c)
    c.level = 3
    expect(strength(c)).toBeGreaterThan(lv1)
  })
})
