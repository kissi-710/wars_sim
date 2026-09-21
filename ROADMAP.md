# ROADMAP

wars_sim の実装計画。**何を・どの順番で** 作るかをここに書く。詳細な仕様は [docs/spec.md](docs/spec.md)(ゲーム)と [docs/ui-spec.md](docs/ui-spec.md)(画面)、未決事項は [docs/open-questions.md](docs/open-questions.md)。

- 進めるたびにチェックボックスを更新する(`[x]` = 完了)。
- 各フェーズの終わりに **`npm run typecheck` / `npm test` / `npm run build`** が通ることを確認し、画面のあるフェーズはブラウザで動作確認する。
- 数値(バランス)は仮値。`src/core/config.ts` に集約し、フェーズ 5 の検証スクリプトで調整する。
- 順序の原則: **コア(Vue 非依存)を先に、UI は薄く後から**。ただし「動いているのが見える」ことを早く確認したいので、フェーズごとに画面も最低限つなぐ。

## 現在の状況

Phase 0〜6 の実装は完了(残りは末尾の「残タスク」)。`npm run typecheck` / `npm test`(39 件)/ `npm run build` はすべて通る。

```bash
npm run dev        # 開発サーバ(http://localhost:5173)
npm test           # コアとビュー変換のテスト
npm run balance    # 性格ごとの勝率を集計(例: npm run balance -- 120 1000)
npm run sim        # ヘッドレスで数百ターン回して経過を表示
npm run inspect    # 3 国戦の内訳(建物・資源・戦績)を表示
```

---

## Phase 0 — 環境構築

- [x] `package.json` に依存とスクリプトを追加(Vue 3 / Vite / TypeScript / vue-tsc / Vitest)
- [x] `vite.config.ts`、`tsconfig.json`(strict)、`index.html`、`.gitignore`
- [x] `src/` と `scripts/` のディレクトリ雛形(spec §1.2)
- [x] `npm install` → `npm run dev` で画面が出ること

> 依存の注意: TypeScript は **5.9 系**(TS 7 は vue-tsc が未対応)。Vite 8 に合わせて Vitest 5 を使用。

## Phase 1 — コアの土台 + マップ表示(M0)

コア
- [x] `core/config.ts`: 全パラメータ(マップ寸法、生産表、レベル、性格、戦闘、AI 間隔)
- [x] `core/types.ts`: Cell / Building / Unit / Country / World / SimEvent の型
- [x] `core/rng.ts`: シード付き PRNG(mulberry32)+ 補助(整数/シャッフル/選択)
- [x] `core/world.ts`: ワールド生成(N 国の村を離して配置 → 初期領土 半径3 → デフォルト建物 → 初期民間人 → 性格・名前・色)
- [x] テスト: 同一シード → 同一ワールド、村の最低距離、初期領土の広さ

画面
- [x] `render/viewport.ts`: ビュー変換の純粋関数(worldToScreen / screenToWorld / zoomAt / clamp / fit)+ テスト
- [x] `render/mapRenderer.ts`: 領土オフスクリーン Canvas(1マス=1px)+ 拡大描画、グリッド、選択枠
- [x] `MapView.vue`: ホイールズーム(カーソル基準)、ドラッグパン、クリック選択、ResizeObserver、DPR 対応
- [x] 確認: 4 国の初期領土が表示され、ズーム/パン/全体表示が動く

## Phase 2 — ターン進行 + ユニット移動 + 領土(M1)

- [x] `core/sim.ts`: `step()` の骨組み(spec §9 の処理順)
- [x] `core/fields.ts`: BFS 距離場(作業/拡張/攻撃/防衛)と、そのキャッシュ更新
- [x] `systems/ai.ts`(ユニット AI)+ `systems/movement.ts`: ランダム順の逐次移動、4 体上限、建物侵入不可
- [x] `systems/territory.ts`: 踏んだマスの領土更新、領土マス数の管理
- [x] ループ(速度 1x〜MAX、1 フレームの tick 上限)、1 ターン送り、リセット(`store.ts`)
- [x] `ControlBar.vue` / `MapStatusBar.vue`: 再生・停止・速度・1 ターン・新規・シード・ターン表示、ホバー情報
- [x] ユニット描画(LOD:点 → 2×2 ドット → 形状・HP バー)
- [x] テスト: 4 体上限、建物マス侵入不可、領土塗り替え、決定性
- [x] 確認: 民間人が動き回って領土が広がる

## Phase 3 — 建物・生産・人口・建設(M2)

