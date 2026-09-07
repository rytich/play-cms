# play-cms P0 Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存のFilma動画を一度だけ使えるコードで共有し、登録後は期限内に再視聴できるCloudflare限定P0を、招待テスターへ手動公開する。

**Architecture:** Hono Workerを唯一のHTTP境界とし、React SPA、D1、Web Crypto、固定送信先のFilma adapterを接続する。ドメインとapplicationはCloudflare型を参照せず、D1・Filma・暗号をadapterへ閉じ込める。各縦切りは独立Issue、feature branch、PR、正確なhead SHAへのknryt承認を経て`develop`へ入れる。

**Tech Stack:** TypeScript strict、Hono、React、Vite、Cloudflare Vite plugin、Workers、D1、Drizzle ORM、Web Crypto、Vitest 4、`@cloudflare/vitest-plugin`

**Spec:** [P0プロトタイプ設計](../specs/2026-09-07-p0-prototype-design.md)

**Tracking:** [GitHub Issue #10](https://github.com/rytich/play-cms/issues/10)

**Related:** [基盤設計](../specs/2026-09-03-foundation-design.md) / [`SECURITY.md`](../../../SECURITY.md)

## Global Constraints

- P0は専用Filmaテスト組織と3〜5名の招待テスターだけで使う。実顧客データと本番組織を使わない。
- CMSからの動画アップロード、解析、DRM、サムネイル、メール確認、Node.js、Docker、Deploy to Cloudflareボタンは追加しない。
- それぞれのTask開始前にGitHub Issueを作り、その番号をbranch、commit、PR、関連文書へ記録する。実装中はIssueコメントを更新する。
- PRは`develop`をbaseにし、`pnpm verify`とTask固有テストを通す。knrytが現在のhead SHAをApproveするまでmergeしない。head変更後は再レビューする。
- APIキー、bootstrap token、rate-limit key、パスワード、アクセスコード、Cookie、認証ヘッダー、Filma識別子・JWT・再生URL・レスポンス本文をGit、Issue、PR、テストfixture、ログへ残さない。
- 公開APIは16 KiB以下のJSONだけを受け、余分なfield、異なるContent-Type、異なるOriginを拒否する。未定義routeは404とする。
- 視聴者向けでは`draft`、公開前、期限切れをすべて404へ畳み、title、description、Filma ID、再生情報を返さない。
- Filma通信は検証済みHTTPS URLのallowlist、`redirect: 'error'`、5秒timeout、64 KiB response上限、自動retryなしを守る。
- Cloudflare Free枠は設計目標であり保証ではない。P0はR2を使わず、D1とWorkerの使用量を試験期間中に記録する。
- Context7で2026-09-07に確認した現行Cloudflare構成を採用する。Viteは`@cloudflare/vite-plugin`、Workers runtime testはVitest 4.1以上と`@cloudflare/vitest-plugin`、D1 migrationは`wrangler.jsonc`のbindingを基準に適用する。

## Target File Structure

```text
src/
├── core/
│   ├── access-code.ts
│   ├── account.ts
│   ├── entitlement.ts
│   └── video.ts
├── application/
│   ├── ports/
│   │   ├── clock.ts
│   │   ├── filma-client.ts
│   │   ├── password-hasher.ts
│   │   ├── repositories.ts
│   │   └── secret-box.ts
│   └── use-cases/
│       ├── admin-auth.ts
│       ├── configure-filma.ts
│       ├── manage-video.ts
│       ├── redeem-access-code.ts
│       ├── viewer-auth.ts
│       └── viewer-library.ts
├── adapters/
│   ├── database/
│   │   ├── d1-repositories.ts
│   │   └── schema.ts
│   ├── filma/http-filma-client.ts
│   └── secrets/web-crypto.ts
├── server/
│   ├── app.ts
│   ├── dependencies.ts
│   ├── middleware/security.ts
│   └── routes/
│       ├── admin.ts
│       ├── auth.ts
│       └── viewer.ts
├── ui/
│   ├── index.html
│   ├── main.tsx
│   └── app.tsx
├── admin/                     # 管理者画面component
├── viewer/                    # 視聴者画面component
└── worker.ts
migrations/0001_p0.sql
tests/
├── unit/
├── integration/
├── worker/
└── live/
```

水平レイヤーを一括作成しない。以下のTaskで必要になったfileだけを追加する。

---

### Task 1: PR #7を最新`develop`へ安全に同期する

**Tracking:** 既存Issue #6 / PR #7を使い、新しいIssueとPRを重複作成しない。

**Files:**

- Preserve: `src/adapters/filma/live-contract.ts`
- Preserve: `tests/unit/filma-live-contract.test.ts`
- Preserve: `tests/live/filma-token.live.test.ts`
- Preserve: `vitest.live.config.ts`
- Preserve: `docs/development/filma-live-api-testing.md`
- Resolve: `docs/superpowers/plans/2026-09-03-foundation-implementation.md`

- [ ] **Step 1: リモート状態と対象SHAをIssueへ記録する**

```bash
gh pr view 7 --json url,state,isDraft,mergeable,mergeStateStatus,headRefOid,baseRefOid,reviews,statusCheckRollup
git fetch origin develop feature/issue-6-filma-live-contract
```

Issue #6へbase SHA、head SHA、競合状態だけを記録し、秘密情報やAPI応答は書かない。

- [ ] **Step 2: mergeで`develop`を取り込む**

```bash
git switch feature/issue-6-filma-live-contract
git merge origin/develop
```

rebaseとforce-pushは使わない。計画書の競合は、PR #7のFilma live contractとP0のセキュリティ要件を両方残して解消する。他fileへ予期しない競合が出た場合は変更を止め、Issueへ対象fileを記録する。

- [ ] **Step 3: 既存契約テストを実行する**

```bash
pnpm vitest run tests/unit/filma-live-contract.test.ts
pnpm verify
git diff --check origin/develop...HEAD
```

期待結果: unit/integration、lint、typecheck、UI build、formatが成功する。

- [ ] **Step 4: 明示実行のlive testを専用テストキーで確認する**

```bash
read -r -s FILMA_LIVE_API_KEY
export FILMA_LIVE_API_KEY
pnpm test:filma:live
unset FILMA_LIVE_API_KEY
```

期待結果: 認証確認が1件成功し、キーやresponse本文が出力されない。コマンド履歴に値を残せない環境では、対話的な秘密注入方法を使う。

- [ ] **Step 5: commit、push、Issue/PRを更新する**

```bash
git add src tests docs package.json pnpm-lock.yaml
git commit -m "fix: sync Filma contract with develop"
git push origin feature/issue-6-filma-live-contract
```

PR #7へ新head SHA、検証結果、残課題を追記する。別レビュー担当が新headをレビューし、knrytのApproveが同じSHAに付いたことを確認してからmergeする。

---

### Task 2: Filmaの既存動画・再生契約を4時間で確定する

**Tracking:** 開始前に`Spike: Filma既存動画と再生契約を確認する` Issueを作成する。

**Files:**

- Create: `docs/development/filma-playback-contract.md`
- Create after GO decision: `src/application/ports/filma-client.ts`
- Create after GO decision: `src/adapters/filma/http-filma-client.ts`
- Create after GO decision: `tests/unit/filma-playback-contract.test.ts`
- Create after GO decision: `tests/live/filma-video-playback.live.test.ts`
- Modify after GO decision: `package.json`

- [ ] **Step 1: 調査境界をIssueへ固定する**

次の条件をIssue本文へ記録する。

```text
対象: 専用テスト組織、既存テスト動画1件、read-only操作
上限: 4時間
確認: 動画存在確認、再生情報取得、有効期限、domain制限、error形式
禁止: 動画作成・更新・削除、HTML scraping、endpoint推測、secret記録
```

- [ ] **Step 2: 現行の認証契約を再確認する**

```bash
pnpm vitest run tests/unit/filma-live-contract.test.ts
read -r -s FILMA_LIVE_API_KEY
export FILMA_LIVE_API_KEY
pnpm test:filma:live
unset FILMA_LIVE_API_KEY
```

期待結果: PR #7で確定した固定token endpoint、redirect拒否、5秒timeout、64 KiB上限、単一試行が維持される。

- [ ] **Step 3: 公式資料と安全化した実レスポンスから契約を記録する**

`docs/development/filma-playback-contract.md`には次だけを書く。

```markdown
# Filma playback contract

- 確認日: 2026-09-07
- 対象環境: 専用テスト組織
- 認証方式: 確認済み方式の分類
- 動画存在確認: HTTP method、固定path、必要field名、status分類
- 再生情報取得: HTTP method、固定path、必要field名、status分類
- 有効期限: 非null期限を取得し、CMS指定`notAfter`以前に失効させる方法
- domain制限: APIまたはFilma設定で確認した方法
- 保存禁止: API key、JWT、video ID、playback URL、response本文
- 結論: GO または NO-GO
```

実値は書かず、pathにIDを含む場合は`{videoId}`と表現する。確認できない項目を推測で埋めず、その項目がGO条件を満たさない理由として記録する。

- [ ] **Step 4: NO-GOなら安全に停止する**

4時間以内に、既存動画の存在とブラウザー再生に必要な情報を公式資料または実レスポンスで確認できない場合、`結論: NO-GO`として文書とIssueだけをcommitする。Tasks 3〜6を開始せず、Filma側へ必要なAPIまたは仕様をIssueに箇条書きする。

- [ ] **Step 5: GOなら内部portの失敗テストを書く**

`tests/unit/filma-playback-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { buildFilmaClient } from '../../src/adapters/filma/http-filma-client.js'

describe('Filma playback contract', () => {
  it('rejects redirects and responses larger than 64 KiB', async () => {
    const client = buildFilmaClient({ fetch: guardedFetchFixture })

    await expect(
      client.verifyVideo({ apiKey: 'test-key', videoId: 'v-test' }),
    ).rejects.toMatchObject({ category: 'upstream_contract' })
  })

  it('rejects a playback grant that exceeds the CMS deadline', async () => {
    const client = buildFilmaClient({ fetch: overlongGrantFetchFixture })

    await expect(
      client.issuePlayback({
        apiKey: 'test-key',
        videoId: 'v-test',
        notAfter: '2026-09-07T00:05:00.000Z',
      }),
    ).rejects.toMatchObject({ category: 'upstream_contract' })
  })
})
```

fixtureのhostは`.example`を使い、実organization ID、video ID、URLを含めない。

- [ ] **Step 6: REDを確認する**

```bash
pnpm vitest run tests/unit/filma-playback-contract.test.ts
```

期待結果: `http-filma-client.ts`が存在しないため失敗する。

- [ ] **Step 7: 最小portと固定endpoint adapterを実装する**

`src/application/ports/filma-client.ts`:

```ts
export type FilmaPlaybackGrant = Readonly<{
  playbackUrl: string
  expiresAt: string
}>

export interface FilmaClient {
  verifyApiKey(
    apiKey: string,
  ): Promise<{ organizationId: string; apiType: string }>
  verifyVideo(input: { apiKey: string; videoId: string }): Promise<void>
  issuePlayback(input: {
    apiKey: string
    videoId: string
    notAfter: string
  }): Promise<FilmaPlaybackGrant>
}
```

`http-filma-client.ts`は契約文書でGOになったmethod、固定host、固定pathだけを実装する。URLは`new URL()`でHTTPSとallowlistを再検証し、redirectを拒否する。response bodyはstream読込中に64 KiBで中断し、errorは`authentication`、`not_found`、`unavailable`、`upstream_contract`へ変換する。

再生契約は非nullの`expiresAt`と許可済みCMS domainでの利用制限を必須とする。adapterは`expiresAt <= notAfter`を検証し、期限不明、期限超過、domain制限未確認を`upstream_contract`として拒否する。`notAfter`はapplicationが`min(現在+5分, 動画終了)`で計算する。既発行grantが動画期限後に無効になることをlive testまたは公式仕様で確認できなければGOにしない。

- [ ] **Step 8: GREENと明示live testを確認する**

```bash
pnpm vitest run tests/unit/filma-playback-contract.test.ts
read -r -s FILMA_LIVE_API_KEY
read -r -s FILMA_LIVE_VIDEO_ID
export FILMA_LIVE_API_KEY FILMA_LIVE_VIDEO_ID
pnpm test:filma:live
unset FILMA_LIVE_API_KEY FILMA_LIVE_VIDEO_ID
pnpm verify
git diff --check origin/develop...HEAD
```

期待結果: unit contractとread-only live contractが成功し、実値を出力しない。非nullの期限、`notAfter`以下の期限、許可済みCMS domainでの利用制限、動画終了後の既発行grant無効化をすべて確認できた場合だけGOとする。一つでも未確認ならNO-GOとしてTask 3へ進まない。

- [ ] **Step 9: commit、push、レビューする**

```bash
git add docs/development/filma-playback-contract.md src/application/ports/filma-client.ts src/adapters/filma/http-filma-client.ts tests package.json pnpm-lock.yaml
git commit -m "feat: verify Filma playback contract"
git push -u origin HEAD
```

IssueへGO/NO-GO、確認項目、検証command、head SHAだけを記録する。GOのPRがknryt承認・mergeされた場合だけTask 3へ進む。

---

### Task 3: Cloudflare/D1と単一管理者設定を縦につなぐ

**Tracking:** 開始前に`P0: Cloudflare D1と単一管理者設定を実装する` Issueを作成する。

**Files:**

- Create: `wrangler.jsonc`
- Create: `worker-configuration.d.ts`
- Create: `migrations/0001_p0.sql`
- Create: `src/core/account.ts`
- Create: `src/application/ports/password-hasher.ts`
- Create: `src/application/ports/repositories.ts`
- Create: `src/application/ports/secret-box.ts`
- Create: `src/application/use-cases/admin-auth.ts`
- Create: `src/application/use-cases/configure-filma.ts`
- Create: `src/adapters/database/d1-repositories.ts`
- Create: `src/adapters/database/schema.ts`
- Create: `src/adapters/secrets/web-crypto.ts`
- Create: `spikes/password-hash-benchmark/worker.ts`
- Create: `spikes/password-hash-benchmark/wrangler.jsonc`
- Create: `scripts/run-password-hash-benchmark.mjs`
- Create: `docs/development/password-hash-benchmark.md`
- Create: `src/server/dependencies.ts`
- Create: `src/server/middleware/security.ts`
- Create: `src/server/routes/admin.ts`
- Create: `src/worker.ts`
- Modify: `src/server/app.ts`
- Create: `src/ui/index.html`
- Create: `src/ui/main.tsx`
- Create: `src/ui/app.tsx`
- Create: `src/admin/setup-page.tsx`
- Create: `src/admin/login-page.tsx`
- Create: `src/admin/filma-page.tsx`
- Delete: `src/admin/index.html`
- Delete: `src/admin/main.tsx`
- Create: `tests/worker/admin-setup.test.ts`
- Create: `vitest.worker.config.ts`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Modify: `package.json`

- [ ] **Step 1: 現行Cloudflare依存を追加する**

```bash
pnpm add drizzle-orm zod
pnpm add -D @cloudflare/vite-plugin @cloudflare/vitest-plugin wrangler
```

lockfileをcommitし、追加理由をPRの「依存パッケージ」に記録する。認証libraryを追加せず、Web Cryptoと短いapplication codeで必要範囲だけ実装する。

`package.json`へ次のscriptを明示的に追加し、`verify`は`test:worker`と`build`も実行するよう更新する。

```json
{
  "scripts": {
    "build": "vite build",
    "build:ui": "vite build",
    "test:worker": "vitest run --config vitest.worker.config.ts",
    "test:filma:live": "node --env-file-if-exists=.dev.vars ./node_modules/vitest/vitest.mjs run --config vitest.live.config.ts",
    "test:p0:smoke": "node --env-file-if-exists=.dev.vars ./node_modules/vitest/vitest.mjs run --config vitest.live.config.ts tests/live/p0-smoke.live.test.ts",
    "build:production": "CLOUDFLARE_ENV=production vite build",
    "deploy:p0": "pnpm build:production && pnpm check:cloudflare:production-config && wrangler deploy",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm test:worker && pnpm build && pnpm format:check"
  }
}
```

`tsconfig.json`のtest用typesには`@cloudflare/vitest-plugin/types`を追加する。旧pool形式のpackageは導入しない。

Cloudflare開発用D1を次のcommandで作り、出力されたIDを`wrangler.jsonc`へ記録する。D1 IDはcredentialではないが、Issue、PR、logへ転記しない。

```bash
pnpm wrangler d1 create play-cms-p0-dev
pnpm wrangler types
pnpm wrangler d1 migrations apply play-cms-p0-dev --local
```

`wrangler.jsonc`は`name: "play-cms-p0-dev"`、`compatibility_date: "2026-09-07"`、`main: "./src/worker.ts"`、`assets.binding: "ASSETS"`、`assets.not_found_handling: "single-page-application"`、`assets.run_worker_first: ["/api/*", "/v/*"]`を定義する。Vite pluginがbuild出力の`assets.directory`を生成するため、入力設定へdirectoryを固定しない。`d1_databases`にはbinding `DATABASE`、database name `play-cms-p0-dev`、作成commandが返した`database_id`、`migrations_dir: "migrations"`を設定する。

`vite.config.ts`はReact pluginと`@cloudflare/vite-plugin`の`cloudflare()`を使い、rootを`src/ui`へ移す。開発・自動testはlocal D1だけを使い、`--remote` migrationはTask 6まで実行しない。

- [ ] **Step 2: Free枠でのpassword hash実行可能性を先に測る**

OWASPのPBKDF2-HMAC-SHA-256推奨値600,000 iterationsを実装候補とする。Cloudflare Workers FreeのHTTP request CPU上限は2026-09-07時点で10 msのため、専用benchmark Workerで実測する。

`spikes/password-hash-benchmark/worker.ts`は128 UTF-8 byteの固定test passwordを用い、1 requestにつきhashまたはverifyを一回だけ実行する。`BENCHMARK_TOKEN` Worker secretが一致する要求だけを受け、password、salt、hashをresponseやlogへ出さない。`scripts/run-password-hash-benchmark.mjs`は送信先を`BENCHMARK_BASE_URL`、認証値を`BENCHMARK_TOKEN`から読み、どちらかが未設定なら実行を拒否する。hash 20 request、verify 20 requestを直列に送り、statusとwall timeだけを記録し、token値をcommand line、log、Issue、PRへ出さない。

benchmark Worker名は`play-cms-password-benchmark-issue-<Issue番号>-<8桁hex>`形式でIssueごとに一意にし、その実値を専用configとlocalの作業記録へ固定する。実行前に`wrangler whoami`でaccountを確認し、Cloudflare dashboardと`wrangler deployments list --name <確定名>`で同名Workerが存在しないことを確認する。存在する場合は上書きも削除もせず、別名へ変更する。

```bash
pnpm wrangler whoami
pnpm wrangler deployments list --name <確定した一意のbenchmark Worker名>
pnpm wrangler deploy --config spikes/password-hash-benchmark/wrangler.jsonc
pnpm wrangler secret put BENCHMARK_TOKEN --config spikes/password-hash-benchmark/wrangler.jsonc
node scripts/run-password-hash-benchmark.mjs
pnpm wrangler delete --name <作成確認済みの同じbenchmark Worker名>
```

削除前にlocal作業記録のaccountとWorker名が作成時の値と一致することを再確認する。自分で作成したことを確認できないWorkerは削除しない。削除後に同名が存在しないことまで確認し、Issueには名前やaccount IDではなく削除確認済みという結果だけを残す。

Cloudflare Metricsで40 requestのCPU timeを確認し、hash・verifyの両方でP95が8 ms以下、Error 1102が0件、HTTP失敗が0件の場合だけGOとする。20%のheadroomを満たさない場合やmetricsを確認できない場合もNO-GOとする。`docs/development/password-hash-benchmark.md`へ日付、runtime/package version、request数、P50/P95/max CPU、1102件数、GO/NO-GO、削除確認だけを記録する。

600,000 iterationsが継続的に上限を超える場合、iterationを独自判断で下げない。Task 3を停止し、Workers Paid、外部認証、P0のpasswordless化のいずれを選ぶかを別ADRで決定する。

- [ ] **Step 3: 管理者設定のWorker testを書く**

`vitest.worker.config.ts`はVitest 4向け`cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })`を設定する。`tests/worker/admin-setup.test.ts`は`cloudflare:workers`の`exports.default.fetch()`を使い、次を実APIとして検証する。Assetsを含む経路だけは`env.ASSETS.fetch()`を明示的に使う。

```ts
it('creates exactly one admin and never returns secrets', async () => {
  const first = await exports.default.fetch(
    'https://example.test/api/admin/setup',
    {
      method: 'POST',
      headers: {
        ...jsonSameOriginHeaders,
        'X-Play-Bootstrap-Token': 'test-bootstrap-token',
      },
      body: JSON.stringify({
        email: 'admin@example.test',
        password: 'correct horse battery staple',
      }),
    },
  )
  expect(first.status).toBe(201)
  expect(await first.json()).toEqual({ configured: true })

  const second = await exports.default.fetch(
    'https://example.test/api/admin/setup',
    {
      method: 'POST',
      headers: jsonSameOriginHeaders,
      body: JSON.stringify({
        email: 'other@example.test',
        password: 'another correct password',
      }),
    },
  )
  expect(second.status).toBe(404)
})
```

同じfileにrequestのbootstrap token未指定・不一致・使用済み・並行要求、login成功、Cookie属性、誤password、admin routeのrole拒否、16 KiB超過、余分なfield、Origin不一致、rate limit fail-closedを追加する。tokenの失敗理由と管理者作成済みは同じ404本文になることも検証する。さらにDBが未使用のときにWorker secret自体が欠落するとsetupだけ503、使用済み後にsecretを除いても通常routeは動作しsetupは汎用404となることを検証する。

- [ ] **Step 4: REDを確認する**

```bash
pnpm vitest run --config vitest.worker.config.ts tests/worker/admin-setup.test.ts
```

期待結果: Worker entryとD1 migrationが存在しないため失敗する。

- [ ] **Step 5: D1 schemaと制約を実装する**

`migrations/0001_p0.sql`はspecの9 tableだけを作成する。最低限、次のDB制約を持たせる。

```sql
CREATE UNIQUE INDEX one_admin ON accounts(role) WHERE role = 'admin';
CREATE UNIQUE INDEX one_redemption_per_code ON redemptions(code_id);
CREATE UNIQUE INDEX one_entitlement_per_video ON entitlements(account_id, video_id);
```

emailは正規化値をuniqueにし、sessionとaccess codeはhashだけを保存する。`app_settings.bootstrap_consumed_at`とadmin作成を同じtransactionで更新する。外部キーを有効化し、application transactionとDB制約の両方で一意性を守る。

`rate_limits`は`endpoint`、keyed HMAC済み`bucket`、`window_started_at`、`attempts`、`expires_at`を持つ。閾値はP0設計の「レート制限契約」に固定し、clientは本番では`CF-Connecting-IP`だけから導出する。ログインとコード入力のように二つのbucketを使うrouteは、両counterの原子的UPSERTが成功した場合だけ後続処理へ進む。超過時は`Retry-After`付き429、D1またはHMAC失敗時は外部通信前に503とする。各更新時に`expires_at`を過ぎた行を最大100件削除し、上限なしのcleanupを行わない。

- [ ] **Step 6: password、session、secret保存を実装する**

`web-crypto.ts`はPBKDF2-HMAC-SHA-256、ランダムsalt、600,000 iterationsを用いてpasswordを保存し、比較は固定時間で行う。初期設定では256 bit以上の`PLAY_BOOTSTRAP_TOKEN`を固定時間で比較し、使用済み状態も確認する。Filma API keyは`PLAY_ENCRYPTION_KEY`からAES-GCMで暗号化し、nonceを暗号文と別fieldに保存する。session tokenは128 bit以上の乱数を生成し、D1にはSHA-256 hashだけを保存する。rate-limit bucketは`PLAY_RATE_LIMIT_KEY`によるHMAC-SHA-256から作る。

`PLAY_BOOTSTRAP_TOKEN`は`bootstrap_consumed_at`が未設定の間だけ必須とし、欠落時のsetupを503で閉じる。使用済みになった後はtokenを削除しても通常routeを動作させ、setupはtokenの有無にかかわらず汎用404を返す。`PLAY_ENCRYPTION_KEY`と`PLAY_RATE_LIMIT_KEY`の未設定、復号失敗、乱数生成失敗は影響するrequestを503で安全側に閉じる。用途のないsession signing secretは追加せず、sessionは128 bit以上のrandom tokenとD1内のSHA-256 hashで検証する。

- [ ] **Step 7: use case、route、最小UIを実装する**

実装するrouteを次に固定する。

```text
POST /api/admin/setup
POST /api/auth/login
POST /api/auth/logout
GET  /api/admin/filma
PUT  /api/admin/filma
```

setupは有効なbootstrap token、admin 0件、bootstrap未使用のすべてを満たす場合だけ有効とし、admin作成とtoken消費を原子的に行う。loginはroleをsessionへ結び付ける。Filma設定はTask 2の`verifyApiKey()`成功後だけ暗号化して置換し、responseは`{ configured, verifiedAt }`だけを返す。UIは`/admin/setup`、`/admin/login`、`/admin/filma`を提供し、bootstrap tokenとAPI keyを再表示しない。

- [ ] **Step 8: GREENと全検証を確認する**

```bash
pnpm vitest run --config vitest.worker.config.ts tests/worker/admin-setup.test.ts
pnpm verify
pnpm build
git diff --check origin/develop...HEAD
```

期待結果: D1 migrationがtest fileごとの隔離storageへ適用され、全testとWorker/UI buildが成功する。

- [ ] **Step 9: commit、push、レビューする**

```bash
git add package.json pnpm-lock.yaml wrangler.jsonc worker-configuration.d.ts migrations src tests spikes/password-hash-benchmark scripts/run-password-hash-benchmark.mjs docs/development/password-hash-benchmark.md vitest.worker.config.ts vite.config.ts tsconfig.json
git commit -m "feat: add Cloudflare admin setup slice"
git push -u origin HEAD
```

Issue/PRへD1 migration、secret名、公開route、negative test、head SHAを記録する。secret値は書かない。

---

### Task 4: 既存動画、使い切りコード、匿名視聴を縦につなぐ

**Tracking:** 開始前に`P0: 既存動画と使い切りコードによる匿名視聴を実装する` Issueを作成する。

**Files:**

- Create: `src/core/video.ts`
- Create: `src/core/access-code.ts`
- Create: `src/application/ports/clock.ts`
- Create: `src/application/use-cases/manage-video.ts`
- Create: `src/application/use-cases/redeem-access-code.ts`
- Modify: `src/application/ports/repositories.ts`
- Modify: `src/adapters/database/d1-repositories.ts`
- Modify: `src/server/routes/admin.ts`
- Create: `src/server/routes/viewer.ts`
- Modify: `src/server/app.ts`
- Create: `src/admin/videos-page.tsx`
- Create: `src/viewer/watch-page.tsx`
- Modify: `src/ui/app.tsx`
- Create: `tests/unit/video-availability.test.ts`
- Create: `tests/unit/access-code.test.ts`
- Create: `tests/worker/anonymous-viewing.test.ts`
- Create: `tests/integration/assets-routing.test.ts`
- Create: `vitest.integration.config.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`

Task 4の最初に通常の`vitest.config.ts`の対象を`tests/unit/**/*.test.{ts,tsx}`へ限定する。別の`vitest.integration.config.ts`はNode環境、`tests/integration/**/*.test.ts`、`restoreMocks: true`を明示し、通常configを継承しない。`package.json`へ`"test:integration": "pnpm build && vitest run --config vitest.integration.config.ts"`を追加し、`verify`は`test:worker`の後に`test:integration`も実行するよう更新する。これによりAssets integration testは通常configのincludeに遮られず必ずbuild済み出力を使い、`tests/worker`はWorkers runtime用configだけで実行する。

- [ ] **Step 1: availabilityとcode生成の失敗テストを書く**

`tests/unit/video-availability.test.ts`で境界を固定する。

```ts
expect(isViewerAvailable(video, instantBeforeStart)).toBe(false)
expect(isViewerAvailable(video, startsAt)).toBe(true)
expect(isViewerAvailable(video, instantBeforeEnd)).toBe(true)
expect(isViewerAvailable(video, endsAt)).toBe(false)
expect(isViewerAvailable({ ...video, status: 'draft' }, startsAt)).toBe(false)
```

`tests/unit/access-code.test.ts`では16文字Crockford Base32、表示形式`XXXX-XXXX-XXXX-XXXX`、正規化、SHA-256 hash、平文非保存を検証する。

- [ ] **Step 2: anonymous flowの失敗testを書く**

`tests/worker/anonymous-viewing.test.ts`で次を検証する。

```text
adminが既存Filma動画を登録する
publishedへ更新する
codeを1件発行しresponseで一度だけ受け取る
未ログイン視聴者がcodeを消費し30分Cookieを得る
再生routeがFilma playback grantを返す
同じcodeの直列・並行再利用は汎用404になる
```

さらに`draft`、公開前、期限切れ、取消済みcodeではtitle、description、Filma ID、playback URLを含まない404になることをresponse textで確認する。

- [ ] **Step 3: REDを確認する**

```bash
pnpm vitest run tests/unit/video-availability.test.ts tests/unit/access-code.test.ts
pnpm vitest run --config vitest.worker.config.ts tests/worker/anonymous-viewing.test.ts
```

期待結果: domainとrouteが存在しないため失敗する。

- [ ] **Step 4: video管理とcode発行を実装する**

実装する管理routeを次に固定する。

```text
GET   /api/admin/videos
POST  /api/admin/videos
PATCH /api/admin/videos/:id
POST  /api/admin/videos/:id/codes
POST  /api/admin/codes/:id/revoke
```

動画作成時はTask 2の`verifyVideo()`を呼び、成功時だけD1へ保存する。`publicId`は128 bit以上の乱数とし、Filma IDをURLに使わない。codeは一度だけresponseに返し、D1へhashだけ保存する。

- [ ] **Step 5: 原子的code消費と30分匿名sessionを実装する**

公開routeを次に固定する。

```text
POST /api/public/videos/:publicId/redeem
GET  /api/public/videos/:publicId/playback
GET  /v/:publicId
```

`redeem`はD1 transactionで、動画availability、code hash、未取消、未使用を確認し、redemptionと匿名sessionを一度に作る。unique制約違反は汎用404へ畳む。匿名Cookieは`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1800`とする。

`playback`は要求ごとにavailabilityと匿名sessionを再確認し、`notAfter = min(現在+5分, 動画終了)`を計算してTask 2の`issuePlayback()`を呼ぶ。非nullの`expiresAt <= notAfter`を再確認し、違反時は503とする。playback URL/JWTをD1、log、localStorage、sessionStorageへ保存しない。

`/v/:publicId`は`assets.run_worker_first`によりWorkerで先に処理する。動画が`published`かつ期間内の場合だけ`env.ASSETS.fetch()`で汎用SPA shellを返し、`draft`、公開前、期限切れ、不明IDは本文に動画情報を含まないHTTP 404を返す。これによりcode入力前でも期限外動画の存在をSPA fallbackから推測させない。

`tests/worker/anonymous-viewing.test.ts`は`exports.default.fetch()`でAPIとWorker分岐を高速に検証する。`tests/integration/assets-routing.test.ts`はWranglerの現行`createTestHarness()`をbuild済みVite出力へ接続し、root設定の`ASSETS` bindingを含む実HTTP経路を検証する。公開中の`/v/:publicId`だけが実際のSPA shellを返し、公開前・終了時刻ちょうど・期限切れ・不明IDではAssetsへ到達せず404になることを確認する。

- [ ] **Step 6: 最小管理UIと視聴UIを実装する**

`/admin/videos`は登録、編集、code発行、未使用code取消だけを提供する。生成codeは一度だけ表示し、再表示機能を作らない。

`/v/:publicId`はredeem前に動画情報を出さず、code入力だけを表示する。成功後にplaybackと次の警告を表示する。

```text
この視聴は30分間だけ有効です。期限内に登録またはログインしない場合、このコードは再利用できず、動画を再び開けません。
```

- [ ] **Step 7: GREENと全検証を確認する**

```bash
pnpm vitest run tests/unit/video-availability.test.ts tests/unit/access-code.test.ts
pnpm vitest run --config vitest.worker.config.ts tests/worker/anonymous-viewing.test.ts
pnpm test:integration
pnpm verify
pnpm build
git diff --check origin/develop...HEAD
```

- [ ] **Step 8: commit、push、レビューする**

```bash
git add src tests package.json pnpm-lock.yaml vitest.config.ts vitest.integration.config.ts
git commit -m "feat: add one-time anonymous viewing"
git push -u origin HEAD
```

PRには並行消費testと非開示testの結果を明記する。

---

### Task 5: 視聴者登録、権利引き継ぎ、ライブラリを縦につなぐ

**Tracking:** 開始前に`P0: 視聴者登録と視聴権ライブラリを実装する` Issueを作成する。

**Files:**

- Create: `src/core/entitlement.ts`
- Create: `src/application/use-cases/viewer-auth.ts`
- Create: `src/application/use-cases/viewer-library.ts`
- Modify: `src/application/use-cases/redeem-access-code.ts`
- Modify: `src/application/ports/repositories.ts`
- Modify: `src/adapters/database/d1-repositories.ts`
- Create: `src/server/routes/auth.ts`
- Modify: `src/server/routes/viewer.ts`
- Modify: `src/server/app.ts`
- Create: `src/viewer/register-page.tsx`
- Create: `src/viewer/login-page.tsx`
- Create: `src/viewer/library-page.tsx`
- Modify: `src/ui/app.tsx`
- Create: `tests/worker/viewer-library.test.ts`

- [ ] **Step 1: 視聴権引き継ぎの失敗testを書く**

`tests/worker/viewer-library.test.ts`で次の二つの経路を固定する。

```text
A. 未ログインでcode消費 → 30分以内に登録 → entitlement移行 → 再login → library再生
B. login済みでcode消費 → 同一transactionでentitlement付与 → library再生
```

同一account・同一videoへ二重付与しないこと、期限切れ匿名sessionから移行できないこと、別browserの匿名sessionを移行できないことをnegative testにする。

- [ ] **Step 2: REDを確認する**

```bash
pnpm vitest run --config vitest.worker.config.ts tests/worker/viewer-library.test.ts
```

期待結果: viewer登録とlibrary routeが存在しないため失敗する。

- [ ] **Step 3: viewer認証と匿名権利移行を実装する**

実装するrouteを次に固定する。

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/viewer/library
GET  /api/viewer/videos/:publicId/playback
```

registerは`viewer`だけを作成する。管理者作成には使えない。register/login時に有効な匿名sessionがあれば、同一transactionでredemptionをaccountへ結び、entitlementをupsertし、匿名sessionを失効させる。

login済みviewerのredeemはcode消費、redemption、entitlement作成を同一transactionで行う。admin sessionからviewer APIは403にする。

- [ ] **Step 4: availabilityをDB queryとresponse境界へ適用する**

library queryは`published`、`starts_at <= now`、`ends_at > now`をD1側で絞り、applicationでも`isViewerAvailable()`を再確認する。responseは次だけに限定する。

```ts
type LibraryItem = Readonly<{
  publicId: string
  title: string
  description: string
  endsAt: string
}>
```

件数、placeholder、tombstoneを含め、期限切れ・非公開・公開前動画の存在を示す情報を返さない。

- [ ] **Step 5: login、register、library UIを実装する**

`/register`、`/login`、`/library`を追加する。匿名再生中の登録・loginリンクは元の`publicId`だけをreturn pathへ持ち、code、session token、playback URLをqueryやbrowser storageへ入れない。

libraryはthumbnailなしでtitleと期限だけを表示する。空状態は「現在視聴できる動画はありません」とし、期限切れ動画の存在を示さない。

- [ ] **Step 6: GREENと全検証を確認する**

```bash
pnpm vitest run --config vitest.worker.config.ts tests/worker/viewer-library.test.ts
pnpm verify
pnpm build
git diff --check origin/develop...HEAD
```

- [ ] **Step 7: commit、push、レビューする**

```bash
git add src tests
git commit -m "feat: add viewer entitlement library"
git push -u origin HEAD
```

PRには二つの権利取得経路、期限切れ非表示、role分離のtest結果を記録する。

---

### Task 6: 期限切れ遮断とCloudflare招待試験を完成させる

**Tracking:** 開始前に`P0: 期限切れ遮断を検証してCloudflareへ招待公開する` Issueを作成する。

**Files:**

- Create: `tests/worker/security-boundaries.test.ts`
- Create: `tests/live/p0-smoke.live.test.ts`
- Create: `scripts/check-secrets.mjs`
- Create: `tests/unit/check-secrets.test.ts`
- Create: `scripts/check-cloudflare-production-config.mjs`
- Create: `tests/unit/check-cloudflare-production-config.test.ts`
- Create: `docs/operations/cloudflare-p0-deploy.md`
- Create: `docs/product/p0-test-script.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `wrangler.jsonc`

- [ ] **Step 1: 時刻・権限・情報非開示の失敗testを追加する**

`tests/worker/security-boundaries.test.ts`は固定Clockを使い、次を全routeで表形式に検証する。

```text
状態             public page  redeem  anonymous playback  library  viewer playback
draft            404          404     404                 非表示   404
公開前            404          404     404                 非表示   404
公開中            code画面      条件付成功 条件付成功            表示     条件付成功
終了時刻ちょうど    404          404     404                 非表示   404
期限切れ           404          404     404                 非表示   404
```

404本文にtitle、description、Filma ID、playback hostが含まれないことも検証する。公開中に発行したgrantの`expiresAt`が`min(現在+5分, 動画終了)`以下であり、動画終了後に同じgrantまたは再生routeから再生できないことをFake Filmaとlive contractの両方で確認する。

- [ ] **Step 2: abuse境界の失敗testを追加する**

P0設計の閾値表どおりにsetup、loginのclient/account、register、redeemのclient/public ID、Filma接続、playbackを検証する。各窓で上限までは成功し、次の一回が`Retry-After`付き429、窓終了時にcounterがresetされること、並行要求で上限を超えないこと、D1・HMAC・本番client IP欠落時に外部通信前の503となることを確認する。JSON 16 KiB超過、unknown field、Origin不一致、Content-Type不一致、admin/viewer role逆転、未定義routeも検証する。

- [ ] **Step 3: REDを確認し、必要最小限の修正だけを行う**

```bash
pnpm vitest run --config vitest.worker.config.ts tests/worker/security-boundaries.test.ts
```

期待結果: 未実装または契約違反のcaseだけが失敗する。失敗ごとにproduction codeを一つずつ修正し、testを再実行する。新しい公開routeや保存dataを追加しない。

- [ ] **Step 4: deploy手順とrollbackを文書化する**

`docs/operations/cloudflare-p0-deploy.md`は実値を含めず、次の順序を固定する。最初にproduction D1を作成し、出力された`database_name`と`database_id`を`wrangler.jsonc`の`env.production.d1_databases`へ設定する。bindingは`DATABASE`、`migrations_dir`は`migrations`に固定する。開発用`play-cms-p0-dev`とproduction `play-cms-p0`のIDを取り違えていないことをaccount名とdatabase名で確認する。

`wrangler.jsonc`の`env.production`にはWorker名`play-cms-p0`、rootと同じ`compatibility_date`、`assets.binding: "ASSETS"`、`assets.not_found_handling: "single-page-application"`、`assets.run_worker_first: ["/api/*", "/v/*"]`、上記D1 bindingを明示する。Vite pluginがbuild出力へ`assets.directory`を生成するため、production入力設定にもdirectoryを固定しない。preview/localは開発用D1、production buildとremote migrationはproduction D1だけを参照し、設定生成後に`pnpm wrangler types`でbinding型を更新する。

Cloudflare Vite pluginではenvironmentをbuild時に選択する。`scripts/check-cloudflare-production-config.mjs`はbuild後の`.wrangler/deploy/config.json`が指す生成済みconfigを読み、Worker名`play-cms-p0`、D1 binding `DATABASE`、database name `play-cms-p0`、Assets binding `ASSETS`、`/api/*`と`/v/*`のWorker-firstを確認する。値が欠落・不一致ならremote migrationとdeployを止める。`tests/unit/check-cloudflare-production-config.test.ts`でdevelopment混入、不正なredirect先、binding欠落を固定する。

このStepで`package.json`へ`"check:cloudflare:production-config": "node scripts/check-cloudflare-production-config.mjs"`を追加する。

```bash
pnpm wrangler whoami
pnpm wrangler d1 create play-cms-p0
pnpm wrangler types
pnpm verify
CLOUDFLARE_ENV=production pnpm build
pnpm check:cloudflare:production-config
pnpm wrangler deploy --dry-run
pnpm wrangler d1 migrations apply play-cms-p0 --remote --env production
pnpm wrangler secret put PLAY_BOOTSTRAP_TOKEN --env production
pnpm wrangler secret put PLAY_ENCRYPTION_KEY --env production
pnpm wrangler secret put PLAY_RATE_LIMIT_KEY --env production
pnpm deploy:p0
```

`wrangler deploy --env production`は使わず、必ず`CLOUDFLARE_ENV=production`でbuildして生成configを検査してから、引数なしの`wrangler deploy`を実行する。D1 resource操作と`secret put`だけは入力`wrangler.jsonc`を対象とするためproduction environmentを明示する。初期登録後は`PLAY_BOOTSTRAP_TOKEN`を削除し、DBの`bootstrap_consumed_at`でも再利用を拒否する。文書にはlocal/production migrationの違い、D1 backup/exportの確認、前Worker versionへのrollback、招待試験終了後のroute停止、残るsecretのrotationを含める。Cloudflare dashboardのaccount ID、database ID、route、secret値は例示しない。

- [ ] **Step 5: non-destructive P0 smoke testを作成する**

`tests/live/p0-smoke.live.test.ts`は、事前作成済みのtest account/videoを使い、次だけを確認する。

```text
health response
viewer login
libraryに期限内videoが1件以上ある
playback grantがHTTPSで取得できる
```

通常の`pnpm test`と公開CIから除外し、`PLAY_CMS_LIVE_BASE_URL`などの明示environmentが揃った場合だけ`pnpm test:p0:smoke`で動かす。codeを消費したりFilma dataを変更したりしないが、login sessionとrate-limit行は作成する。専用test accountだけを使い、sessionは30分、rate-limit行は窓終了24時間後までに自動削除されることを記録する。

- [ ] **Step 6: 全検証とsecret scanを実行する**

`package.json`へ`"check:secrets": "node scripts/check-secrets.mjs"`を追加する。

```bash
pnpm verify
CLOUDFLARE_ENV=production pnpm build
pnpm check:cloudflare:production-config
pnpm vitest run --config vitest.worker.config.ts
pnpm check:secrets
git diff --check origin/develop...HEAD
rg -n "FILMA_LIVE_|PLAY_BOOTSTRAP_TOKEN|PLAY_ENCRYPTION_KEY|PLAY_RATE_LIMIT_KEY" .
```

`scripts/check-secrets.mjs`はtracked fileだけを対象に、private key header、GitHub/AWS既知token形式、JWT形式、headerへ埋め込まれたBearer/API key、`*_SECRET=`と`FILMA_LIVE_API_KEY=`の非placeholder値を検出する。`replace-with-`で始まる文書用値と変数名単体だけをallowlistとし、検出文字列は`[REDACTED]`へ置換してpath・lineだけを出力する。`tests/unit/check-secrets.test.ts`で検出例と許可例を固定する。

最後の`rg`は予約変数名の配置監査であり、値の検出には使わない。`pnpm check:secrets`が値を検出した場合はcommitせず、Git履歴に入った可能性があれば当該credentialをrotationする。

- [ ] **Step 7: manual deployし、invite testを実施する**

最初は管理者本人でsuccess flowと期限切れflowを実演する。その後3〜5名へURLと使い切りcodeだけを個別に渡し、80%以上が補助なしでcode入力から再生まで到達できるかを記録する。Issueには人数、成功工程、失敗工程、改善点だけを記録し、emailやcodeを残さない。

- [ ] **Step 8: commit、push、レビューする**

```bash
git add tests docs README.md package.json wrangler.jsonc worker-configuration.d.ts scripts/check-secrets.mjs scripts/check-cloudflare-production-config.mjs
git commit -m "test: complete Cloudflare P0 release gates"
git push -u origin HEAD
```

PRにはdeploy先の秘密でないURL、test結果、rollback確認、Worker/D1使用量の観測値を記録する。knrytのexact-head Approve後にmergeし、Issueを完了する。

---

## Completion Gate

P0完了は次をすべて満たす場合だけ宣言する。

- [ ] Tasks 1〜6のPRが`develop`へmerge済みで、各merge前にknrytが同じhead SHAをApproveしている。
- [ ] `pnpm verify`、Workers runtime test、明示live testが成功している。
- [ ] 使い切りcodeの並行再利用がDB制約とtransactionで拒否される。
- [ ] 匿名権利が30分以内だけ移行でき、viewer entitlementで再login後に視聴できる。
- [ ] `draft`、公開前、期限切れの動画情報がすべてのviewer routeから隠れる。
- [ ] API key、password、code、session token、Filma再生情報が平文保存・log・Gitへ残らない。
- [ ] 初期管理者登録がbootstrap tokenで保護され、使用後の同じtokenを再利用できない。
- [ ] Filma playback grantが非null期限を持ち、`min(現在+5分, 動画終了)`を超えず、期限後に再利用できない。
- [ ] Cloudflareへ手動deployでき、rollback手順を確認している。
- [ ] 3〜5名の招待試験結果を個人情報なしでIssueへ記録している。
- [ ] deferred scopeを誤って実装していない。

## Current Documentation Sources

- Cloudflare Vite plugin: <https://developers.cloudflare.com/workers/vite-plugin/>
- Cloudflare Vite environments: <https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/>
- Cloudflare Vite static assets: <https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/>
- Cloudflare SPA routing: <https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/>
- Cloudflare Vitest integration: <https://developers.cloudflare.com/workers/testing/vitest-integration/>
- Cloudflare Vitest plugin migration: <https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/>
- Cloudflare integration test harness: <https://developers.cloudflare.com/workers/testing/test-harness/>
- D1 create and configuration: <https://developers.cloudflare.com/d1/get-started/>
- D1 migrations: <https://developers.cloudflare.com/d1/reference/migrations/>
- Cloudflare Workers limits: <https://developers.cloudflare.com/workers/platform/limits/>
- OWASP Password Storage: <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>

確認日: 2026-09-07。実装時にpackage major versionまたは設定形式が変わっている場合は、Context7またはCloudflare公式資料で再確認し、同じIssueとPRで本計画を更新する。
