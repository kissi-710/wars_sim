import { describe, expect, it } from 'vitest'
import { CONFIG } from '../src/core/config'
import { pushEvent } from '../src/core/events'
import { stepWorld } from '../src/core/sim'
import { recordStats } from '../src/core/stats'
import { NO_OWNER } from '../src/core/types'
import { updateCivilization } from '../src/core/systems/civilization'
import { resolveCombat } from '../src/core/systems/combat'
import { buildingCap, construct } from '../src/core/systems/construction'
import { computeEfficiency, peopleEfficiency } from '../src/core/systems/efficiency'
import { updateMobilization } from '../src/core/systems/mobilization'
import { checkOccupation } from '../src/core/systems/occupation'
import { produce } from '../src/core/systems/production'
import { updateTerritory } from '../src/core/systems/territory'
import { applyUpkeep } from '../src/core/systems/upkeep'
import {
  addBuilding,
  countBuildings,
  createWorld,
  idx,
  refreshPopulation,
  spawnUnit,
} from '../src/core/world'
import { claim, emptyWorld } from './helpers'

describe('ワールド生成', () => {
  it('同一シードなら同一の展開になる(決定性)', () => {
    const a = createWorld({ seed: 42, countryCount: 4 })
    const b = createWorld({ seed: 42, countryCount: 4 })
    for (let i = 0; i < 150; i++) {
      stepWorld(a)
      stepWorld(b)
    }
    expect(Array.from(a.owner)).toEqual(Array.from(b.owner))
    expect(a.units.size).toBe(b.units.size)
    expect(a.countries.map((c) => c.stock)).toEqual(b.countries.map((c) => c.stock))
    expect(a.events.length).toBe(b.events.length)
  })

  it('各国に村・初期領土(7×7)・デフォルト建物・民間人 6 が置かれる', () => {
    const w = createWorld({ seed: 7, countryCount: 4 })
    for (const c of w.countries) {
      const b = countBuildings(w, c.id)
      expect(b.village).toBe(1)
      expect(b.farm).toBe(1)
      expect(b.mine).toBe(1)
      expect(b.house).toBe(1)
      expect(c.land).toBe(49)
      expect(c.civilians).toBe(CONFIG.world.initialCivilians)
    }
  })

  it('村どうしは離れて配置される', () => {
    const w = createWorld({ seed: 3, countryCount: 8 })
    const v = [...w.buildings.values()].filter((b) => b.kind === 'village')
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        expect(Math.hypot(v[i]!.x - v[j]!.x, v[i]!.y - v[j]!.y)).toBeGreaterThan(14)
      }
    }
  })
})

describe('マスとユニット', () => {
  it('1 マスにユニットは 4 体まで。建物マスには入れない', () => {
    const w = emptyWorld()
    for (let k = 0; k < 4; k++) expect(spawnUnit(w, 0, 'civilian', 10, 10, 'work')).not.toBeNull()
    expect(spawnUnit(w, 0, 'civilian', 10, 10, 'work')).toBeNull()
    addBuilding(w, 'farm', 0, 20, 20)
    expect(spawnUnit(w, 0, 'civilian', 20, 20, 'work')).toBeNull()
  })
})

describe('生産効率', () => {
  it('周囲の人数 0/8/16/32 で 100%/150%/200%/200%', () => {
    expect(peopleEfficiency(0)).toBe(1)
    expect(peopleEfficiency(8)).toBe(1.5)
    expect(peopleEfficiency(16)).toBe(2)
    expect(peopleEfficiency(32)).toBe(2)
  })

  it('周囲 8 マスの自国民間人だけを数える(軍人・他国・8 近傍の外は数えない)', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 30, 30)
    const b = addBuilding(w, 'farm', 0, 10, 10)
    spawnUnit(w, 0, 'civilian', 11, 10, 'work')
    spawnUnit(w, 0, 'civilian', 9, 9, 'work')
    spawnUnit(w, 0, 'soldier', 10, 11, 'attack')
    spawnUnit(w, 1, 'civilian', 11, 11, 'work')
    spawnUnit(w, 0, 'civilian', 12, 10, 'work')
    computeEfficiency(w)
    expect(b.workers).toBe(2)
    expect(b.efficiency).toBeCloseTo(1 + 2 / 16, 9)
  })
})

