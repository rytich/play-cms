# 視聴者認証と視聴権ライブラリ

[Issue #32](https://github.com/rytich/play-cms/issues/32)・[PR #33](https://github.com/rytich/play-cms/pull/33)では、動画再生より前の最小機能として視聴者登録、ログイン、現在有効な視聴権の一覧を追加する。

## 画面とAPI

画面は次のURLで直接開け、再読み込み・戻る・進むでも同じ画面状態を復元する。

- `/register`: 視聴者登録
- `/login`: 視聴者ログイン
- `/library`: 視聴権ライブラリ。未認証時は`/login`へ戻す

視聴者APIは管理者ログインから分離する。

- `POST /api/viewer/register`
- `POST /api/viewer/login`
- `GET /api/viewer/session`
- `GET /api/viewer/library`
- `POST /api/auth/logout`（管理者と共通）

`GET /api/viewer/library`は、ログイン中の視聴者に付与済みで、公開中かつ開始日時以降・終了日時より前の動画だけを返す。応答は`publicId`、`title`、`description`、`endsAt`に限定し、画面にはタイトルと視聴期限だけを主要表示する。下書き、公開前、期限切れの動画は件数を含めて示さない。

視聴権の`source_code_id`は必須で、発行元コードと動画の組が一致する場合だけ保存できる。ライブラリの公開状態と期間はSQLで絞り込み、応答境界でも再確認する。これは将来SQLを変更した場合にも非公開情報を応答へ混ぜないための多層防御である。

日時は端末の通常のIANAタイムゾーン名を表示する。ブラウザが空値や解釈できない名称を返す場合は、特定地域を誤表示せず`端末設定のタイムゾーン`と表示する。

## 合成データでの確認

通常の自動テストは`tests/worker/fixtures/wrangler.test.jsonc`の合成bindingと隔離D1だけを使う。`.dev.vars`や既存ローカルD1は使わない。

```bash
pnpm vitest run tests/unit/viewer-routes.test.ts tests/unit/viewer-client.test.ts
pnpm vitest run tests/unit/viewer-synchronization.test.ts
pnpm vitest run --config vitest.worker.config.ts tests/worker/viewer-auth-library.test.ts tests/worker/viewer-migration.test.ts
PLAY_VERIFY_BUILD=true pnpm build
```

ブラウザ受入も別portと独立browser contextを使い、合成viewerと合成動画だけで行う。既存preview、実メールアドレス、実動画ID、実Filma APIは使わない。
logoutと履歴復帰の同期判断は`pnpm test`対象の純粋関数テストを必須検証とし、実ViewerAppのPlaywright回帰は`pnpm test:browser:viewer-logout`で補助確認する。今回の範囲ではCI・開発環境や製品依存を拡張しないため、ブラウザを`pnpm verify`の必須条件にはしない。

## 今回含めないもの

- 動画再生とFilma連携
- コード消費、匿名session、視聴権引き継ぎ
- メール確認、パスワード再設定、プロフィール
- 管理者による視聴権付与API

本番の`entitlements`作成経路は追加していない。後続のコード消費機能だけを唯一の本番writerとし、この段階では合成テストが視聴権データを投入する。Filma再生は[再生契約](filma-playback-contract.md)がNO-GOの間は開始しない。

実装範囲と残りのP0工程は[視聴者認証・ライブラリ計画](../superpowers/plans/2026-09-09-viewer-auth-library-implementation.md)および[P0実装計画](../superpowers/plans/2026-09-07-p0-prototype-implementation.md)を参照する。
