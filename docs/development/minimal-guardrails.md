# 最小のPRガードレール

Tracking: [Issue #12](https://github.com/rytich/play-cms/issues/12) / [Issue #13](https://github.com/rytich/play-cms/issues/13) / [Issue #14](https://github.com/rytich/play-cms/issues/14)

関連: [ADR 0002](../decisions/0002-use-knryt-automated-pr-reviewer.md) / [基盤計画 Task 8](../superpowers/plans/2026-09-03-foundation-implementation.md#task-8-ciと最終文書)

## 構成

Task 8のうちCIとマージ保護だけを先行導入する。#12・#13のコードと運用変更は一つの導入PRで扱い、#14で実設定を確認する。Task 8全体の完了を意味しない。

必須チェックは`verify`一つ。Node.js 22、package.json指定のpnpm、固定lockfileで`pnpm verify`を実行する。APIキーとLive API、Docker、デプロイは不要。CIと独立レビューは並行して進む。CI時間は目標5分以内、ジョブ上限10分とし、実測して調整する。

GitHub側の強制条件は[develop-ruleset.json](../../.github/develop-ruleset.json)を正本とする。承認1件、古い承認の無効化、最新baseへの追従、GitHub Actions発行の`verify`成功、削除・force push禁止、bypassなし、merge commit方式を設定する。承認者をknrytに限定する確認はレビュー担当が行う（承認数1だけでは特定の人物を指定できない）。

## レビュー担当の処理

1. 読み取り専用で評価し、repository、PR番号、review済みbase/head SHA、判定、検証結果を記録する。評価フェーズへ書き込み資格情報を渡さない。
2. GitHub操作フェーズのidentityが`knryt`で、Ready判定であることを確認する。最新PRが`rytich/play-cms`の`develop`向け、Open、非Draft、作者がknryt以外であることを再取得する。
3. `gh api repos/rytich/play-cms/rules/branches/develop`で現在適用されるルールを取得し、その`ruleset_id`の詳細を`gh api repos/rytich/play-cms/rulesets/<id>`で読む。active、対象develop、正本と同じ全条件、bypassなしを確認する。取得不能、未設定、条件不足では停止する。PRがmergeableというだけで保護ありと判断しない。
4. `gh pr checks <PR番号> --repo rytich/play-cms --json name,state,workflow,link`で`verify`の存在を確認する。チェック0件、欠落、失敗は停止。CIが実行中の場合だけ、同じレビュー処理内で次を実行する。

   ```sh
   gh pr checks <PR番号> --repo rytich/play-cms --watch --interval 10 --fail-fast
   ```

   実行環境のタイムアウトを10分に設定する。タイムアウト、キャンセル、失敗では停止理由を記録する。古い承認を使った再試行はしない。通常のCI完了は同じ処理で受け取り、Webhookの再配信や追加の人間確認を要求しない。停止後に再実行する場合はGitHubの最新状態とreview対象rangeを取り直す。

5. 待機後にbase/headとチェックを再取得する。レビュー時からどちらかが変わった場合は再レビューする。`verify`は`SUCCESS`だけを許可し、`SKIPPED`や`NEUTRAL`を成功とみなさない。PRの最新headに対する結果を使う。`pull_request` CIはGitHubのテスト用merge commit上で動き、対象headとbaseの組み合わせも検証する。
6. ADR 0002の`commit_id=<reviewed-head-sha>`付きApproveを行い、返却commit IDを確認する。Merge直前にも同じbase/head、ruleset、チェック成功、knrytの有効なApprove、mergeable状態を再確認する。`gh pr merge <PR番号> --repo rytich/play-cms --merge --match-head-commit <reviewed-head-sha>`で実行する。

GitHubの`--auto`予約や新しいCI完了Webhookは使わない。予約後のbase/head変更でレビューした組み合わせと異なる内容がMergeされることを避け、既存の処理で待機と再検証を完結する。Merge直前の確認と実際の書き込みの間はGitHub rulesetとhead SHA指定で保護する。

## 初回導入

1. CI・本書・ruleset正本を含む導入PRをDraftで作成し、`verify`が成功することを確認する。DraftではApprove・Mergeしない。
2. GitHub管理者は既存rulesetを読み取り、重複作成せず、正本の設定をdevelopへ適用する。`verify`の発行元がGitHub Actions（App ID `15368`）であることを実行結果から照合する。
3. repositoryのsquash/rebase mergeを無効にし、merge commitを有効にする。適用ルール・bypassなし・チェック名・App IDをAPIから再取得する。
4. 未承認の導入PRがGitHub上でMerge不可であることを確認する。保護設定を先に有効化するため、本PRのmerge前でもCI成功を導入条件とする（#14の当初の「#13マージ済み」条件をこの初回手順で置き換える）。
5. 別端末のレビュー実行環境で本手順が読み込まれることを確認し、Readyにしてknrytの独立レビューへ渡す。レビュー処理の完了、承認されたSHA、マージ後のdevelopを確認する。実行環境を確認できない場合は「実装済み・運用確認待ち」と記録する。

設定ファイルをコミットしただけでは適用済みとしない。Issueにruleset ID、確認日、CI実行URL、PR、未確認事項を記録する。秘密情報や署名ヘッダーは保存しない。

## 停止条件の検証

設定を弱める試験は行わず、導入前の読み取り結果、テストPRの状態、CI履歴で確認する。

| 条件                                         | 期待結果                                    |
| -------------------------------------------- | ------------------------------------------- |
| rulesetが空・inactive・取得不能              | 自動Mergeせず理由を記録                     |
| `verify`がない／チェック0件                  | 成功扱いせず停止                            |
| `verify`が実行中                             | 同じ処理で上限10分待機                      |
| CI失敗・キャンセル・タイムアウト・skip       | 承認・Mergeを止める                         |
| 承認後にheadを更新                           | 古い承認が無効になり再レビューが必要        |
| baseが更新されbranchが古い                   | 最新baseへ同期するまでMerge不可、再レビュー |
| 承認なし、CI成功                             | GitHubの保護でMerge不可                     |
| knryt承認、CI成功、同じbase/head、全条件成立 | Merge可能                                   |

GitHub設定の強制と外部レビューワーの待機動作は別々に検証する。GitHub上のApprove・Merge履歴だけでは、それがWebhook起動か手動操作か、CI待機が正常かまでは証明できない。

## 参考

- [GitHub CLI: gh pr checks](https://cli.github.com/manual/gh_pr_checks)
- [GitHub: rules API](https://docs.github.com/en/rest/repos/rules)
- [GitHub: setup-node](https://github.com/actions/setup-node)
- [pnpm: action-setup](https://github.com/pnpm/action-setup)
