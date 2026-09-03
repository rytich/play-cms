# コントリビューションガイド

## Issueを先に作成する

既存のOpen・Closed Issueを検索してから、バグ、機能提案、文書改善のIssue Formを選んでください。セキュリティ問題は公開Issueへ投稿せず、[SECURITY.md](SECURITY.md)に従ってください。

実装計画の各Taskには一つのIssueを作成し、設計書、実装計画、完了条件、対象外を記載します。着手、判断変更、ブロッカー、検証結果もIssueへコメントします。

## ブランチとPull Request

1. 最新の`develop`から`feature/issue-<番号>-<概要>`を作成します。
2. テストを先に書き、意図した理由で失敗することを確認します。
3. 最小実装でテストを通します。
4. 関連文書へIssue番号を記載します。
5. `pnpm verify`を実行し、結果をIssueへコメントします。
6. `develop`向けPRを作成します。

PR本文には`Refs #<番号>`、変更範囲、リスク、確認したシナリオ、未確認事項、関連文書を記載してください。`develop`向けPRではGitHubの自動クローズが働かないため、マージ確認後にIssueへマージ済みPRをコメントして手動で閉じます。

Cloudflare用とNode.js用のビルドをTask 7で導入するまでは、Task固有テストとその時点の`pnpm verify`を実行し、結果をIssueとPRへ記録します。導入後は両環境のビルドも必須です。Task 8でCIを導入するまでは、記録済みのローカル検証、独立レビュー、文書更新をマージ条件とします。導入後はCI成功も確認します。

## コミット

コミットメッセージは`feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:`、`ci:`のいずれかで始め、1コミットの目的を明確にします。

## 必須確認

```bash
pnpm verify
```

AIが作成した変更も独立レビューの対象です。レビュー担当者は結果を確認し、Ready判定のときだけ、規約に従って`knryt`として自動Approveできます。review対象rangeを`baseRefOid=<reviewed-base-sha>`と`headRefOid=<reviewed-head-sha>`で記録し、Approve・Mergeの直前に両方の一致を確認します。どちらかが変わった場合はbranch同期、検証、新しい独立レビューを要求します。Approveは`gh api --method POST repos/<owner>/<repo>/pulls/<pr-number>/reviews -f event=APPROVE -f commit_id=<reviewed-head-sha> -f body='<review-summary>'`でreview済みcommitへ拘束し、返却された`commit_id`と現在headの一致も確認します。不一致なら可能な限り当該Approveを取り消し、新しい独立レビューを要求します。Task 8より前は記録済みのexact-headローカル検証を確認します。Task 8のruleset有効化前は自動Mergeを禁止します。Task 8以降は`required_approving_review_count: 1`、stale Approve無効化、branch最新化、CI必須化、`knryt`のbypass禁止をrulesetで強制し、required指定の有無にかかわらずreview対象headのCIチェックが存在し、すべて成功していることを確認します。チェック0件は成功扱いにしないものとします。自動Approveと自動MergeではDraft状態、mergeable状態、Critical・Importantの有無、PR作成者も再確認してください。Approve後に同じbase/headペアとマージ条件を再確認し、`gh pr merge <pr-number> --merge --match-head-commit <reviewed-head-sha>`でmerge commit方式を固定してhead変更を原子的に拒否します。Merge成功後にだけソースブランチを削除し、条件変更や失敗時は盲目的に再試行しません。テスト結果や未確認事項を省略しないでください。
