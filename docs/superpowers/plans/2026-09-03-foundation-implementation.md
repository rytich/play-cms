# play-cms Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cloudflare WorkersとNode.jsの両方で動作し、管理者認証とFilma API接続設定を備えるplay-cmsの第1マイルストーンを構築する。

**Architecture:** Honoの共通アプリケーションをCloudflare WorkerとNode.jsの二つのエントリーポイントから起動する。ユースケースはDB、暗号化、Filma APIをポートとして参照し、D1・SQLiteなどの実装詳細をアダプターへ閉じ込める。React管理画面はViteで静的アセットとしてビルドする。

**Tech Stack:** TypeScript、pnpm、Hono、React、Vite、Drizzle ORM、D1、SQLite、Vitest、Playwright、Wrangler、Docker

**Spec:** `docs/superpowers/specs/2026-09-03-foundation-design.md`

## Global Constraints

- TypeScriptはstrict modeで使用する。
- Node.jsは22.13.0系または24以上を対象にする。
- 単一リポジトリ・単一パッケージから開始する。
- 機能、公開API、依存パッケージ、権限、保存データ、外部通信を必要最小限にする。
- 公開コードで成立する`deny-by-default`を採用し、独自暗号を実装しない。
- 認証・視聴コード入力・費用や負荷を生むAPIはレート制限し、使い切り状態は原子的に更新する。
- 外部通信先を許可済みホストへ固定してリダイレクトを拒否し、期限切れ動画のサムネイルを含む情報を返さない。
- Filma APIキーは平文でDB、ログ、URLへ保存・出力しない。
- Filma認証は`POST /filmaapi/token`へ`X-Api-Key`ヘッダーで送信する。
- CloudflareとNode.jsで同じCore、Application、Server、UIを使用する。
- 振る舞いを追加する前に、失敗するテストを実行して失敗理由を確認する。
- Issueは作業状態、リポジトリ内文書は確定した設計と運用の正本とする。
- 各Taskは一つのGitHub Issueと一つの`develop`向けPRで実施する。
- Issue、PR、関連するリポジトリ内文書を相互にリンクする。
- セキュリティ方針は[GitHub Issue #8](https://github.com/rytich/play-cms/issues/8)と`SECURITY.md`を参照し、各Taskで脅威、入力境界、権限、秘密情報、失敗時の挙動、防御テストを記録する。

---

## 全Task共通のGitHub実行手順

各TaskのStep 1より前に、次を実行する。

1. Issue検索で同じTaskが未作成であることを確認する。
2. タイトルを`Task N: <Task名>`としてIssueを作成する。
3. Issue本文に設計書`docs/superpowers/specs/2026-09-03-foundation-design.md`、本計画、対象Task、完了条件、対象外を記載する。
4. `develop`から`feature/issue-<番号>-<英語の短い概要>`を作成する。
5. Issueへブランチ名、着手時点のコミット、実行予定テストをコメントする。

各Taskのコミット後に、次を実行する。

1. Task固有のテストと`pnpm verify`を実行する。
2. Issueへ実行したコマンド、成功・失敗件数、未確認事項をコメントする。
3. 変更した設計書・ADR・開発文書へ`GitHub Issue #<番号>`の参照を追加する。
4. ブランチをpushし、`develop`向けPRを作成する。
5. PR本文に`Refs #<番号>`、変更範囲、リスク、テスト結果、関連文書を記載する。
6. Task 8でCIを導入するまでは、ローカル検証結果と独立レビューを確認する。導入後はCI結果も確認し、失敗時は原因と対応をIssueへコメントする。

PRがマージされたらIssueへPRをコメントして手動で閉じる。Issueが閉じたことを確認するまで、そのTaskを完了扱いにしない。次のTaskは前Taskのマージ後の`develop`から開始する。

---

### Task 1: 開発基盤とリポジトリ運用

Tracking: [GitHub Issue #1](https://github.com/rytich/play-cms/issues/1)

**Files:**

- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.gitignore`
- Create: `.agents/skills/play-cms-reviewer/SKILL.md`
- Create: `src/admin/index.html`
- Create: `src/admin/main.tsx`
- Create: `src/server/app.ts`
- Create: `tests/unit/repository-contract.test.ts`
- Create: `AGENTS.md`
- Create: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/docs.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`
- Create: `docs/development/workflow.md`

**Interfaces:**

- Consumes: `docs/superpowers/specs/2026-09-03-foundation-design.md`
- Produces: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build:ui`と、全作業者が参照する開発規約。

- [ ] **Step 1: テストランナーを導入し、リポジトリ契約の失敗テストを書く**

`package.json`、`tsconfig.json`、`vitest.config.ts`を先に作成し、`pnpm install`でテスト実行に必要な依存関係を固定したうえで、次のテストを書く。この段階の`package.json`には`test: vitest run`だけを定義し、残りのスクリプトはStep 3で追加する。

```ts
// tests/unit/repository-contract.test.ts
import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const requiredFiles = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/ISSUE_TEMPLATE/docs.yml',
  '.github/pull_request_template.md',
  '.agents/skills/play-cms-reviewer/SKILL.md',
]

describe('repository contract', () => {
  it.each(requiredFiles)('contains %s', async (path) => {
    await expect(access(path)).resolves.toBeUndefined()
  })

  it('keeps AGENTS.md as an index to canonical documents', async () => {
    const agents = await readFile('AGENTS.md', 'utf8')
    expect(agents).toContain('CONTRIBUTING.md')
    expect(agents).toContain('docs/development/workflow.md')
    expect(agents).toContain('pnpm verify')
    expect(agents).toContain('.agents/skills/play-cms-reviewer/SKILL.md')
  })
})
```

- [ ] **Step 2: テストが不足ファイルで失敗することを確認する**

Run: `pnpm exec vitest run tests/unit/repository-contract.test.ts`
Expected: FAIL。`AGENTS.md`が存在しない旨が表示される。

- [ ] **Step 3: 最小構成と運用文書を作成する**

`package.json`には`dev`、`test`、`lint`、`typecheck`、`build:ui`、`format:check`、`verify`を定義する。Task 1時点の`verify`は`lint && typecheck && test && build:ui && format:check`を順番に実行する。`build:worker`と`build:node`は実行エントリーポイントを追加するTask 7で定義し、その時点で`verify`へ追加する。

`AGENTS.md`は以下を入口にする。

```md
# Agent instructions

このファイルはAIエージェント向けの入口です。規則の正本を重複させません。

1. `docs/superpowers/specs/`の承認済み設計を読む。
2. `docs/superpowers/plans/`の対象計画を読む。
3. 開発手順とGitHub運用は`CONTRIBUTING.md`と`docs/development/workflow.md`に従う。
4. 技術判断は`docs/decisions/`を確認する。
5. 完了報告前に`pnpm verify`を実行し、結果を記録する。
6. PR作成後は別エージェントに`.agents/skills/play-cms-reviewer/SKILL.md`を読ませ、独立レビューを実行する。

秘密情報をコミット、ログ出力、IssueやPRへ記載しない。公開Issueで脆弱性を報告せず`SECURITY.md`へ誘導する。
```

Issue Formsではバグに再現手順・期待結果・実際の結果・環境、機能に目的・利用者・完了条件・対象外を必須入力として定義する。PRテンプレートには関連Issue、変更、リスク、確認シナリオ、未確認事項、文書更新を含める。

- [ ] **Step 4: 契約テストと静的検査を通す**

Run: `pnpm exec vitest run tests/unit/repository-contract.test.ts && pnpm verify`
Expected: PASS。Vitestは全テスト成功、ESLint、TypeScript、Vite、Prettierはエラー0件。

- [ ] **Step 5: コミットする**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts vitest.config.ts eslint.config.js .prettierrc.json .prettierignore .gitignore .agents/skills/play-cms-reviewer/SKILL.md src/admin src/server tests/unit/repository-contract.test.ts AGENTS.md README.md CONTRIBUTING.md SECURITY.md .github docs/development/workflow.md
git commit -m "chore: initialize play-cms development foundation"
```

### Task 2: 暗号化と管理者認証のコア

**Files:**

- Create: `src/core/admin.ts`
- Create: `src/core/session.ts`
- Create: `src/application/ports/admin-repository.ts`
- Create: `src/application/ports/session-repository.ts`
- Create: `src/application/ports/secret-box.ts`
- Create: `src/application/ports/password-hasher.ts`
- Create: `src/application/use-cases/admin-auth.ts`
- Create: `src/adapters/secrets/web-crypto-secret-box.ts`
- Create: `src/adapters/secrets/web-crypto-password-hasher.ts`
- Test: `tests/unit/admin-auth.test.ts`
- Test: `tests/unit/web-crypto-secrets.test.ts`

**Interfaces:**

- Consumes: Web Crypto API。
- Produces: `AdminRepository`、`SessionRepository`、`PasswordHasher`、`SecretBox`、`registerFirstAdmin()`、`loginAdmin()`、`logoutAdmin()`、`updateAdminProfile()`。

- [ ] **Step 1: 初回登録を一度だけ許可する失敗テストを書く**

```ts
it('registers only the first administrator', async () => {
  const first = await registerFirstAdmin(deps, {
    email: 'owner@example.com',
    name: 'Owner',
    password: 'correct horse battery staple',
  })
  expect(first.email).toBe('owner@example.com')
  await expect(
    registerFirstAdmin(deps, {
      email: 'other@example.com',
      name: 'Other',
      password: 'another secure password',
    }),
  ).rejects.toMatchObject({ code: 'ADMIN_ALREADY_EXISTS' })
})
```

- [ ] **Step 2: テストが未実装で失敗することを確認する**

Run: `pnpm exec vitest run tests/unit/admin-auth.test.ts`
Expected: FAIL。`registerFirstAdmin`のexportが存在しない。

- [ ] **Step 3: 認証ユースケースを最小実装する**

```ts
export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, encoded: string): Promise<boolean>
}

export interface SecretBox {
  encrypt(plainText: string): Promise<string>
  decrypt(encoded: string): Promise<string>
}
```

パスワードはWeb CryptoのPBKDF2-SHA-256、ランダム16 byte salt、600,000 iterationsで導出する。APIキー暗号化はAES-256-GCM、ランダム12 byte IVを使い、保存形式を`v1.<base64url-iv>.<base64url-ciphertext>`に固定する。セッションは32 byteのランダムトークンを発行し、DBにはSHA-256ハッシュだけを保存する。

- [ ] **Step 4: 暗号化と認証のテストを通す**

Run: `pnpm exec vitest run tests/unit/admin-auth.test.ts tests/unit/web-crypto-secrets.test.ts`
Expected: PASS。誤パスワード、改ざん暗号文、二回目の初期登録も拒否される。

- [ ] **Step 5: コミットする**

```bash
git add src/core src/application/ports src/application/use-cases src/adapters/secrets tests/unit/admin-auth.test.ts tests/unit/web-crypto-secrets.test.ts
git commit -m "feat: add administrator authentication core"
```

### Task 3: 共通スキーマとDBアダプター

**Files:**

- Create: `src/adapters/database/schema.ts`
- Create: `src/adapters/database/drizzle-admin-repository.ts`
- Create: `src/adapters/database/drizzle-session-repository.ts`
- Create: `src/adapters/database/drizzle-settings-repository.ts`
- Create: `src/adapters/database/drizzle-rate-limit-repository.ts`
- Create: `src/application/ports/settings-repository.ts`
- Create: `src/application/ports/rate-limit-repository.ts`
- Create: `migrations/0001_foundation.sql`
- Create: `drizzle.config.ts`
- Test: `tests/integration/database-repositories.test.ts`

**Interfaces:**

- Consumes: Task 2の`AdminRepository`と`SessionRepository`。
- Produces: `SettingsRepository`、`RateLimitRepository`とD1・SQLiteで共有するDrizzleリポジトリ。

- [ ] **Step 1: SQLite上のリポジトリ契約テストを書く**

```ts
it('persists an encrypted Filma setting without exposing plaintext', async () => {
  await settings.saveFilmaConnection({
    encryptedApiKey: 'v1.iv.cipher',
    organizationId: 12,
    apiType: 'fullaccess',
    checkedAt: new Date('2026-09-03T00:00:00Z'),
  })
  expect(await settings.getFilmaConnection()).toMatchObject({
    encryptedApiKey: 'v1.iv.cipher',
    organizationId: 12,
  })
  expect(JSON.stringify(await dumpTables(db))).not.toContain('plain-api-key')
})

it('allows no more than the limit under concurrent requests', async () => {
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      rateLimits.consume({
        endpoint: 'admin-login',
        bucket: 1234,
        limit: 10,
      }),
    ),
  )
  expect(results.filter((result) => result.allowed)).toHaveLength(10)
})
```

- [ ] **Step 2: マイグレーション未作成で失敗することを確認する**

Run: `pnpm exec vitest run tests/integration/database-repositories.test.ts`
Expected: FAIL。`admins`テーブルが存在しない。

- [ ] **Step 3: SQLとDrizzleリポジトリを実装する**

`0001_foundation.sql`に`admins`、`sessions`、`app_settings`、`request_rate_limits`を作る。メールアドレスはunique、セッショントークンハッシュはprimary key、期限と更新日時はUnix秒で保存する。レート制限はコードで固定したendpoint名、0から4095までのHMAC bucket、固定窓の開始時刻、試行回数を保持し、`PRIMARY KEY(endpoint, bucket)`とする。窓が変わったときは同じ行を上書きし、履歴行を作らない。最大行数は固定endpoint数×4096であり、加算と窓の上書きを単一SQLで原子的に行う。D1とSQLiteの両方で使えるSQLite方言のみを使用する。

- [ ] **Step 4: リポジトリ契約テストを通す**

Run: `pnpm exec vitest run tests/integration/database-repositories.test.ts`
Expected: PASS。作成・取得・更新・期限切れセッション削除と、並行要求でも上限を超えて許可しないレート制限加算が成功する。複数の固定窓と多数の識別子を処理しても同じbucket行が上書きされ、最大行数を超えないことも確認する。

- [ ] **Step 5: コミットする**

```bash
git add src/adapters/database src/application/ports/settings-repository.ts src/application/ports/rate-limit-repository.ts migrations drizzle.config.ts tests/integration/database-repositories.test.ts
git commit -m "feat: add portable sqlite repositories"
```

### Task 4: 管理者HTTP API

**Files:**

- Modify: `src/server/app.ts`
- Create: `src/server/dependencies.ts`
- Create: `src/server/middleware/admin-session.ts`
- Create: `src/server/middleware/request-limits.ts`
- Create: `src/server/middleware/security.ts`
- Create: `src/server/routes/setup.ts`
- Create: `src/server/routes/auth.ts`
- Create: `src/server/routes/profile.ts`
- Test: `tests/integration/admin-api.test.ts`

**Interfaces:**

- Consumes: Task 2の認証ユースケース、Task 3のリポジトリと`RateLimitRepository`、ランタイムが検証したクライアント識別子。
- Produces: `createApp(deps: AppDependencies): Hono`、`POST /api/setup/admin`、`POST /api/auth/login`、`POST /api/auth/logout`、`GET/PATCH /api/admin/profile`、共通の入力上限・レート制限ミドルウェア。

- [ ] **Step 1: Cookie認証フローの失敗テストを書く**

```ts
it('logs in and returns the administrator profile', async () => {
  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@example.com',
      password: 'secure password 123',
    }),
  })
  expect(login.status).toBe(204)
  const cookie = login.headers.get('set-cookie')
  expect(cookie).toContain('play_session=')
  expect(cookie).toContain('HttpOnly')
  expect(cookie).toContain('SameSite=Lax')
  const profile = await app.request('/api/admin/profile', {
    headers: { cookie: cookie! },
  })
  expect(await profile.json()).toMatchObject({ email: 'owner@example.com' })
})
```

- [ ] **Step 2: ルート未実装の404を確認する**

Run: `pnpm exec vitest run tests/integration/admin-api.test.ts`
Expected: FAIL。ログイン応答が404になる。

- [ ] **Step 3: APIとセキュリティ境界を実装する**

JSON入力は16 KiBを上限として超過時は413を返し、Zodで検証する。初期登録とログインは、エンドポイントとランタイムが検証したクライアント識別子をキーに、10分の固定窓で10回まで許可する。DBにはIPアドレスを保存せず、アプリケーション秘密鍵からWeb Cryptoで導出したHMAC値の先頭12 bitを0から4095までのbucketとして保存する。超過時は`Retry-After`付き429、レート制限DBの障害時は503として安全側に閉じる。Cloudflareは`CF-Connecting-IP`、Node.jsはsocket remote addressをランタイム側で検証して渡し、Node.jsでは明示したtrusted proxy以外の転送ヘッダーを信用しない。状態変更APIは`Origin`がリクエストURLと同一オリジンであることを確認する。Cookieは`HttpOnly; SameSite=Lax; Path=/`、本番では`Secure`を付ける。全応答に`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Content-Security-Policy`を付ける。

- [ ] **Step 4: APIテストを通す**

Run: `pnpm exec vitest run tests/integration/admin-api.test.ts`
Expected: PASS。未認証は401、不正Originは403、初期登録の二回目は409、16 KiB超過は413、11回目は`Retry-After`付き429になる。固定窓の境界、並行要求、レート制限DB障害時に安全側に閉じることも確認する。

- [ ] **Step 5: コミットする**

```bash
git add src/server tests/integration/admin-api.test.ts
git commit -m "feat: expose secure administrator API"
```

### Task 5: Filma接続設定

事前準備として[GitHub Issue #6](https://github.com/rytich/play-cms/issues/6)の明示実行Liveテストで`POST /filmaapi/token`の認証契約を確認する。APIキー、JWT、組織ID、認証ヘッダー、レスポンス本文は記録せず、通常の`pnpm verify`と公開CIから分離する。

**Files:**

- Create: `src/application/ports/filma-client.ts`
- Create: `src/application/use-cases/configure-filma.ts`
- Create: `src/adapters/filma/http-filma-client.ts`
- Create: `src/server/routes/filma-settings.ts`
- Modify: `src/server/app.ts`
- Test: `tests/unit/configure-filma.test.ts`
- Test: `tests/integration/http-filma-client.test.ts`
- Test: `tests/integration/filma-settings-api.test.ts`

**Interfaces:**

- Consumes: `SecretBox`、`SettingsRepository`、`RateLimitRepository`、Filma API `POST /filmaapi/token`。
- Produces: `FilmaClient.verifyApiKey()`、`configureFilma()`、`GET/PUT /api/admin/filma-settings`。

- [ ] **Step 1: APIキーが保存前に検証・暗号化される失敗テストを書く**

```ts
it('verifies and encrypts the API key before saving', async () => {
  await configureFilma(deps, { apiKey: 'secret-key' })
  expect(filma.requests[0]).toEqual({ apiKey: 'secret-key' })
  expect(settings.saved).toMatchObject({
    encryptedApiKey: 'encrypted:secret-key',
    organizationId: 42,
    apiType: 'fullaccess',
  })
  expect(JSON.stringify(settings.saved)).not.toContain('"apiKey":"secret-key"')
})
```

- [ ] **Step 2: ユースケース未実装で失敗することを確認する**

Run: `pnpm exec vitest run tests/unit/configure-filma.test.ts`
Expected: FAIL。`configureFilma`のexportが存在しない。

- [ ] **Step 3: Filmaクライアントと設定APIを実装する**

```ts
export type FilmaConnection = {
  organizationId: number
  apiType: 'readonly' | 'fullaccess'
}

export interface FilmaClient {
  verifyApiKey(input: { apiKey: string }): Promise<FilmaConnection>
}
```

管理画面と設定APIはAPIキーだけを受け取り、送信先を変更させない。`PUT /api/admin/filma-settings`はTask 4と同じ`RateLimitRepository`を使い、エンドポイントと検証済みクライアント識別子のbucketごとに10分で5回まで許可する。超過時は`Retry-After`付き429、DB障害時は503として安全側に閉じ、並行要求でも上限を超えてFilmaへ送信しない。ランタイムはFilmaクライアントを信頼済みの固定URL`https://filma.biz/filmaapi/token`で構築する。クライアントは`X-Api-Key`と`Content-Type: application/json`を送信し、`redirect: 'error'`でリダイレクトを拒否する。レスポンス本文の読取を含む通信全体のタイムアウトは5秒、応答は64 KiBを上限とし、自動再試行しない。非200、上限超過、本文読取失敗を含む終了経路で通信を中断する。200のみ成功とし、401を`INVALID_API_KEY`、403を`DOMAIN_NOT_ALLOWED`、その他の4xx・5xx、タイムアウト、応答上限超過、ネットワーク失敗を`FILMA_UNAVAILABLE`へ変換する。応答から`organization_id`と`api_type`だけを返し、JWTは保持しない。

- [ ] **Step 4: 単体・HTTP・APIテストを通す**

Run: `pnpm exec vitest run tests/unit/configure-filma.test.ts tests/integration/http-filma-client.test.ts tests/integration/filma-settings-api.test.ts`
Expected: PASS。APIキーがURL、レスポンス、保存データ、エラー文字列へ現れない。設定APIが送信先を受け付けず、リダイレクト、本文読取を含む5秒超過、Content-Lengthとchunkedの64 KiB超過を拒否し、非200を含む終了経路で通信を中断し、失敗時に自動再試行しないことも確認する。6回目は`Retry-After`付き429、レート制限DB障害は503となり、並行要求でも5回を超えてFilmaへ送信しない。

- [ ] **Step 5: コミットする**

```bash
git add src/application/ports/filma-client.ts src/application/use-cases/configure-filma.ts src/adapters/filma src/server tests/unit/configure-filma.test.ts tests/integration/http-filma-client.test.ts tests/integration/filma-settings-api.test.ts
git commit -m "feat: add encrypted Filma connection settings"
```

### Task 6: 管理画面

**Files:**

- Modify: `src/admin/main.tsx`
- Create: `src/admin/app.tsx`
- Create: `src/admin/api.ts`
- Create: `src/admin/pages/setup-page.tsx`
- Create: `src/admin/pages/login-page.tsx`
- Create: `src/admin/pages/profile-page.tsx`
- Create: `src/admin/pages/filma-settings-page.tsx`
- Create: `src/admin/styles.css`
- Test: `tests/unit/admin-app.test.tsx`
- Test: `tests/e2e/admin-onboarding.spec.ts`

**Interfaces:**

- Consumes: Task 4とTask 5のHTTP API。
- Produces: `/admin`の初期登録、ログイン、プロフィール、Filma設定画面。

- [ ] **Step 1: APIキーを再表示しないUIテストを書く**

```tsx
it('shows connection metadata without rendering the saved API key', async () => {
  render(
    <FilmaSettingsPage
      api={fakeApi({
        configured: true,
        organizationId: 42,
        apiType: 'fullaccess',
        checkedAt: '2026-09-03T00:00:00.000Z',
      })}
    />,
  )
  expect(await screen.findByText('接続済み')).toBeVisible()
  expect(screen.getByText('組織ID: 42')).toBeVisible()
  expect(screen.queryByDisplayValue('secret-key')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: UI未実装で失敗することを確認する**

Run: `pnpm exec vitest run tests/unit/admin-app.test.tsx`
Expected: FAIL。`FilmaSettingsPage`が存在しない。

- [ ] **Step 3: 四つの管理画面を実装する**

画面文言は日本語にする。APIエラーは項目エラー、認証失敗、Filma認証失敗、Filma一時障害に分ける。送信中はボタンを無効化し、成功後にパスワードやAPIキー入力を空にする。APIキー欄は常に空欄で、新しい値を保存すると置換されることを表示する。

- [ ] **Step 4: UI単体テストとオンボーディングE2Eを通す**

Run: `pnpm exec vitest run tests/unit/admin-app.test.tsx && pnpm exec playwright test tests/e2e/admin-onboarding.spec.ts`
Expected: PASS。初期登録からFilma接続済み表示まで完了する。

- [ ] **Step 5: コミットする**

```bash
git add src/admin tests/unit/admin-app.test.tsx tests/e2e/admin-onboarding.spec.ts
git commit -m "feat: add administrator onboarding UI"
```

### Task 7: CloudflareとDockerの配布構成

**Files:**

- Create: `src/entrypoints/cloudflare.ts`
- Create: `src/entrypoints/node.ts`
- Create: `src/runtime/cloudflare-dependencies.ts`
- Create: `src/runtime/node-dependencies.ts`
- Create: `wrangler.jsonc`
- Create: `.dev.vars.example`
- Create: `Dockerfile`
- Create: `compose.yaml`
- Create: `deploy/docker/entrypoint.sh`
- Create: `scripts/check-worker-size.mjs`
- Create: `tests/unit/runtime-config.test.ts`
- Verify: `src/adapters/filma/live-contract.ts`
- Test: `tests/unit/filma-live-contract.test.ts`
- Create: `docs/operations/cloudflare.md`
- Create: `docs/operations/docker.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: `createApp(deps)`、D1・SQLiteリポジトリ、Worker secrets。
- Produces: Workerエントリーポイント、Node.jsサーバー、Deploy to Cloudflareボタン、Docker起動手順。

- [ ] **Step 1: 必須設定と秘密値非混入の失敗テストを書く**

```ts
it('rejects missing application secrets', () => {
  expect(() => parseRuntimeConfig({})).toThrow(
    'PLAY_SESSION_SECRET is required',
  )
})

it('keeps real secrets out of example files', async () => {
  const example = await readFile('.dev.vars.example', 'utf8')
  expect(example).toContain('PLAY_SESSION_SECRET=replace-with-32-random-bytes')
  expect(example).not.toMatch(/[A-Fa-f0-9]{64}/)
})
```

- [ ] **Step 2: ランタイム設定未実装で失敗することを確認する**

Run: `pnpm exec vitest run tests/unit/runtime-config.test.ts`
Expected: FAIL。`parseRuntimeConfig`が存在しない。

- [ ] **Step 3: CloudflareとDockerの起動構成を実装する**

`wrangler.jsonc`にはD1 binding `DB`、R2 binding `MEDIA`、assets binding `ASSETS`を定義する。`.dev.vars.example`のruntime欄には`PLAY_SESSION_SECRET`と`PLAY_ENCRYPTION_KEY`のダミー値を記載し、live test専用欄には`FILMA_LIVE_API_KEY=replace-with-dedicated-test-key`を残す。本番ランタイムは`FILMA_LIVE_API_KEY`を読まず、Issue #6で導入したlive testを含むFilma送信先は`https://filma.biz/filmaapi/token`へ固定する。`FILMA_API_HOST`は定義せず、管理画面や環境変数から送信先を変更させない。live testもレスポンス本文の読取を含む5秒のタイムアウト、Content-Lengthとchunkedに適用する64 KiBの応答上限、自動再試行しない契約を維持する。`package.json.cloudflare.bindings`で二つのruntime secret生成方法を説明する。READMEのボタンは次を使う。

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rytich/play-cms)
```

Dockerは非rootユーザーでNode.jsサーバーを起動し、`/data/play-cms.sqlite`と`/data/media`を永続化する。entrypointはマイグレーション成功後だけサーバーを起動する。

- [ ] **Step 4: 両ランタイムのテストとビルドを通す**

Run: `pnpm exec vitest run tests/unit/filma-live-contract.test.ts tests/unit/runtime-config.test.ts && pnpm build:ui && pnpm build:worker && pnpm build:node && docker build -t play-cms:test .`
Expected: PASS。live test契約が固定送信先、5秒のタイムアウト、chunkedを含む64 KiBの応答上限、失敗時に自動再試行しないことを防御テストで確認する。三つのビルドとDockerイメージ作成がexit 0になる。

- [ ] **Step 5: Workerサイズを確認する**

Run: `pnpm check:worker-size`
Expected: PASS。圧縮後Workerが3,000,000 byte未満で、実測値が出力される。

- [ ] **Step 6: コミットする**

```bash
git add src/entrypoints src/runtime wrangler.jsonc .dev.vars.example Dockerfile compose.yaml deploy scripts tests/unit/runtime-config.test.ts docs/operations README.md package.json pnpm-lock.yaml
git commit -m "feat: add Cloudflare and Docker deployment targets"
```

### Task 8: CIと最終文書

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `docs/architecture/overview.md`
- Create: `docs/product/foundation.md`
- Modify: `CONTRIBUTING.md`
- Modify: `README.md`
- Create: `tests/helpers/markdown-links.ts`
- Test: `tests/unit/documentation-links.test.ts`

**Interfaces:**

- Consumes: Tasks 1-7の検証コマンドと文書。
- Produces: 全PRで実行されるCI、利用者・開発者向けの正本文書。

- [ ] **Step 1: ローカルMarkdownリンクの失敗テストを書く**

```ts
import { findBrokenLocalMarkdownLinks } from '../helpers/markdown-links'

it('resolves every local Markdown link', async () => {
  const failures = await findBrokenLocalMarkdownLinks([
    'README.md',
    'CONTRIBUTING.md',
    'docs',
  ])
  expect(failures).toEqual([])
})
```

- [ ] **Step 2: リンク検証ヘルパー未実装で失敗することを確認する**

Run: `pnpm exec vitest run tests/unit/documentation-links.test.ts`
Expected: FAIL。`findBrokenLocalMarkdownLinks`が存在しない。

- [ ] **Step 3: リンク検証、CI、正本文書を完成させる**

`findBrokenLocalMarkdownLinks(paths: string[]): Promise<string[]>`は指定されたMarkdownファイルとディレクトリを再帰的に読み、HTTP URLとページ内アンカーを除く相対リンクについて、リンク元から解決したファイルが存在しない場合に`<source> -> <target>`を返す。

CIはNode.js 22とpnpm lockfileを使い、`pnpm install --frozen-lockfile`、`pnpm verify`、`pnpm check:worker-size`を実行する。CI成功後に`develop`へactive rulesetを設定し、pull request ruleの`required_approving_review_count: 1`、`Dismiss stale pull request approvals`、`Require branches to be up to date before merging`、CIジョブの`required status checks`、merge commit方式を必須化する。`knryt`を含む自動実行者へbypassを付与しない。GitHub APIでrulesetがactiveであり、必須承認数、対象ルール、required checkが実際に適用されることを確認する。自動レビュー・Approve・Mergeの実装と資格情報は[ADR 0002](../../decisions/0002-use-knryt-automated-pr-reviewer.md)に従い、対象repositoryとbase branchの許可リスト、未信頼Webhook入力、二段階処理、最小権限を検証する。`overview.md`にはコンポーネント境界とCloudflare／Node.jsの依存方向、`foundation.md`には提供機能と対象外、READMEにはCloudflareとDockerの最短導入手順を記載する。

- [ ] **Step 4: 全検証を実行する**

Run: `pnpm verify && pnpm check:worker-size && docker build -t play-cms:test .`
Expected: PASS。lint、型検査、全Vitest、UI・Worker・Nodeビルド、Workerサイズ、Dockerビルドがすべてexit 0になる。加えてGitHub APIで`develop`のactive ruleset、`required_approving_review_count: 1`、stale Approve無効化、branch最新化、CIのrequired status checks、merge commit方式、bypassなしを確認する。

- [ ] **Step 5: 作業ツリーを確認する**

Run: `git status --short`
Expected: Task 8で意図したファイルだけが変更または追加として表示される。

- [ ] **Step 6: コミットする**

```bash
git add .github/workflows/ci.yml docs/architecture/overview.md docs/product/foundation.md CONTRIBUTING.md README.md tests/helpers/markdown-links.ts tests/unit/documentation-links.test.ts
git commit -m "ci: verify portable play-cms foundation"
```

## 計画完了時の確認

- `pnpm verify`が成功している。
- `pnpm check:worker-size`が圧縮後3,000,000 byte未満を報告している。
- `docker build -t play-cms:test .`が成功している。
- 管理者初期登録、ログイン、プロフィール更新、Filma接続設定のE2Eが成功している。
- APIキーがDB平文、URL、ログ、APIレスポンス、画面へ現れない。
- README、AGENTS.md、CONTRIBUTING.md、SECURITY.md、Issue Forms、PRテンプレート、設計・運用文書が揃っている。