describe('生産', () => {
  it('畑・鉱山は周囲の民間人が最低人数に満たないと止まり、満たすと効率つきで出力する', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 30, 30)
    addBuilding(w, 'farm', 0, 10, 10)
    addBuilding(w, 'mine', 0, 20, 20)
    spawnUnit(w, 0, 'civilian', 11, 10, 'work')
    computeEfficiency(w)
    produce(w)
    expect(w.countries[0]!.stock.food).toBe(0)
    spawnUnit(w, 0, 'civilian', 9, 10, 'work')
    computeEfficiency(w)
    produce(w)
    expect(w.countries[0]!.stock.food).toBeCloseTo(1.0 * (1 + 2 / 16), 9)
  })

  it('村は食料も人も無くても(無条件に)民間人を生産する。住居より遅い', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 30, 30)
    addBuilding(w, 'village', 0, 10, 10)
    let turns = 0
    while (w.countries[0]!.civilians === 0 && turns < 100) {
      computeEfficiency(w)
      produce(w)
      refreshPopulation(w)
      turns++
    }
    expect(turns).toBe(CONFIG.buildings.village.cycle)
    expect(w.units.size).toBe(1)

    const w2 = emptyWorld()
    claim(w2, 0, 0, 0, 30, 30)
    addBuilding(w2, 'house', 0, 10, 10)
    w2.countries[0]!.stock.food = 100
    let t2 = 0
    while (w2.units.size === 0 && t2 < 100) {
      computeEfficiency(w2)
      produce(w2)
      t2++
    }
    expect(t2).toBe(CONFIG.buildings.house.cycle)
    expect(t2).toBeLessThan(turns)
    expect(w2.countries[0]!.stock.food).toBe(95)
  })

  it('住居は食料が無いと停止する', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 30, 30)
    const b = addBuilding(w, 'house', 0, 10, 10)
    for (let i = 0; i < 30; i++) {
      computeEfficiency(w)
      produce(w)
    }
    expect(b.status).toBe('no-food')
    expect(w.units.size).toBe(0)
  })

  it('工房は装備が備蓄上限に達すると停止する(上限は性格で決まる)', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 30, 30)
    const c = w.countries[0]!
    c.personality = 'warlike'
    c.stock = { food: 1000, ore: 1000, equipment: CONFIG.personalities.warlike.stockCap }
    const b = addBuilding(w, 'workshop', 0, 10, 10)
    spawnUnit(w, 0, 'civilian', 11, 10, 'work')
    spawnUnit(w, 0, 'civilian', 9, 10, 'work')
    computeEfficiency(w)
    produce(w)
    expect(b.status).toBe('stock-cap')
    c.personality = 'peaceful'
    computeEfficiency(w)
    produce(w)
    expect(b.status).toBe('ok')
  })
})

