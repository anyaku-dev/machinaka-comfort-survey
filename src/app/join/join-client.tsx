"use client";
import dynamic from "next/dynamic";

// 参加トークンは URL フラグメントにありサーバーからは見えないため、ブラウザだけで描画する
const JoinApp = dynamic(() => import("./join-app"), { ssr: false, loading: () => <main className="mobile">読み込み中…</main> });

export default function JoinClient() {
  return <JoinApp />;
}
