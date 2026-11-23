"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api-client";
import { LoadingIndicator } from "@/components/loading-indicator";
import { fmtDateTime } from "@/components/status";

interface Link {
  id: string;
  url: string;
  qr: string;
  createdAt?: string;
  expiresAt: string;
  expired: boolean;
  maxSubmissions: number;
  maxRegistrations: number;
}

const REVOKE_REASON: Record<string, string> = { reissued: "再発行により失効", manual: "手動で失効", round_closed: "調査終了により失効" };

export default function LinkPanel({
  roundId,
  status,
  history,
}: {
  roundId: string;
  status: string;
  history: { id: string; created_at: string; expires_at: string; revoked_at: string | null; revoked_reason: string | null }[];
}) {
  const router = useRouter();
  const [link, setLink] = useState<Link | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pendingAction, setPendingAction] = useState<"issue" | "revoke" | null>(null);
  const [hours, setHours] = useState(24 * 14);

  useEffect(() => {
    let current = true;
    api<{ link: Link | null }>(`/api/rounds/${roundId}/link`)
      .then((r) => { if (current) { setLink(r.link); setLookupFailed(false); } })
      .catch((e) => { if (current) { setError(e.message); setLookupFailed(true); } })
      .finally(() => { if (current) setLoaded(true); });
    return () => { current = false; };
  }, [roundId, loadAttempt]);

  function retryLoad() {
    setLoaded(false);
    setError(null);
    setLoadAttempt((n) => n + 1);
  }

  async function issue() {
    if (link && !confirm("参加リンクを再発行します。配布済みのQRコード・URLは使えなくなります（入力途中の調査者も新しいQRで入り直す必要があります）。よろしいですか？")) return;
    setPendingAction("issue");
    setError(null);
    try {
      const r = await api<{ link: Link }>(`/api/rounds/${roundId}/link`, "POST", { expiresInHours: hours });
      setLink(r.link);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingAction(null);
    }
  }
  async function revoke() {
    if (!confirm("参加リンクを失効させます。よろしいですか？")) return;
    setPendingAction("revoke");
    setError(null);
    try {
      await api(`/api/rounds/${roundId}/link`, "DELETE");
      setLink(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingAction(null);
    }
  }

  if (status === "draft") return <div className="alert alert-info">調査を開始すると参加用QRコードを発行できます（「概要・設定」タブの「調査を開始」）。</div>;

  return (
    <div className="stack">
      {status === "closed" && <div className="alert alert-info">調査は終了しています。参加リンクは失効しています。</div>}
      {!loaded && <div className="card"><LoadingIndicator label="参加QRの状態を確認しています…" /></div>}
      {loaded && link && (
        <div className="card" style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={link.qr} alt="参加用QRコード" width={320} height={320} style={{ maxWidth: "100%", height: "auto" }} />
          <p className="mono" data-testid="join-url">
            {link.url}
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn-small" onClick={() => navigator.clipboard.writeText(link.url)}>
              URLをコピー
            </button>
            <button className="btn-small" onClick={() => window.print()}>
              印刷
            </button>
          </div>
          <p className="small">
            有効期限：{fmtDateTime(link.expiresAt)} {link.expired && <span className="badge badge-danger">期限切れ</span>}
            ／ 提出上限 {link.maxSubmissions} 件 ／ 参加登録上限 {link.maxRegistrations} 名
          </p>
          <p className="muted small no-print">
            このQRコードには参加用のランダムな鍵だけが含まれ、主催者の権限は含まれません。調査者以外に共有しないでください。
          </p>
        </div>
      )}
      {loaded && !link && !lookupFailed && status === "active" && <div className="alert alert-warn">有効な参加リンクがありません。発行してください。</div>}
      {status === "active" && (
        <div className="card row no-print">
          <label htmlFor="hours" className="small">
            有効期限
          </label>
          <select id="hours" value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ maxWidth: 200 }}>
            <option value={12}>12時間</option>
            <option value={24}>1日</option>
            <option value={24 * 3}>3日</option>
            <option value={24 * 14}>14日</option>
            <option value={24 * 30}>30日</option>
          </select>
          <button className="btn-primary" disabled={pendingAction !== null || !loaded || lookupFailed} onClick={issue} data-testid="issue-link">
            {pendingAction === "issue" ? <><span className="loading-spinner button-spinner" aria-hidden="true" />発行中…</> : link ? "再発行（旧リンクを失効）" : "参加QRを発行"}
          </button>
          {link && (
            <button className="btn-danger btn-small" disabled={pendingAction !== null} onClick={revoke}>
              {pendingAction === "revoke" ? "失効中…" : "失効させる"}
            </button>
          )}
        </div>
      )}
      {error && <div className="alert alert-error" role="alert">{error} {lookupFailed && <button className="btn-small" onClick={retryLoad}>再読み込み</button>}</div>}
      <div className="card no-print">
        <h3 style={{ marginTop: 0 }}>発行履歴</h3>
        <table>
          <thead>
            <tr>
              <th>発行</th>
              <th>有効期限</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{fmtDateTime(h.created_at)}</td>
                <td>{fmtDateTime(h.expires_at)}</td>
                <td>{h.revoked_at ? `${REVOKE_REASON[h.revoked_reason ?? ""] ?? "失効"}（${fmtDateTime(h.revoked_at)}）` : "有効"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
