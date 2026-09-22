import type { BuildingKind, PersonalityId } from './types'

/**
 * 全パラメータ。数値はすべて仮値(docs/spec.md 参照)で、バランス検証(scripts/balance.ts)で調整する。
 * 検証スクリプトから書き換えられるよう、通常のミュータブルなオブジェクトにしている。
 */

export interface LevelDef {
  name: string
  minLand: number
  minFood: number
  minOre: number
  /** 全建物に乗算する生産効率 */
  efficiency: number
  /** 新規装備の攻撃力 */
  equipAtk: number
}

export interface BuildingDef {
  label: string
  /** 稼働に必要な周囲 8 マスの自国民間人数 */
  minWorkers: number
  /** 生産周期(ターン)。0 = 毎ターン出力 */
  cycle: number
  /** 周期ごとの消費 */
  foodCost: number
  oreCost: number
  /** 毎ターン出力(cycle = 0 の建物) */
  outFood: number
  outOre: number
}

export interface PersonalityDef {
  label: string
  /** 平時の目標軍人比率 */
  ratio: number
  /** 総動員時の目標軍人比率 */
  mobRatio: number
  /** 装備の備蓄上限 */
  stockCap: number
  /** 攻撃性(0〜1) */
  aggression: number
  /** 建設の重み */
  weights: Record<'house' | 'farm' | 'mine' | 'workshop', number>
  /** 工房の個数上限に掛ける倍率(調整用。既定 1) */
  workshopCapMul: number
  /** 新規装備の攻撃力に掛ける倍率(好戦的の攻撃補正) */
  attackMul: number
  /** 全建物の生産効率に掛ける倍率(平和的の内政補正) */
  economyMul: number
}

