# Agent instructions

このファイルはAIエージェント向けの入口です。規則の正本を重複させません。

1. `docs/superpowers/specs/`の承認済み設計を読む。
2. `docs/superpowers/plans/`の対象計画を読む。
3. 開発手順とGitHub運用は`CONTRIBUTING.md`と`docs/development/workflow.md`に従う。
4. セキュリティ設計と変更時の確認項目は`SECURITY.md`に従う。
5. 技術判断は`docs/decisions/`を確認する。
6. TaskのIssueを作成してからfeatureブランチで着手する。
7. 完了報告前に`pnpm verify`を実行し、結果をIssueとPRへ記録する。
8. PR作成後は別エージェントに`.agents/skills/play-cms-reviewer/SKILL.md`を読ませ、独立レビューを実行する。
9. 自動Approve・自動Mergeは`docs/decisions/0002-use-knryt-automated-pr-reviewer.md`の条件を満たす`knryt`レビューワーだけが実行する。

秘密情報をコミット、ログ出力、IssueやPRへ記載しないでください。脆弱性を公開Issueで報告せず、`SECURITY.md`へ誘導してください。
