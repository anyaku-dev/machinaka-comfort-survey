import LoginForm from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/organizer") ? next : "/organizer";
  return (
    <main className="narrow auth-shell">
      <span className="eyebrow">ORGANIZER ACCESS</span>
      <h1>主催者ログイン</h1>
      <p className="page-intro">調査の作成と管理を始めましょう。</p>
      <LoginForm next={safeNext} />
      <p className="muted small">
        ログインできない場合は、主催者アカウントの管理者にお問い合わせください。調査者はログイン不要です。
      </p>
    </main>
  );
}
