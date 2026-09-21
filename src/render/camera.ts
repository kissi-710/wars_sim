import {
  centerOn,
  clampViewport,
  fitViewport,
  panByPixels,
  zoomAt,
  type MapSize,
  type ViewSize,
  type Viewport,
} from './viewport'

/** カメラ(ビュー状態)。ズーム・パン・慣性・アニメーション・キー移動・追従をまとめて扱う。 */
export class Camera {
  vp: Viewport = { scale: 8, cx: 50, cy: 50 }
  size: ViewSize = { width: 800, height: 600 }
  /** 変化のたびに増える(ミニマップ・再描画の検知用) */
  version = 0
  fitted = false

  private anim: { from: Viewport; to: Viewport; t0: number; dur: number } | null = null
  private vel = { x: 0, y: 0 }
  private lastMoveT = 0

  constructor(public map: MapSize) {}

  setMap(map: MapSize): void {
    this.map = map
  }

  setSize(w: number, h: number): void {
    const first = !this.fitted
    this.size = { width: Math.max(1, w), height: Math.max(1, h) }
    if (first) {
      this.vp = fitViewport(this.size, this.map)
      this.fitted = true
    } else {
      this.vp = clampViewport(this.vp, this.size, this.map)
    }
    this.version++
  }

  private set(vp: Viewport): void {
    this.vp = clampViewport(vp, this.size, this.map)
    this.version++
  }

  fit(animated = true): void {
    const to = fitViewport(this.size, this.map)
    if (animated) this.animateTo(to)
    else this.set(to)
  }

  animateTo(to: Viewport, dur = 200): void {
    this.vel = { x: 0, y: 0 }
    this.anim = {
      from: { ...this.vp },
      to: clampViewport(to, this.size, this.map),
      t0: performance.now(),
      dur,
    }
  }

  /** 中央を固定点にして factor 倍(ボタン・キー用。アニメーションつき) */
  zoomCenter(factor: number): void {
    const base = this.anim ? this.anim.to : this.vp
    this.animateTo(zoomAt(base, this.size, this.map, factor, this.size.width / 2, this.size.height / 2), 140)
  }

  /** (sx, sy) を固定点にして factor 倍(ホイール・ピンチ用。即時) */
  zoomAtPoint(factor: number, sx: number, sy: number): void {
    this.anim = null
    this.set(zoomAt(this.vp, this.size, this.map, factor, sx, sy))
  }

  /** ダブルクリックなど: 指定の画面位置を中心に一段ズーム */
  zoomToPoint(factor: number, sx: number, sy: number): void {
    const target = zoomAt(this.vp, this.size, this.map, factor, sx, sy)
    this.animateTo(target, 180)
  }

  /** 画面上で (dx, dy) px だけ内容を動かす */
  pan(dx: number, dy: number): void {
    this.anim = null
    this.set(panByPixels(this.vp, this.size, this.map, dx, dy))
  }

  jumpTo(wx: number, wy: number, minScale?: number): void {
    const scale = Math.max(this.vp.scale, minScale ?? 0)
    this.animateTo(centerOn({ ...this.vp, scale }, this.size, this.map, wx, wy), 260)
  }

  centerNow(wx: number, wy: number): void {
    this.anim = null
    this.set(centerOn(this.vp, this.size, this.map, wx, wy))
  }

  // --- ドラッグの慣性 -------------------------------------------------------

  stopInertia(): void {
    this.vel = { x: 0, y: 0 }
  }

  dragMove(dx: number, dy: number, now: number): void {
    const dt = Math.max(1, now - this.lastMoveT)
    this.lastMoveT = now
    // 直近の速度(px/s)を指数移動平均で
    this.vel.x = this.vel.x * 0.6 + ((dx / dt) * 1000) * 0.4
    this.vel.y = this.vel.y * 0.6 + ((dy / dt) * 1000) * 0.4
    this.pan(dx, dy)
  }

  dragRelease(inertia: boolean, now: number): void {
    // 止めてから離した場合は滑らせない
    if (!inertia || now - this.lastMoveT > 80) this.vel = { x: 0, y: 0 }
  }

  // --- フレーム更新 --------------------------------------------------------

  /** 毎フレーム呼ぶ。変化があれば true */
  update(now: number, dt: number, keys: ReadonlySet<string>, follow: { x: number; y: number } | null): boolean {
    let changed = false
    if (this.anim) {
      const t = Math.min(1, (now - this.anim.t0) / this.anim.dur)
      const e = 1 - Math.pow(1 - t, 3)
      const { from, to } = this.anim
      const scale = from.scale * Math.pow(to.scale / from.scale, e)
      this.vp = { scale, cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e }
      if (t >= 1) this.anim = null
      this.version++
      changed = true
    } else if (Math.abs(this.vel.x) > 8 || Math.abs(this.vel.y) > 8) {
      this.set(panByPixels(this.vp, this.size, this.map, (this.vel.x * dt) / 1000, (this.vel.y * dt) / 1000))
      const decay = Math.pow(0.9, dt / 16)
      this.vel.x *= decay
      this.vel.y *= decay
      changed = true
    }

    let kx = 0
    let ky = 0
    if (keys.has('ArrowLeft') || keys.has('a')) kx += 1
    if (keys.has('ArrowRight') || keys.has('d')) kx -= 1
    if (keys.has('ArrowUp') || keys.has('w')) ky += 1
    if (keys.has('ArrowDown') || keys.has('s')) ky -= 1
    if (kx !== 0 || ky !== 0) {
      const speed = (keys.has('Shift') ? 1400 : 550) * (dt / 1000)
      this.pan(kx * speed, ky * speed)
      changed = true
    }

    if (follow && !this.anim) {
      const k = Math.min(1, dt / 140)
      this.set(centerOn(this.vp, this.size, this.map, this.vp.cx + (follow.x - this.vp.cx) * k, this.vp.cy + (follow.y - this.vp.cy) * k))
      changed = true
    }
    return changed
  }
}
