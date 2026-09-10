## Issue / Task

- Issue: Refs #
- Task:
- 承認済み設計:
- 承認済み計画:

## Review range

- baseRefOid:
- headRefOid:

## 変更

- 対象範囲:
- 対象外:

## リスク

-

## 検証結果

- [ ] `pnpm verify`
- コマンドと結果:
- 対象head:

## NO-GO / 未確認

- 承認済みNO-GO:
- 未確認事項:

## セキュリティ確認

- 脅威と悪用経路:
- 入力境界と拒否条件:
- 必要な権限と追加理由:
- 秘密情報・個人情報の保存、送信、ログ:
- 保存データ・保持期間:
- 外部通信先・リダイレクト・タイムアウト・応答量・再試行:
- 失敗時の閉じ方と実行した防御テスト:

## 独立レビュー

- Review round: initial / re-review
- Finding ledger source: review ID / author / commit ID / submittedAt（initialはなし）
- Finding ledger:
- Late-discovery reason / reviewer-process follow-up: なし
- Operational stop: なし
- Assessment: 未実施
- GitHub action: 未実施

## 関連文書

-

## 実装前の境界確認

- [ ] DBの参照関係・一意性・移行時の既存データ整合を確認した、または対象外と記録した
- [ ] 競合・外部失敗時のno-writeを確認した、または対象外と記録した
- [ ] 外部API契約を確認済み事実とNO-GOへ分けた、または外部通信なしと記録した
- [ ] 秘密を保存・送信・URL・ログ・応答へ出さない境界を確認した
- [ ] navigation/authentication変更のbrowser受入を確認した、または対象外と記録した

## チェックリスト

- [ ] 振る舞いの変更にテストを追加した
- [ ] 関連文書を更新した
- [ ] 機能、API、依存パッケージ、権限、保存データ、外部通信を必要最小限にした
- [ ] 秘密情報や個人情報を含んでいない
- [ ] PR作成者が`knryt`の場合、自動Approve・自動Mergeを無効にした
