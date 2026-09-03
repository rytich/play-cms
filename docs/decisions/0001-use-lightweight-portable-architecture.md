# ADR 0001: 軽量で移植可能な構成を採用する

- 状態: 採用
- 決定日: 2026-09-03

## 背景

play-cms は、Filmaと連携する小規模な動画CMSとして、Cloudflareを推奨環境にしつつ、国内の低価格なNode.js対応サーバーでも動作させる。Cloudflareでは可能な限り無料枠で運用でき、公開リポジトリから「Deploy to Cloudflare」で導入できることを重視する。

当初は、管理画面、認証、コレクション管理を備えるPayload CMSの活用を検討した。

## PayloadでCloudflare Paidが必要になる理由

Payload公式のCloudflare D1テンプレートは、生成されるWorkerがWorkers Freeの圧縮後3 MBのスクリプトサイズ上限を超えるため、現時点ではPaid Workersでのみデプロイ可能と明記している。

主な要因は、Payload本体だけではなく、管理画面とHTTP層を担うNext.js、React Server Components、OpenNextのCloudflareアダプター、PayloadのD1・R2アダプターを一つのWorkerとして構成する点にある。D1やR2の利用量が少なくても、デプロイ成果物のサイズ制限は別に適用されるため、無料枠には収まらない。

公式テンプレートは次の構成を使用している。

- Next.jsとPayloadによる管理画面・API
- `@opennextjs/cloudflare`によるWorkers向けビルド
- `@payloadcms/db-d1-sqlite`によるD1接続
- `@payloadcms/storage-r2`によるR2接続
- Worker、D1、R2を定義する`wrangler.jsonc`

Payloadをフォークして不要機能を削除する案は、上流更新への追従、セキュリティ修正の取り込み、Cloudflare固有ビルドの継続検証に大きな保守コストがかかる。今回必要な機能は限定されているため、そのコストに見合わない。

## 決定

次の構成を採用する。

- HTTP/API: Hono
- 管理画面・視聴画面: ReactとVite
- DBアクセス: Drizzle ORM
- Cloudflare: Workers、D1、R2
- 国内サーバー: Node.js、SQLite、ローカルファイルストレージ
- 配布: Deploy to CloudflareボタンとDockerイメージ

ドメインロジックをCloudflareやSQLiteから分離し、実行環境ごとの差異をアダプターに閉じ込める。Cloudflare向け成果物を小さく保ち、Workers Freeでの利用を設計目標とする。

## 影響

### 利点

- Payload公式構成より小さいWorkerを構築できる。
- 同じ業務ロジックをCloudflareとNode.jsで共有できる。
- 今回不要な汎用CMS機能を実装・保守せずに済む。
- Filma連携と視聴権管理に絞ったUIを提供できる。

### 欠点

- 管理画面、認証、アクセス制御を独自に実装する必要がある。
- Payloadのプラグインや管理UIを利用できない。
- Workers Freeの各種上限は継続的に計測し、公式仕様の変更も追跡する必要がある。

## 参考資料

- [Payload Cloudflare D1 template](https://github.com/payloadcms/payload/tree/main/templates/with-cloudflare-d1)
- [Payload Cloudflare template wrangler.jsonc](https://github.com/payloadcms/payload/blob/main/templates/with-cloudflare-d1/wrangler.jsonc)
- [Payload Cloudflare template package.json](https://github.com/payloadcms/payload/blob/main/templates/with-cloudflare-d1/package.json)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