describe('建設と個数制限', () => {
  it('国が建てる建物は個数上限を超えない(初期建物も数える)', () => {
    const w = createWorld({ seed: 5, countryCount: 2 })
    for (const c of w.countries) c.stock = { food: 100000, ore: 100000, equipment: 0 }
    for (let t = 0; t < 600; t++) {
      w.turn = t
      construct(w)
    }
    for (const c of w.countries) {
      const n = countBuildings(w, c.id)
      expect(n.house).toBeLessThanOrEqual(buildingCap(c, 'house'))
      expect(n.farm).toBeLessThanOrEqual(buildingCap(c, 'farm'))
      expect(n.mine).toBeLessThanOrEqual(buildingCap(c, 'mine'))
      expect(n.workshop).toBeLessThanOrEqual(buildingCap(c, 'workshop'))
      expect(n.workshop).toBeGreaterThanOrEqual(1)
    }
  })

  it('個数上限は最大領土に比例して増え、領土が減っても下がらない', () => {
    const w = createWorld({ seed: 5, countryCount: 2 })
    const c = w.countries[0]!
    c.peakLand = 60
    const small = buildingCap(c, 'house')
    c.peakLand = 600
    const big = buildingCap(c, 'house')
    expect(big).toBeGreaterThan(small)
    expect(big).toBe(CONFIG.construction.capBase.house + Math.floor(600 / CONFIG.construction.capPerLand.house))
    // 領土が減っても peakLand(=上限の元)は減らない
    c.land = 10
    c.peakLand = Math.max(c.peakLand, c.land)
    expect(buildingCap(c, 'house')).toBe(big)
  })

  it('sim を回すと peakLand は領土の最大値を保持する', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 19, 14) // 300 マス
    addBuilding(w, 'village', 0, 5, 5)
    spawnUnit(w, 0, 'civilian', 6, 5, 'work')
    stepWorld(w)
    expect(w.countries[0]!.peakLand).toBe(300)
    claim(w, 1, 10, 0, 19, 14) // 隣国に半分ほど奪われる
    stepWorld(w)
    expect(w.countries[0]!.land).toBeLessThan(300)
    expect(w.countries[0]!.peakLand).toBe(300)
  })
})

describe('領土', () => {
  it('ユニットが踏んだ無所有地・他国領は自国のものになり、自国領は変わらない', () => {
    const w = emptyWorld()
    claim(w, 1, 5, 5, 5, 5)
    spawnUnit(w, 0, 'civilian', 5, 5, 'work')
    spawnUnit(w, 0, 'civilian', 6, 5, 'work')
    updateTerritory(w)
    expect(w.owner[idx(w, 5, 5)]).toBe(0)
    expect(w.owner[idx(w, 6, 5)]).toBe(0)
    expect(w.countries[0]!.land).toBe(2)
    expect(w.countries[1]!.land).toBe(0)
  })

  it('敵と同居中のマスは変わらない', () => {
    const w = emptyWorld()
    claim(w, 1, 5, 5, 5, 5)
    spawnUnit(w, 0, 'soldier', 5, 5, 'attack')
    spawnUnit(w, 1, 'soldier', 5, 5, 'attack')
    updateTerritory(w)
    expect(w.owner[idx(w, 5, 5)]).toBe(1)
  })
})

