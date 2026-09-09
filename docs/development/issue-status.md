# 開発Issueの現在地

更新: 2026-09-09。これは整理時点のスナップショット。最新の状態と実行証拠は[GitHub Issues](https://github.com/rytich/play-cms/issues)を正本とし、PRのマージだけで未確認の運用・公開条件を完了扱いにしない。

## 進める順序

| 区分             | Issue                                                                                      | 現状・次の条件                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 実装中           | [#32 視聴者登録・ログイン・視聴権ライブラリ](https://github.com/rytich/play-cms/issues/32) | コード消費・再生より前のviewer基盤を[PR #33](https://github.com/rytich/play-cms/pull/33)で検証・統合する |
| 再生前必須       | [#16 Filma再生契約](https://github.com/rytich/play-cms/issues/16)                          | 調査文書は統合済みだがNO-GO。ドメイン制約・絶対期限・実再生確認が残る                                    |
| 公開前必須       | [#30 追加ブラウザ受入](https://github.com/rytich/play-cms/issues/30)                       | 実BFCache復帰・実200%拡大は未確認。#28の新画面も確認対象に含める                                         |
| レビュー運用確認 | [#5 Webhook疎通](https://github.com/rytich/play-cms/issues/5)                              | 登録/Ping確認済み。実deliveryとの相関・受信側検証・重複拒否の証拠を残す                                  |
| レビュー運用確認 | [#12 自動Mergeの安全停止](https://github.com/rytich/play-cms/issues/12)                    | 文書は統合済み。外部実行環境の停止/再開と、レビュー判定に対応する操作の整合を確認する                    |
| 保護運用確認     | [#14 develop ruleset](https://github.com/rytich/play-cms/issues/14)                        | active・bypassなし・承認/CI/最新化必須は再取得済み。条件不足時の拒否証拠を残す                           |
| 後続保守         | [#31 checkout実行基盤の警告](https://github.com/rytich/play-cms/issues/31)                 | プロトタイプ開発を優先して保留。製品機能とは別の専用PRで公式互換性確認とSHA固定の更新を行う              |

## 今回終了したIssue

| Issue                                               | 完了した範囲                                                  | 根拠PR                                            |
| --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| [#6](https://github.com/rytich/play-cms/issues/6)   | opt-inの安全なFilma認証テスト基盤。現在の再生成功を意味しない | [#7](https://github.com/rytich/play-cms/pull/7)   |
| [#8](https://github.com/rytich/play-cms/issues/8)   | シンプルなセキュリティ方針の文書化                            | [#9](https://github.com/rytich/play-cms/pull/9)   |
| [#10](https://github.com/rytich/play-cms/issues/10) | P0仕様の定義。P0全機能の完成ではない                          | [#11](https://github.com/rytich/play-cms/pull/11) |
| [#13](https://github.com/rytich/play-cms/issues/13) | PRごとのverify CI導入。外部レビュー運用は#12に残す            | [#15](https://github.com/rytich/play-cms/pull/15) |
| [#19](https://github.com/rytich/play-cms/issues/19) | ローカル管理画面のIPv4接続拒否の修正                          | [#20](https://github.com/rytich/play-cms/pull/20) |
| [#22](https://github.com/rytich/play-cms/issues/22) | テーマ・画面導線の仕様化                                      | [#23](https://github.com/rytich/play-cms/pull/23) |
| [#24](https://github.com/rytich/play-cms/issues/24) | 承認済み範囲のローカル管理UI。未確認2項目は#30へ分離          | [#27](https://github.com/rytich/play-cms/pull/27) |
| [#28](https://github.com/rytich/play-cms/issues/28) | 100件ページ、検索・絞り込み、動画とキーの一括状態変更         | [#29](https://github.com/rytich/play-cms/pull/29) |

## 小さく運用する

- 「実装・文書が完成」と「実環境での確認が完了」を分け、残件は元Issueまたは明示した後続Issueへ保持する。
- 一つの開発Taskは一つのIssue・featureブランチ・PR。新しい管理ツールや状態ラベルを増やさず、Issueコメントに着手・判断・検証・統合を短く記録する。
- developへのマージ後に対応Issueを手動で閉じる。未確認の公開条件や外部実行環境の証拠不足を、マージの事実だけで閉じない。
- 6 Astraは設計・管理、実装は既存5.6 Sol一体。独立レビューは別5.6系、正式Approve/Mergeはknryt。
- #16・#30と既存の公開ゲートが未完了の間は実配信・外部公開を停止する。管理上の公開設定保存とは区別する。

関連: [視聴者認証・ライブラリの確認手順](viewer-auth-library.md)、[視聴者認証・ライブラリ計画](../superpowers/plans/2026-09-09-viewer-auth-library-implementation.md)、[開発手順](workflow.md)、[管理先行と公開ゲート](admin-first-prototype.md)。
