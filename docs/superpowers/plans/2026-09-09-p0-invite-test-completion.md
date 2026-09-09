# P0 Invite Test Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使い切り閲覧キーから期限内の再視聴までを完成させ、Cloudflare D1へmigrationして3〜5名が操作できる招待テスト環境を用意する。

**Architecture:** 既存のHono Worker、React/Vite、D1、Web Cryptoを維持し、動画バイナリは保存しない。Filma APIキーと再生grantはサーバー境界だけで扱い、Filma契約が成立してからキーを原子的に消費する。製品実装、Cloudflare配置、人的受入を別Issueへ分け、各段階を単独で停止・レビューできるようにする。

**Tech Stack:** TypeScript, Hono, React, Vite, Cloudflare Workers, D1, Web Crypto, Vitest, Wrangler 4

**Spec:** [play-cms 現行要件](../../product/requirements.md)

## Global Constraints

- base branchは`develop`。Issue #35、#36、#37を順に扱い、一Issue・一feature branch・一PRを維持する。人的な受入結果だけはIssue #37のコメントを記録先とし、製品変更が生じた場合だけ修正IssueとPRを追加する。
- 6 Astraは設計と管理だけを担当する。製品・テスト・migration・設定の実装と修正は同じ5.6 Sol担当へ集約し、別の5.6系担当が独立レビューする。正式Approve/Mergeはknrytだけが行う。
- 実装は失敗テストから開始し、各PRで`pnpm verify`、`git diff --check origin/develop...HEAD`、秘密値の非混入を確認する。
- Filma APIキーをresponse、browser storage、URL、ログ、Issue、PRへ出さない。再生grantをD1、browser storage、ログへ保存しない。
- #16のGO条件を満たすまで実Filma再生と閲覧キー消費を有効にしない。Filma障害、構成不備、grant契約違反ではキーを未使用のまま残して503で閉じる。
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
- Modify: `src/adapters/database/viewer-repository.ts`
- Modify: `src/adapters/secrets/web-crypto.ts`
- Modify: `src/server/env.d.ts`
- Modify: `src/server/app.ts`
- Modify: `src/viewer/App.tsx`
- Modify: `src/viewer/client.ts`
- Modify: `src/viewer/routes.ts`
- Modify: `src/viewer/styles.css`
- Modify: `src/admin/main.tsx`
- Test: `tests/unit/viewing.test.ts`
- Test: `tests/unit/filma-playback-client.test.ts`
- Test: `tests/worker/viewing-flow.test.ts`
- Test: `tests/worker/viewing-migration.test.ts`
- Test: `tests/browser/viewing-flow.mjs`
- Modify: `package.json`
- Create: `docs/development/viewing-flow.md`

**Interfaces:**

- Produces: `parseViewingCode(value: unknown): string | null`。ハイフンとASCII空白を除去し、大文字16文字のCrockford Base32だけを返す。
- Produces: `isViewerAvailable(video, nowMs): boolean`。`published && startsAt <= now < endsAt`を唯一の公開判定とする。
- Produces: `issuePlaybackGrant(input): Promise<{url: string; expiresAt: string}>`。`input`は`apiKey`、`filmaFileId`、`notAfter`、`allowedOrigin`を持ち、固定Filma host、5秒、64 KiB、redirect拒否、単一試行を適用する。
- Produces: `redeemForAnonymous(db, input)`と`redeemForViewer(db, input)`。code hash、video、時刻を同一transactionで再確認し、一つだけredemptionを作る。
- Consumes: `findSessionAccount()`、`createViewerWithSession()`、`availableLibraryItems()`、既存の`play_session` Cookie。

- [ ] **Step 1: Filma再生契約を再確認する**

  `pnpm test:filma:live`をGit管理外の専用テスト値で一回だけ実行し、#16の三条件を確認する。APIキー、動画ID、JWT、URL、応答本文は出力しない。非null期限、`notAfter`以下、許可ドメイン外拒否のいずれかを確認できなければ、#16へNO-GOを追記し、このTaskのproduction有効化を停止する。

- [ ] **Step 2: migrationとcoreの失敗テストを書く**

  `0004`には暗号化済みFilma設定、30分の匿名視聴session、redemptionを追加する。`redemptions.code_id`はunique、`(code_id, video_id)`は既存`access_codes(id, video_id)`と一致させ、匿名sessionまたはviewer accountのちょうど一方だけを保持するCHECKを付ける。既存3 migrationを適用した合成D1へ`0004`を適用し、既存account、session、video、access code、entitlementが保持される失敗テストを書く。

