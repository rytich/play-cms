# 使い切り視聴フロー

[Issue #35](https://github.com/rytich/play-cms/issues/35)・[PR #42](https://github.com/rytich/play-cms/pull/42)で、使い切りコードから匿名視聴、視聴者アカウントへの視聴権移行までを縦に接続した。一般公開と実Filma再生のGO判定はこの実装に含まない。

## 画面とAPI

- `/admin/filma`: Filma APIキーの接続確認と暗号化保存。保存後は接続状態だけを表示し、キーは再表示しない。
- `/v/:publicId`: 視聴権がない間はコード入力だけを表示する。引換成功後だけ動画情報と有効期限付き再生情報を表示する。
- `POST /api/public/videos/:publicId/redeem`: 未ログイン時は30分の匿名session、viewer時は視聴権を作成する。
- `GET /api/public/videos/:publicId/playback`: 有効な匿名sessionとその引換対象だけを許可する。
- `GET /api/viewer/videos/:publicId/playback`: ログイン中viewerの視聴権だけを許可する。

`/register?returnTo=/v/:publicId`と`/login?returnTo=/v/:publicId`は、検証済みの同一サイト視聴URLだけを戻り先にできる。コード、再生URL、視聴者IDはURLやbrowser storageへ保存しない。

再生成功時は、サーバー側で固定originと期限を検証した短時間・動画限定のFilma player URLだけをiframeの`src`に設定する。play-cms独自のHTML5 video要素は使わず、Filma APIキーをブラウザーへ返さない。CSPの`frame-src`は`https://filma.biz`だけを許可し、`frame-ancestors 'none'`によるplay-cms画面自体の埋め込み拒否は維持する。

## 原子性と非公開境界

引換は、公開中の期間内動画、有効・未使用コード、P0フラグと専用FilmaファイルIDの完全一致を確認する。Filma grantを検証できた後、D1 batch内で同じ条件を再確認して一件だけ消費する。Filma失敗、フラグ無効、allowlist不一致、不正または5分を超えるgrantでは、redemptionも視聴権も作らずコードを未使用のまま残す。

動画の開始・終了は独立して省略できる。開始未設定は過去側の制限なし、終了未設定は無期限として、引換、匿名再生、viewer再生、libraryのすべてで同じ判定を使う。終了未設定でもplayback grant自体は発行時刻から最大5分に制限する。公開状態だけで視聴権を作らず、有効なキーまたは既存entitlementを必ず要求する。

匿名Cookieは`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1800`とし、トークン本体ではなくhashだけをD1に保存する。登録またはログイン時に有効な匿名視聴権を同一transactionで一度だけviewerへ移し、元の匿名sessionを失効させる。管理一覧の使用済みキーは選択・有効化・無効化・取消の対象にできない。

## 検証

通常のunit/Workerテストは合成bindingと隔離D1だけを使う。実Filma APIに接続しない。補助ブラウザ受入はbuild済みUIを一時loopback serverで配信し、別browser contextと合成API応答で、direct open、reload、back/forward、匿名から登録、再ログイン後library、別browserでの再利用拒否、使用済み管理行を確認する。後者はD1試験の代用ではない。

```bash
pnpm vitest run tests/unit/viewing.test.ts tests/unit/filma-playback-client.test.ts
pnpm vitest run --config vitest.worker.config.ts tests/worker/viewing-flow.test.ts tests/worker/viewing-migration.test.ts tests/worker/admin-management.test.ts
pnpm exec playwright install chromium
pnpm test:browser:viewing
```

CIでは固定版PlaywrightのChromiumだけを導入し、同じbrowser受入を必須`verify` jobで実行する。既存の外部runtimeを使う場合は、`PLAYWRIGHT_MODULE_PATH=/path/to/playwright`と`PLAYWRIGHT_CHROME_PATH=/path/to/chrome`を指定する経路も維持する。

`pnpm test:filma:playback:live`は通常の`pnpm verify`に含めない手動契約テストである。この明示コマンドだけがGit管理外の`.dev.vars`を読み込むため、`.dev.vars.example`をコピーして専用テスト値を設定するか、同じ変数をprocess environmentへexportする。通常の`pnpm verify`は`.dev.vars`を読み込まない。専用テスト組織の`FILMA_LIVE_API_KEY`、`FILMA_LIVE_FILE_ID`、`FILMA_LIVE_NOT_FOUND_FILE_ID`、`FILMA_LIVE_INVALID_API_KEY`、`FILMA_LIVE_ALLOWED_ORIGIN`、`FILMA_LIVE_DENIED_ORIGIN`がすべて必要で、どれかがない場合はrequest前に`FILMA_LIVE_CONFIG_MISSING`で停止する。実行時はstorageの200/404/401/403と200 schema、返却URL内JWTの動画・期限、許可／拒否origin、期限後の同じgrantと`POST /filmaapi/token/refresh`を確認する。ログはstatus、真偽値、`all-conditions-passed`／`contract-denied`／`test-infrastructure-error`の分類だけとし、値、JWT、URL、response本文を出さない。

合成Worker境界試験では、grant失敗時のredemption・entitlementが0件でコード状態が不変であること、既存メールへの登録失敗時に匿名権利が残ること、draft・公開前・終了時刻ちょうど・期限切れ・不明IDをpublic page、redeem、anonymous playback、library、viewer playbackで確認する。補助ブラウザ試験は`/admin/filma`のdirect openに加えてreloadとback/forward復元も確認する。

## 未確認と停止条件

- 実Filma storage endpointの200/401/403/404 schemaとstatus、動画単位のgrant、5分以下の期限、拒否origin、期限後grant/refreshは未確認。実値を持つ手動live testが三分類のいずれかを記録するまではGOにしない。
- 実storage契約が確定するまで、動画保存前のlive確認を製品の作成・更新APIへ接続しない。
- `PLAY_CMS_P0_INVITE_PLAYBACK` は既定無効。実契約を確認できない間は、招待試験でも有効化せずコードを消費しない。
- remote D1、Cloudflare招待環境、実動画の保存・再生・deployは後続Taskの対象。
