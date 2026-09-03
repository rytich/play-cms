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
6. 独立レビューの結果をIssueへ反映します。Task 8でCIを導入した後は、CI結果も反映します。

## 独立レビュー

PR作成後、実装会話の履歴を持たない別エージェントに`.agents/skills/play-cms-reviewer/SKILL.md`を読ませます。base/head SHA、Issue、PR、Task、設計書、計画だけを入力し、読み取り専用でレビューさせます。

調整担当者は指摘を確認してからPRとIssueへ記録します。CriticalまたはImportantがある場合は修正し、更新後のhead SHAに対して別エージェントで再レビューします。review対象rangeを`baseRefOid=<reviewed-base-sha>`と`headRefOid=<reviewed-head-sha>`で記録し、Approve・Mergeの直前に両方の一致を確認します。どちらかが変わった場合はbranch同期、検証、新しい独立レビューを要求します。Ready判定の場合は、`gh api --method POST repos/<owner>/<repo>/pulls/<pr-number>/reviews -f event=APPROVE -f commit_id=<reviewed-head-sha> -f body='<review-summary>'`でreview済みcommitへ拘束したApproveを`knryt`として作成し、返却された`commit_id`と現在headの一致を確認します。不一致なら可能な限り当該Approveを取り消し、新しい独立レビューを要求します。Task 8より前は記録済みのexact-headローカル検証を確認します。Task 8のruleset有効化前は自動Mergeを禁止します。Task 8以降はstale Approve無効化、branch最新化、CI必須化、`knryt`のbypass禁止をrulesetで強制し、required指定の有無にかかわらずreview対象headのCIチェックが存在し、すべて成功していることを確認します。チェック0件は成功扱いにしないものとします。自動Approveと自動Mergeは、Draftではなく、PRがmergeableで、CriticalまたはImportantがなく、PR作成者が`knryt`ではない場合に限ります。Approveの直後にPRを再取得し、同じbase/headペアとマージ条件を確認します。`gh pr merge <pr-number> --merge --match-head-commit <reviewed-head-sha>`でmerge commit方式を固定してhead変更を原子的に拒否します。Mergeに成功した場合のみソースブランチを削除します。条件が変わった場合やMergeに失敗した場合は再試行せず停止して報告します。Ready with minor follow-upはコメントのみ、Not readyはREQUEST_CHANGESとします。

`develop`は既定ブランチではないため、GitHubのキーワードによるIssue自動クローズは働きません。PRのマージ後にIssueへマージ済みPRをコメントし、手動で閉じます。Issueの終了を確認してから次のTaskへ進みます。
