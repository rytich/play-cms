# 開発とGitHub運用

Tracking: [GitHub Issue #1](https://github.com/rytich/play-cms/issues/1)

## 原則

- Issueは作業状態を追跡します。
- リポジトリ内文書は確定した設計と運用の正本です。
- 一つのTaskを一つのIssue、一つのfeatureブランチ、一つのPRで扱います。
- Issue、PR、設計書、ADR、変更文書を相互にリンクします。

## Taskの開始

1. 重複Issueがないことを検索します。
2. Issue本文へ目的、関連文書、完了条件、対象外を記載します。
3. 最新の`develop`から`feature/issue-<番号>-<概要>`を作ります。
4. Issueへブランチ名、開始コミット、予定する検証をコメントします。

## 実装中

- 振る舞いは失敗するテストから追加します。
- 設計変更、ブロッカー、スコープ変更をIssueへ記録します。
- 秘密情報や個人情報をIssue、PR、ログへ記載しません。
- 依存ライブラリの現行仕様は、必要に応じてContext7と公式ドキュメントで確認します。

## Pull Request

1. Task固有テストと`pnpm verify`を実行します。
2. コマンド、成功・失敗件数、未確認事項をIssueへコメントします。
3. 関連文書へIssue番号を追加します。
4. featureブランチをpushします。
5. `develop`向けPRを作り、`Refs #<番号>`を記載します。
6. CIとレビューの結果をIssueへ反映します。

## 独立レビュー

PR作成後、実装会話の履歴を持たない別エージェントに`.agents/skills/play-cms-reviewer/SKILL.md`を読ませます。base/head SHA、Issue、PR、Task、設計書、計画だけを入力し、読み取り専用でレビューさせます。

調整担当者は指摘を確認してからPRとIssueへ記録します。CriticalまたはImportantがある場合は修正し、更新後のhead SHAに対して別エージェントで再レビューします。Approveとマージは人間または別のGitHub資格情報を持つレビュー担当者が行います。

`develop`は既定ブランチではないため、GitHubのキーワードによるIssue自動クローズは働きません。PRのマージ後にIssueへマージ済みPRをコメントし、手動で閉じます。Issueの終了を確認してから次のTaskへ進みます。
