# P0 Invite Test Completion Implementation Plan

> **Execution workflow:** リポジトリの[AGENTS.md](../../../AGENTS.md)に従い、同じ5.6 Sol実装担当がtaskを順に実行し、別担当が[play-cms reviewer](../../../.agents/skills/play-cms-reviewer/SKILL.md)で独立レビューする。外部のagent skillは任意かつ非blockingであり、利用できなくてもこのcheckbox順で実行する。

**Goal:** 使い切り閲覧キーから期限内の再視聴までを完成させ、Cloudflare D1へmigrationして3〜5名が操作できる招待テスト環境を用意する。

**Architecture:** 既存のHono Worker、React/Vite、D1、Web Cryptoを維持し、動画バイナリは保存しない。Filma APIキーと再生grantはサーバー境界だけで扱い、Filma契約が成立してからキーを原子的に消費する。製品実装、Cloudflare配置、人的受入を別Issueへ分け、各段階を単独で停止・レビューできるようにする。

**Tech Stack:** TypeScript, Hono, React, Vite, Cloudflare Workers, D1, Web Crypto, Vitest, Wrangler 4

**Spec:** [play-cms 現行要件](../../product/requirements.md)

## Global Constraints

- base branchは`develop`。Issue #35、#36、#37を順に扱い、一Issue・一feature branch・一PRを維持する。人的な受入結果だけはIssue #37のコメントを記録先とし、製品変更が生じた場合だけ修正IssueとPRを追加する。
- 6 Astraは設計と管理だけを担当する。製品・テスト・migration・設定の実装と修正は同じ5.6 Sol担当へ集約し、別の5.6系担当が独立レビューする。正式Approve/Mergeはknrytだけが行う。
- 実装は失敗テストから開始し、各PRで`pnpm verify`、`git diff --check origin/develop...HEAD`、秘密値の非混入を確認する。
- Filma APIキーをresponse、browser storage、URL、ログ、Issue、PRへ出さない。再生grantをD1、browser storage、ログへ保存しない。
- 一般公開は#16のGO条件を満たすまで実Filma再生と閲覧キー消費を有効にしない。P0招待試験だけは[ADR 0003](../../decisions/0003-allow-limited-p0-playback-without-domain-binding.md)に従い、専用の非機密動画一件、3〜5名、動画単位・5分以下、既定無効の条件で進める。Filma障害、構成不備、動画限定または期限の契約違反ではキーを未使用のまま残して503で閉じる。
- 非公開・公開前・期限終了後は、全viewer routeでタイトル、説明、サムネイル、Filma ID、再生grant、存在を示す件数を返さない。
- P0では動画アップロード、アクセス解析、DRM、サムネイル、メール確認、パスワード再設定、新しい管理基盤を追加しない。
- Cloudflare操作の前に`wrangler whoami`と対象resourceを確認し、既存の同名Worker/D1を上書き・削除しない。remote migrationは専用テストD1だけへ適用する。

---

### Task 1: 閲覧キー・匿名視聴・視聴権を縦につなぐ

