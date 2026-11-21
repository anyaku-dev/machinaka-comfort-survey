import Link from "next/link";

export default function Home() {
  return (
    <main className="narrow">
      <h1>まちなか居心地調査</h1>
      <div className="card stack">
        <p>
          国土交通省「まちなかの居心地の良さを測る指標（改訂版ver.1.1）」を用いた現地調査のためのWebアプリです。
        </p>
        <p className="muted">
          調査者の方は、主催者から配布されたQRコードをスマートフォンのカメラで読み取ってください。アプリのインストールは不要です。
        </p>
        <Link className="btn btn-primary" href="/organizer">
          主催者ログイン
        </Link>
      </div>
      <p className="muted small">
        本アプリは国土交通省の公式ツールではありません。集計値のうち公式分析ツール（Excel）との照合状況は各画面・CSVに表示しています。
      </p>
    </main>
  );
}
