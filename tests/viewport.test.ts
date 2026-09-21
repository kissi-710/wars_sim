import { describe, expect, it } from 'vitest'
import {
  MAX_SCALE,
  centerOn,
  clampViewport,
  fitViewport,
  minScale,
  panByPixels,
  screenToWorld,
  visibleCells,
  worldToScreen,
  zoomAt,
} from '../src/render/viewport'

const size = { width: 800, height: 600 }
const map = { width: 100, height: 100 }

describe('viewport', () => {
  it('worldToScreen と screenToWorld は往復で一致する', () => {
    const vp = { scale: 7.5, cx: 33.2, cy: 61.7 }
    const s = worldToScreen(vp, size, 12.3, 45.6)
    const w = screenToWorld(vp, size, s.x, s.y)
    expect(w.x).toBeCloseTo(12.3, 9)
    expect(w.y).toBeCloseTo(45.6, 9)
  })

  it('zoomAt はカーソル下のワールド座標を動かさない', () => {
    const vp = { scale: 6, cx: 50, cy: 50 }
    const before = screenToWorld(vp, size, 200, 150)
    const next = zoomAt(vp, size, map, 2, 200, 150)
    expect(next.scale).toBeCloseTo(12, 9)
    const after = screenToWorld(next, size, 200, 150)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
  })

  it('スケールは最小(全体の 60%)〜最大(80px/マス)に収まる', () => {
    const vp = fitViewport(size, map)
    const tiny = zoomAt(vp, size, map, 0.0001, 400, 300)
    expect(tiny.scale).toBeCloseTo(minScale(size, map), 9)
    const huge = zoomAt(vp, size, map, 10000, 400, 300)
    expect(huge.scale).toBe(MAX_SCALE)
  })

  it('どのマスも画面中央に置ける(中心はマップ内なら許可、外は丸める)', () => {
    const corner = centerOn({ scale: 20, cx: 50, cy: 50 }, size, map, 0, 0)
    expect(corner.cx).toBe(0)
    expect(corner.cy).toBe(0)
    const out = clampViewport({ scale: 20, cx: -30, cy: 500 }, size, map)
    expect(out.cx).toBe(0)
    expect(out.cy).toBe(100)
  })

  it('panByPixels はドラッグ方向に内容を動かす', () => {
    const vp = { scale: 10, cx: 50, cy: 50 }
    const next = panByPixels(vp, size, map, 100, -50)
    expect(next.cx).toBeCloseTo(40, 9)
    expect(next.cy).toBeCloseTo(55, 9)
  })

  it('全体表示はマップ全体が収まり中央に来る', () => {
    const vp = fitViewport(size, map)
    const a = worldToScreen(vp, size, 0, 0)
    const b = worldToScreen(vp, size, 100, 100)
    expect(a.x).toBeGreaterThanOrEqual(0)
    expect(a.y).toBeGreaterThanOrEqual(0)
    expect(b.x).toBeLessThanOrEqual(size.width)
    expect(b.y).toBeLessThanOrEqual(size.height)
    expect(vp.cx).toBe(50)
  })

  it('visibleCells は見えているマス範囲をマップ内に丸める', () => {
    const vp = { scale: 10, cx: 50, cy: 50 }
    const v = visibleCells(vp, size, map)
    expect(v.x0).toBe(10)
    expect(v.x1).toBe(90)
    const corner = visibleCells({ scale: 10, cx: 0, cy: 0 }, size, map)
    expect(corner.x0).toBe(0)
    expect(corner.y0).toBe(0)
  })
})