**Tracking:** [Issue #35](https://github.com/rytich/play-cms/issues/35)

**Files:**

- Create: `migrations/0004_redemptions_filma_settings.sql`
- Create: `src/core/viewing.ts`
- Create: `src/adapters/database/viewing-repository.ts`
- Create: `src/adapters/filma/playback-client.ts`
- Modify: `src/adapters/database/admin-repository.ts`
- Modify: `src/adapters/database/viewer-repository.ts`
- Modify: `src/adapters/secrets/web-crypto.ts`
- Modify: `src/server/env.d.ts`
- Modify: `src/server/app.ts`
- Modify: `src/viewer/App.tsx`
- Modify: `src/viewer/client.ts`
- Modify: `src/viewer/routes.ts`
- Modify: `src/viewer/styles.css`
- Modify: `src/admin/main.tsx`
- Modify: `src/admin/client.ts`
- Modify: `src/admin/routes.ts`
- Modify: `src/ui/layouts/AdminLayout.tsx`
- Test: `tests/unit/viewing.test.ts`
- Test: `tests/unit/filma-playback-client.test.ts`
- Test: `tests/worker/viewing-flow.test.ts`
- Test: `tests/worker/viewing-migration.test.ts`
- Test: `tests/worker/admin-management.test.ts`
- Test: `tests/browser/viewing-flow.mjs`
- Test: `tests/unit/admin-client.test.ts`
- Test: `tests/unit/admin-routes.test.ts`
- Test: `tests/unit/ui-layout.test.tsx`
- Test: `tests/live/filma-playback.live.test.ts`
- Create: `vitest.playback-live.config.ts`
- Modify: `package.json`
- Create: `docs/development/viewing-flow.md`

**Interfaces:**

- Produces: `parseViewingCode(value: unknown): string | null`。ハイフンとASCII空白を除去し、大文字16文字のCrockford Base32だけを返す。
- Produces: `isViewerAvailable(video, nowMs): boolean`。`published && startsAt <= now < endsAt`を唯一の公開判定とする。
- Produces: `issuePlaybackGrant(input): Promise<{url: string; expiresAt: string}>`。`input`は`apiKey`、`filmaFileId`、`notAfter`、`allowedOrigin`を持ち、固定Filma host、5秒、64 KiB、redirect拒否、単一試行を適用する。
- Produces: `redeemForAnonymous(db, input)`と`redeemForViewer(db, input)`。code hash、video、時刻を同一transactionで再確認し、一つだけredemptionを作る。
- Consumes: `findSessionAccount()`、`createViewerWithSession()`、`availableLibraryItems()`、既存の`play_session` Cookie。
- Consumes: `PLAY_CMS_P0_INVITE_PLAYBACK`と`PLAY_CMS_P0_FILMA_FILE_ID`。前者は文字列`true`のときだけP0再生を許可し、後者と動画の`filmaFileId`が完全一致しない場合はgrant取得前に拒否する。未設定を既定とし、通常CIでは無効のままにする。

- [ ] **Step 1: Filma再生契約専用のlive testでGO条件を確認する**

  既存の`pnpm test:filma:live`はtoken endpointの認証だけを確認するため、再生GOの証拠に使わない。`test:filma:playback:live`はこの文書PRのheadにはまだ存在せず、Task 1 Step 1で最初に作るdeliverableとする。`tests/live/filma-playback.live.test.ts`と`vitest.playback-live.config.ts`を作成し、通常CIの`verify`から除外した同名scriptを`package.json`へ追加する。`pnpm run`の一覧に同scriptが表示されることをcommand-discoveryの受入条件とする。

  Git管理外の`FILMA_LIVE_API_KEY`、`FILMA_LIVE_FILE_ID`、`FILMA_LIVE_NOT_FOUND_FILE_ID`、`FILMA_LIVE_INVALID_API_KEY`、`FILMA_LIVE_ALLOWED_ORIGIN`、`FILMA_LIVE_DENIED_ORIGIN`が全てある場合だけ手動実行する。6変数のいずれかがない状態ではFilmaへrequestを送らず、変数名だけを含む`FILMA_LIVE_CONFIG_MISSING`で明示的に失敗することをtestで固定する。値、APIキー、動画ID、URLは出力しない。

  専用テストは、公開済みの専用動画一件に対して`jwt_expires_at = now + 10秒`を指定し、返却URL内tokenの非null期限が指定値以下であること、許可originで再生開始できること、拒否originで403になること、11秒後に同じgrantとrefreshの両方が拒否されることを確認する。status、期限比較、確認項目名だけを出力し、APIキー、動画ID、JWT、URL、応答本文を出力しない。

  結果は次の3種類に分け、statusと分類名だけを#16へ記録する。

  - `all-conditions-passed`: 有効期限、許可origin、拒否origin、期限後grant、期限後refreshの全条件を確認できた場合だけGO候補とする。
  - `contract-denied`: Filmaへの到達と認証は成立したが、拒否originでも再生できる、または期限後のgrant/refreshが受理されるなど、一般公開のsecurity条件が満たされないことを実証できた場合。一般公開はNO-GOとする。P0は動画限定と5分以下の非null期限を確認できた場合だけ、ADR 0003の既定無効・専用動画allowlistの実装へ進める。
  - `test-infrastructure-error`: 変数不足、認証失敗、timeout、DNS、予期しないstatus/schemaなど、契約成立・不成立を判定できない場合。原因を調査するまで停止し、これを`contract-denied`またはGOとして扱わない。

  `test-infrastructure-error`、動画限定不明、期限不明、5分超過ではP0も停止する。domain制限とrefresh延長の残存リスクだけをADR 0003でP0限定受容し、testを削除したり`all-conditions-passed`へ読み替えたりしない。

- [x] **Step 2: migrationとcoreの失敗テストを書く**

  `0004`には暗号化済みFilma設定、30分の匿名視聴session、redemptionを追加する。`redemptions.code_id`はunique、`(code_id, video_id)`は既存`access_codes(id, video_id)`と一致させ、匿名sessionまたはviewer accountのちょうど一方だけを保持するCHECKを付ける。既存3 migrationを適用した合成D1へ`0004`を適用し、既存account、session、video、access code、entitlementが保持される失敗テストを書く。

- [x] **Step 3: Filma設定とgrant検証の失敗テストを書く**

  `GET /api/admin/filma`は`{configured, verifiedAt}`だけを返し、`PUT /api/admin/filma`は`{apiKey}`だけを受ける。接続確認成功後にAES-GCMで保存し、平文・nonce・ciphertextをresponseへ返さない。`issuePlaybackGrant()`が固定host、timeout、response上限、redirect拒否、`expiresAt <= notAfter`、HTTPS URLを守ることをtestで固定する。

- [ ] **Step 4: `/admin/filma`と動画保存前検証の失敗テストを書く**

  `src/admin/routes.ts`が`/admin/filma`を固有画面として認識し、`AdminLayout`の「Filma連携」から遷移でき、direct open・reload・back・forwardで復元できることをtestで固定する。画面は未設定、確認中、接続済み、接続失敗だけを示し、保存済みキーを再表示しない。

  実装着手の前提として、確認済み公式仕様を固定した[Filma playback contract](../../development/filma-playback-contract.md#確認した契約)の「動画存在確認・再生情報取得」とエラー仕様を根拠に、次の識別・受入規則をtestで固定する。

  - 管理者が送信した`filmaFileId`は`^[1-9]\d{0,19}$`の正規形だけを許可し、その文字列を`GET /filmaapi/storage/{id}`のpath `id`へ一度だけpercent-encodeして渡す。成功時もこの入力値だけを`videos.filma_file_id`へ保存する。
  - responseの`mediafile_id`はエンコード済みファイルを示す別識別子であり、入力`filmaFileId`との一致を要求せず、入力値を上書きしない。正のsafe integerであることを検証し、そのresponse内のHTTPS `url`と再生grantの対象確認だけに使う。
  - `show_all`は送らない。公式仕様上は公開ファイルだけが200となるため、文書にない`published` fieldを推測しない。200かつ64 KiB以下のJSON objectで、`url`が許可済みFilma hostのHTTPS URL、`mediafile_id`が上記条件を満たす場合だけschema成功候補とする。
  - pinned error contractに従い、404は不存在として保存せず管理入力エラー、401/403は認証・権限設定エラーとして保存せず503、redirect・その他status・timeout・過大body・不正schemaは保存せず503へ閉じる。response bodyと識別子をログへ出さない。

  専用テスト動画、専用組織で不存在と確認したテスト用ID、無効なテスト認証、拒否originを使うlive contract testで、200、404、401、403の実statusと200 schemaが上記分類に一致することを確認するまでproductionの動画作成・更新へ接続しない。固定した公式資料へ到達できない、実契約が資料と一致しない、またはstatus/schemaを安全に分類できない場合はStep 4を停止して#16へ未確認事項を記録する。別endpointやfieldを推測せず、動画をD1へ保存しない。

- [x] **Step 5: キー消費・管理表示・権利移行の失敗テストを書く**

  `POST /api/public/videos/:publicId/redeem`、`GET /api/public/videos/:publicId/playback`、`GET /api/viewer/videos/:publicId/playback`を対象に、未ログイン、ログイン済み、登録時移行、ログイン時移行、直列再利用、二並行再利用、期限切れ匿名session、別browser、既存entitlementを検証する。Filma grant失敗時に`redemptions`と`entitlements`が0件で、access codeが未使用であることを必ず確認する。

  管理API/UIでは`redemptions`が存在するキーを`used`として一覧・絞り込みに表示し、有効／無効の一括変更と単体取消の対象から除外する。redeem対bulk、redeem対revokeの並行要求はどちらか一方だけを成功させ、使用済みになった後の変更は409、所有動画が違う場合は404とする。既存entitlementとredemptionは管理操作で削除しない。

- [x] **Step 6: 最小実装でテストを通す**

  redeemは、P0再生フラグと専用動画allowlist、ハッシュ一致候補、availabilityを読み取り、Filma grantを取得・検証した後、D1 transactionで同じ条件を再確認して一件だけ消費する。フラグ未設定・無効、allowlist不一致ではFilmaへ接続せずキーを未使用のまま503で閉じる。匿名時は`play_anonymous`を`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1800`で発行する。viewer時は同じtransactionでentitlementをupsertする。register/login時は有効な匿名sessionだけを同じtransactionで移し、移行後に匿名sessionを失効させる。

- [x] **Step 7: URL単位の管理・視聴UIを実装する**

  `/admin/filma`にキー設定と接続状態を実装する。`/v/:publicId`はredeem前にコード入力だけを表示する。成功後に5分以下のgrantで再生し、「この視聴は30分間だけ有効です。期限内に登録またはログインしない場合、このコードは再利用できず、動画を再び開けません。」を表示する。`/register?returnTo=/v/:publicId`と`/login?returnTo=/v/:publicId`はpublicId以外をURLへ載せない。ライブラリの動画リンクは`/v/:publicId`へ遷移する。管理キー一覧は`used`を表示し、使用済み行の選択・有効化・無効化・取消をdisabledにする。

- [x] **Step 8: 境界・ブラウザ・全検証を実行する**

  `draft`、公開前、終了時刻ちょうど、期限切れ、不明IDを、public page、redeem、anonymous playback、library、viewer playbackの表で検証する。ブラウザではdirect open、reload、back、forward、匿名から登録、再login後libraryを確認する。

  レビュー追補では、grant失敗時の全DB不変条件、既存メール登録時の匿名権利保持、public/redeem/anonymous/library/viewerの終了時刻ちょうどを含む非公開行列、認証済み不明ID、`/admin/filma`のreload・back・forwardを追加確認した。

  ```bash
  pnpm vitest run tests/unit/viewing.test.ts tests/unit/filma-playback-client.test.ts
  pnpm vitest run tests/unit/admin-client.test.ts tests/unit/admin-routes.test.ts tests/unit/ui-layout.test.tsx
  pnpm vitest run --config vitest.worker.config.ts tests/worker/viewing-flow.test.ts tests/worker/viewing-migration.test.ts tests/worker/admin-management.test.ts
  pnpm test:browser:viewing
  pnpm verify
  git diff --check origin/develop...HEAD
  ```

- [ ] **Step 9: 記録・commit・PR・独立レビューを行う**

  #35へGO/NO-GO、件数、command、head SHA、未確認事項を記録する。秘密値がdiffとログにないことを確認し、`feat: complete one-time viewing flow (#35)`でcommitする。PRは`develop`向けに`Refs #35`を記載し、別5.6系レビュー後、knrytのexact-head承認・CI成功を待つ。

---

### Task 2: D1 migrationとCloudflare招待環境を構築する

**Tracking:** [Issue #36](https://github.com/rytich/play-cms/issues/36)

**Files:**

- Modify: `wrangler.jsonc`
- Modify: `worker-configuration.d.ts`
- Modify: `package.json`
- Modify: `src/server/app.ts`
- Modify: `src/server/security.ts`
- Create: `scripts/check-cloudflare-invite-config.mjs`
- Test: `tests/unit/check-cloudflare-invite-config.test.ts`
- Test: `tests/worker/invite-security-boundaries.test.ts`
- Create: `tests/live/p0-smoke.live.test.ts`
- Create: `docs/operations/cloudflare-invite-deploy.md`
- Modify: `README.md`

**Interfaces:**

- Produces: `pnpm check:cloudflare:invite-config`。生成済みdeploy configのWorker名、D1 binding/name、Assets binding、Worker-first route、`PLAY_LOCAL_ONLY`無効を検査する。
- Produces: `pnpm test:p0:smoke`。明示した招待URLと専用test accountだけでhealth、login、library、期限遮断、playbackを読み取り確認する。
- Produces: `clientBucket(env, request): Promise<string>`。local-only時だけ固定fixtureを使い、invite環境ではCloudflareが設定した`CF-Connecting-IP`を`PLAY_RATE_LIMIT_KEY`でHMAC化する。headerまたはkey欠落時は503とする。
- Consumes: `migrations/0001_admin.sql`から`0004_redemptions_filma_settings.sql`、Task 1の全公開route。

- [ ] **Step 1: 現行Cloudflare設定をContext7と公式資料で再確認する**

  repositoryのWrangler 4系に対して、D1 environment binding、`d1 migrations list/apply --remote`、static assets、Workers development URL、deployment/version rollbackのcommandを確認し、参照日とURLを運用文書へ記録する。

- [ ] **Step 2: production混入を拒否する設定テストを書く**

  invite buildが専用Worker名、専用D1名、`DATABASE`、`ASSETS`、`/api/*`と`/v/*`のWorker-first、`PLAY_LOCAL_ONLY !== true`を満たす場合だけ成功するテストを書く。local D1 UUID、別環境名、binding欠落、公開route欠落では失敗させる。Worker testではlocal-onlyのloopback制限を維持し、invite時だけ外部hostを許可すること、`CF-Connecting-IP`またはrate-limit key欠落時にFilma通信や認証処理より前の503になることを固定する。

- [ ] **Step 3: invite環境設定と手順を実装する**

  rootはlocal-onlyのまま維持し、`env.invite`だけに専用Workerとremote D1 bindingを置く。local-only middlewareは`PLAY_LOCAL_ONLY === 'true'`の場合だけloopbackを要求し、inviteではCloudflareのclient IPを匿名化したbucketを使う。`docs/operations/cloudflare-invite-deploy.md`へ、対象account確認、同名resource不存在確認、D1作成、migration一覧、backup/export、secret登録、dry run、maintenance baseline、機能版deploy、rollback、試験終了時停止を順番に記載する。

- [ ] **Step 4: ローカル検証とdry runを完了する**

  ```bash
  pnpm verify
  pnpm build
  pnpm check:cloudflare:invite-config
  pnpm wrangler deploy --dry-run --env invite
  git diff --check origin/develop...HEAD
  ```

  出力へsecret値、account ID、database IDを転載しない。結果を#36へ記録し、`deploy: add Cloudflare invite environment (#36)`でcommit、PR、独立レビュー、knryt承認、CI成功まで完了する。

- [ ] **Step 5: 対象を再確認してremote D1を作成する**

  `pnpm wrangler whoami`でaccount名を確認し、予定名と同名のWorker/D1が存在しないことをlist commandで確認する。新規の専用D1だけを作成し、返却されたIDを`env.invite.d1_databases`へ設定してtypesとconfig検査を再実行する。既存resourceがある場合は上書きせず停止する。

- [ ] **Step 6: maintenance baselineを先にデプロイする**

  初回はAPIとAssetsの全routeへ503を返すmaintenance versionを同じinvite Worker名へデプロイし、そのversion IDと停止動作を確認する。これを機能版の直前rollback先とする。招待URLはまだ共有しない。Worker rollbackはcodeとroutingだけを戻し、D1 schema/dataを戻さないことを運用文書へ明記する。

- [ ] **Step 7: migrationとsecretを適用して機能版をデプロイする**

  migration前にD1 exportを取得し、schemaとdataの復元手順をWorker rollbackと分離して記録する。`d1 migrations list --remote --env invite`で対象名と未適用一覧を確認し、0001から昇順で専用D1へ適用する。`PLAY_BOOTSTRAP_TOKEN`、`PLAY_ENCRYPTION_KEY`、`PLAY_RATE_LIMIT_KEY`、Filma APIキーに必要なsecretを対話入力し、値をファイル・shell history・Issueへ残さない。dry runとconfig検査を再実行してからinvite環境をdeployする。

- [ ] **Step 8: 管理者初期設定とsmoke testを行う**

  招待URLで管理者を一度だけ初期登録し、成功後にbootstrap secretを削除する。専用テスト動画とテストaccountでhealth、管理者login、動画登録、キー発行、viewer login、library、playback、期限切れ404を確認する。失敗時は新規招待を停止し、maintenance baselineへWorkerをrollbackする。migration後のD1を旧codeが読めない場合はWorker rollbackで復旧したと扱わず、maintenanceを維持して事前exportからの復元可否を判断する。D1へ書き込まれたテスト値は保持し、原因調査のため無断削除しない。

---

### Task 3: 3〜5名の招待操作確認を実施する

**Tracking:** [Issue #37](https://github.com/rytich/play-cms/issues/37)

**Files:**

- Create after execution: `docs/product/p0-invite-test-result.md`
- Modify after execution: `docs/development/issue-status.md`

**Interfaces:**

- Consumes: Issue #36で確認済みの招待URL、管理者、専用Filma動画。
- Produces: 個人情報を含まない人数、各工程の成功数、補助の有無、改善点、継続／修正判断。

- [ ] **Step 1: テストデータと観察票を準備する**

  管理者が3〜5個の個別キーを発行し、各テスターへURLと一つのキーを個別に渡す。GitHubにはキー、メールアドレス、Filma ID、再生URLを書かない。観察項目はコード入力、再生、警告理解、登録／login、library再視聴、期限後拒否に固定する。

- [ ] **Step 2: 本人による予行を行う**

  新しいbrowser contextでsuccess flowを一回、別動画または時刻fixtureで期限切れflowを一回確認する。Criticalな情報漏えい、キー再利用、他人のライブラリ表示があれば招待を開始せず、#37へ停止理由だけを記録して修正Issueを作る。

- [ ] **Step 3: 3〜5名で操作確認する**

  各参加者が補助なしで操作を開始し、詰まった工程だけ補助する。成功人数、各工程の失敗数、必要だった補助、自由記述の改善点を匿名集計する。API応答本文やbrowser storageを収集しない。

- [ ] **Step 4: 判定と文書を確定する**

  80%以上が補助なしでキー入力から再生まで完了し、期限切れ非開示とキー再利用拒否にCriticalがなければP0招待テスト成立とする。`docs/product/p0-invite-test-result.md`へ日付、人数、集計、未解決点、次の最小Issueだけを記録し、`docs: record P0 invite test result (#37)`でPRを作る。成立しない場合も同じ文書へ事実を記録し、失敗工程ごとに最小の修正Issueを作る。

---

## Self-review

- 要件対応: 管理者、視聴者、キー、期限、URL、Filma秘密、D1、Cloudflare、3〜5名受入をTask 1〜3へ割り当てた。
- 対象外対応: アップロード、解析、DRM、サムネイル、メール機能、一般公開をGlobal Constraintsで除外した。
- 型整合: `publicId`、`filmaFileId`、`expiresAt`、`notAfter`は既存camelCase responseと一致させ、D1列だけsnake_caseとした。
- 停止条件: 一般公開の#16 NO-GOを維持し、P0でも動画限定・5分以下の期限を確認できない場合、Filma failure、Cloudflare resource名衝突、Critical受入不具合では次工程へ進まない。
