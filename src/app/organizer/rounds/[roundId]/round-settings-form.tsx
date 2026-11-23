"use client";
import { useState } from "react";
import { api } from "@/components/api-client";
import type { RoundRow } from "@/lib/server/rounds";

type Form = {
  title: string;
  scopeText: string;
  frontageScopeText: string;
  peripheralScopeText: string;
  surveyDate: string;
  isHoliday: boolean;
  startTime: string;
  endTime: string;
  isNight: boolean;
  eventName: string;
  stayMeasureMinutes: string;
  passMeasureMinutes: string;
  previousActions: string;
  notes: string;
  areaMeasured: string;
  areaTotal: string;
  lengthMeasured: string;
  roadwayWidth: string;
  sidewalkWidth: string;
  driveways: string;
};

const METRICS: [keyof Form, string, string][] = [
  ["areaMeasured", "計測範囲面積（㎡）［広場］", "plaza.areaMeasured"],
  ["areaTotal", "全体面積（㎡）［広場］", "plaza.areaTotal"],
  ["lengthMeasured", "計測範囲延長（m）［ストリート］", "street.lengthMeasured"],
  ["roadwayWidth", "車道の幅員（m）［ストリート］", "street.roadwayWidth"],
  ["sidewalkWidth", "歩道の幅員（m）［ストリート］", "street.sidewalkWidth"],
  ["driveways", "歩道を遮る車の出入り口数［ストリート］", "street.driveways"],
];

export default function RoundSettingsForm({ round, locked }: { round: RoundRow; locked: boolean }) {
  const m = round.siteMetrics ?? {};
  const [f, setF] = useState<Form>({
    title: round.title,
    scopeText: round.scopeText,
    frontageScopeText: round.frontageScopeText,
    peripheralScopeText: round.peripheralScopeText,
    surveyDate: round.surveyDate ?? "",
    isHoliday: round.isHoliday,
    startTime: round.startTime ?? "",
    endTime: round.endTime ?? "",
    isNight: round.isNight,
    eventName: round.eventName,
    stayMeasureMinutes: round.stayMeasureMinutes?.toString() ?? "",
    passMeasureMinutes: round.passMeasureMinutes?.toString() ?? "",
    previousActions: round.previousActions,
    notes: round.notes,
    ...(Object.fromEntries(METRICS.map(([k, , key]) => [k, m[key] === null || m[key] === undefined ? "" : String(m[key])])) as Pick<Form, "areaMeasured">),
  } as Form);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const siteMetrics: Record<string, number | null> = {};
      for (const [k, , key] of METRICS) siteMetrics[key] = num(f[k] as string);
      await api(`/api/rounds/${round.id}`, "PATCH", {
        title: f.title,
        scopeText: f.scopeText,
        frontageScopeText: f.frontageScopeText,
        peripheralScopeText: f.peripheralScopeText,
        surveyDate: f.surveyDate || null,
        isHoliday: f.isHoliday,
        startTime: f.startTime || null,
        endTime: f.endTime || null,
        isNight: f.isNight,
        eventName: f.eventName,
        stayMeasureMinutes: num(f.stayMeasureMinutes),
        passMeasureMinutes: num(f.passMeasureMinutes),
        previousActions: f.previousActions,
        notes: f.notes,
        siteMetrics,
      });
      setMsg({ kind: "ok", text: "保存しました。" });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const ta = (k: keyof Form, label: string, help?: string) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <textarea id={k} disabled={locked} maxLength={4000} value={f[k] as string} onChange={set(k)} />
      {help && <div className="muted small">{help}</div>}
    </div>
  );

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2 style={{ marginTop: 0 }}>調査回の設定{locked && <span className="badge badge-closed" style={{ marginLeft: 8 }}>開始後のため変更不可</span>}</h2>
      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="field">
          <label htmlFor="title">調査回の名称</label>
          <input id="title" type="text" maxLength={200} value={f.title} onChange={set("title")} />
        </div>
        <h3>調査範囲（文章で指定）</h3>
        <p className="muted small">地図の共有はアプリ外（紙の地図・オリエンテーション）で行います。調査者の画面には以下の文章が表示されます。</p>
        {ta("scopeText", "計測対象範囲", "例：○○通りの△△交差点から□□橋まで（両側歩道を含む）")}
        {ta("frontageScopeText", "空間の状態確認シートで計測する沿道建物・土地の範囲")}
        {ta("peripheralScopeText", "周辺エリアとする概ねの範囲（300m圏内が目安）", "空間Bの「※」項目はこの範囲も含めて確認します。")}
        <h3>日時</h3>
        <div className="row">
          <div className="field">
            <label htmlFor="surveyDate">調査日 *</label>
            <input id="surveyDate" type="date" value={f.surveyDate} onChange={set("surveyDate")} />
          </div>
          <label className="check">
            <input type="checkbox" checked={f.isHoliday} onChange={set("isHoliday")} /> 祝日
          </label>
          <div className="field">
            <label htmlFor="startTime">開始時刻</label>
            <input id="startTime" type="time" value={f.startTime} onChange={set("startTime")} />
          </div>
          <div className="field">
            <label htmlFor="endTime">終了時刻</label>
            <input id="endTime" type="time" value={f.endTime} onChange={set("endTime")} />
          </div>
          <label className="check">
            <input type="checkbox" checked={f.isNight} onChange={set("isNight")} /> 夜間に計測する
          </label>
        </div>
        <div className="field">
          <label htmlFor="eventName">イベント名（イベント等を行っている場合）</label>
          <input id="eventName" type="text" maxLength={200} value={f.eventName} onChange={set("eventName")} />
        </div>
        <h3>滞在者・通行者の計測時間</h3>
        <div className="row">
          <div className="field">
            <label htmlFor="stayMeasureMinutes">滞在者 計測時間（分）</label>
            <input id="stayMeasureMinutes" type="number" min={0.5} max={1440} step="any" value={f.stayMeasureMinutes} onChange={set("stayMeasureMinutes")} />
          </div>
          <div className="field">
            <label htmlFor="passMeasureMinutes">通行者 計測時間（分）</label>
            <input id="passMeasureMinutes" type="number" min={0.5} max={1440} step="any" value={f.passMeasureMinutes} onChange={set("passMeasureMinutes")} />
          </div>
        </div>
        <p className="muted small">計測時間が未設定の場合、1時間当たり人数は算出しません。</p>
        <h3>対象地の情報（わかる範囲で）</h3>
        <div className="row">
          {METRICS.map(([k, label]) => (
            <div className="field" key={k} style={{ minWidth: 220 }}>
              <label htmlFor={k}>{label}</label>
              <input id={k} type="number" step="any" value={f[k] as string} onChange={set(k)} />
            </div>
          ))}
        </div>
        {ta("previousActions", "前回からの主な取組（2回目以降）")}
        {ta("notes", "特記事項（主催者メモ）")}
      </fieldset>
      {msg && <div className={`alert ${msg.kind === "ok" ? "alert-ok" : "alert-error"}`}>{msg.text}</div>}
      {!locked && (
        <button className="btn-primary" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "保存中…" : "設定を保存"}
        </button>
      )}
    </form>
  );
}
