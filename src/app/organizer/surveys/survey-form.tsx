"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api-client";

export interface SurveyFormValue {
  name: string;
  purpose: string;
  organizerName: string;
  siteName: string;
  siteAddress: string;
  siteType: "street" | "plaza" | "other";
}

export default function SurveyForm({ surveyId, initial }: { surveyId?: string; initial?: SurveyFormValue }) {
  const router = useRouter();
  const [v, setV] = useState<SurveyFormValue>(
    initial ?? { name: "", purpose: "", organizerName: "", siteName: "", siteAddress: "", siteType: "street" },
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const set = (k: keyof SurveyFormValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (surveyId) {
        await api(`/api/surveys/${surveyId}`, "PATCH", v);
        setMsg({ kind: "ok", text: "保存しました。" });
      } else {
        const r = await api<{ roundId: string }>("/api/surveys", "POST", v);
        router.push(`/organizer/rounds/${r.roundId}`);
      router.refresh();
      }
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="name">調査名 *</label>
        <input id="name" type="text" required maxLength={200} value={v.name} onChange={set("name")} />
      </div>
      <div className="field">
        <label htmlFor="purpose">調査の目的</label>
        <textarea id="purpose" maxLength={4000} value={v.purpose} onChange={set("purpose")} />
      </div>
      <div className="field">
        <label htmlFor="organizerName">実施主体</label>
        <input id="organizerName" type="text" maxLength={200} value={v.organizerName} onChange={set("organizerName")} />
      </div>
      <div className="row">
        <div className="field grow">
          <label htmlFor="siteName">対象地名</label>
          <input id="siteName" type="text" maxLength={200} value={v.siteName} onChange={set("siteName")} />
        </div>
        <div className="field select-field">
          <label htmlFor="siteType">対象地の種類</label>
          <select id="siteType" value={v.siteType} onChange={set("siteType")}>
            <option value="street">ストリート</option>
            <option value="plaza">広場</option>
            <option value="other">その他</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="siteAddress">対象地所在地</label>
        <input id="siteAddress" type="text" maxLength={300} value={v.siteAddress} onChange={set("siteAddress")} />
      </div>
      <p className="muted small">
        対象地の種類は新しい調査回を作るときの設問の初期表示に使います（ストリート以外では空間B「回遊」24～31を初期状態で非表示）。
      </p>
      {msg && <div className={`alert ${msg.kind === "ok" ? "alert-ok" : "alert-error"}`}>{msg.text}</div>}
      <button className="btn-primary" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? "保存中…" : surveyId ? "保存" : "作成して調査回の設定へ"}
      </button>
    </form>
  );
}
