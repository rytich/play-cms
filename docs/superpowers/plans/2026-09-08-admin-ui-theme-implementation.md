# 最小テーマと管理UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ユーザー指定を優先し、既存の5.6系実装担当一体を再利用する。担当を工程ごとに増員しない。

**Goal:** ロゴ・サイト名・CSS変数を差し替えられる管理画面を、既存の動画・閲覧用キー・認証を保持して提供する。

**Architecture:** Reactの共通レイアウトと静的ブランド設定を追加し、既存管理画面のAPI呼び出しは維持する。テーマはビルド入力だけとし、DB・設定API・UIキットは追加しない。視聴者画面は今回実装しない。

**Tech Stack:** 既存のReact、Vite、TypeScript、CSS、Vitest、React DOM Server。新規依存なし。

**Spec:** [承認済みUI仕様](../specs/2026-09-08-ui-theme-navigation-design.md)のA範囲。B（視聴機能）とC（利用検証後）は別工程。

**2026-09-08追加要件:** 仕様セクション4「URLで現在地がわかる画面遷移」を必須とする。従来の同一URL内での一覧／編集切替を置き換える。画面は一覧、新規、編集、キー管理を固有パスで識別し、通常のリンクによるページ単位遷移を基本とする。以下の関数例は表示部品の例であり、URLを変えない実装の許可ではない。

## 状態・追跡

