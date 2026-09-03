# play-cms

play-cmsは、Filmaと連携する小規模なオープンソース動画CMSです。Cloudflareを推奨環境とし、Node.jsを実行できる国内サーバーにも対応します。

## 現在の状態

基盤を開発中です。公開運用に必要な認証、Filma連携、動画管理、視聴権管理は未実装です。

## 開発環境

- Node.js 22.13.0系または24以上
- pnpm 11.19.0以上

```bash
pnpm install
pnpm verify
```

## 文書

- [基盤設計](docs/superpowers/specs/2026-09-03-foundation-design.md)
- [実装計画](docs/superpowers/plans/2026-09-03-foundation-implementation.md)
- [技術判断](docs/decisions/0001-use-lightweight-portable-architecture.md)
- [コントリビューションガイド](CONTRIBUTING.md)
- [セキュリティポリシー](SECURITY.md)

## 開発状況

- [Task 1: 開発基盤とリポジトリ運用](https://github.com/rytich/play-cms/issues/1)
