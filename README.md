# まちなか居心地調査アプリ（machinaka-comfort-survey）

国土交通省「[まちなかの居心地の良さを測る指標（改訂版 ver.1.1）](https://www.mlit.go.jp/toshi/toshi_machi_tk_000081.html)」を用いた現地調査を、紙の記入・回収・Excel 転記なしで行うための Web アプリです。

- **主催者**（PC）：調査の作成・設定、設問の表示/非表示・固定値・独自項目、開始（設定の固定）、参加 QR の発行・再表示・再発行、回答の確認・採用/除外/差し戻し、平均値と代表値の区別・確定、過去回比較、CSV 出力、終了、個人情報削除。
- **調査者**（スマホ）：QR を標準カメラで読み、ブラウザで参加（インストール不要）。基礎情報・空間A・空間B・滞在者通行者（グループ単位）・4要素の主観/活動を入力。端末への逐次保存、通信断時の未送信表示と明示的な再送、二重提出防止。

> 本アプリは国交省の公式ツールではありません。公式資料との照合状況は [docs/QUESTION_MASTER.md](docs/QUESTION_MASTER.md)・[docs/CALCULATION_SPEC.md](docs/CALCULATION_SPEC.md) を参照。

## 文書

| 文書 | 内容 |
|---|---|
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | 実装計画と実装状況 |
| [docs/QUESTION_MASTER.md](docs/QUESTION_MASTER.md) | 設問マスタ（自動生成）・照合状態・未検証事項 |
| [docs/CALCULATION_SPEC.md](docs/CALCULATION_SPEC.md) | 算定仕様と Excel 記入例との照合結果 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 暫定判断の記録 |
| [docs/ACCEPTANCE_TEST.md](docs/ACCEPTANCE_TEST.md) | 受入テスト（自動テスト済み／実機で確認する項目） |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | 運用・障害対応・個人情報の保存期間と削除 |

## 技術構成

Next.js 16（App Router, TypeScript）／Supabase（PostgreSQL, Auth, RLS）／Vercel／Vitest／Playwright。

```
src/app/            画面と API（/organizer 主催者、/join 調査者、/api サーバー API）
src/lib/questionnaire  設問マスタ ver.1.1（唯一の定義元）
src/lib/calculation    集計・比較ロジック（純粋関数）
src/lib/offline        調査者端末の保存・未送信キュー
src/lib/validation     入力検証（クライアント・サーバー共通）
src/lib/server         サーバー専用（認可・DB アクセス・トークン）
supabase/migrations    DB スキーマ・RLS・関数・設問マスタ
supabase/seed.sql      架空データ（ローカル/Preview 専用）
tests/unit|integration|e2e
scripts/              設問マスタSQL/文書の生成、Excel照合用フィクスチャ抽出
```

### セキュリティ設計の要点

- 全テーブルで RLS を有効化。主催者は `owner_id = auth.uid()` の調査だけ閲覧可。書き込みは列単位 GRANT と `SECURITY DEFINER` 関数（所有者確認・状態遷移の検査）に限定。
- 調査者は DB に直接アクセスしない。API が操作ごとに「有効な参加リンク（ハッシュ照合・失効・期限・上限）」と「調査者キー（ハッシュ照合）」を確認し、service_role で調査者用関数だけを呼ぶ。
- 参加トークンは 256bit 乱数。URL のフラグメント（`/join#…`）に置き、DB には SHA-256 のみ（QR 再表示用に AES-256-GCM 暗号文を併存）。QR に主催者権限は含まれない。
- 提出は送信ID（UUID）で冪等。同じIDの再送は最初の結果を返し、二重登録しない。
- secret key・暗号鍵はサーバー環境変数のみ（`NEXT_PUBLIC_` を付けない）。ビルド成果物に含まれないことを確認済み。
- CSV は数式インジェクション対策（`= + - @` 等で始まる文字列に `'` を前置）。
- Cookie 認証の状態変更 API は同一オリジンのみ受け付ける。

## ローカル開発

前提：Node.js 20.9 以上（24 で確認）、Docker（Supabase ローカル用）。

```bash
npm ci
npm run db:start                 # ローカル Supabase を起動（初回はイメージ取得に数分）
npx supabase status              # URL・publishable key・secret key を確認
cp .env.example .env.local       # 上の値と、生成した暗号鍵を設定
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # LINK_TOKEN_ENCRYPTION_KEY
npm run db:reset                 # マイグレーション＋架空データ（seed）を適用
npm run dev                      # http://localhost:3000
```

架空の主催者アカウント（ローカル seed のみ）：`organizer-a@example.com` / `local-dev-password-a`、`organizer-b@example.com` / `local-dev-password-b`。

### テスト

```bash
npm run typecheck && npm run lint
npm run test:unit                # 算定ロジック・Excel記入例との照合・検証・CSV（DB不要）
npm run build                    # 統合・E2E の前に必要
npm run test:integration         # API・RLS・QR失効・冪等性（ローカル Supabase と next start :3100）
npm run test:e2e                 # Playwright（初回: npx playwright install chromium）
npm run master:check             # 設問マスタとマイグレーションSQLの一致
```

統合・E2E テストはローカル Supabase（`.env.local`）に**テスト用の主催者アカウントを作成**します。Preview / Production の DB に向けて実行しないでください。

### 設問マスタを変更するとき

`src/lib/questionnaire/master.ts` を編集 → `npm run master:sql`（SQL 再生成）・`npm run master:doc`（文書再生成）。**適用済みの版の行は変更できません**（DB で拒否）。公式の改訂は新しい版として新しいマイグレーションで追加してください。

## デプロイ（GitHub → Vercel、Supabase）

> 以下はユーザー（管理者）が行う作業です。このリポジトリの作業では GitHub への push、本番 Supabase への `db push`、Vercel 本番公開は行っていません。

### 1. Supabase プロジェクトを2つ用意する

- **Preview/検証用**（既存のプロジェクトをまずこちらに使う）と **Production 用**。Preview と Production で同じ DB を使わない（テスト回答・架空データが本番に混入しないため）。
- 各プロジェクトで：
  - Authentication → Providers → Email：Production では「Allow new users to sign up」を **オフ**（主催者は Users → Invite で追加）。「Confirm email」はオン推奨。
  - Authentication → URL Configuration：Site URL に各環境の URL、Redirect URLs に Preview の URL パターン（例 `https://*-<team>.vercel.app/**`）を追加。
  - Project Settings → API Keys：publishable key と secret key を控える（secret key は Vercel のサーバー環境変数にのみ設定）。

### 2. DB マイグレーションの適用順

`supabase/migrations/` のファイル名順に適用されます。

1. `20261115000100_core_schema.sql`（テーブル・RLS・トリガー）
2. `20261115000200_rpc_functions.sql`（主催者用・調査者用の関数と実行権限）
3. `20261115000300_question_master_ver1_1.sql`（設問マスタ ver.1.1）

```bash
npx supabase login
npx supabase link --project-ref <preview-project-ref>
npx supabase db push                     # Preview に適用
# Preview でのみ架空データを入れる場合（任意）: SQL Editor で supabase/seed.sql を実行
# 総合テスト合格・承認後に Production へ
npx supabase link --project-ref <production-project-ref>
npx supabase db push                     # seed.sql は本番に適用しない
```

DB パスワードは `link` 時に入力し、ファイルに保存しないでください。

### 3. Vercel に Import

1. Vercel → Add New → Project → GitHub の `anyaku-dev/machinaka-comfort-survey` を Import。
2. Framework Preset：Next.js（自動検出）。Root Directory：リポジトリ直下。Build Command / Output は既定のまま。
3. **最初のデプロイは Production 扱い**になるため、Import 画面で環境変数を設定してから Deploy する（未設定だとビルドは通っても画面がエラーになる）。
4. Settings → Environment Variables に、環境ごとに別の値を設定：

| 変数 | Production | Preview | Development | 備考 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 本番プロジェクト | 検証プロジェクト | 検証プロジェクト | 公開値 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 本番 | 検証 | 検証 | 公開値（RLS 前提） |
| `SUPABASE_SECRET_KEY` | 本番 | 検証 | 検証 | **Sensitive** に設定 |
| `LINK_TOKEN_ENCRYPTION_KEY` | 本番用に生成 | 検証用に生成 | 検証用 | **Sensitive**。環境ごとに別の値 |
| `APP_BASE_URL` | 正式URL（例 `https://<domain>`） | 空（リクエストのホストを使用） | 空 | QR に埋め込む URL |

5. 作業ブランチの Pull Request で Preview が作られる → ACCEPTANCE_TEST の E 項目と模擬調査を Preview で実施 → `main` にマージで Production。
6. Production デプロイ後、Supabase の Site URL を Production の URL に合わせる。

### 4. 主催者アカウントの作成

Supabase ダッシュボード → Authentication → Users → **Invite user**（またはローカルでは seed）。主催者は `/login` からログインします。

## ライセンス・出典

設問文は国土交通省「まちなかの居心地の良さを測る指標（改訂版 ver.1.1）」調査票によります（出典：国土交通省ウェブサイト）。