export const CONFIG = {
  width: 100,
  height: 100,
  defaultCountryCount: 4,
  minCountries: 2,
  maxCountries: 8,

  world: {
    edgeMargin: 10,
    initialRadius: 3,
    initialCivilians: 6,
    initialFood: 20,
    initialOre: 10,
    initialEquipment: 0,
  },

  units: {
    cellCapacity: 4,
    civilianHp: 10,
    civilianAtk: 1,
    soldierHp: 20,
  },

  efficiency: {
    /** この人数で最大効率 */
    fullPeople: 16,
  },

  /** 生産の基準値(効率 100% のとき) */
  buildings: {
    village: { label: '村', minWorkers: 0, cycle: 20, foodCost: 0, oreCost: 0, outFood: 0, outOre: 0 },
    house: { label: '住居', minWorkers: 0, cycle: 10, foodCost: 5, oreCost: 0, outFood: 0, outOre: 0 },
    mine: { label: '鉱山', minWorkers: 2, cycle: 0, foodCost: 0, oreCost: 0, outFood: 0, outOre: 0.5 },
    farm: { label: '畑', minWorkers: 2, cycle: 0, foodCost: 0, oreCost: 0, outFood: 1.0, outOre: 0 },
    workshop: { label: '工房', minWorkers: 2, cycle: 6, foodCost: 1, oreCost: 2, outFood: 0, outOre: 0 },
  } as Record<BuildingKind, BuildingDef>,

  construction: {
    interval: 8,
    /** 建設コスト */
    cost: {
      house: { ore: 5, food: 2 },
      farm: { ore: 3, food: 2 },
      mine: { ore: 6, food: 2 },
      workshop: { ore: 12, food: 4 },
    } as Record<'house' | 'farm' | 'mine' | 'workshop', { ore: number; food: number }>,
    /**
     * 建物の個数上限 = base + floor(これまでの最大領土 / perLand)。領土に比例して増え、領土が減っても下がらない。
     */
    capBase: { house: 2, farm: 2, mine: 2, workshop: 1 } as Record<
      'house' | 'farm' | 'mine' | 'workshop',
      number
    >,
    capPerLand: { house: 30, farm: 30, mine: 50, workshop: 100 } as Record<
      'house' | 'farm' | 'mine' | 'workshop',
      number
    >,
    /** 工房を最低 1 つ建てるための、非村建物の数の目安 */
    workshopAfter: 5,
    candidateSamples: 40,
  },

  levels: [
    { name: '村', minLand: 0, minFood: 0, minOre: 0, efficiency: 1.0, equipAtk: 6 },
    { name: '街', minLand: 100, minFood: 50, minOre: 30, efficiency: 1.25, equipAtk: 9 },
    { name: '都市', minLand: 300, minFood: 200, minOre: 100, efficiency: 1.5, equipAtk: 13 },
  ] as LevelDef[],

  /** 人口の上限 = max(minCap, 領土マス数 × density)。住居・村は上限に達すると民間人を生産しない */
  population: {
    density: 0.5,
    minCap: 24,
  },

  military: {
    /** 軍人の攻撃範囲: 自分のマスと、上下左右のこの距離(1 = 隣接 4 マス)。民間人は同じマスのみ */
    reach: 1,
    /** 軍人 1 体あたり毎ターンの食料 */
    upkeepFood: 0.05,
    starveDamage: 1,
    convertPerTurn: 2,
    convertPerTurnMobilized: 10,
    /** 敵軍人が自国領からいなくなってから総動員を解除するまで */
    demobilizeAfter: 20,
    defenseBonus: 1.25,
  },

  personalities: {
    warlike: {
      label: '好戦的',
      ratio: 0.3,
      mobRatio: 0.45,
      stockCap: 5,
      aggression: 0.9,
      weights: { house: 1, farm: 1, mine: 1.5, workshop: 2 },
      workshopCapMul: 1,
      attackMul: 1.3,
      economyMul: 1,
    },
    balanced: {
      label: '中庸',
      ratio: 0.2,
      mobRatio: 0.35,
      stockCap: 12,
      aggression: 0.5,
      weights: { house: 1, farm: 1, mine: 1, workshop: 1 },
      workshopCapMul: 1,
      attackMul: 1,
      economyMul: 1,
    },
    peaceful: {
      label: '平和的',
      ratio: 0.08,
      mobRatio: 0.5,
      stockCap: 80,
      aggression: 0.15,
      weights: { house: 1.5, farm: 1.5, mine: 1, workshop: 0.5 },
      workshopCapMul: 1,
      attackMul: 1.2,
      economyMul: 1.1,
    },
  } as Record<PersonalityId, PersonalityDef>,

  occupation: {
    radius: 2,
    /** 半径内の他国領有マス数がこの割合を超えたら占領(24 マス中 13) */
    ratio: 0.5,
  },

  ai: {
    /** 民間人のうち開拓者(領土を広げる役)になる割合。バランス検証で決定(docs/spec.md §15) */
    settlerRatio: 0.5,
    fieldInterval: 4,
    /** 開拓者・拡張軍人が、勾配を無視してランダムに歩く確率(領土が一本道にならず太る) */
    expandWander: 0.4,
    /** 作業スポットにいる民間人が動く確率 */
    workerWander: 0.03,
  },

  /** 国の戦略(攻撃目標の選択)。強さの比が (base - aggr × aggrWeight) 以上なら侵攻する */
  strategy: {
    interval: 12,
    /** 侵攻を始めるのに必要な軍人数(少数での突撃を避ける) */
    minSoldiers: 5,
    thresholdBase: 1.6,
    thresholdAggr: 1.5,
    /**
     * 戦争疲れ(war weariness): 国境を接した相手がいるのに、しきい値未達で開戦を見送るたびにしきい値を下げる
     * (1 回の見直しごとに standoffDecay ずつ)。互角の相手同士がいつまでも睨み合って動かなくなるのを防ぐ。
     * しきい値は thresholdFloor までしか下がらない(それ以上は下げない)。開戦すると疲れはリセットされる。
     */
    standoffDecay: 0.01,
    thresholdFloor: 0.5,
    /** 相手の強さが自国のこの割合以下なら、村を直接狙う(首狩り) */
    snipeRatio: 0.34,
    /** 装備の在庫 1 個を、軍人何体分の強さとみなすか */
    equipPower: 0.5,
  },

  /** 軍人の戦術。周囲 radius マスで、敵軍人が foes 体以上かつ味方の ratio 倍を超えたら撤退する */
  tactics: {
    radius: 3,
    retreatFoes: 3,
    retreatRatio: 1.8,
  },

  /**
   * 孤立崩壊: 建物を 1 つも持たない状態が長く続く国(生産手段が無く、経済を立て直せない)は、
   * 全ユニットが少しずつ弱っていく。敵の手が届かない僻地に最後の 1 体が残り続けて
   * 永遠に決着がつかない、という事態を防ぐための最終手段。猶予期間中は影響しない。
   */
  collapse: {
    graceTurns: 150,
    hpDecayPerTurn: 0.25,
  },

  stats: {
    interval: 10,
    maxSamples: 1000,
  },

  events: {
    max: 5000,
    /** 大規模戦闘とみなす損害数 */
    bigBattleLosses: 5,
  },

  colors: [
    '#e74c3c', // 赤
    '#3498db', // 青
    '#2ecc71', // 緑
    '#f1c40f', // 黄
    '#9b59b6', // 紫
    '#1abcc4', // 水色
    '#ff7eb6', // ピンク
    '#e67e22', // 橙
  ],
  names: ['アルド', 'ベルネ', 'カリム', 'ドラン', 'エルミ', 'フォルト', 'ガレス', 'ハーゼ'],
}

export const PERSONALITY_IDS: PersonalityId[] = ['warlike', 'balanced', 'peaceful']
