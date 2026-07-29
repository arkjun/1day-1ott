# 1日 1OTT

[English](./README.md) · [한국어](./README_ko.md) · [日本語](./README_ja.md)

映画、ドラマ、バラエティ、アニメ、YouTubeなど、毎日観たコンテンツを記録し、GitHubのコントリビューショングラフのように可視化するWebサービスです。

- サービス: [https://1day1ott.com](https://1day1ott.com)
- ソースコード: [MIT License](./LICENSE)
- ポリシー: [プライバシーポリシー](https://1day1ott.com/privacy?lang=ja) · [利用規約](https://1day1ott.com/terms?lang=ja)（韓国語原本: [PRIVACY.md](./PRIVACY.md) · [TERMS.md](./TERMS.md)）

## 主な機能

- 日付、コンテンツ種類、リアクション、短い感想、視聴プラットフォームを記録
- 年間アクティビティ、連続記録、月別・種類別の統計
- TMDB検索とYouTube URLからの情報取得
- 公開範囲をユーザーが選べる共有プロフィール
- メールアドレス・パスワードおよびPasskey認証
- 韓国語・英語・日本語とライト・ダークテーマ
- Markdown形式での記録のインポート・エクスポート

## 技術構成

このリポジトリは、pnpm workspaceを使用したTypeScriptモノレポです。

```text
apps/web         React 19 + Viteフロントエンド
apps/api         Hono、Better Auth、Drizzleを使用するCloudflare Worker
packages/shared  Zodスキーマ、共有型、純粋なユーティリティ
docs             機能仕様書と実装計画
```

本番環境では、1つのCloudflare Workerが`/api/*`リクエストを処理し、Viteのビルド成果物も配信します。データはCloudflare D1に保存します。ローカル環境では、Viteが`/api`リクエストを`wrangler dev`へプロキシします。

## 必要環境

- Node.js 24
- pnpm 10.33.0

pnpmのバージョンは、ルート`package.json`の`packageManager`フィールドに固定されています。

## ローカル開発

依存関係をインストールし、ローカル環境ファイルを準備します。

```bash
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
openssl rand -base64 32
```

最後のコマンドの出力を`apps/api/.dev.vars`の`BETTER_AUTH_SECRET`に設定します。TMDB検索を利用する場合は`TMDB_API_TOKEN`も設定してください。`.dev.vars`はGitの管理対象外であり、コミットしてはいけません。

コミット済みのマイグレーションをローカルD1に適用します。

```bash
pnpm db:migrate:local
```

APIとWebアプリを別々のターミナルで起動します。

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

- Web: `http://localhost:5173`
- API: `http://localhost:8787`
- ヘルスチェック: `http://localhost:8787/health`

## 検証

```bash
pnpm test
pnpm typecheck
pnpm --filter @1ott/web build
```

APIテストは、`workerd`内の分離された実際のD1ストレージ上で実行されます。

## データベースの変更

Drizzleスキーマを変更した場合にのみ、新しいマイグレーションを生成してローカルで検証します。

```bash
pnpm db:generate
pnpm db:migrate:local
```

生成された`apps/api/migrations`配下のファイルは、ソースコードの変更と一緒にコミットします。

## Cloudflareへのデプロイ

WranglerでCloudflareにログインし、D1データベースを作成します。

```bash
pnpm --filter @1ott/api exec wrangler login
pnpm --filter @1ott/api exec wrangler d1 create 1ott-db
```

出力された`database_id`を`apps/api/wrangler.jsonc`に反映し、本番用secretを登録します。

```bash
pnpm --filter @1ott/api exec wrangler secret put BETTER_AUTH_SECRET
pnpm --filter @1ott/api exec wrangler secret put TMDB_API_TOKEN
pnpm --filter @1ott/api db:migrate:remote
pnpm run deploy
```

GitHub Actionsからデプロイする場合は、次のリポジトリsecretを設定します。

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

カスタムドメイン、`BETTER_AUTH_URL`、`WEB_ORIGIN`、D1 bindingは、デプロイ環境に合わせて`apps/api/wrangler.jsonc`で変更してください。`main`へのpushでは、CI成功後にD1マイグレーションと本番デプロイが実行されます。

## 外部サービス

- コンテンツ検索・詳細情報: [TMDB](https://www.themoviedb.org/)
- YouTube URL情報: [YouTube oEmbed](https://oembed.com/)
- 実行環境・データベース: [Cloudflare Workers](https://workers.cloudflare.com/) · [D1](https://developers.cloudflare.com/d1/)

本サービスはTMDBおよびTMDB APIを使用していますが、TMDBによる保証、認証、承認を受けたサービスではありません。

## コントリビューション

変更を始める前に[AGENTS.md](./AGENTS.md)を確認し、変更後にテストと型チェックを実行してください。不具合や機能提案はGitHub Issuesで受け付けています。セキュリティ脆弱性やプライバシーに関する問題は、公開Issueではなく`support@1day1ott.com`へご連絡ください。

すべてのコントリビューターは[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)に従う必要があります。

## ライセンス

このプロジェクトは[MIT License](./LICENSE)で公開されています。