describe('戦闘', () => {
  it('ダメージは同時に適用される(無所有地では補正なし)', () => {
    const w = emptyWorld()
    const a = spawnUnit(w, 0, 'soldier', 5, 5, 'attack')!
    const b = spawnUnit(w, 1, 'soldier', 5, 5, 'attack')!
    resolveCombat(w)
    expect(a.hp).toBe(20 - 6)
    expect(b.hp).toBe(20 - 6)
  })

  it('自国領で戦うと攻撃力に防衛補正がかかる', () => {
    const w = emptyWorld()
    claim(w, 0, 5, 5, 5, 5)
    const a = spawnUnit(w, 0, 'soldier', 5, 5, 'attack')!
    const b = spawnUnit(w, 1, 'soldier', 5, 5, 'attack')!
    resolveCombat(w)
    expect(b.hp).toBeCloseTo(20 - 6 * CONFIG.military.defenseBonus, 9)
    expect(a.hp).toBe(20 - 6)
  })

  it('民間人も戦えるが攻撃力は低く、HP が尽きると消滅する。決着でまとめ行が出る', () => {
    const w = emptyWorld()
    const civ = spawnUnit(w, 0, 'civilian', 5, 5, 'work')!
    const sol = spawnUnit(w, 1, 'soldier', 5, 5, 'attack')!
    resolveCombat(w)
    expect(civ.hp).toBe(10 - 6)
    expect(sol.hp).toBe(20 - 1)
    resolveCombat(w)
    expect(w.units.has(civ.id)).toBe(false)
    expect(w.countries[0]!.counters.civilianDeaths).toBe(1)
    expect(w.countries[1]!.counters.kills).toBe(1)
    // 戦闘が途切れて数ターンたつと、まとめ行が確定する
    w.turn += 5
    resolveCombat(w)
    const ev = w.events.filter((e) => e.type === 'battle')
    expect(ev).toHaveLength(1)
    expect(ev[0]!.data.total).toBe(1)
    expect(w.events.some((e) => e.type === 'contact')).toBe(true)
  })

  it('全滅するまで続き、生き残った側がマスを取る', () => {
    const w = emptyWorld()
    spawnUnit(w, 0, 'soldier', 5, 5, 'attack')
    spawnUnit(w, 0, 'soldier', 5, 5, 'attack')
    spawnUnit(w, 1, 'civilian', 5, 5, 'work')
    for (let i = 0; i < 5; i++) resolveCombat(w)
    updateTerritory(w)
    expect(w.owner[idx(w, 5, 5)]).toBe(0)
    expect([...w.units.values()].every((u) => u.owner === 0)).toBe(true)
  })
})

describe('建物の占領', () => {
  function setup(enemyCells: number) {
    const w = emptyWorld()
    claim(w, 1, 40, 40, 60, 60)
    addBuilding(w, 'farm', 1, 50, 50)
    // 半径 2 の 24 マスのうち enemyCells マスを国 0 が持つ
    let n = 0
    for (let dy = -2; dy <= 2 && n < enemyCells; dy++) {
      for (let dx = -2; dx <= 2 && n < enemyCells; dx++) {
        if (dx === 0 && dy === 0) continue
        claim(w, 0, 50 + dx, 50 + dy, 50 + dx, 50 + dy)
        n++
      }
    }
    return w
  }

  it('24 マス中 13 マス(過半数)を奪われると占領される', () => {
    const w = setup(13)
    checkOccupation(w)
    const b = [...w.buildings.values()][0]!
    expect(b.owner).toBe(0)
    expect(w.owner[idx(w, 50, 50)]).toBe(0)
    expect(w.countries[0]!.counters.occupied).toBe(1)
    expect(w.countries[1]!.counters.lost).toBe(1)
    expect(w.events.some((e) => e.type === 'occupy')).toBe(true)
  })

  it('12 マスでは占領されない', () => {
    const w = setup(12)
    checkOccupation(w)
    expect([...w.buildings.values()][0]!.owner).toBe(1)
  })

  it('占領された国は総動員する。村の占領は重大イベント', () => {
    const w = emptyWorld()
    claim(w, 1, 40, 40, 60, 60)
    addBuilding(w, 'village', 1, 50, 50)
    addBuilding(w, 'farm', 1, 60, 60)
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) if (dx !== 0 || dy !== 0) claim(w, 0, 50 + dx, 50 + dy, 50 + dx, 50 + dy)
    }
    spawnUnit(w, 1, 'civilian', 45, 45, 'work')
    checkOccupation(w)
    const ev = w.events.find((e) => e.type === 'occupy')!
    expect(ev.importance).toBe('major')
    w.turn++
    updateMobilization(w)
    expect(w.countries[1]!.mobilized).toBe(true)
  })
})

