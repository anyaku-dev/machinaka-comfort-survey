"use client";
import dynamic from "next/dynamic";
import { LoadingIndicator } from "@/components/loading-indicator";

// 参加トークンは URL フラグメントにありサーバーからは見えないため、ブラウザだけで描画する
const JoinApp = dynamic(() => import("./join-app"), { ssr: false, loading: () => <main className="mobile"><LoadingIndicator label="調査を準備しています…" /></main> });

export default function JoinClient() {
  return <JoinApp />;
}
