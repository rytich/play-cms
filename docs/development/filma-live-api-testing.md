# Filma実API契約テスト

Tracking: [GitHub Issue #6](https://github.com/rytich/play-cms/issues/6)

## 目的

Filmaクライアントを推測で実装しないため、専用テスト組織の実APIで認証境界だけを確認します。通常の単体・統合テストは外部サービスへ接続せず、このテストも通常の`pnpm verify`や公開CIから実行しません。

## ローカル設定

`.dev.vars.example`を`.dev.vars`へコピーし、次の1項目だけをローカルで設定します。

- `FILMA_LIVE_API_KEY`: 専用テスト組織で発行したAPIキー

`.dev.vars`はGit管理外です。値をGit、Issue、PR、チャット、コマンド履歴、画面共有、ログへ記載しないでください。送信先はコード内の`https://filma.biz/filmaapi/token`に固定し、環境変数やコマンド引数から変更できません。

## 実行

```bash
pnpm test:filma:live
```

このコマンドだけが`POST https://filma.biz/filmaapi/token`を1回実行します。自動再試行はせず、リダイレクトは拒否し、5秒で通信を中断します。応答本文はストリームの実測で64 KiBを上限とし、`Content-Length`がない場合や実際の本文サイズと異なる場合も上限を適用します。200応答では`organization_id`と`api_type`の存在と型を検証し、出力にはHTTPステータスと確認した項目名だけを表示します。APIキー、JWT、組織ID、認証ヘッダー、レスポンス本文は表示しません。

## エラー分類

- `INVALID_API_KEY`: HTTP 401
- `DOMAIN_NOT_ALLOWED`: HTTP 403
- `FILMA_UNAVAILABLE`: その他のHTTPエラー、ネットワーク障害、5秒のタイムアウト、64 KiBの応答上限超過
- `INVALID_RESPONSE_SCHEMA`: HTTP 200だが期待するJSON契約を満たさない
- `MISSING_CONFIGURATION`: 必須のローカル設定がない

エラー時もレスポンス本文と元のネットワークエラーは表示しません。実APIの検証結果をIssueやPRへ記録するときは、成功・失敗、HTTP分類、確認した項目名だけを記載します。

## 対象外

このテストはAPIキーをCMSのDBへ保存せず、動画やFilma上のデータを作成・変更・削除しません。APIキーの暗号化保存と管理画面は実装計画Task 5以降で扱います。
