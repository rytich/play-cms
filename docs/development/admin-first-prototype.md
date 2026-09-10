# 管理機能の先行プロトタイプ

Tracking: [Issue #18](https://github.com/rytich/play-cms/issues/18)、[Issue #45](https://github.com/rytich/play-cms/issues/45)

## 承認された進行順序

2026-09-07、ユーザーは実動画公開を無効にしたまま管理画面・動画登録・閲覧用キー管理を先行する案を承認した。「使い切りコード」はソースコードではなく閲覧用キーであり、発行総数を少数に制限しない。P0では一件ずつ必要な数を追加発行する。一括生成・CSV出力・再表示は追加しない。

この文書は[P0設計](../superpowers/specs/2026-09-07-p0-prototype-design.md)と[P0計画](../superpowers/plans/2026-09-07-p0-prototype-implementation.md)の先行実装に関する追補である。[再生契約の確認 Issue #16](https://github.com/rytich/play-cms/issues/16)のNO-GO自体は変更しない。

## 今回動かす範囲

- Cloudflare WorkerとローカルD1で、初期管理者一名の登録、ログイン、ログアウト。
- 動画の登録・編集・一覧。FilmaファイルID、タイトル、説明、公開／非公開（下書き）、任意の開始・終了日時を保存する。Filma存在確認済みとは扱わない。
- 閲覧用キーを一件ずつ追加発行する。16文字Crockford Base32の照合用hashと、管理者が一件だけ再表示するための暗号文を保存する。生キーは一覧へ含めない。
- 公開、閲覧、再生情報取得、キー消費はサーバーで拒否し、タイトルやキーを視聴者向けに返さない。公開を有効にする設定スイッチを設けない。

## 境界

今回のアプリは**localhost限定**。ローカルD1だけを使い、遠隔リソース作成・migration・デプロイは行わない。Workers Freeのpassword hash測定は試験公開前の必須ゲートとして残す。PBKDF2-HMAC-SHA-256は600,000 iterationsから弱めない。

2026-09-09承認の[Issue #30](https://github.com/rytich/play-cms/issues/30)（実BFCache復帰・実200%ブラウザ拡大）も公開前の必須ゲートとする。管理UIのPR #27から後続へ分離したもので、未確認を確認済みにはしない。Issue #30未完了でもローカル開発・コード統合は進められるが、外部公開・実配信は開始しない。検証のためにキャッシュ禁止・認証・秘密消去の防御を緩和しない。

APIキーの保存・接続設定、実Filma通信、視聴者認証・視聴権、キー消費、アップロード、サムネイル、通知は次の工程。DBは現時点で使用するテーブルだけを追加する。単純なSQLとprepared statementを使用し、この段階ではORM・schema検証用の依存を増やさない。

初期登録は256bit以上のランダムなローカルbootstrap tokenと管理者未作成・未使用状態を要求し、DB制約とtransactionで一件に限定する。パスワードはsalt付きハッシュ、sessionはSHA-256 hashだけ保存する。閲覧用キーは照合用SHA-256 hashに加え、再表示用AES-GCM暗号文とnonceを保存する。sessionは8時間、HttpOnly/Secure/SameSite=Lax cookieを使う。

新規設定する管理者パスワードはUnicode code pointで12文字以上、UTF-8で128バイト以下とし、UIとAPIで同じ検証を使う。ログイン入力は旧版で作成済みのhashとの互換性を保つため、UTF-8で12〜128バイトの値をhash照合へ渡すが、この互換条件を新規設定には使わない。PBKDF2-HMAC-SHA-256の600,000 iterationsは維持する。

状態変更は同一Origin、application/json、16KiB以下、余分なfield拒否。管理APIは毎回admin roleを検証する。共有D1 rate limitは初期登録5回/15分、login10回/client・5回/account/15分。localhostのみのclient bucketを使い、本番でのIP判定の代用にしない。管理者の書込は60回/分に制限するが、発行総数は制限しない。DB・暗号・構成エラーは秘密を含まない503とする。

閲覧用キーの発行結果はrequest開始時の動画IDへ結び付け、完了前に別動画へ移動した場合はその画面へ表示しない。再表示はadmin認証済みの単一POSTだけで復号し、応答を保存しない。旧行など暗号文を持たないキーは再表示できないが再発行できる。再発行は未使用・無効・取消済み・使用済みの各状態で行え、旧キーを再利用不能にして新しいキーを原子的に追加し、履歴と使用済み状態を残す。取消は未使用のキーだけを更新し、二度目の取消は対象なしとして扱う。管理HTMLはCSP `frame-ancestors 'none'`と`X-Frame-Options: DENY`をdev server、Worker、static assetの各経路で返す。

公開期間は開始・終了を独立して省略できる。開始未設定は過去側の制限なし、終了未設定は無期限とし、両方を指定した場合だけ開始より後の終了を要求する。`published`は表示期間だけでは公開せず、コード消費または既存視聴権を引き続き要求する。既存動画の編集画面には同一originの`/v/:publicId`リンクとURLコピーボタンを表示する。

## 実装チェックリスト

実装担当はユーザー指定に従い5.6 Sol一体へ集約する。6 Astra側は設計・進行管理だけを担当し、独立レビューは実装後に5.6系で順次行う。

- [ ] Worker/D1の起動とmigration、管理者認証、下書き・キー管理API
- [ ] 日本語の最小管理画面と再表示しないキー表示
- [ ] APIの負系と永続化、公開・消費が拒否されることのテスト
- [ ] ローカル操作確認、pnpm verify、PR、独立レビュー

Issue #18の一つの縦切りとして実装する。元計画Tasks 3/4全体の完了とは扱わない。再生確認・Free実測・試験公開の条件が満たされるまで、実際に視聴できるP0の完成とは報告しない。

## ローカル起動

gitignoredの`.dev.vars`へローカル専用のbootstrap token、rate-limit key、32-byteの16進`PLAY_ENCRYPTION_KEY`を設定し、`pnpm db:migrate:local`、`pnpm dev`の順に実行する。暗号鍵が未設定・不正・変更済みの場合、キー発行・再表示・再発行は秘密を出さず503で閉じる。開発サーバーのhostはIPv4 loopbackの`127.0.0.1`へ固定し、`0.0.0.0`やLANへ公開しない。起動後はViteが表示したLocal URL（通常は`http://127.0.0.1:5173/`）を開く。

[Issue #19](https://github.com/rytich/play-cms/issues/19)では、`server.host: "localhost"`が環境によりIPv6 loopbackだけで待受し、IPv4を使うアプリ内ブラウザから接続できないことを確認した。`127.0.0.1`の明示後、待受がIPv4 loopbackだけになり、`http://localhost:5173/`と`http://127.0.0.1:5173/`の両方でHTTP 200を確認した。

## 安全な検証

通常のWorkerテストは`tests/worker/fixtures/wrangler.test.jsonc`と合成bindingだけを使う。`pnpm verify`の検証buildも同じ設定を使い、rootの`.dev.vars`と`.wrangler/state`を読み込まない。実際の秘密分離を確認するときは、OSの一時ディレクトリへリポジトリを複製し、そのfixtureのrootに合成sentinelだけを置いてWorkerテストを実行する。実worktreeの`.dev.vars`へsentinelを追記しない。

frame拒否headerの実HTTP確認は、データ入りの5173番を使わず、一時fixtureを別のIPv4 loopback portでdev起動・build・previewする。`/`、`/admin/login`、`/index.html`、未知のSPA fallbackについて、`Content-Security-Policy: frame-ancestors 'none'`と`X-Frame-Options: DENY`を確認する。
