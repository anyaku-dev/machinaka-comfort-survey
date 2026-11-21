"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api-client";

export default function ReviewActions({
  submissionId,
  status,
  roundActive,
  observationsIncluded,
}: {
  submissionId: string;
  status: string;
  roundActive: boolean;
  observationsIncluded: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(action: "accept" | "exclude" | "return") {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/submissions/${submissionId}/review`, "POST", { action, note });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleObs() {
    setBusy(true);
    try {
      await api(`/api/submissions/${submissionId}/observations`, "POST", { included: !observationsIncluded });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (status === "draft" || status === "returned") return null;
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="review-note">コメント（差し戻し時は必須。調査者に表示されます）</label>
        <textarea id="review-note" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="row">
        {status !== "accepted" && (
          <button className="btn-primary" disabled={busy} onClick={() => act("accept")} data-testid="accept">
            採用
          </button>
        )}
        {status !== "excluded" && (
          <button disabled={busy} onClick={() => act("exclude")} data-testid="exclude">
            除外
          </button>
        )}
        {roundActive && (
          <button disabled={busy} onClick={() => act("return")} data-testid="return">
            差し戻し
          </button>
        )}
        <span className="grow" />
        <button className="btn-small" disabled={busy} onClick={toggleObs}>
          滞在者・通行者を人数集計に{observationsIncluded ? "含めない" : "含める"}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
