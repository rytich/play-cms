# play-cms

play-cmsは、Filmaと連携する小規模な動画CMSとして公開リポジトリで開発中です。Cloudflareを推奨環境とし、Node.jsを実行できる国内サーバーにも対応します。

## 現在の状態

localhost限定の管理者認証、未検証下書き、閲覧用キー管理を試作中です。公開・再生・実Filma連携・視聴権管理は無効です。

## ライセンス

ライセンスは未決定です。`LICENSE`を追加して方針を確定するまでは、利用・改変・再配布の許諾はまだ付与していません。

## 開発環境

- Node.js 22.13.0系または24以上
- pnpm 11.19.0以上

```bash
pnpm install
pnpm verify
```

## 文書

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

- [Task 1: 開発基盤とリポジトリ運用](https://github.com/rytich/play-cms/issues/1)
- [Issue #6: Filma実API契約テスト](https://github.com/rytich/play-cms/issues/6)
