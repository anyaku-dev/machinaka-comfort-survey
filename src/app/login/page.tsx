import LoginForm from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/organizer") ? next : "/organizer";
  return (
    <main className="narrow">
      <h1>主催者ログイン</h1>
      <LoginForm next={safeNext} />
      <p className="muted small">
        主催者アカウントは管理者が Supabase で発行します（README「主催者アカウントの作成」）。調査者はログイン不要です。
      </p>
    </main>
  );
}
