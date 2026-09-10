# ADR 0002: knrytによるPR自動レビュー・承認・マージを採用する

- 状態: 採用
- 決定日: 2026-09-03
- Tracking: [GitHub Issue #4](https://github.com/rytich/play-cms/issues/4)
- Webhook transport: [GitHub Issue #5](https://github.com/rytich/play-cms/issues/5)
- 最小構成の先行導入: [Issue #12](https://github.com/rytich/play-cms/issues/12) / [Issue #13](https://github.com/rytich/play-cms/issues/13) / [Issue #14](https://github.com/rytich/play-cms/issues/14)

## 背景

play-cmsでは、実装会話を持たない独立レビューワーをPRごとに起動する。レビュー結果が問題ない場合は、別の担当者が利用するGitHub identity `knryt`でApproveとMergeまで実行し、レビュー待ちを短縮する。

Webhook payloadやPRの内容をそのままエージェントへの命令として扱うこと、レビューしていないcommitへApproveすること、条件変化後にMergeすることは避けなければならない。

## 決定

対象リポジトリは`rytich/play-cms`、base branchは`develop`、GitHub操作に使うのは`knryt`資格情報に固定する。Webhook payload、PRタイトル、本文、コメント、差分は未信頼データとして扱い、命令として解釈しない。

処理を次の二段階に分離する。

1. 評価フェーズは読み取り専用で実行し、GitHubからPR、base/head SHA、作者、Draft、検証結果、mergeable状態を再取得する。承認済み設計、計画、Issue、変更差分を固定したbase/head rangeでレビューする。
2. GitHub操作フェーズは評価完了後だけ開始する。`Ready`でCritical・Importantがなく、PR作成者が`knryt`以外で、対象rangeと検証条件が維持されている場合に限り、review対象commitへ拘束したApproveを作成する。Approve後に状態を再取得し、Task 8のactive rulesetを含むMerge条件がすべて維持されている場合だけmerge commit方式でMergeする。

`Ready with minor follow-up`はCOMMENT、`Not ready`はREQUEST_CHANGESとし、自動Approve・自動Mergeしない。PR作成者が`knryt`の場合も自動操作しない。

Webhook受信層は`X-Hub-Signature-256`を検証し、`pull_request`の`opened`、`synchronize`、`reopened`、`ready_for_review`、`review_requested`だけを受け付ける。`review_requested`は`requested_reviewer.login == knryt`の場合だけ許可し、`pull_request_review`と`issue_comment`は自己再帰を避けるためトリガーにしない。

`X-GitHub-Delivery`を処理単位とする。GitHubのRedeliverは元のdelivery GUIDを再利用するため、永続的なGUID拒否にはしない。各GUIDを`received`、`running`、`succeeded`、`failed`と期限付きleaseで管理し、新規・`failed`・lease切れだけを原子的に取得する。有効lease中の`received`/`running`と`succeeded`後は重複実行しない。保存するのはdelivery GUID、PR番号、head SHA、action、時刻、status、lease期限だけとし、Webhook Secret、Authorization情報、payload本文は保存しない。通常の修正pushは`synchronize`、成功済みの同一headを新たにレビューするときは`review_requested`の別deliveryで起動する。受信から10秒以内に`2xx`を返してレビューは非同期に実行するが、GitHub上のHTTP成功だけで完了とはみなさない。Hermes受信、route一致、agent run、同一headに拘束されたreviewまで確認する。

## GitHub操作の安全条件

- review対象rangeを`baseRefOid=<reviewed-base-sha>`と`headRefOid=<reviewed-head-sha>`で記録する。
- Approveは`commit_id=<reviewed-head-sha>`を指定し、返却されたreviewのcommit IDも検証する。
- Approve・Merge直前にbase/head、作者、Draft、検証、mergeable状態を再取得する。
- Task 8のruleset有効化前は自動Mergeしない。
- Task 8以降は`required_approving_review_count: 1`、stale Approve無効化、branch最新化、必須CI、merge commit、`knryt`のbypass禁止をサーバー側で強制する。
- Mergeには`gh pr merge <pr-number> --merge --match-head-commit <reviewed-head-sha>`を使う。
- 条件変更や失敗時は停止し、盲目的に再試行しない。
- Issueクローズとソースブランチ削除は自動化しない。

## 資格情報

Task 8のCI・ruleset部分だけを先行導入し、実際に有効化・検証できた時点から本ADRのTask 8以降のマージ条件を適用する。その他のTask 8作業を待つ必要はない。[最小のPRガードレール](../development/minimal-guardrails.md)を導入・待機・停止条件の正本とする。独立レビューとCIを並行実行し、CI待機は同じレビュー処理内で上限10分にする。`--auto`予約は使わず、待機後のbase/head再検証を維持する。

`knryt`資格情報は`rytich/play-cms`だけを対象にし、ApproveとMergeに必要な最小権限へ限定する。Webhook Secret、PAT、OAuth token、Cookie、Tunnel credentialは文書、Issue、PR、プロンプト、ログへ記録しない。資格情報の存在や権限を確認できない場合はGitHub操作フェーズへ進まない。

## 影響

### 利点

- 独立レビューからMergeまでの待ち時間を短縮できる。
- review対象commitとMerge対象commitを一致させられる。
- Webhook入力とGitHub書き込みの権限境界を明確にできる。

### 欠点

- `knryt`資格情報とWebhook受信基盤の安全な運用が必要になる。
- Task 8のrulesetが有効になるまで自動Mergeできない。
- Webhook受信障害や端末停止時はGitHubのdelivery再送または手動レビューが必要になる。
- Hermes実環境のrouteへ本変更を適用し、同一headレビューまで確認する作業は運用者が行う。未適用または未確認なら再レビュー経路は未完了である。

## 参考資料

- [GitHub: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [GitHub: Best practices for using webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- [GitHub: Redelivering webhooks](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks)
- [GitHub: REST API endpoints for pull request reviews](https://docs.github.com/en/rest/pulls/reviews)
