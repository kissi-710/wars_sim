import { Camera } from './render/camera'

/** アプリ全体で共有するカメラ(MapView・ミニマップ・ツールバーが参照する) */
export const camera = new Camera({ width: 100, height: 100 })
