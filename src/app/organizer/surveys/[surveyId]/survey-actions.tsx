"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api-client";

export default function SurveyActions({ surveyId, latestRoundId }: { surveyId: string; latestRoundId: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function newRound(copyFrom: string | null) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ roundId: string }>(`/api/surveys/${surveyId}/rounds`, "POST", { copyFrom });
      router.push(`/organizer/rounds/${r.roundId}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function deleteSurvey() {
    if (!confirm("この調査と全ての調査回・回答を削除します。元に戻せません。よろしいですか？")) return;
    setBusy(true);
    try {
      await api(`/api/surveys/${surveyId}`, "DELETE");
      router.push("/organizer");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="row" style={{ marginTop: "0.75rem" }}>
      {latestRoundId && (
        <button disabled={busy} onClick={() => newRound(latestRoundId)}>
          前回の設定・設問をコピーして新しい調査回
        </button>
      )}
      <button disabled={busy} onClick={() => newRound(null)}>
        標準設問で新しい調査回
      </button>
      <span className="grow" />
      <button className="btn-danger btn-small" disabled={busy} onClick={deleteSurvey}>
        調査を削除
      </button>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
