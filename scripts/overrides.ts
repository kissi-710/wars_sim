import { CONFIG } from '../src/core/config'

/** CONFIG_OVERRIDES='{"military":{"upkeepFood":0.1}}' のように、実行時に設定を上書きする(調整実験用)。 */
export function applyOverrides(): void {
  const raw = process.env.CONFIG_OVERRIDES
  if (!raw) return
  const merge = (dst: Record<string, unknown>, src: Record<string, unknown>): void => {
    for (const [k, v] of Object.entries(src)) {
      const cur = dst[k]
      if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object') {
        merge(cur as Record<string, unknown>, v as Record<string, unknown>)
      } else {
        dst[k] = v
      }
    }
  }
  merge(CONFIG as unknown as Record<string, unknown>, JSON.parse(raw) as Record<string, unknown>)
  console.error(`[overrides] ${raw}`)
}
