# 管理画面のテーマ差し替え

Tracking: [Issue #24](https://github.com/rytich/play-cms/issues/24) / [承認済み仕様](../superpowers/specs/2026-09-08-ui-theme-navigation-design.md)

管理画面のブランド表示と色は、レビュー対象のビルド入力として差し替える。ブラウザからテーマを登録する機能やDB設定はない。外部CSS、外部フォント、外部画像、`@import`、任意HTML・JavaScriptを追加しない。

## 差し替える場所

- `src/ui/brand.ts`: `siteName`、同一サイト内の`logoPath`、`faviconPath`。
- `src/ui/themes/custom.css`: 既定値から変更するCSS変数だけ。
- `public/brand/`: 公開してよいPNG/WebPロゴとICO faviconだけ。

ロゴは`/brand/<英数字・ハイフン・アンダースコア>.png`または`.webp`、faviconは同じ命名の`.ico`だけを指定できる。未設定、形式不一致、読み込み失敗時はサイト名テキストへ戻る。画像には動画、サムネイル、秘密情報、運用データを含めない。

## CSS変数

既定値は`src/ui/themes/default.css`にあり、変更は`custom.css`へ置く。

- 色: `--play-color-bg`、`--play-color-surface`、`--play-color-text`、`--play-color-muted`、`--play-color-border`、`--play-color-primary`、`--play-color-on-primary`、`--play-color-primary-hover`、`--play-color-focus`、`--play-color-success`、`--play-color-warning`、`--play-color-danger`
- 文字: `--play-font-family`、`--play-font-size`
- 寸法: `--play-space`、`--play-radius-control`、`--play-radius-panel`

成功・警告・エラー色はブランド色とは別に保ち、文字ラベルだけでも状態を判別できるようにする。既定テーマと差し替え後の双方で、通常文字4.5:1、大きな文字3:1、操作部品3:1のコントラストと主操作44px以上を確認する。

## ロゴと確認

横長ロゴは元画像の縦横比を維持し、透明余白を小さくする。画面側は高さ34px、最大幅180px（小画面132px）に収め、`object-fit: contain`で変形を避ける。320、375、768、1280 CSS pxと200%拡大で、ロゴがメニューや見出しを押し出さないことを確認する。

変更後は次を実行する。

```bash
pnpm verify
pnpm build:ui
```

成果物を配置した環境では、HTMLが新しいハッシュ付きCSS/JavaScriptを参照していることと、古いロゴ・faviconがブラウザや配信キャッシュに残っていないことを確認する。この手順は公開やデプロイを許可するものではない。

## 隔離したブラウザ確認

実ブラウザ確認では、既存の`.wrangler/state`や稼働中サーバーを使わない。OSの一時ディレクトリに権限700の新しいD1永続化先とChrome profileを別々に作り、合成データだけを入れる。サーバーは`127.0.0.1`の空いている別ポートへ固定し、Chromeも専用profileと専用デバッグポートで起動する。Cookieはポート間で共有され得るため、ポート変更だけを分離とは扱わない。

一覧では表示範囲と日時のタイムゾーン表記を確認する。終了時は自分が起動した試験サーバーと試験Chromeだけを停止し、既存ポート、既存D1、秘密設定は変更しない。

## 元へ戻す

`brand.ts`を`siteName: 'play-cms'`、`logoPath: null`、`faviconPath: null`へ戻し、`custom.css`の上書きを削除して再検証・再ビルドする。DB migrationや既存動画・閲覧用キーの変更は不要。
