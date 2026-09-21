/**
 * ビュー変換(ズーム・パン)の純粋関数。
 * screen = (world - center) * scale + viewSize / 2   (world はマス単位・小数可、scale は px/マス)
 */

export interface Viewport {
  /** 1 マスあたりの CSS px */
  scale: number
  /** 画面中央に来るワールド座標 */
  cx: number
  cy: number
}

export interface ViewSize {
  width: number
  height: number
}

export interface MapSize {
  width: number
  height: number
}

export const MAX_SCALE = 80
/** 全体表示に対する最小スケールの割合 */
export const MIN_SCALE_RATIO = 0.6
const FIT_PADDING = 16

export function worldToScreen(vp: Viewport, size: ViewSize, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - vp.cx) * vp.scale + size.width / 2, y: (wy - vp.cy) * vp.scale + size.height / 2 }
}

export function screenToWorld(vp: Viewport, size: ViewSize, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - size.width / 2) / vp.scale + vp.cx, y: (sy - size.height / 2) / vp.scale + vp.cy }
}

/** マップ全体が画面に収まるスケール */
export function fitScale(size: ViewSize, map: MapSize): number {
  const w = Math.max(1, size.width - FIT_PADDING * 2)
  const h = Math.max(1, size.height - FIT_PADDING * 2)
  return Math.min(w / map.width, h / map.height)
}

export function minScale(size: ViewSize, map: MapSize): number {
  return fitScale(size, map) * MIN_SCALE_RATIO
}

export function clampScale(scale: number, size: ViewSize, map: MapSize): number {
  const lo = Math.min(minScale(size, map), MAX_SCALE)
  return Math.max(lo, Math.min(MAX_SCALE, scale))
}

/** スケール範囲と、どのマスも画面中央に置ける範囲(中心がマップ内)に収める */
export function clampViewport(vp: Viewport, size: ViewSize, map: MapSize): Viewport {
  return {
    scale: clampScale(vp.scale, size, map),
    cx: Math.max(0, Math.min(map.width, vp.cx)),
    cy: Math.max(0, Math.min(map.height, vp.cy)),
  }
}

/** マップ全体表示(中央) */
export function fitViewport(size: ViewSize, map: MapSize): Viewport {
  return { scale: fitScale(size, map), cx: map.width / 2, cy: map.height / 2 }
}

/** (sx, sy) の下のワールド座標を動かさずに factor 倍する */
export function zoomAt(
  vp: Viewport,
  size: ViewSize,
  map: MapSize,
  factor: number,
  sx: number,
  sy: number,
): Viewport {
  const anchor = screenToWorld(vp, size, sx, sy)
  const scale = clampScale(vp.scale * factor, size, map)
  const next: Viewport = {
    scale,
    cx: anchor.x - (sx - size.width / 2) / scale,
    cy: anchor.y - (sy - size.height / 2) / scale,
  }
  return clampViewport(next, size, map)
}

/** 画面上で (dx, dy) px だけ内容を動かす(ドラッグ) */
export function panByPixels(vp: Viewport, size: ViewSize, map: MapSize, dx: number, dy: number): Viewport {
  return clampViewport({ scale: vp.scale, cx: vp.cx - dx / vp.scale, cy: vp.cy - dy / vp.scale }, size, map)
}

/** ワールド座標 (wx, wy) を画面中央へ */
export function centerOn(vp: Viewport, size: ViewSize, map: MapSize, wx: number, wy: number): Viewport {
  return clampViewport({ scale: vp.scale, cx: wx, cy: wy }, size, map)
}

/** 画面に見えているマス範囲(端は含む・マップ内に丸める) */
export function visibleCells(
  vp: Viewport,
  size: ViewSize,
  map: MapSize,
): { x0: number; y0: number; x1: number; y1: number } {
  const a = screenToWorld(vp, size, 0, 0)
  const b = screenToWorld(vp, size, size.width, size.height)
  return {
    x0: Math.max(0, Math.floor(a.x)),
    y0: Math.max(0, Math.floor(a.y)),
    x1: Math.min(map.width - 1, Math.floor(b.x)),
    y1: Math.min(map.height - 1, Math.floor(b.y)),
  }
}
