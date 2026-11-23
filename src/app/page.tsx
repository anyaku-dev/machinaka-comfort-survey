import Link from "next/link";

export default function Home() {
  return (
    <main className="home-shell">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">ま</span>
          <span className="brand-name">まちなか居心地調査</span>
        </div>
        <span className="home-header-note">現地調査ツール</span>
      </header>
      <div className="home-grid">
        <section className="hero">
          <span className="eyebrow">まちの居心地を測る</span>
          <h1>まちなかの居心地を、<br />確かな記録に。</h1>
          <p>国土交通省「まちなかの居心地の良さを測る指標（改訂版ver.1.1）」を用いた現地調査を、スマートフォンから進められます。</p>
          <Link className="btn btn-primary" href="/organizer">主催者ログイン <span aria-hidden="true">→</span></Link>
        </section>
        <aside className="home-side">
          <section className="home-info">
            <span className="eyebrow">調査者の方へ</span>
            <h2>QRコードから参加</h2>
            <p>主催者から配布されたQRコードをスマートフォンで読み取ってください。アプリのインストールやログインは不要です。</p>
          </section>
          <div className="home-note"><span className="home-note-line" aria-hidden="true" />現地で入力し、途中の回答は端末に保存できます。</div>
        </aside>
      </div>
      <p className="home-legal muted small">
        本アプリは国土交通省の公式ツールではありません。集計値のうち公式分析ツール（Excel）との照合状況は各画面・CSVに表示しています。
      </p>
    </main>
  );
}