describe('軍人の維持費', () => {
  it('軍人だけが毎ターン食料 0.05 を消費する。民間人は消費しない', () => {
    const w = emptyWorld()
    for (let k = 0; k < 10; k++) spawnUnit(w, 0, 'soldier', 5 + (k % 5), 5 + ((k / 5) | 0), 'attack')
    for (let k = 0; k < 10; k++) spawnUnit(w, 0, 'civilian', 5 + (k % 5), 10 + ((k / 5) | 0), 'work')
    w.countries[0]!.stock.food = 10
    applyUpkeep(w)
    expect(w.countries[0]!.stock.food).toBeCloseTo(10 - 10 * CONFIG.military.upkeepFood, 9)
  })

  it('食料が足りないと支払えない軍人は飢餓ダメージを受け、HP 0 で消滅する', () => {
    const w = emptyWorld()
    for (let k = 0; k < 4; k++) spawnUnit(w, 0, 'soldier', 5 + k, 5, 'attack')
    w.countries[0]!.stock.food = 0
    applyUpkeep(w)
    expect([...w.units.values()].every((u) => u.hp === 19 && u.starving)).toBe(true)
    expect(w.events.some((e) => e.type === 'starve')).toBe(true)
    for (let i = 0; i < 25; i++) applyUpkeep(w)
    expect(w.units.size).toBe(0)
    expect(w.countries[0]!.counters.starved).toBe(4)
  })
})

describe('軍人化と総動員', () => {
  function prepared() {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 40, 40)
    addBuilding(w, 'village', 0, 20, 20)
    for (let k = 0; k < 40; k++) spawnUnit(w, 0, 'civilian', 5 + (k % 10), 5 + ((k / 10) | 0), 'work')
    refreshPopulation(w)
    return w
  }

  it('平時は目標軍人比率まで、1 ターン 2 体ずつ軍人化する', () => {
    const w = prepared()
    const c = w.countries[0]!
    c.personality = 'balanced'
    c.stock.equipment = 100
    updateMobilization(w)
    expect(c.soldiers).toBe(CONFIG.military.convertPerTurn)
    expect(c.stock.equipment).toBe(98)
    for (let i = 0; i < 20; i++) {
      w.turn++
      refreshPopulation(w)
      updateMobilization(w)
    }
    refreshPopulation(w)
    expect(c.soldiers / (c.soldiers + c.civilians)).toBeCloseTo(CONFIG.personalities.balanced.ratio, 1)
  })

  it('目標軍人比率は性格で違う(平和的は 10%)', () => {
    const w = prepared()
    const c = w.countries[0]!
    c.personality = 'peaceful'
    c.stock.equipment = 100
    for (let i = 0; i < 20; i++) {
      w.turn++
      refreshPopulation(w)
      updateMobilization(w)
    }
    refreshPopulation(w)
    expect(c.soldiers).toBe(Math.ceil(0.1 * 40))
  })

  it('自国領に敵の軍人がいると総動員し、1 ターンに 10 体まで一気に軍人化。解除は 20 ターン後', () => {
    const w = prepared()
    const c = w.countries[0]!
    c.personality = 'peaceful'
    c.stock.equipment = 30
    const enemy = spawnUnit(w, 1, 'soldier', 10, 10, 'attack')!
    updateMobilization(w)
    expect(c.mobilized).toBe(true)
    expect(c.soldiers).toBe(CONFIG.military.convertPerTurnMobilized)
    expect(w.events.some((e) => e.type === 'mobilize')).toBe(true)

    // 敵が去っても 20 ターンは総動員が続く
    w.units.delete(enemy.id)
    w.cellCount[idx(w, 10, 10)] = 0
    for (let i = 0; i < 19; i++) {
      w.turn++
      refreshPopulation(w)
      updateMobilization(w)
    }
    expect(c.mobilized).toBe(true)
    w.turn += 2
    updateMobilization(w)
    expect(c.mobilized).toBe(false)
    expect(w.events.some((e) => e.type === 'demobilize')).toBe(true)
  })

  it('軍人化した人は、その時点の文明レベルの装備攻撃力を持つ', () => {
    const w = prepared()
    const c = w.countries[0]!
    c.level = 3
    c.personality = 'warlike'
    c.stock.equipment = 5
    updateMobilization(w)
    const soldiers = [...w.units.values()].filter((u) => u.kind === 'soldier')
    expect(soldiers.length).toBeGreaterThan(0)
    expect(soldiers.every((u) => u.atk === CONFIG.levels[2]!.equipAtk)).toBe(true)
  })
})

