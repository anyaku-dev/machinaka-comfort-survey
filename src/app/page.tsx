import Link from "next/link";

export default function Home() {
  return (
    <main className="narrow">
      <div className="brand" style={{ marginBottom: 32 }}>
        <span className="brand-mark" aria-hidden="true">✦</span>
        <span className="brand-name">まちなか居心地調査</span>
      </div>
      <section className="hero stack">
        <span className="eyebrow">まちを見つめる、調査のためのアプリ</span>
        <h1>まちなかの居心地を、<br />一つひとつ記録する。</h1>
        <p>国土交通省「まちなかの居心地の良さを測る指標（改訂版ver.1.1）」を用いた現地調査を、スマートフォンから進められます。</p>
        <Link className="btn btn-primary" href="/organizer">主催者ログイン →</Link>
      </section>
      <section className="card stack" style={{ marginTop: 20 }}>
        <span className="eyebrow">調査者の方へ</span>
        <h2>QRコードから参加できます</h2>
        <p className="muted">主催者から配布されたQRコードをスマートフォンのカメラで読み取ってください。アプリのインストールやログインは不要です。</p>
      </section>
      <p className="muted small" style={{ marginTop: 20 }}>
        本アプリは国土交通省の公式ツールではありません。集計値のうち公式分析ツール（Excel）との照合状況は各画面・CSVに表示しています。
      </p>
    </main>
  );
}
