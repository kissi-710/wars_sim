import { CONFIG } from '../core/config'
import type { BuildingKind, BuildingStatus, SimEvent, World } from '../core/types'

export const KIND_LABEL: Record<BuildingKind, string> = {
  village: '村',
  house: '住居',
  mine: '鉱山',
  farm: '畑',
  workshop: '工房',
}

export const STATUS_LABEL: Record<BuildingStatus, string> = {
  ok: '稼働中',
  'no-food': '停止(食料不足)',
  'no-ore': '停止(鉱物不足)',
  'no-workers': '停止(周囲の民間人が不足)',
  'stock-cap': '停止(装備の備蓄が上限)',
  'no-space': '待機(出現できる空きマスが無い)',
  'pop-cap': '待機(人口が上限)',
  inactive: '停止(国が滅亡)',
}

export const EVENT_TYPE_LABEL: Record<SimEvent['type'], string> = {
  occupy: '占領',
  levelUp: '文明',
  mobilize: '総動員',
  demobilize: '総動員',
  contact: '接触',
  declare: '侵攻',
  battle: '戦闘',
  build: '建設',
  starve: '飢餓',
  convert: '軍人化',
  collapse: '孤立',
  extinct: '滅亡',
  victory: '勝利',
  milestone: '節目',
}

/** ログのフィルタ用カテゴリ */
export const EVENT_CATEGORIES: { id: string; label: string; types: SimEvent['type'][] }[] = [
  { id: 'battle', label: '戦闘', types: ['battle', 'contact', 'declare'] },
  { id: 'occupy', label: '占領', types: ['occupy'] },
  { id: 'build', label: '建設', types: ['build'] },
  { id: 'civ', label: '文明', types: ['levelUp', 'milestone'] },
  { id: 'war', label: '総動員/軍人化', types: ['mobilize', 'demobilize', 'convert'] },
  { id: 'state', label: '国家', types: ['extinct', 'victory'] },
  { id: 'starve', label: '飢餓', types: ['starve', 'collapse'] },
]

export function categoryOf(type: SimEvent['type']): string {
  return EVENT_CATEGORIES.find((c) => c.types.includes(type))?.id ?? 'other'
}

export function personalityLabel(id: keyof typeof CONFIG.personalities): string {
  return CONFIG.personalities[id].label
}

export function levelName(level: number): string {
  return CONFIG.levels[level - 1]?.name ?? '?'
}

/** イベントを 1 行の文にする */
export function formatEvent(ev: SimEvent, world: World): string {
  const name = (i: number | undefined) => (i === undefined ? '?' : (world.countries[i]?.name ?? '?'))
  const a = name(ev.countries[0])
  const b = name(ev.countries[1])
  const d = ev.data
  switch (ev.type) {
    case 'occupy':
      return `${a}が${b}の${KIND_LABEL[d.kind as BuildingKind]}を占領`
    case 'levelUp':
      return `${a}が「${d.name}」に発展(Lv${d.level})`
    case 'mobilize':
      return `${a}が総動員を発令`
    case 'demobilize':
      return `${a}の総動員が解除`
    case 'contact':
      return `${a}と${b}が初めて交戦`
    case 'declare':
      return d.snipe ? `${a}が${b}の村を狙って侵攻を開始(首狩り)` : `${a}が${b}への侵攻を開始`
    case 'battle': {
      const losses = ev.countries.map((c) => `${name(c)} ${d[`l${c}`] ?? 0}`).join(' / ')
      return `戦闘が決着(${d.duration}ターン)。損害: ${losses}`
    }
    case 'build':
      return `${a}が${KIND_LABEL[d.kind as BuildingKind]}を建設`
    case 'starve':
      return d.lost !== undefined
        ? `${a}の軍人が飢餓で ${d.lost} 体死亡`
        : `${a}の軍人 ${d.soldiers} 体が飢餓(食料不足)`
    case 'convert':
      return `${a}で ${d.count} 体が軍人化`
    case 'collapse':
      return `${a}は建物を全て失い、孤立して弱り始めた`
    case 'extinct':
      return `${a}が滅亡した`
    case 'victory':
      return `${a}の勝利`
    default:
      return String(ev.type)
  }
}

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}
