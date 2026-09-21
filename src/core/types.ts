import type { Rng } from './rng'

export type BuildingKind = 'village' | 'house' | 'mine' | 'farm' | 'workshop'
export type UnitKind = 'civilian' | 'soldier'
export type PersonalityId = 'warlike' | 'balanced' | 'peaceful'
/** 民間人: work(作業)/expand(開拓)。軍人: attack(侵攻)/expand(開拓) */
export type Stance = 'work' | 'attack' | 'expand'

/** 建物の稼働状況(UI 表示用) */
export type BuildingStatus =
  | 'ok'
  | 'no-food'
  | 'no-ore'
  | 'no-workers'
  | 'stock-cap'
  | 'no-space'
  | 'pop-cap'
  | 'inactive'

export const NO_OWNER = 255
export const NO_BUILDING = -1
export const NO_UNIT = -1

export interface Building {
  id: number
  kind: BuildingKind
  owner: number
  x: number
  y: number
  /** 次の生産までの進捗 */
  progress: number
  /** 周囲 8 マスの自国民間人数 */
  workers: number
  /** 最終効率(人数効率 × 文明レベル補正) */
  efficiency: number
  status: BuildingStatus
}

export interface Unit {
  id: number
  kind: UnitKind
  owner: number
  x: number
  y: number
  /** 直前のターン開始時の位置(移動アニメーション用) */
  px: number
  py: number
  hp: number
  maxHp: number
  atk: number
  stance: Stance
  starving: boolean
  /** 最後にダメージを与えた国(撃破数の集計用) */
  lastHitBy: number
}

export interface Stock {
  food: number
  ore: number
  equipment: number
}

export interface Counters {
  kills: number
  civilianDeaths: number
  soldierDeaths: number
  occupied: number
  lost: number
  starved: number
}

export interface Country {
  id: number
  name: string
  color: string
  personality: PersonalityId
  alive: boolean
  level: number
  stock: Stock
  mobilized: boolean
  /** 軍人に飢餓が出ているか(ログの重複防止) */
  starving: boolean
  lastThreatTurn: number
  /** 建物を占領されたターン(総動員のトリガ) */
  lostBuildingTurn: number
  /** 毎ターン収支(移動平均。軍人の維持費込み) */
  flowFood: number
  flowOre: number
  land: number
  /** これまでの最大領土。建物の個数上限はこれに比例し、領土が減っても下がらない */
  peakLand: number
  civilians: number
  soldiers: number
  villages: number
  /** 戦略: 攻撃目標の国(無ければ -1)と、現在の構え */
  warTarget: number
  posture: Posture
  /** 相手が弱く、村を直接狙う(首狩り)か */
  snipe: boolean
  strategyAt: number
  counters: Counters
}

/** attack: 攻撃目標へ侵攻 / defend: 領土の防衛 / peace: 敵対行動なし(開拓・待機) */
export type Posture = 'attack' | 'defend' | 'peace'

export type EventType =
  | 'occupy'
  | 'levelUp'
  | 'mobilize'
  | 'demobilize'
  | 'contact'
  | 'declare'
  | 'battle'
  | 'build'
  | 'starve'
  | 'convert'
  | 'extinct'
  | 'victory'
  | 'milestone'

export type Importance = 'major' | 'normal' | 'minor'

export interface SimEvent {
  id: number
  turn: number
  type: EventType
  importance: Importance
  /** 関係国(主体, 相手の順) */
  countries: number[]
  pos?: { x: number; y: number }
  data: Record<string, number | string>
}

export interface CountrySample {
  turn: number
  land: number
  civilians: number
  soldiers: number
  food: number
  ore: number
  equipment: number
}

/** 戦闘のまとまり(付近の戦闘が続いている間 1 件として集計し、収まったらログに出す) */
export interface BattleRecord {
  start: number
  /** 最後に戦闘があったターン */
  last: number
  countries: number[]
  losses: Record<number, number>
  pos: { x: number; y: number }
}

/** BFS 距離場(国ごと・用途ごと) */
export interface CountryFields {
  work: Int16Array
  expand: Int16Array
  attack: Int16Array
  defend: Int16Array
  /** 自国の建物へ戻る(撤退) */
  home: Int16Array
  /** 敵国との国境沿い(待機・警戒) */
  guard: Int16Array
  workAt: number
  expandAt: number
  attackAt: number
  defendAt: number
  homeAt: number
  guardAt: number
  attackFor: number
  hasWork: boolean
  hasExpand: boolean
  hasAttack: boolean
  hasDefend: boolean
  hasHome: boolean
  hasGuard: boolean
  /** 作業員が足りず稼働できていない建物(鉱山・畑・工房)がある */
  understaffed: boolean
}

export interface GameOptions {
  seed: number
  countryCount: number
  /** 国ごとの性格。'random' または未指定ならシードから割り当て */
  personalities?: (PersonalityId | 'random')[]
}

export interface World {
  width: number
  height: number
  turn: number
  seed: number
  options: GameOptions
  rng: Rng
  owner: Uint8Array
  buildingAt: Int32Array
  cellCount: Uint8Array
  cellUnits: Int32Array
  units: Map<number, Unit>
  buildings: Map<number, Building>
  nextUnitId: number
  nextBuildingId: number
  countries: Country[]
  fields: CountryFields[]
  /** 国ごとの時系列統計(10 ターンごと) */
  samples: CountrySample[][]
  sampleInterval: number
  events: SimEvent[]
  nextEventId: number
  battles: Map<number, BattleRecord>
  /** このターンに戦闘があったマス(攻撃側・被弾側)。マップの戦闘マーカー用 */
  fightCells: Set<number>
  /** このターンの攻撃線 [from, to, from, to, ...](マス index)。拡大時の演出用 */
  hits: number[]
  contactPairs: Set<number>
  winner: number | null
}