- 計画作成: 2026-09-08。計画提示済みになるまでコード実装は開始しない。
- 設計の保存: [Issue #22](https://github.com/rytich/play-cms/issues/22) / [文書PR #23](https://github.com/rytich/play-cms/pull/23)。本計画はこの文書PRに含める。
- 製品実装: [Issue #24](https://github.com/rytich/play-cms/issues/24) / [Draft PR #27](https://github.com/rytich/play-cms/pull/27)。一つの縦切りTask・一つの実装PRで扱い、文書PRへ製品コードを混ぜない。
- URL要件の追加文書: [Issue #25](https://github.com/rytich/play-cms/issues/25)。#23マージ後の追加分は別の文書PRで追跡し、#24着手時にはこの追補の正式マージも確認する。
- 調査した管理実装: [PR #20](https://github.com/rytich/play-cms/pull/20)、head `69408ac76bd5e0fff5a20005be6b2e36082a3397`。2026-09-08時点でDraft・未マージ。これは着手可能の証拠ではない。
- 実装前にPR #20の重要指摘解消・新headの独立レビューと正式マージ、PR #23の正式マージを確認する。先行CI・rulesetの実状態も再確認し、チェック0件を成功扱いにしない。
- 条件が整えば最新developから`1a-m5/issue-24-admin-ui-theme`を作成。未整備ならIssue #24を開始待ちとし、未承認のstacked実装や強制マージで回避しない。
- 6 Astra: 設計・進行管理。5.6系一体: 実装・テスト・修正。実装後に別5.6系一体で独立レビュー。正式Approve/Mergeはknrytの条件を維持。

## Global Constraints

- 「P0ではサムネイル自体を取得・表示しない。」
- 「CSSは信頼されたリポジトリ管理者がレビューするビルド入力であり、安全なサンドボックスとは扱わない。」
- 「初期は明色テーマ一種だけとし、暗色テーマ・実行中切替・テーマ選択DBは追加しない。」
- 「テーマはナビ項目、権限、期限、警告文、DOMの意味・読み上げ順を変更しない。」
- 「PC（960 CSS px以上）: 左240pxをナビ、右を本文。」
- 「小画面（960px未満）: 上部にロゴと『メニュー』ボタン。」（画面ラベルはメニュー）
- localhost限定。公開・再生・実Filma・遠隔DB・デプロイは禁止。ログイン情報やDBを作り直さない。
- 実装を始める前に現行`AGENTS.md`、`SECURITY.md`、P0承認追補、レビュー結果を読む。自動テストに実運用秘密が取り込まれない検証環境を確認する。
- Node.js `^22.13.0 || >=24.0.0`、pnpm `11.19.0`以上という既存要件を維持。lockfile・依存・既存API契約・DB schemaを変更しない。追加APIは直アクセス用の管理者専用単一動画GETに限定する。
- 既存の100件単位ページ送りは維持する。検索・並べ替え・全件取得を新規追加しない。

## ファイル境界

以下はPR #20を取り込んだ実装ブランチでの配置。既存ファイルの行番号は同期で動くため関数名を変更位置とする。

| 操作   | ファイル                                                                        | 責務                                         |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------------- |
| Create | `src/ui/brand.ts`                                                               | 公開ブランド定数とロゴ・faviconパス検証      |
| Create | `src/ui/themes/default.css` / `custom.css`                                      | 意味別の既定変数／運用者の変数上書き         |
| Create | `src/ui/base.css`                                                               | 共通文字、フォーム、フォーカス、通知、ボタン |
| Create | `src/ui/components/Brand.tsx`                                                   | サイト名・画像ロゴ・画像失敗時のテキスト     |
| Create | `src/ui/layouts/AdminLayout.tsx`                                                | 管理ナビ・モバイル開閉・本文スキップ         |
| Create | `src/ui/layouts/AuthLayout.tsx`                                                 | 初期設定・ログインの一列の共通枠             |
| Create | `src/admin/ui-state.ts`                                                         | 一覧／編集・未保存・画面遷移判断の純粋関数   |
| Modify | `src/admin/main.tsx` のApp / AdminVideos / LoginForm / SetupForm                | 既存画面を枠へ組み込み、操作と通知を整理     |
| Modify | `src/admin/styles.css`                                                          | 管理画面固有の配置だけを残す                 |
| Create | `public/brand/README.md`                                                        | 公開可のPNG/WebPロゴ・ICO faviconの配置手順  |
| Create | `tests/unit/ui-brand.test.ts` / `admin-ui-state.test.ts` / `ui-layout.test.tsx` | 純粋関数と静的HTMLの契約                     |
| Create | `docs/development/ui-theming.md`                                                | 実装した変数、差し替え・復元、確認記録       |
| Modify | `README.md`                                                                     | 運用ガイドへのリンク                         |

ロゴ未提供なので既定はテキストのplay-cms。架空の正式ロゴを作らない。`src/viewer`、未使用のUI部品、空の機能ページは作らない。既存のFieldやButtonを一律に書き換える汎用部品化はせず、CSSで共有する。

## Task 1: テーマ対応の管理UIを一つの縦切りで届ける

**Files:** 上記のCreate / Modify / Testを対象とする。URL要件に伴い`src/admin/routes.ts`と`tests/unit/admin-routes.test.ts`を追加対象とし、`src/server/app.ts`と`tests/worker/admin-api.test.ts`は単一動画読取と直アクセスの防御検証に限定して変更可能。DB schema・暗号・認証方式は対象外。

**URL実装契約:** `/admin/videos`、`/admin/videos/new`、`/admin/videos/:videoId/edit`、`/admin/videos/:videoId/codes`を解釈する小さな経路判定を用意する。ログイン・初期設定経路は維持する。個別画面は認証確認後に`GET /api/admin/videos/:id`で既存CMS IDの動画を取得し、直前の一覧取得に依存しない。既存の管理者認証・no-store・安全な失敗応答を再利用し、有効な管理者セッションなし401、対象なし404、内部障害503を検証する。既存APIには経路IDの形式検証がないため、IDは既存のパラメーター化DB検索へ渡し、不正形式で一致しないIDも404とする。このTaskで新しいID形式の400契約やrole別の403分岐を追加しない。全件走査や新しいDBアクセス層を作らない。稼働中環境は変更しない。

一覧offsetと戻り先は許可済み内部パス／有効offsetだけを使う。通常リンクとページ読み込みを基本とし、クライアント状態はURLから導出する。汎用ルーターの自作や新規依存は加えない。GET画面表示だけでは保存・キー発行・消費・取消を起こさない。新規保存成功後は作成済みIDの編集URLへ置き換え、失敗時は新規URLに入力を保持する。

経路判定の単体テスト、単一動画APIの隔離Workerテストを先に失敗させてから実装する。URLの直接入力・戻る／進む・未保存警告・履歴キャッシュ復帰は静的HTMLテストで代替せずStep 7で実ブラウザ確認する。

**Interfaces:**

- Consumes: 既存`adminRequest`、`AdminRequestError`、`localDateTime`、`toIsoDateTime`、動画とキーのAPIレスポンス。入力・認証・取消の契約を変えない。
- Produces: `brand`（公開設定）、`isBrandAssetPath(value, kind)`（純粋関数）、`Brand`、`AdminLayout`、`AuthLayout`、`canLeaveEditor`。

```ts
type BrandConfig = {
  siteName: string
  logoPath: string | null
  faviconPath: string | null
}
// brand.tsでexportする。初期値はsiteName='play-cms'、両path=null。
// isBrandAssetPath(value: string, kind: 'logo' | 'favicon'): boolean
// logoは /brand/<英数字・ハイフン・アンダースコア>.(png|webp)、
// faviconは同じディレクトリの.icoだけ。URL/query/fragment/../は拒否。

type AdminLayoutProps = {
  siteName: string
  logoPath: string | null
  onVideos: () => void
  onLogout: () => void
  children: React.ReactNode
}
// AuthLayoutはsiteName、logoPath、childrenのみを受け取る。
// BrandはsiteName、logoPathのみを受け取る。
// canLeaveEditor(dirty: boolean, confirmedDiscard: boolean): boolean
```

- [x] **Step 1: 前提と安全な検証環境を確認する。**

PR #20 / #23のマージと最新developの内容、独立レビューの解消状況を確認し、Issue #24へ開始SHA・ブランチ名を記録する。専用作業場所の合成データ・秘密を含まないテスト設定で既存`pnpm verify`を実行し、基準結果を保存する。既存の稼働サーバー、`.dev.vars`、ローカルD1をコピー・初期化・停止しない。実ブラウザ用の試験が必要なら別のloopbackポートを使う。

- [x] **Step 2: ブランド境界と未保存判断の失敗するテストを書く。**

`tests/unit/ui-brand.test.ts`には以下を置く。まだbrand.tsがない段階の失敗を確認する。

```ts
import { describe, expect, it } from 'vitest'
import { brand, isBrandAssetPath } from '../../src/ui/brand'

describe('brand', () => {
  it('accepts a nonempty brand and only local configured assets', () => {
    expect(brand.siteName.trim().length).toBeGreaterThan(0)
    if (brand.logoPath !== null)
      expect(isBrandAssetPath(brand.logoPath, 'logo')).toBe(true)
    if (brand.faviconPath !== null)
      expect(isBrandAssetPath(brand.faviconPath, 'favicon')).toBe(true)
  })
  it('allows only local approved assets', () => {
    expect(isBrandAssetPath('/brand/logo-v1.png', 'logo')).toBe(true)
    expect(isBrandAssetPath('/brand/site.ico', 'favicon')).toBe(true)
    for (const value of [
      'https://example.invalid/logo.png',
      '//example.invalid/a.png',
      '/brand/../x.png',
      '/brand/a.svg',
      '/brand/a.png?token=x',
    ]) {
      expect(isBrandAssetPath(value, 'logo')).toBe(false)
    }
  })
})
```

`tests/unit/admin-ui-state.test.ts`には以下を置く。

```ts
import { expect, it } from 'vitest'
import { canLeaveEditor } from '../../src/admin/ui-state'

it('keeps unsaved input unless discard is confirmed', () => {
  expect(canLeaveEditor(true, false)).toBe(false)
  expect(canLeaveEditor(true, true)).toBe(true)
  expect(canLeaveEditor(false, false)).toBe(true)
})
```

実行: `pnpm vitest run tests/unit/ui-brand.test.ts tests/unit/admin-ui-state.test.ts`。Expected: 未作成moduleによるFAIL。既存APIや暗号の失敗をこのREDとして数えない。

- [x] **Step 3: 設定・最小判断関数・CSSを実装する。**

brand.tsは上記型と定数をexportし、パス判定はkindごとの正規表現で完全一致にする。判定NGは画像を描画せずテキストへ戻す。未保存判定の実装は次に限定し、ナビ側で確認結果を渡す。

```ts
export function canLeaveEditor(
  dirty: boolean,
  confirmedDiscard: boolean,
): boolean {
  return !dirty || confirmedDiscard
}
```

色の初期値は現行管理CSSの濃紺・青・淡背景を継承する。default.cssで背景・surface・text・muted・border・primary・on-primary・primary-hover・focus・success・warning・danger、font-family・font-size・space・radiusを宣言する。`custom.css`は変更例のコメントだけ。base.cssの宣言は変数を参照し、最後に運用者上書きを読む。以下が最小の書式であり、ほかの必須変数も同じファイルへまとめる。

```css
:root {
  --play-color-bg: #f5f7fa;
  --play-color-text: #172033;
  --play-color-primary: #315fa9;
  --play-color-on-primary: #fff;
  --play-color-focus: #315fa9;
  --play-radius-control: 8px;
}
```

実行: Step 2の同一コマンド。Expected: PASS。CSS値を変えても判断関数・APIが変わらない構成にする。

- [x] **Step 4: 共通枠の失敗するテストを書く。**

`tests/unit/ui-layout.test.tsx`で、既存React DOM Serverによる静的HTMLを検査する。状態遷移やCSSの見え方はこのテストだけで検証済みと扱わない。

```tsx
import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminLayout } from '../../src/ui/layouts/AdminLayout'

it('renders only available admin navigation and the prototype boundary', () => {
  const html = renderToStaticMarkup(
    <AdminLayout
      siteName="Test CMS"
      logoPath={null}
      onVideos={() => {}}
      onLogout={() => {}}
    >
      <h1>動画</h1>
    </AdminLayout>,
  )
  for (const text of [
    'Test CMS',
    '管理画面',
    '動画',
    'メニュー',
    'ログアウト',
    '公開と再生は無効',
  ]) {
    expect(html).toContain(text)
  }
  expect(html).toContain('data-surface="admin"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).not.toContain('Filma連携')
  expect(html).not.toContain('アップロード')
})
```

実行: `pnpm vitest run tests/unit/ui-layout.test.tsx`。Expected: 未作成layoutによるFAIL。同じファイルにAuthLayoutの一列フォーム枠とBrandのnull/不正パス時にimgがないケースを追加する。

- [x] **Step 5: 枠を実装し、管理画面に組み込む。**

Brandは有効画像だけを`img`で描画し、onErrorでテキストへ戻す。siteNameはReact文字列として出力する。設定したfaviconが有効なときだけ同一サイト内のlink要素へ適用し、未設定なら追加しない。

AdminLayoutはPC左240px、960px未満で本文を押し下げる開閉ナビを持つ。メニューボタンにaria-expandedとaria-controls、本文にid、スキップリンク、現在位置ラベルを付ける。ナビを閉じたときはボタンへフォーカスを戻す。危険なHTML挿入は使わない。

Appの既存ログイン判定を維持し、ログイン・初期設定だけAuthLayoutに包む。認証済みではAppからAdminVideosへ既存logoutを呼ぶ`onLogout: () => void`を追加で渡す。AdminVideos自身のreturnをAdminLayoutで包むことで、一覧へ戻る操作と未保存判断を同じ状態所有者へ置く。`data-surface="admin"`以下へ管理CSSを限定する。既存のroot作成・認証・ログアウトの処理内容は書き換えない。

```tsx
// AdminVideosのreturnで適用する形。childrenは既存の一覧／編集領域。
// returnToListはStep 6の一覧への移動、onLogoutはAppから受ける。
<AdminLayout
  siteName={brand.siteName}
  logoPath={brand.logoPath}
  onVideos={returnToList}
  onLogout={onLogout}
>
  {children}
</AdminLayout>
```

実行: `pnpm vitest run tests/unit/ui-brand.test.ts tests/unit/admin-ui-state.test.ts tests/unit/ui-layout.test.tsx`、`pnpm typecheck`。Expected: PASS。APIキー設定・公開・再生のUIは出さない。

- [x] **Step 6: 一覧→編集→キーの操作を整える。**

AdminVideosの表示状態はURLから一覧／新規／編集／キー管理へ解決し、メモリ内の`list`/`editor`だけで画面を切り替えない。一覧の「動画を登録」、行の「編集」、動画内の「基本情報」「閲覧用キー」、「一覧へ戻る」は実際のhrefを持つリンクとする。既存ページ送りはURLのoffsetと一致させ、画面変更後に対応見出しへフォーカスする。`returnToList`とAdminLayoutの`onVideos`を使う場合も同じ検証済み一覧URLへ移動し、別タブ操作を妨げない。DOM検索で隠れたボタンを押すような間接接続はしない。

保存フォームと最後の保存済み値の差からdirtyを判定する。`canLeaveEditor(dirty, confirmedDiscard)`がfalseなら戻る・別動画・新規作成への移動を中止する。ブラウザ離脱にはdirtyの間だけbeforeunloadを登録し、保存成功・unmountで解除する。明示ログアウトは秘密消去を優先し、失効による画面クリアを未保存確認で妨げない。

キー表示には「再表示できません」「コピー」「確認して閉じる」。Clipboard成功時だけコピー済みを表示し、拒否されたら手動コピーへ案内。閉じる・動画切替・logout時に生キーを破棄する。発行結果の通信断は再取得と手動取消・新規発行を案内し、自動で再発行しない。取消には対象を示す確認を挟む。未使用キー総数に制限を追加しない。

読み込み・空・失敗・成功を別表示にする。入力エラー時に非秘密項目を保持し、エラー概要と該当欄を関連付ける。初期設定の用語を「初回セットアップ用トークン」にし、値を表示せず説明とログインへのリンクを置く。

ここではPR #20で解消した非同期応答・秘密表示の防御を維持する。新たに不具合が見つかった場合は既存の実装担当へ戻し、範囲と防御テストをIssueで明確にしてから対処する。

- [ ] **Step 7: 実ブラウザで受入条件を検証する。**

2026-09-08時点で、隔離した合成D1・別loopbackポート・専用Chrome profileにより、初回設定、ログイン、100件／101件目のページ送り、320／375／768／960／1280px表示、編集直URL、実際の戻る／進むを確認した。

2026-09-09、同じ隔離条件を作り直し、標準Playwrightの新しいbrowser contextで主要フローを追加確認した。新規保存後の再読込と重複なし、未保存リンク／実際のブラウザ戻るの取消・破棄、キー発行・コピー成功／拒否・閉じる・再読込・取消、logout後の401と実際のブラウザ戻る／保護URL直アクセスでの生キー・保護データ非表示が通過した。明示破棄後にブラウザ標準警告が重なる不具合は、明示破棄の移動中だけ`beforeunload`を抑止する回帰テスト付き最小修正を行い、取消時と通常離脱時の保護を維持した。試験環境の履歴復帰は`pageshow.persisted === false`であり、BFCacheからの復帰、200%拡大、全操作のキーボード確認、テーマ差し替え例は未確認のため、本Stepは未完了のままとする。

同日の独立レビュー後、修飾／非primary／処理済みクリックを未保存確認の対象外にし、日時関係エラーを開始・終了入力へARIAで関連付け、取消確認へ生キーではなく表示済みmetadata IDを含めた。局所Playwrightで修飾クリック時の確認0回と元画面保持、日時エラー時の入力保持と一般503時のinvalid非設定、取消対象IDの表示を確認した。

変更要求後の追加受入では、新しい合成D1・別ポート・browser contextを使い、キーボードだけでログイン、モバイルメニュー、編集保存、キー発行・コピー・閉じる・取消を完了した。一時コピーでは合成サイト名・PNGロゴ・CSS変数の反映後、既定名・テキストfallback・既定CSSへ復元し、外部origin要求0と元ファイルとのbyte一致を確認した。Playwright既定の`--disable-back-forward-cache`だけを専用Chromeで除外しても、保護HTMLの`Cache-Control: no-store`、no-store下のJS通信、Vite WebSocketにより`pageshow.persisted`はfalseだった。200%のブラウザ拡大もPlaywrightのキー入力ではChrome UIの倍率が変わらず実測1倍だった。保護応答を弱めず、BFCache実復帰と実200%拡大は未確認のままとする。

合成データ専用のlocalhost環境を使用する。以下は手動/利用可能なブラウザ操作で検証し、結果を表でIssue #24へ記録する。未検証セルを成功にしない。

| 操作                                                           | 期待結果                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 320/375/768/1280px、200%拡大                                   | 主操作に横スクロール不要、960pxで切替、固定要素でフォーカスが隠れない           |
| キーボードのみのログイン・メニュー・編集・取消                 | 順序が自然、戻り先にフォーカス、ラベルと通知を判別できる                        |
| 保存せず戻る→取消／破棄を確認                                  | 取消なら入力保持、破棄なら一覧へ戻る                                            |
| 保存失敗・読込失敗・空一覧                                     | 入力保持、秘密なしエラー、空状態を区別                                          |
| キー発行→コピー成功/失敗→閉じる→再読込                         | 一回だけ表示、失敗時手動コピー、閉じたキーは再表示なし                          |
| キー発行の応答前に別動画へ移動                                 | 以前の動画のキーを新しい動画のものとして表示しない                              |
| logout・認証切れ・ブラウザ戻る                                 | 生キーと保護データを消去し、再認証前に復元しない                                |
| 一覧・新規・編集・キー管理をリンク／直接URL／別タブで開く      | URLと対象が一致し、直前の一覧のメモリに依存しない                               |
| 再読込・戻る／進む・履歴キャッシュ復帰・未保存警告をキャンセル | 同じ対象とoffsetを復元、キャンセル時はURLと入力を維持、生キーは復元しない       |
| 新規保存後に再読込／キー画面の直アクセス                       | 新規登録の再送・キー発行等の状態変更を起こさない                                |
| 不明経路・不存在ID・未認証・不正な戻り先                       | 保護データを表示せず、外部リダイレクトしない                                    |
| 合成ロゴPNG、ロゴ不存在、CSS変数とsiteName変更、元へ戻す       | 共通反映、テキストfallback、復元可能、DB変更不要                                |
| ネットワークとDOM確認                                          | 外部CSS/フォントなし、公開・再生・Filmaリクエストなし、キーがURL/永続領域にない |

2026-09-09の受入状況:

| 範囲                                   | 状況     | 根拠／残り                                                                    |
| -------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| 新規保存・再読込                       | 確認済み | POSTは1回、編集URLへの置換後に再読込して同名1件                               |
| 未保存のリンク・ブラウザ戻る           | 確認済み | 取消はURL・入力保持、破棄は移動、各操作の確認は1回                            |
| キー発行・コピー・閉じる・再読込・取消 | 確認済み | コピー成功／拒否、閉じる／履歴移動後の生キー非表示、取消の中止／実行          |
| logout・401・履歴戻り・保護URL         | 確認済み | 再認証前に生キー・動画名を表示しない                                          |
| 外部通信・ブラウザ永続領域             | 確認済み | 外部origin要求0、生キーをURL・履歴state・local/session storageへ保存しない    |
| BFCache復帰                            | 未確認   | 無効化引数を除外してもno-store、JS通信、Vite WebSocketにより`persisted=false` |
| 200%拡大                               | 未確認   | Playwrightのキー入力はChrome UIの倍率を変更せず、実測1倍                      |
| 主要操作のキーボード確認               | 確認済み | ログイン、モバイルメニュー、編集保存、キー発行・コピー・閉じる・取消          |
| テーマ差し替え例・復元                 | 確認済み | 合成名・PNG・CSS変数を反映後、既定設定へbyte一致で復元。外部origin要求0       |

ページ送りの回帰検証では専用テストDBに合成動画101件を用意する。1ページ目（offset 0）で100件・「前へ」無効・「次へ」有効を確認し、「次へ」で2ページ目（offset 100）へ進み1件・「次へ」無効を確認する。2ページ目の動画を編集して「一覧へ戻る」でoffset 100と選択対象が保持され、再び同じ動画を開けることを確認する。「前へ」でoffset 0に戻り、先頭100件とページ送り状態が復元されることを記録する。表示範囲・件数が各offsetと一致することも確認し、101件のfixtureは稼働中DBへ作らない。

既定と変更例の双方で通常文字4.5:1、大文字3:1、操作部品3:1、主操作44pxを確認する。変更例はテスト用素材・一時的な設定を使い、既定設定を戻してからcommitする。UI操作で作ったデータを消す必要がある場合も、専用テストDBであることを確認し、既存の稼働DBには触れない。

- [x] **Step 8: 運用文書と全検証を仕上げる。**

2026-09-08、運用文書、公開素材ディレクトリの注意書き、README導線を追加し、`pnpm verify`と`git diff --check`を完走した。ビルド成果物を別loopbackポートで配信し、`/`、`/admin/login`、`/index.html`、未知経路のframe拒否ヘッダーも確認した。Step 7の未検証項目はこの完了に含めない。

ui-theming.mdへ実際に存在する変数一覧、編集箇所、ビルド、ロゴのサイズ比を維持する方法、キャッシュ更新、元設定への復元を記録する。public/brand/README.mdは公開素材だけを置く旨と未設定時fallbackを明記。READMEからリンクし、Issue #24・実装PR・本計画を相互リンクする。

実行: `pnpm verify`、`git diff --check`。Expected: 全成功。ビルドのJS/CSSサイズを基準から比較してIssueへ記録するが、この試験だけでWorkers Free適合や視聴機能の完成を宣言しない。

- [ ] **Step 9: 保存・PR・独立レビュー。**

2026-09-09、Draft PR #27の作成、CI、独立レビューと変更要求への修正までは実施済み。本更新に追加受入の結果と範囲表示修正を保存する。最新headの独立差分再レビューはIssue #24・PR #27で追跡し、正式なknryt再承認、Ready化、mergeは未完了として本Stepを完了扱いにしない。BFCache実復帰と実200%拡大の後続分離はまだ承認されておらず、Step 7の必須条件を維持する。

テーマ・レイアウトと導線で必要に応じて小さくcommitするが、Task #24の一つのfeatureブランチ・PRに集約する。例: `git commit -m "feat: add minimal admin branding and navigation (#24)"`。変更対象だけをstageし、テスト素材・秘密・DBを含めない。

検証結果、差分、未確認事項をIssueへ記録してdevelop向け実装PRを作成する。別5.6系レビューワーへ`.agents/skills/play-cms-reviewer/SKILL.md`、本計画、仕様、base/head、テスト・実画面証拠を渡す。重要指摘は同じ実装担当が修正し、新headを再レビューする。正式なknryt承認・CI・最新baseの条件がそろうまでマージしない。

## 仕様との対応と終了条件

- 外観契約・ファイル分離: Steps 2〜5、運用手順は8。
- 管理メニュー・入力・キー管理: Steps 4〜7。
- URLで現在地がわかる画面遷移: URL実装契約、Step 6〜7。受入条件を満たすまでURL対応を完了扱いにしない。
- 小画面・フォーカス・エラー・非公開境界: Steps 5〜8。
- 既存データ保持・モデル分担・Issue/PR運用: Steps 1・8・9。
- 視聴者認証・権利引継ぎ・期限失効・サムネイルは本Taskでは作らない。仕様B/Cを完了扱いにしない。

終了時は「管理UIのA範囲が実装・検証済み」と報告し、視聴できるP0の完成や試験公開を意味しないことを添える。
