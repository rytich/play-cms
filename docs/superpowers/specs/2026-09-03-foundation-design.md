# play-cms 基盤設計

- 状態: 承認済み
- 作成日: 2026-09-03
- 関連判断: [ADR 0001](../../decisions/0001-use-lightweight-portable-architecture.md)
- 基盤実装: [GitHub Issue #1](https://github.com/rytich/play-cms/issues/1)

## 目的

Filmaと連携する動画CMSの開発基盤を構築する。Cloudflareを推奨環境とし、公開リポジトリのボタンから導入できる一方、Node.jsを実行できる国内サーバーでもDockerを使って運用できるようにする。

最初の実装単位では、デプロイ可能なアプリケーション基盤、管理者認証、Filma APIキーの暗号化保存と接続確認までを扱う。動画管理、視聴コード、エンドユーザー登録、視聴権一覧、アクセス解析は後続の機能単位で設計・実装する。

## 設計原則

- Filma APIや実行環境への依存をアダプターに閉じ込める。
- ドメインルールをHTTP、DB、UIから独立させる。
- CloudflareとNode.jsで同じアプリケーション層を使用する。
- シークレットをGit、ログ、平文DBへ保存しない。
- 確定した設計はリポジトリ内文書を正本とし、Issueは作業状態の追跡に使う。
- 実装と同じ変更で関連文書を更新する。

## 技術構成

- 言語: TypeScript strict mode
- パッケージ管理: pnpm
- HTTP/API: Hono
- UI: React、Vite
- DB: Drizzle ORM
- テスト: Vitest、必要なユーザーフローのみPlaywright
- Cloudflare: Workers、D1、R2、Workers Builds
- Node.js: Node.js 22.13.0以上の22.x、または24以上、SQLite、ローカルストレージ
- 配布: Deploy to Cloudflareボタン、Dockerfile、compose.yaml

Workers Freeでの動作は保証ではなく設計目標とする。CIでWorker成果物サイズを計測し、無料枠の上限変更は公式ドキュメントを基準に判断する。

## ファイル構造

```text
play-cms/
├── AGENTS.md
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── src/
│   ├── core/                  # 値オブジェクト、エンティティ、ドメインルール
│   ├── application/           # ユースケースとポート定義
│   ├── adapters/
│   │   ├── database/          # D1、SQLite実装
│   │   ├── filma/             # Filma APIクライアント
│   │   ├── secrets/           # APIキー暗号化
│   │   └── storage/           # R2、ローカル実装
│   ├── server/                # Honoルート、認証、ミドルウェア
│   ├── admin/                 # 管理者向けReact UI
│   └── viewer/                # 視聴者向けReact UI
├── migrations/               # D1とSQLiteで共有するSQL
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── deploy/
│   └── docker/
├── docs/
│   ├── architecture/
│   ├── decisions/             # ADR
│   ├── development/
│   ├── operations/
│   ├── product/
│   └── superpowers/           # 合意済み設計と実装計画
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── pull_request_template.md
│   └── workflows/
├── wrangler.jsonc
├── Dockerfile
├── compose.yaml
└── package.json
```

単一リポジトリ・単一パッケージから開始する。再利用する境界が実装で確認されるまではワークスペースや公開パッケージへ分割しない。

## コンポーネント境界

### Core

認証主体、暗号化済み設定などのドメイン型とルールを持つ。Hono、React、Drizzleを参照しない。

### Application

管理者の初期登録、ログイン、プロフィール更新、Filma APIキー登録、接続確認をユースケースとして提供する。DB、暗号化、Filma APIとの接続はTypeScriptインターフェースとして定義する。

### Adapters

Applicationが定義するインターフェースを実装する。D1とSQLiteは同じスキーマおよびリポジトリ契約を満たす。FilmaクライアントはHTTPレスポンスを内部型へ変換し、外部APIの詳細をアプリケーション層へ漏らさない。

### Server

HonoでAPI、セッションCookie、CSRF対策、入力検証、セキュリティヘッダーを提供する。CloudflareとNode.jsの起動処理のみ分ける。

### UI

管理者画面と視聴者画面を分離する。最初の実装単位では、初期管理者登録、ログイン、プロフィール、Filma接続設定のみを提供する。

## データとシークレット

最初のスキーマは管理者、セッション、アプリ設定、マイグレーション履歴に限定する。パスワードは業界標準のパスワードハッシュで保存する。Filma APIキーはアプリケーション共通の暗号化キーで暗号化し、暗号化済み値のみDBへ保存する。

暗号化キーとCookie署名キーは次の方法で注入する。

- Cloudflare: Worker secrets
- Docker: 環境変数またはDocker secrets

APIキーは画面へ再表示せず、設定済みかどうかと最終接続確認結果だけを表示する。ログとエラーにはAPIキー、Cookie、認証ヘッダーを含めない。

## デプロイ

### Cloudflare

リポジトリのREADMEに公式形式のDeploy to Cloudflareボタンを置く。Cloudflareは`wrangler.jsonc`からD1とR2を検出し、必要なリソースを作成する。`.dev.vars.example`と`package.json`の`cloudflare.bindings`で必要なシークレットと説明を提示する。デプロイスクリプトはD1マイグレーション後にWorkerを公開する。

### 国内サーバー

DockerfileはNode.jsランタイムで同じHonoアプリを起動する。compose.yamlは永続ボリューム上のSQLiteとローカルストレージを使用する。TLS終端はホスティング事業者またはリバースプロキシの責務とする。

## エラー処理

- 入力エラーは項目単位で表示し、秘密情報を応答へ含めない。
- Filma接続エラーは認証失敗、到達不能、一時障害に分類する。
- DBまたは暗号化処理の失敗は汎用メッセージを返し、構造化ログへ相関IDを記録する。
- 初期管理者が存在する場合、初期登録APIを無効化する。
- 起動時に必須シークレットがなければ安全に停止する。

## テスト方針

- ドメインとユースケースは外部サービスなしで単体テストする。
- D1互換SQLiteとローカルSQLiteのマイグレーションを統合テストする。
- Filma APIは契約境界をテストし、秘密値がログへ出ないことを確認する。
- 初期登録、ログイン、APIキー設定、接続確認をE2Eテストする。
- Cloudflare用とNode.js用の両方をCIでビルドする。
- Cloudflare成果物の圧縮後サイズをCIで計測する。

## 文書管理

- `README.md`: 利用者向け概要、導入、Deployボタン
- `AGENTS.md`: AIエージェント向け入口と必読文書、検証コマンド
- `CONTRIBUTING.md`: 人間・AI共通の開発手順とPR規約
- `SECURITY.md`: 非公開の脆弱性報告方法
- `docs/architecture/`: 現在の構成とデータフロー
- `docs/decisions/`: 採用・不採用を含む技術判断
- `docs/development/`: ローカル開発、テスト、DB変更手順
- `docs/operations/`: Cloudflare、Docker、バックアップ、更新手順
- `docs/product/`: 合意済みの機能・画面・用語

`AGENTS.md`は規則の複製先にせず、正本への短い案内にする。Payloadの`AGENTS.md`が`CLAUDE.md`へ誘導する構造と、Supabase JSの`AGENTS.md`が各正本文書を列挙する構造を参考にする。

## GitHub運用

### Issue

- バグ、機能提案、文書改善のIssue Formを分ける。
- 作成前に既存のOpen・Closed Issueを検索する。
- 実装計画の各Taskには、着手前に一つのGitHub Issueを作成する。
- Issue本文に設計書、実装計画、対象Task、完了条件、対象外を記載する。
- 着手、判断変更、検証結果、ブロッカーをIssueコメントとして随時記録する。
- バグには再現手順、期待結果、実際の結果、環境を必須にする。
- 機能提案には目的、利用者、完了条件、対象外を必須にする。
- セキュリティ問題は公開Issueへ投稿させず、`SECURITY.md`へ誘導する。
- 大きな機能は設計合意後に実装Issueへ分割する。

### Pull Request

- 一つのPRは一つの目的に限定し、関連Issueを記載する。
- 実装は`feature/issue-<番号>-<概要>`ブランチで行い、`develop`へPRを作成する。
- PR本文に`Refs #<番号>`を記載し、IssueとPRを相互に参照する。
- PR作成前に、Issueへ検証コマンドと結果をコメントする。
- 設計書、ADR、運用文書から関連IssueまたはPRを参照し、Issue・PRから変更文書を参照する。
- 変更内容、リスク、確認したシナリオ、未確認事項を記載する。
- 振る舞いの変更にはテストを追加し、文書も同じPRで更新する。
- 各Taskで利用可能な検証を通す。Cloudflare用とNode.js用のビルドをTask 7で導入するまでは、Task固有テストとその時点の`pnpm verify`を必須とする。導入後は両環境のビルドも必須とする。
- Task 8でCIを導入するまでは、ローカル検証のコマンドと結果をIssueとPRへ記録し、独立レビューをマージ条件とする。Task 8のruleset有効化前は自動Mergeを禁止する。導入後はrulesetで`required_approving_review_count: 1`、stale Approve無効化、branch最新化、CI必須化、`knryt`のbypass禁止を強制し、required指定の有無にかかわらずreview対象headのCIチェックが存在し、すべて成功していることを必須とする。チェック0件は成功扱いにしない。
- AIによる変更も独立レビューし、実行結果をPRへ残す。review対象rangeを`baseRefOid=<reviewed-base-sha>`と`headRefOid=<reviewed-head-sha>`で記録し、Approve・Merge直前に両方を確認する。変更時はbranch同期、検証、新しい独立レビューを要求する。規約の条件を満たす場合は`knryt`として自動Approve・自動Mergeできる。Approveは`gh api --method POST repos/<owner>/<repo>/pulls/<pr-number>/reviews -f event=APPROVE -f commit_id=<reviewed-head-sha> -f body='<review-summary>'`でreview済みcommitへ拘束し、返却`commit_id`を検証する。Mergeは`gh pr merge <pr-number> --merge --match-head-commit <reviewed-head-sha>`でmerge commit方式を固定し、review後のhead変更を原子的に拒否する。

### ラベル

初期のカスタムラベル9件として`type:bug`、`type:feature`、`type:docs`、`area:cloudflare`、`area:docker`、`area:filma`、`area:auth`、`status:needs-design`、`status:ready`を追加し、GitHub既定の`good first issue`を再利用する。新規Issueの種別分類には`type:*`を正本として使用する。ラベルは分類と着手可能性を示し、進捗の詳細はIssue本文とチェックリストで管理する。

## 最初の実装単位の完了条件

- ローカルNode.jsとCloudflare Workers向けにビルドできる。
- D1とSQLiteで同じ初期マイグレーションを適用できる。
- 最初の管理者を一度だけ登録できる。
- 管理者がログイン、ログアウト、プロフィール更新できる。
- Filma APIキーを暗号化保存し、接続確認できる。
- Deploy to CloudflareボタンとDocker導入手順がある。
- Issue Form、PRテンプレート、CI、開発・運用ガイドがある。
- テスト、型検査、lint、両環境のビルド、Workerサイズ確認がCIで実行される。

## 今回の対象外

- 動画アップロードとFilmaへの自動連携
- 動画メタデータ、公開期間、DRM設定
- 使い切り視聴コード
- エンドユーザー登録と視聴権一覧
- 動画再生とアクセス解析
- メール送信とパスワード再設定
- 複数管理者、組織、マルチテナント
- プラグイン機構と汎用CMSコレクションビルダー
- ライセンス本文の追加

これらは基盤完成後に、独立した設計・Issue・実装計画として扱う。ライセンス方式も実装開始前の独立した設計判断として記録する。

## IssueからPRまでの必須フロー

1. 対象TaskのIssueを作成し、設計書と実装計画へリンクする。
2. `develop`の最新状態から`feature/issue-<番号>-<概要>`を作成する。
3. Issueへ着手コメントと実装予定を記載する。
4. TDDで実装し、判断やブロッカーが生じた時点でIssueへ追記する。
5. Task固有のテストと`pnpm verify`を実行する。
6. Issueへ検証コマンド、成功・失敗件数、未確認事項をコメントする。
7. 文書へ関連Issue番号を記載し、コミットする。
8. `develop`向けPRを作成し、本文に`Refs #<番号>`、変更、リスク、確認結果、文書リンクを記載する。
9. 独立レビューと、そのTask時点で利用可能なマージゲートを完了してからマージする。Task 8でCIを導入するまでは記録済みのローカル検証を、導入後はCI成功も確認する。規約の条件を満たす場合は`knryt`として自動Approve・自動Mergeし、Issueへマージ済みPRをコメントして手動で閉じる。

IssueやPRの更新を省略した実装は完了扱いにしない。

## 参考にした運用

- Payload: コードと文書の同居、事前のIssue検索、機能実装前の設計相談、再現用テスト構成
- Supabase: 新機能の事前合意、IssueとPRの関連付け、明確なPR説明
- Directus: AGENTS.md、PRのリスク・テストシナリオ・レビュー事項
- GitHub: Issue Forms、PRテンプレート、Security Policy
