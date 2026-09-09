# Viewer Authentication and Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task.

**Goal:** 視聴者が登録・ログインし、現在視聴権が有効な動画だけをURLで識別できるライブラリ画面で確認できる最小の縦切りを追加する。

**Architecture:** 既存のHono Worker、D1、React/Vite単一ビルド、Cookieセッションをそのまま使う。管理者認証を変更せず、視聴者APIを`/api/viewer/*`へ分離し、`accounts.role`とサーバー側認可で管理者・視聴者を分ける。`entitlements`の本番データ作成は後続のコード消費機能だけに委ね、今回は合成D1テストが権利データを投入する。

**Tech Stack:** TypeScript, Hono, React, Vite, Cloudflare Workers, D1, Vitest, Playwright

**Spec:** [play-cms P0最小縦切りプロトタイプ設計](../specs/2026-09-07-p0-prototype-design.md)

## Global Constraints

- Trackingは[GitHub Issue #32](https://github.com/rytich/play-cms/issues/32)・[PR #33](https://github.com/rytich/play-cms/pull/33)、baseは`develop`、feature branchは`1a-m4/issue-32-viewer-auth-library`とする。
- 実装・テスト・migration・設定変更は既存の5.6 Sol実装担当一名に集約し、別の5.6系担当が独立レビューする。正式なApprove/Mergeは`knryt`だけが行う。
- 新しい依存関係、開発ツール、CI変更、追加のセキュリティ基盤を導入しない。既存のパスワードハッシュ、Cookie、JSON上限、同一Origin、D1レート制限を再利用する。
- Filma API、動画再生、コード消費、匿名30分session、視聴権引き継ぎ、実D1 migration、deployを実行・実装しない。これらはIssue #16と後続のコード消費PRに残す。
- 登録時メール確認、パスワード再設定、プロフィール、サムネイル、管理者による権利付与APIを追加しない。
- 視聴者の画面は`/register`、`/login`、`/library`。主要な画面状態はURLで識別し、reload・back・forwardで同じ状態を復元できるようにする。
- libraryは`published`かつ`starts_at <= now`かつ`ends_at > now`の権利動画だけを返す。非公開・公開前・期限切れの存在は件数、placeholder、tombstone、タイトル、説明のいずれでも漏らさない。
- public responseは`publicId`、`title`、`description`、`endsAt`だけとする。UIはサムネイルなしでタイトルと期限を表示し、空状態は「現在視聴できる動画はありません」とする。
- 通常テストは合成D1だけを使い、`.dev.vars`、実APIキー、実メールアドレス、実動画IDを読み込まない。ブラウザ受入は既存previewとは別port/contextで行う。
- Issue #30の実BFCache復帰・実200%拡大は公開前ゲートのままとし、このPRの完了条件に含めない。Issue #31のCI基盤保守にも着手しない。

---

### Task 1: 視聴者登録・ログイン・視聴権ライブラリを縦につなぐ

**Files:**

- Create: `migrations/0003_viewer_accounts_entitlements.sql`
- Create: `src/core/viewer.ts`
- Create: `src/adapters/database/viewer-repository.ts`
- Create: `src/viewer/App.tsx`
- Create: `src/viewer/client.ts`
- Create: `src/viewer/routes.ts`
- Create: `src/viewer/styles.css`
- Modify: `src/server/app.ts`
- Modify: `src/admin/main.tsx`
- Create: `tests/unit/viewer-routes.test.ts`
- Create: `tests/unit/viewer-client.test.ts`
- Create: `tests/worker/viewer-auth-library.test.ts`
- Create: `tests/worker/viewer-migration.test.ts`
- Create: `docs/development/viewer-auth-library.md`
- Modify: `README.md`
- Modify: `docs/development/issue-status.md`
- Modify: `docs/superpowers/plans/2026-09-07-p0-prototype-implementation.md`

- [x] **Step 1: API・migration・URL契約の失敗testを書く**

  次を先にtestで固定し、対象testが期待どおりREDになることを確認する。

  - 既存の管理者・sessionデータを保持したまま`accounts.role`へ`viewer`を追加できる。
  - `entitlements`は`account_id`、`video_id`、`source_code_id`、`granted_at`を持ち、同じaccount・videoを重複させない。
  - `POST /api/viewer/register`はviewerだけを作成してsessionを発行する。
  - `POST /api/viewer/login`、`POST /api/auth/logout`で再ログインとlogoutができる。
  - `GET /api/viewer/session`はviewer sessionだけを認め、`GET /api/viewer/library`はviewer roleを必須にする。
  - viewerは管理APIを使えず、adminはviewer libraryを使えない。未認証は401、role不一致は403とする。
  - 登録はclientごとに1時間3回、loginは既存のclient/account制限を再利用する。状態変更はJSONのみ、16 KiB上限、余分なfield拒否、同一Origin必須とする。
  - `/register`、`/login`、`/library`が直接表示でき、route helperが各URLを一意に識別する。

- [x] **Step 2: schemaを最小変更する**

  `0003` migrationで、子tableの退避・再作成を含む既存のD1 migration patternに合わせて`accounts.role`のCHECKを`admin`と`viewer`へ拡張する。既存admin、session、`one_admin`制約、email一意制約を保持し、`entitlements`を追加する。migration testは旧schemaからの適用と既存データ保持を合成DBで確認する。実D1には適用しない。

- [x] **Step 3: viewer repositoryとAPIを実装する**

  既存auth helperを再利用し、viewer登録・検索・session認可・library queryを追加する。library queryはD1側で公開状態と期間を絞り、response境界でも同じavailabilityを再確認する。重複emailや認証失敗は秘密情報を含まない汎用応答にし、パスワード・Cookie・hashをログやresponseへ含めない。

  管理者の`POST /api/auth/login`と既存管理画面の挙動は変更しない。視聴者用は`POST /api/viewer/register`、`POST /api/viewer/login`、`GET /api/viewer/session`、`GET /api/viewer/library`へ分離する。

- [x] **Step 4: viewer UIを実装する**

  `src/admin/main.tsx`のentry pointでpathnameによりviewer appと既存admin appを振り分け、viewer実装は`src/viewer/`へ分離する。登録成功後は`/library`へ遷移し、logout後と未認証libraryは`/login`へ遷移する。login成功後も`/library`へ遷移する。

  libraryはタイトルと期限だけを主要表示し、動画がない場合は「現在視聴できる動画はありません」と表示する。画面遷移はHistory APIまたは通常navigationを使い、browser storageへ認証情報を保存しない。

- [x] **Step 5: 合成D1とブラウザで受入確認する**

  合成D1へviewer、権利、公開中動画、draft、公開前、期限切れ動画を投入し、以下を確認する。

  1. 新規登録からlibraryを表示できる。
  2. logout後、同じviewerで再loginしてlibraryを表示できる。
  3. 公開中かつ期限内の権利動画だけを表示する。
  4. draft、公開前、期限切れ動画のタイトルや件数をDOM・API responseへ出さない。
  5. viewerの管理API拒否、adminのviewer API拒否を確認する。
  6. `/register`、`/login`、`/library`のdirect open、reload、back、forwardを確認する。

  実Filma API、動画再生、実D1、既存preview portは使用しない。

- [x] **Step 6: 文書と全検証を完了する**

  `docs/development/viewer-auth-library.md`へ今回のURL/API、合成データでの確認方法、非対象、後続のコード消費PRが唯一のentitlement作成経路になることを記載する。READMEとIssue statusからIssue #32、計画、検証方法へリンクし、元P0計画Task 5へ段階実装の注記を追加する。

  次を実行し、結果をreport、Issue #32、PRへ記録する。

  ```bash
  pnpm vitest run tests/unit/viewer-routes.test.ts tests/unit/viewer-client.test.ts
  pnpm vitest run --config vitest.worker.config.ts tests/worker/viewer-auth-library.test.ts tests/worker/viewer-migration.test.ts
  pnpm verify
  pnpm build
  git diff --check origin/develop...HEAD
  ```

- [x] **Step 7: commitしてcontrollerへ報告する**

  実装担当は秘密情報と`.dev.vars`がdiffへ入っていないことを確認し、すべてを次のmessageでcommitする。pushとPR作成はcontrollerが独立レビュー後に行う。

  ```bash
  git add migrations src tests docs README.md
  git commit -m "feat: add viewer auth and entitlement library (#32)"
  ```
