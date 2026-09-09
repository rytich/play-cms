# Filma playback contract

- 確認日: 2026-09-07
- Tracking: [GitHub Issue #16](https://github.com/rytich/play-cms/issues/16)
- Review: [GitHub PR #17](https://github.com/rytich/play-cms/pull/17)
- 設計: [P0プロトタイプ設計](../superpowers/specs/2026-09-07-p0-prototype-design.md)
- 計画: [P0 Task 2](../superpowers/plans/2026-09-07-p0-prototype-implementation.md#task-2-filmaの既存動画再生契約を4時間で確定する)
- 対象環境: 専用テスト組織用に設定済みのローカル認証情報。動画の作成・更新・削除なし。
- 結論: **NO-GO（現在のP0再生契約に対して）**。Filma全体の利用可否を否定する判定ではない。

## 確認した契約

公式公開資料のソース `moguracream/filma-docs` のmasterが、確認時点で `3ad90bdef3537d3a4e79177d7cd22dcb4b7550d5` であることをGitHub APIで確認した。以下はその版の仕様であり、今回の実API成功を示すものではない。

- 認証方式: `X-Api-Key`ヘッダーで `POST https://filma.biz/filmaapi/token`。`mediafile_id`による動画限定と、`jwt_expires_at`による絶対期限指定が記載されている。必要fieldは `token`、`expires_at`、`mediafile_id`。CMSではキーをクエリへ載せない。[トークン発行仕様](https://github.com/moguracream/filma-docs/blob/3ad90bdef3537d3a4e79177d7cd22dcb4b7550d5/api-spec/docs/04-endpoints.md#L25-L85)
- 動画存在確認・再生情報取得: `GET https://filma.biz/filmaapi/storage/{videoId}`。このpathのIDは**ファイルID**で、返却される `mediafile_id` と同一視しない。必要fieldは `url`、`mediafile_id`。`jwt_expires_at`を指定でき、省略時は現在時刻から1時間。既存動画1件の取得、成功・不存在・権限エラーの実status分類は今回未確認。[ファイル再生情報仕様](https://github.com/moguracream/filma-docs/blob/3ad90bdef3537d3a4e79177d7cd22dcb4b7550d5/api-spec/docs/04-endpoints.md#L409-L450)
- 有効期限: 絶対期限の指定方法は記載されている。一方、CMSの `notAfter = min(現在+5分, 動画公開終了)` を、返却情報および既発行情報の利用時に守れることは未確認。期限情報がない、または指定期限を超える場合は許可しない。
- domain制限: APIキー認証にはReferer/Originによる制限があるが、**JWT認証にはドメイン制限が適用されない**と明記されている。APIキー側の制限をJWT再生側の保証として扱わない。[認証仕様](https://github.com/moguracream/filma-docs/blob/3ad90bdef3537d3a4e79177d7cd22dcb4b7550d5/api-spec/docs/02-authentication.md#L127-L165)
- 更新後の期限: JWT更新APIの記載はあるが、CMS指定の絶対終了期限が更新後にも保持されるかは資料だけでは確定できない。実際に期限超過が可能だったとは判断していない。[更新仕様](https://github.com/moguracream/filma-docs/blob/3ad90bdef3537d3a4e79177d7cd22dcb4b7550d5/api-spec/docs/04-endpoints.md#L180-L195)

## 実行結果と制限

- 認証契約単体テスト: `pnpm exec vitest run tests/unit/filma-live-contract.test.ts`、15件成功。
- 実API認証テスト: 設定済みのGit管理外設定を読み込んで、`vitest.live.config.ts`を指定し1回だけ実行。2026-09-07 18:01 JST、約5秒で `FILMA_UNAVAILABLE`、1件失敗。記録されたログではHTTP statusは確認できない。この結果だけでキー無効・Filma障害・タイムアウト原因を断定しない。
- 既存の5秒上限、64 KiB上限、redirect拒否、自動再試行なしを変更していない。動画取得・ブラウザー再生・期限終了後のアクセス遮断は未実行。
- 保存禁止: APIキー、JWT、実組織ID・動画ID、再生URL、認証ヘッダー、レスポンス本文。公開文書にある能力とCMS要件の差だけを記録し、未確認の脆弱性を主張しない。

## 再開条件

P0のGO条件のうちdomain制限が公式仕様と一致せず、期限終了後の遮断も未確認のため、4時間の上限まで試行を繰り返さずNO-GOとした。Task 2の停止条件に従い、推測adapterとTasks 3〜6は開始しない。

Filma側へ確認する項目は次の3点に絞る。

1. JWTによる再生をCMSの許可ドメインに限定できる現行API・設定の有無。存在しない場合はP0要件の変更判断が必要。
2. 動画単位で指定した絶対期限が、既発行再生情報と更新後のトークンにも適用される保証と確認方法。
3. 専用テスト組織の既存動画1件で、認証・再生・期限後の拒否を確認できる接続条件。実IDやキーは非公開設定で扱う。

開発順序の代替案は2026-09-07に承認され、[管理機能の先行プロトタイプ](admin-first-prototype.md)として管理画面・動画登録・使い切りコード管理を先行した。NO-GOは変更せず、実動画公開は無効のままである。再開時は#16の三条件を再確認し、成立しない状態で閲覧キーを消費しない。
