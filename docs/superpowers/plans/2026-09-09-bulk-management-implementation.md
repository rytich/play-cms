# 一覧絞り込みと一括状態変更の実装計画

> 実装は既存の5.6 Sol担当一体が、TDDと段階ごとの検証で進める。新しい実装担当は起動しない。

- 状態: 実装・合成検証122件成功。独立レビューとknrytによる統合待ち（2026-09-09）。
- Tracking: [Issue #28](https://github.com/rytich/play-cms/issues/28) / [PR #29](https://github.com/rytich/play-cms/pull/29)
- Goal: 動画・閲覧キーを100件ずつ検索・選択し、動画の公開設定と未使用キーの有効設定を安全に一括変更できる。
- Architecture: 既存React画面、Hono管理API、D1 repositoryを拡張する。URLを一覧条件の正本とし、専用APIが最大100件を原子的に処理する。
- Tech Stack: TypeScript、React、Vite、Hono、D1、Vitest。新規依存、汎用ルーター、ジョブ基盤は追加しない。
- Spec: [承認済み仕様](../specs/2026-09-09-bulk-management-design.md)
- 先行: [PR #27](https://github.com/rytich/play-cms/pull/27) / [Issue #24](https://github.com/rytich/play-cms/issues/24)

## Global Constraints

- 6 Astraは設計とIssue/PR管理のみ。コード・設定・migration・テストは同じ5.6系実装担当、独立レビューは別5.6系で順番に行う。正式Approve/Mergeはknryt。
- PR #27統合とIssue #24終了を確認してから、現在のIssue #28ブランチへ最新developを取り込む。一つのIssue・ブランチ・PRを維持する。
- 稼働中5173、利用中5194、既存`.dev.vars`・D1・管理者情報は変更しない。旧schema検証もブラウザ試験も別の合成DBを使う。
- 実Filma通信・視聴者向け配信・試験公開・デプロイを有効化しない。保存済みpublishedは実配信の許可ではない。
- 最大100件、JSON 16 KiB、管理者ごと一括API合計6回/分、既存管理書込共通60回/分。100回の単件API連打、全検索結果選択、CSV、削除は作らない。
- 使用済み・永久取消済みキーは復活させない。有効/無効は未使用キーの引換設定で、付与済み視聴権は消さない。引換・視聴権の実装は別工程。
- 生キー・認証情報・メール・選択ID群をURL/履歴state/永続ストレージ/ログへ保存しない。確定した検索条件だけURL保存する。
- 変更は全件成功または全件未変更。通信断・DB障害による成否不明を成功やロールバック済みと断定せず、自動再実行しない。
- 実BFCache復帰・実200%拡大はユーザー承認済みの公開前必須[Issue #30](https://github.com/rytich/play-cms/issues/30)へ集約する。本Taskでも未確認を成功扱いにせず、ローカル統合と外部公開の条件を分ける。

## ファイルと境界

PR #27統合後のファイルを対象とする。行番号ではなく責務で変更位置を指定する。

| 操作   | ファイル                                                                        | 責務                                                           |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Create | `src/core/admin-management.ts`                                                  | 一覧条件・一括入力の純粋な型と検証、適格性の共通規則           |
| Modify | `src/core/admin.ts`                                                             | Videoの保存状態をdraft/publishedへ拡張。既存単件入力契約は維持 |
| Modify | `src/adapters/database/admin-repository.ts`                                     | 条件付き一覧、101件取得、一括状態変更の原子的処理              |
| Modify | `src/server/app.ts`                                                             | 一覧拡張、専用一括API、認証・入力・レート制限                  |
| Create | `migrations/0002_admin_bulk_management.sql`                                     | 動画状態制約とキー停止設定。番号は着手時の最新連番を確認       |
| Modify | `src/admin/routes.ts`, `src/admin/ui-state.ts`                                  | URL条件・復帰先、ページ限定選択、処理結果の状態                |
| Create | `src/admin/ListFilters.tsx`, `src/admin/BulkActions.tsx`                        | 検索フォームと選択操作。API・認証を持たない小さい表示部品      |
| Modify | `src/admin/main.tsx`, `src/admin/styles.css`                                    | 既存一覧への接続、結果・確認・公開設定と実配信停止の表示       |
| Create | `tests/unit/admin-management.test.ts`                                           | 入力境界、状態適格性                                           |
| Modify | `tests/unit/admin-routes.test.ts`, `tests/unit/admin-ui-state.test.ts`          | URL往復、選択破棄、重複送信抑止                                |
| Create | `tests/worker/admin-management.test.ts`, `tests/worker/admin-migration.test.ts` | 一覧・一括API、旧schema移行・失敗時の保持                      |
| Modify | `tests/worker/admin-api.test.ts`                                                | 既存単件API、秘密分離、公開拒否の回帰                          |
| Create | `docs/development/bulk-management.md`                                           | 実装した操作、移行・復元の注意、ブラウザ受入結果               |
| Modify | `README.md`                                                                     | 運用ガイドへの導線                                             |

## 実装インターフェース

### URLと一覧API

画面URLの動画条件は`q/status/from/to/offset`、キー条件は`codeId/setting/lifecycle/issuedFrom/issuedTo/codesOffset`。キー画面では動画一覧へ戻る条件も独立して保持する。検索確定時はその一覧のoffsetだけ0にする。未知・重複パラメーターの扱いを一つのparserで統一し、不正な既知条件を黙って全件表示へ広げない。

- `GET /api/admin/videos`: `offset`と任意`q/status/from/to`。既存`videos`配列を維持し、`hasMore: boolean`を追加。
- `GET /api/admin/videos/:id/codes`: APIの既存`offset`を維持し、画面の`codesOffset`から変換。任意`codeId/setting/lifecycle/issuedFrom/issuedTo`と`hasMore`を追加。既存`codes`配列とmetadata ID・発行日時・取消日時・statusを保持し、`enabled: boolean`を追加。
- `q`は`instr(title, ?) > 0`によるタイトル部分一致OR Filma ID完全一致。他の条件はAND。大文字・小文字を区別し、`%`、`_`も普通の検索文字として扱う。空qでは検索条件を付けない。
- 動画期間は`ends_at > from`かつ`starts_at < to`の重なり。キー発行期間は`created_at >= issuedFrom`かつ`created_at < issuedTo`。片側なしは無制限、from >= toは400。既存の必須動画期間を省略可能へ変更しない。
- 日時はタイムゾーン付きで検証してUTCへ正規化。DB秒と画面ISO文字列の単位を混同しない。検索語100文字、offsetの既存上限を維持する。
- `ORDER BY created_at DESC, id DESC LIMIT 101 OFFSET ?`から先頭100件を返す。総件数COUNTや全件取得はしない。

### 一括API

```ts
// POST /api/admin/videos/bulk-status
type BulkVideoInput = { ids: string[]; status: 'draft' | 'published' }
// POST /api/admin/videos/:id/codes/bulk-status
type BulkCodeInput = { ids: string[]; enabled: boolean }
type BulkResult = { changedCount: number; unchangedCount: number }
```

既存の単件POST/PUTと競合しない順序で経路登録する。IDsは1〜100件、各IDは現行UUID形式、重複・余分なfieldを拒否。parse関数は成功値またはnullを返す。セッション/admin・同一Origin・JSON/サイズは既存防御を再利用する。現行schemaはadminのみだが、非admin認証が将来通るように認可を省略しない。

キーは動画存在と全IDの所属を確認し、存在/所属不一致は404、取消済みや再有効化時の期間終了など既知の不適格は409。混在時は404を優先し、変更は0件。開始前の設定変更は可能。非公開動画のenabledを自動で書き換えない。単件動画編集はstatusを上書きしない現在のUPDATEを維持する。

`redemptions`/`entitlements`が未実装のため、現在の製品DBに使用済みキーは発生しない。使用済み判定用の独自フラグ・仮の消費APIを増やさない。現段階の`lifecycle=used`は空結果であり、その理由を画面・ガイドに明記する。純粋な適格性テストでは使用済みを拒否する。実引換を有効化する前にredemptions参照を一覧・一括・単件取消へ統合し、競合試験を追加することを未完了ゲートとして残す。

### DB方式の技術確認

2026-09-09にContext7とCloudflare公式資料を確認した。

- D1の`batch()`はトランザクションとして実行され、失敗時は全体を中断する。[D1 Database](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- `defer_foreign_keys`だけではCASCADEによる子行削除を止められない。[SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/#pragma-defer_foreign_keys--onoff)
- 一文のbind数上限も考慮する。100 IDに目標状態等を追加して上限を超えないよう、検証済みID配列を一つのJSON引数として`json_each(?)`へbindする方式を最初に検証する。[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- 同資料のLIKEパターン上限は50 bytesで、承認済み100文字検索と両立しない。検索文字を切り詰めず、`instr`でリテラル部分一致する。日本語100文字と`%`/`_`をWorkerテストへ含める。

一括更新は同じbatch内の「存在・適格・変更前件数のSELECT」と「全ID適格を条件にしたUPDATE」を基本とする。UPDATEは異なる目標状態の行だけ変更する。SELECTの結果を受け取ってから別リクエストで無条件UPDATEする方式は禁止。batchの結果から変更前件数と実変更件数の整合を確認し、不明なら503と再取得案内にする。取消や期間変更との並行要求を合成D1で検証する。SQL構文だけで原子性の達成を宣言しない。

移行は旧schemaを保持したまま、子`access_codes`の全列を外部キーなしの一時退避表へコピーし、子表を外してから親`videos`を再作成・コピー、正しい外部キーの子表を再作成・復元する方式を合成DBで検証する。全体はmigrationの一つのトランザクション内で行い、失敗時に元schema/データへ戻ることを実証する。ID・hash・日時・取消・索引・ユニーク制約を維持し、可逆設定は`is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1))`とする。取消状態は別途必ず優先する。既存0001を書き換えたり制約を無効化して済ませたりしない。

この移行は現管理schemaのみを対象とする。着手時に他の子表や新migrationが追加されていたら設計へ戻し、未知の表を削除・無視しない。既存実データへの適用は本計画の実行に含めない。

## Task 1: 絞り込み・選択・一括操作を一つの縦切りで実装する

**Files:** 上表。コード/TDDは5.6 Solのみ。各Stepは同じTask #28の小ステップであり、追加の実装エージェントやPRには分割しない。

- [x] **Step 1: 先行統合と基準の固定。** PR #27のknrytによるmerge `9c4b1c8b8d06658a0083246e26082233111bb1f7`とIssue #24終了を確認。既存の隔離worktreeをIssue #28ブランチへ切り替えて再利用し、origin/develop同期後の基準を`36936101391eb0025301d2a1283f15862e078dd1`へ固定した。変更なしの状態から既存合成設定の`pnpm verify`を実行し、Node69/69・Worker27/27、lint/typecheck/build/format成功。
- [x] **Step 2: 入力とURLのRED。** 次表の単体試験を追加し、未実装関数・不足した拒否条件で失敗することを確認。既存の正規化と内部戻り先検証を流用して最小実装する。

| 試験                                      | 期待                                         |
| ----------------------------------------- | -------------------------------------------- |
| IDsが0/1/100/101件、重複、別型、未知field | 1/100のみ適格、その他拒否                    |
| status/booleanの不正値、qの100/101文字    | 境界どおり受理/拒否                          |
| 開始=終了、終了時刻ちょうど、片側期間     | 不正区間拒否、終了を含まず、片側条件だけ適用 |
| 取消済み/使用済み/未使用のキー適格性      | 前二者拒否。未使用のみ状態と期間を検証       |
| 動画条件とキー条件のURL往復               | 混同せず復元、対応offsetだけリセット         |
| ページ/条件/動画/ログアウト変更           | 選択0件。処理中に同じ操作を再送しない        |

実行: `pnpm exec vitest run --config vitest.config.ts tests/unit/admin-management.test.ts tests/unit/admin-routes.test.ts tests/unit/admin-ui-state.test.ts`。RED理由とGREEN件数を記録する。

- [x] **Step 3: 合成DBの移行RED→GREEN。** 0001だけを適用した別fixtureに複数動画と有効/取消済みキーを作る。既存テストsetupが全migrationを自動適用する点を避け、専用合成bindingまたは同等の隔離を使う。移行後の全列照合、外部キー/ユニーク/CHECK/索引、追加published保存、is_enabled既定値を確認する。途中失敗のロールバックも確認。ローカルWranglerのmigration適用経路でも検証する。失敗したらこのStepで止め、既存データへ試さない。
- [x] **Step 4: 一覧と一括APIのRED→GREEN。** 1001件fixture、絞り込みAND、同時刻ソート、100件ちょうどと最終1件、入力/auth/Origin/16 KiB/レート制限、404/409全件未変更、再操作の変更不要件数、単件取消との競合を先にテストする。repositoryとAPIを実装。100件成功でbind上限に収まることを実D1互換Worker試験で確認する。

実行: `pnpm exec vitest run --config vitest.worker.config.ts tests/worker/admin-management.test.ts tests/worker/admin-migration.test.ts tests/worker/admin-api.test.ts`。元schemaの試験で開発者の秘密やDBを読み込まない。

- [x] **Step 5: 最小UIを接続。** 検索フォーム、リセット、100行、各行と現ページの選択、件数、二つの明示目標ボタン、確認、結果を既存URL別画面へ組み込む。設定と利用状態を別表示し、公開設定済みでも実配信停止と表示。対象IDが選択されたと分かるラベル、indeterminate、キーボード/フォーカス/通知を付ける。結果不明は再取得のみを案内し、自動再送しない。
- [x] **Step 6: 隔離ブラウザで受入。** 動画1001件・一動画キー1001件を別ポートに用意する。検索→複数選択→確認中止/実行→一覧更新、100件一括、動画公開/非公開、キー無効/有効、取消済み選択不可、終了時刻拒否、検索結果から消えて先頭復帰を確認する。直接URL/再読込/戻る進む/編集から条件復帰、ページ変更で選択解除、通信断/401時の保護情報消去を確認。小画面・キーボードで主操作できること、外部通信0と秘密非保存も確認する。実200%・BFCache復帰はIssue #30の公開前確認へ集約し、本Taskの新画面もその対象とする。実引換・視聴権の試験は未実装と明記。
- [ ] **Step 7: 文書・検証・独立レビュー。** 実装担当の文書化と検証まで完了。変更freeze後の独立レビュー、PR記録、knrytのexact-head再レビューと統合は未完了。操作ガイドに実装済み/後続ゲート、適用前バックアップと復元の注意、合成DBでの結果を保存しREADMEへ接続。`pnpm verify`と`git diff --check`を完走し、Issue/PRに正確な件数・未確認事項・SHAを記録する。変更をfreezeし別5.6系でレビュー、重要指摘は同じ実装担当へ戻す。条件がそろうまで#29はDraftを維持。Ready化後はknrytへexact-head再レビューを依頼し、自分でApprove/Mergeしない。

## 受入と終了の区別

今回の終了は「管理一覧の検索・100件選択・一括設定を隔離ブラウザで操作でき、旧schemaのデータ保持を検証済み」。視聴できるP0、公開運用、Cloudflare無料枠適合、実データ移行の完了とは扱わない。仕様変更や技術的ブロッカーはIssue #28へ記録し、黙って受入条件を削らない。