- [x] `systems/efficiency.ts`: 周囲 8 マスの自国民間人数 → 効率(spec §5.2)
- [x] `systems/production.ts`: 村/住居/鉱山/畑/工房の生産ルール、停止理由の記録
- [x] `systems/construction.ts`: 国 AI の建設(重み・個数上限・コスト・置き場所の選定)
- [x] 民間人 AI に「作業員が足りない建物へ向かう」を追加(作業距離場)
- [x] 建物アイコン描画、`CellInspector.vue`(稼働状況・効率内訳・ユニット一覧)、`SideBar.vue`
- [x] レイヤーメニュー(領土/国境/グリッド/建物/ユニット/戦闘/ラベル/範囲)
- [x] テスト: 効率式(0/8/16/32 人)、資源不足/人不足で停止、村が無条件で生産、個数上限
- [x] 確認: 人口と資源が増え、建物が自動で建つ(平和なシミュレーション)

## Phase 4 — 装備・軍人・戦闘・占領・ログ(M3)

- [x] `systems/upkeep.ts`: 軍人の維持費(食料)と飢餓
- [x] `systems/mobilization.ts`: 目標軍人比率、総動員の発動/解除、軍人化(装備消費・上限)
- [x] `systems/combat.ts`: 同居マスの戦闘(同時ダメージ・防衛補正・ランダム対象)、戦闘のまとめ集約
- [x] 軍人 AI(攻撃・防衛・拡張。性格の攻撃性で分岐)
- [x] `systems/occupation.ts`: 半径 2 の占領判定(過半数、連鎖は次ターン、村の占領)
- [x] 滅亡・勝利判定(`sim.ts`)
- [x] `core/events.ts`: 構造化イベント(重要度・上限つき・連番)
- [x] `LogPanel.vue`: 表示・重要度/種類/国のフィルタ・検索・自動追尾・座標クリックでジャンプ・ping
- [x] 戦闘マーカー/占領エフェクト(波紋)の描画
- [x] テスト: 戦闘(同時ダメージ・全滅・防衛補正)、占領(13 で成立/12 で不成立)、飢餓、総動員、滅亡/勝利
- [x] 確認: 国どうしが接触し、戦闘・占領・滅亡がログに流れる

## Phase 5 — 文明レベル・性格・統計・国パネル(M4)

- [x] `systems/civilization.ts`: レベルアップ判定と効果(効率・装備攻撃力・個数上限)
- [x] `core/stats.ts`: 10 ターンごとの国別サンプル(上限で間引き)、累計カウンタ(撃破/戦死/占領/飢餓)
- [x] `CountryList.vue` / `CountryDetail.vue`: カード、進捗バー、資源収支、戦績、推移グラフ、領土シェア推移
- [x] `charts/`(LineChart / StackedAreaChart)を SVG で自前実装(進捗バーは CSS)
- [x] `MapMinimap.vue`、国ハイライト、村へ移動、ユニット追従
- [x] キーボードショートカット、ヘルプダイアログ、新規ゲームダイアログ(シード/国数/性格)
- [x] `scripts/balance.ts`: ヘッドレスで多数シードを回し、性格ごとの勝率を集計 → 数値調整
- [x] 確認: 3 国戦で各性格の割合が 20〜45% に収まる(好戦的 27% / 中庸 43% / 平和的 31%。docs/spec.md §15.1)

## Phase 6 — 仕上げ(M5)

- [x] ヒートマップ(民間人/軍人密度)・占領判定範囲・作業範囲のレイヤー
- [x] オートカメラ(観戦モード)、重大イベントのトースト、ユニット移動の補間
- [x] 設定ダイアログ・UI 設定の保存(localStorage、try/catch)
- [x] パフォーマンス確認(ヘッドレスで 1 ターン 0.4〜1ms。ブラウザでも 1 ターン 0.4ms 前後)
- [ ] MAX 再生中の UI 応答性の実機確認(開発中のブラウザペインが非表示だと `requestAnimationFrame` が止まり、確認できなかった)
- [ ] 必要になったらコアを Web Worker へ(現状の速度では不要)
- [ ] セーブ/ロード・リプレイ(シード + 設定での再現は既に可能)

---

## 残タスク・課題(優先順)

1. **決着がつきにくい**(docs/spec.md §15.2): 建物の周囲に民間人が密集して盾になり、占領しにくい。1,000 ターン程度で 1 国だけが残ることはほぼ無い。戦争が「領土の膠着」になる。
2. 村だけが残って人口がほぼ 0 の「亡霊国家」が長く残る(村を占領されるまで滅亡しない)。
3. 中庸がやや強い(43%)。「序盤は好戦的 → 中盤は中庸 → 終盤は平和的」の三すくみに近づけたい。
4. 実機でのブラウザ確認(MAX 再生、タッチ操作、`devicePixelRatio` 2 のにじみ)。
5. 国名・国旗、色覚への配慮(頭文字/記号)、セーブ/ロード・リプレイ。

## 実装メモ

- バランス調整の指標: 3 国戦(好戦/中庸/平和)で各性格の割合 20〜45%(docs/spec.md §15)。
- 決定性: コア内で `Math.random` を使わない。ターン処理順は spec §9 で固定。
- 未決事項は暫定案で進め、実装時に決めたことは docs に反映する(docs と実装が食い違わないようにする)。
