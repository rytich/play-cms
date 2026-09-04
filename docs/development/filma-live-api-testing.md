# Filma実API契約テスト

Tracking: [GitHub Issue #6](https://github.com/rytich/play-cms/issues/6)

## 目的

Filmaクライアントを推測で実装しないため、専用テスト組織の実APIで認証境界だけを確認します。通常の単体・統合テストは外部サービスへ接続せず、このテストも通常の`pnpm verify`や公開CIから実行しません。

## ローカル設定

`.dev.vars.example`を`.dev.vars`へコピーし、次の2項目をローカルで設定します。

- `FILMA_API_HOST`: スキームやパスを含まないFilma APIホスト名
- `FILMA_LIVE_API_KEY`: 専用テスト組織で発行したAPIキー

`.dev.vars`はGit管理外です。値をGit、Issue、PR、チャット、コマンド履歴、画面共有、ログへ記載しないでください。

## 実行

```bash
pnpm test:filma:live
```

このコマンドだけが`POST https://<FILMA_API_HOST>/filmaapi/token`を実行します。200応答では`organization_id`と`api_type`の存在と型を検証し、出力にはHTTPステータスと確認した項目名だけを表示します。APIキー、JWT、組織ID、認証ヘッダー、レスポンス本文は表示しません。

## エラー分類

- `INVALID_API_KEY`: HTTP 401
- `DOMAIN_NOT_ALLOWED`: HTTP 403
- `FILMA_UNAVAILABLE`: その他のHTTPエラーまたはネットワーク障害
- `INVALID_RESPONSE_SCHEMA`: HTTP 200だが期待するJSON契約を満たさない
- `MISSING_CONFIGURATION`: 必須のローカル設定がない
- `INVALID_API_HOST`: ホスト名にスキーム、パス、ユーザー情報などが含まれる

エラー時もレスポンス本文と元のネットワークエラーは表示しません。実APIの検証結果をIssueやPRへ記録するときは、成功・失敗、HTTP分類、確認した項目名だけを記載します。

## 対象外

このテストはAPIキーをCMSのDBへ保存せず、動画やFilma上のデータを作成・変更・削除しません。APIキーの暗号化保存と管理画面は実装計画Task 5以降で扱います。