- [ ] **Step 3: Filma設定とgrant検証の失敗テストを書く**

  `GET /api/admin/filma`は`{configured, verifiedAt}`だけを返し、`PUT /api/admin/filma`は`{apiKey}`だけを受ける。接続確認成功後にAES-GCMで保存し、平文・nonce・ciphertextをresponseへ返さない。`issuePlaybackGrant()`が固定host、timeout、response上限、redirect拒否、`expiresAt <= notAfter`、HTTPS URLを守ることをtestで固定する。

- [ ] **Step 4: キー消費と権利移行の失敗テストを書く**

  `POST /api/public/videos/:publicId/redeem`、`GET /api/public/videos/:publicId/playback`、`GET /api/viewer/videos/:publicId/playback`を対象に、未ログイン、ログイン済み、登録時移行、ログイン時移行、直列再利用、二並行再利用、期限切れ匿名session、別browser、既存entitlementを検証する。Filma grant失敗時に`redemptions`と`entitlements`が0件で、access codeが未使用であることを必ず確認する。

- [ ] **Step 5: 最小実装でテストを通す**

  redeemは、ハッシュ一致候補とavailabilityを読み取り、Filma grantを取得・検証した後、D1 transactionで同じ条件を再確認して一件だけ消費する。匿名時は`play_anonymous`を`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1800`で発行する。viewer時は同じtransactionでentitlementをupsertする。register/login時は有効な匿名sessionだけを同じtransactionで移し、移行後に匿名sessionを失効させる。

- [ ] **Step 6: URL単位の視聴UIを実装する**

  `/v/:publicId`はredeem前にコード入力だけを表示する。成功後に5分以下のgrantで再生し、「この視聴は30分間だけ有効です。期限内に登録またはログインしない場合、このコードは再利用できず、動画を再び開けません。」を表示する。`/register?returnTo=/v/:publicId`と`/login?returnTo=/v/:publicId`はpublicId以外をURLへ載せない。ライブラリの動画リンクは`/v/:publicId`へ遷移する。

- [ ] **Step 7: 境界・ブラウザ・全検証を実行する**

  `draft`、公開前、終了時刻ちょうど、期限切れ、不明IDを、public page、redeem、anonymous playback、library、viewer playbackの表で検証する。ブラウザではdirect open、reload、back、forward、匿名から登録、再login後libraryを確認する。

  ```bash
  pnpm vitest run tests/unit/viewing.test.ts tests/unit/filma-playback-client.test.ts
  pnpm vitest run --config vitest.worker.config.ts tests/worker/viewing-flow.test.ts tests/worker/viewing-migration.test.ts
  pnpm test:browser:viewing
  pnpm verify
  git diff --check origin/develop...HEAD
  ```

- [ ] **Step 8: 記録・commit・PR・独立レビューを行う**

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

  rootはlocal-onlyのまま維持し、`env.invite`だけに専用Workerとremote D1 bindingを置く。local-only middlewareは`PLAY_LOCAL_ONLY === 'true'`の場合だけloopbackを要求し、inviteではCloudflareのclient IPを匿名化したbucketを使う。`docs/operations/cloudflare-invite-deploy.md`へ、対象account確認、同名resource不存在確認、D1作成、migration一覧、backup/export、secret登録、dry run、deploy、rollback、試験終了時停止を順番に記載する。

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

- [ ] **Step 6: migrationとsecretを適用してデプロイする**

  `d1 migrations list --remote --env invite`で対象名と未適用一覧を確認し、0001から昇順で専用D1へ適用する。`PLAY_BOOTSTRAP_TOKEN`、`PLAY_ENCRYPTION_KEY`、`PLAY_RATE_LIMIT_KEY`、Filma APIキーに必要なsecretを対話入力し、値をファイル・shell history・Issueへ残さない。dry runとconfig検査を再実行してからinvite環境をdeployする。

- [ ] **Step 7: 管理者初期設定とsmoke testを行う**

  招待URLで管理者を一度だけ初期登録し、成功後にbootstrap secretを削除する。専用テスト動画とテストaccountでhealth、管理者login、動画登録、キー発行、viewer login、library、playback、期限切れ404を確認する。失敗時は新規招待を停止し、前Worker versionへrollbackする。D1へ書き込まれたテスト値は保持し、原因調査のため無断削除しない。

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
- 停止条件: #16 NO-GO、Filma failure、Cloudflare resource名衝突、Critical受入不具合で次工程へ進まない。
