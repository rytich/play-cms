# play-cms

play-cmsは、Filmaと連携する小規模な動画CMSとして公開リポジトリで開発中です。Cloudflareを推奨環境とし、Node.jsを実行できる国内サーバーにも対応します。

## 現在の状態

localhost限定で、管理者機能に加えて視聴者登録・ログインと合成視聴権のライブラリを試作中です。コード消費、公開再生、実Filma連携、本番の視聴権付与は無効です。

## ライセンス

ライセンスは未決定です。`LICENSE`を追加して方針を確定するまでは、利用・改変・再配布の許諾はまだ付与していません。

## 開発環境

- Node.js 22.13.0系または24以上
- pnpm 11.19.0（`packageManager`で固定）

```bash
pnpm install
pnpm verify
```

## 文書

- [現行要件とP0招待テストの完了条件](docs/product/requirements.md)
- [P0招待テスト完了計画](docs/superpowers/plans/2026-09-09-p0-invite-test-completion.md)
- [一覧絞り込み・一括状態変更の操作とmigration](docs/development/bulk-management.md)
- [視聴者認証と視聴権ライブラリ](docs/development/viewer-auth-library.md)
- [視聴者認証・ライブラリ実装計画](docs/superpowers/plans/2026-09-09-viewer-auth-library-implementation.md)
- [Issueの現在状態](docs/development/issue-status.md)
- [テーマ差し替え・管理者／視聴者UI仕様（管理UI実装済み・ブラウザ受入一部未完了）](docs/superpowers/specs/2026-09-08-ui-theme-navigation-design.md)
- [最小テーマと管理UIの実装計画](docs/superpowers/plans/2026-09-08-admin-ui-theme-implementation.md)
- [管理画面のテーマ差し替え手順](docs/development/ui-theming.md)
- [基盤設計](docs/superpowers/specs/2026-09-03-foundation-design.md)
- [実装計画](docs/superpowers/plans/2026-09-03-foundation-implementation.md)
- [Filma実API契約テスト](docs/development/filma-live-api-testing.md)
- [技術判断](docs/decisions/0001-use-lightweight-portable-architecture.md)
- [コントリビューションガイド](CONTRIBUTING.md)
- [セキュリティポリシー](SECURITY.md)

## 開発状況

- [Issue #34: 現行要件の集約](https://github.com/rytich/play-cms/issues/34)
- [Issue #35: 使い切りキー・匿名視聴・視聴権引き継ぎ](https://github.com/rytich/play-cms/issues/35)
- [Issue #36: D1 migrationとCloudflare招待環境](https://github.com/rytich/play-cms/issues/36)
- [Issue #37: 3〜5名の招待操作確認](https://github.com/rytich/play-cms/issues/37)
- [Issue #16: Filma再生契約のGO/NO-GO](https://github.com/rytich/play-cms/issues/16)
- [Issue #30: 公開前ブラウザ受入](https://github.com/rytich/play-cms/issues/30)
- [全Issueの現在地](docs/development/issue-status.md)
