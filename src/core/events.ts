import { CONFIG } from './config'
import type { EventType, Importance, SimEvent, World } from './types'

/** 構造化イベントを記録する。ログ・トースト・オートカメラ・バランス検証で共用。 */
export function pushEvent(
  world: World,
  type: EventType,
  importance: Importance,
  countries: number[],
  pos: { x: number; y: number } | undefined,
  data: Record<string, number | string> = {},
): SimEvent {
  const ev: SimEvent = {
    id: world.nextEventId++,
    turn: world.turn,
    type,
    importance,
    countries,
    pos,
    data,
  }
  world.events.push(ev)
  if (world.events.length > CONFIG.events.max + 200) pruneEvents(world)
  return ev
}

/** 上限を超えたら、古い「詳細」から先に捨てる。 */
function pruneEvents(world: World): void {
  let excess = world.events.length - CONFIG.events.max
  if (excess <= 0) return
  const kept: SimEvent[] = []
  for (const ev of world.events) {
    if (excess > 0 && ev.importance === 'minor') {
      excess--
      continue
    }
    kept.push(ev)
  }
  if (excess > 0) kept.splice(0, excess)
  world.events = kept
}
