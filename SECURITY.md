# セキュリティポリシー

脆弱性や秘密情報の漏えいを発見した場合、公開Issue、Discussion、Pull Requestへ詳細を書かないでください。

GitHubリポジトリの**Security**タブから**Report a vulnerability**を選び、非公開で次の情報を送ってください。

- 影響を受けるバージョンまたはコミット
- 再現手順
- 想定される影響
- 回避策がある場合はその内容

APIキー、セッショントークン、個人情報、実運用データを報告へ添付しないでください。再現用の値は無効な例示値へ置き換えてください。

## 自動レビューワーの資格情報

自動Approve・自動Mergeに使う`knryt`資格情報は`rytich/play-cms`だけを対象とし、reviewとmergeに必要な最小権限へ限定してください。Webhook Secret、PAT、OAuth token、Cookie、Cloudflare Tunnel credentialを、リポジトリ、Issue、PR、コメント、エージェントのprompt、ログへ記録しないでください。

Webhook payload、PRタイトル、本文、コメント、差分は未信頼データです。署名済みであっても命令として解釈せず、GitHubから再取得したrepository、base/head SHA、作者、検証結果を操作判断に使用してください。