describe('文明レベル', () => {
  it('領土 かつ 食料 かつ 鉱物 が揃うと上がる。片方だけでは上がらず、降格しない', () => {
    const w = emptyWorld()
    const c = w.countries[0]!
    const lv2 = CONFIG.levels[1]!
    claim(w, 0, 0, 0, 20, 20) // 441 マス
    c.stock = { food: lv2.minFood - 1, ore: lv2.minOre, equipment: 0 }
    updateCivilization(w)
    expect(c.level).toBe(1)
    c.stock.food = lv2.minFood
    updateCivilization(w)
    expect(c.level).toBe(2)
    expect(w.events.some((e) => e.type === 'levelUp')).toBe(true)
    c.stock = { food: 0, ore: 0, equipment: 0 }
    updateCivilization(w)
    expect(c.level).toBe(2)
  })
})

describe('滅亡と勝利', () => {
  it('村もユニットも無くなった国は滅亡し、最後の 1 国が勝者になる', () => {
    const w = emptyWorld()
    claim(w, 0, 0, 0, 10, 10)
    addBuilding(w, 'village', 0, 5, 5)
    spawnUnit(w, 0, 'civilian', 6, 5, 'work')
    stepWorld(w)
    expect(w.countries[1]!.alive).toBe(false)
    expect(w.winner).toBe(0)
    expect(w.events.some((e) => e.type === 'extinct')).toBe(true)
    expect(w.events.some((e) => e.type === 'victory')).toBe(true)
  })
})

describe('イベントと統計', () => {
  it('上限を超えると古い「詳細」から先に捨てる(重大は残る)', () => {
    const w = emptyWorld()
    pushEvent(w, 'victory', 'major', [0], undefined)
    for (let i = 0; i < CONFIG.events.max + 500; i++) pushEvent(w, 'convert', 'minor', [0], undefined)
    expect(w.events.length).toBeLessThanOrEqual(CONFIG.events.max + 200)
    expect(w.events[0]!.type).toBe('victory')
  })

  it('国ごとのサンプルは一定ターンごとに記録され、上限で間引かれる', () => {
    const w = emptyWorld()
    for (let t = 0; t <= 50; t++) {
      w.turn = t
      recordStats(w)
    }
    expect(w.samples[0]!.map((s) => s.turn)).toEqual([0, 10, 20, 30, 40, 50])
    const before = w.sampleInterval
    for (let t = 60; t <= CONFIG.stats.maxSamples * 10 + 20; t += 10) {
      w.turn = t
      recordStats(w)
    }
    expect(w.samples[0]!.length).toBeLessThanOrEqual(CONFIG.stats.maxSamples)
    expect(w.sampleInterval).toBeGreaterThan(before)
  })
})

describe('シミュレーション全体', () => {
  it('600 ターン回しても不変条件が保たれる(建物マスにユニット無し・4 体上限・領土数の整合)', () => {
    const w = createWorld({ seed: 11, countryCount: 4 })
    for (let t = 0; t < 600; t++) stepWorld(w)
    const size = w.width * w.height
    const land = new Array(w.countries.length).fill(0)
    for (let i = 0; i < size; i++) {
      expect(w.cellCount[i]!).toBeLessThanOrEqual(4)
      if (w.buildingAt[i] !== -1) expect(w.cellCount[i]).toBe(0)
      if (w.owner[i] !== NO_OWNER) land[w.owner[i]!]++
    }
    w.countries.forEach((c, i) => expect(c.land).toBe(land[i]))
    for (const b of w.buildings.values()) expect(w.owner[idx(w, b.x, b.y)]).toBe(b.owner)
  })
})
