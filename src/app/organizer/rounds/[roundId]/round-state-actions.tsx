"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api-client";

export default function RoundStateActions({ roundId, status, surveyId }: { roundId: string; status: string; surveyId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, after: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="row">
        {status === "draft" && (
          <button
            className="btn-primary"
            disabled={busy}
            data-testid="start-round"
            onClick={() => {
              if (!confirm("調査を開始します。開始後は設定・設問を変更できません（設定は固定されます）。よろしいですか？")) return;
              run(() => api(`/api/rounds/${roundId}/start`, "POST"), () => router.push(`/organizer/rounds/${roundId}/link`));
            }}
          >
            調査を開始（設定を固定）
          </button>
        )}
        {status === "active" && (
          <button
            className="btn-danger"
            disabled={busy}
            data-testid="close-round"
            onClick={() => {
              if (!confirm("調査を終了します。参加リンクは失効し、以後の提出は受け付けません。よろしいですか？")) return;
              run(() => api(`/api/rounds/${roundId}/close`, "POST"), () => router.refresh());
            }}
          >
            調査を終了
          </button>
        )}
        {status === "closed" && (
          <button
            disabled={busy}
            onClick={() => {
              if (!confirm("この調査回の調査者の氏名・所属・年代・性別を削除（匿名化）します。回答は残ります。元に戻せません。")) return;
              run(() => api(`/api/rounds/${roundId}/purge`, "POST"), () => router.refresh());
            }}
          >
            調査者の個人情報を削除
          </button>
        )}
        {status !== "active" && (
          <button
            className="btn-danger btn-small"
            disabled={busy}
            onClick={() => {
              if (!confirm("この調査回と全ての回答を削除します。元に戻せません。よろしいですか？")) return;
              run(() => api(`/api/rounds/${roundId}`, "DELETE"), () => router.push(`/organizer/surveys/${surveyId}`));
            }}
          >
            調査回を削除
          </button>
        )}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
