"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "@/components/api-client";
import { fmt, VerificationBadge } from "@/components/status";
import type { QuestionAggregate, RoundAggregate } from "@/lib/calculation/aggregate";
import type { Indicator } from "@/lib/calculation/types";
import { ELEMENT_LABELS, SECTION_LABELS, SECTION_ORDER } from "@/lib/questionnaire/master";

type RepEdit = { state: "value" | "not_applicable" | "no_data" | ""; value: string; note: string };
const STATE_SHORT: Record<string, string> = { unanswered: "未", not_applicable: "適用外", hidden: "非表示", missing: "—" };
const STATUS_LABEL: Record<string, string> = { excel_verified: "Excel照合済", app_calculated: "アプリ算出値", unverified: "未検証" };

function IndicatorTable({ list, title }: { list: Indicator[]; title: string }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>指標</th>
              <th className="num">値</th>
              <th>単位</th>
              <th>式・根拠</th>
              <th>検証</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.key} data-key={i.key}>
                <td>{i.label}</td>
                <td className="num" data-testid={`ind-${i.key}`}>
                  {i.value === null ? <span className="muted">算出せず</span> : i.unit === "割合" ? `${(i.value * 100).toFixed(1)}%` : fmt(i.value, 1)}
                </td>
                <td>{i.unit}</td>
                <td className="small">
                  {i.formula}
                  <div className="muted">{i.missingReason ?? i.basis}</div>
                </td>
                <td>
                  <span className={`badge ${i.status === "excel_verified" ? "badge-active" : i.status === "unverified" ? "badge-danger" : "badge-info"}`}>{STATUS_LABEL[i.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ResultsPanel({ roundId, stayMinutes, passMinutes }: { roundId: string; stayMinutes: number | null; passMinutes: number | null }) {
  const [includeSubmitted, setIncludeSubmitted] = useState(false);
  const [agg, setAgg] = useState<RoundAggregate | null>(null);
  const [edits, setEdits] = useState<Record<string, RepEdit>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [finalNote, setFinalNote] = useState("");

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    api<RoundAggregate>(`/api/rounds/${roundId}/aggregate${includeSubmitted ? "?include=submitted" : ""}`)
      .then((a) => {
        if (cancelled) return;
        setAgg(a);
        const e: Record<string, RepEdit> = {};
        for (const q of [...a.questions, ...a.activityTypes]) {
          const r = q.representative;
          e[q.questionId] = r ? { state: r.valueState, value: r.valueNum === null ? "" : String(r.valueNum), note: r.note } : { state: "", value: "", note: "" };
        }
        setEdits(e);
      })
      .catch((err) => !cancelled && setMsg({ kind: "error", text: (err as Error).message }));
    return () => {
      cancelled = true;
    };
  }, [roundId, includeSubmitted, reloadKey]);

  if (!agg) return <p className="muted">集計中…</p>;

  const repTargets = [...agg.questions.filter((q) => ["scale4", "ynu3", "count", "number"].includes(q.answerFormat) && q.visible), ...agg.activityTypes];
  const changed = repTargets.filter((q) => {
    const e = edits[q.questionId];
    const r = q.representative;
    if (!e || e.state === "") return false;
    return !r || r.valueState !== e.state || String(r.valueNum ?? "") !== e.value || r.note !== e.note;
  });

  function applySuggestions(onlyEmpty: boolean) {
    const next = { ...edits };
    for (const q of repTargets) {
      const cur = next[q.questionId];
      if (onlyEmpty && cur?.state) continue;
      const s = q.suggestion;
      if (s.value !== null) next[q.questionId] = { state: "value", value: String(Number(s.value.toFixed(4))), note: cur?.note ?? "" };
    }
    setEdits(next);
  }

  async function saveReps() {
    setBusy(true);
    setMsg(null);
    try {
      const items = changed.map((q) => {
        const e = edits[q.questionId];
        const v = e.state === "value" ? Number(e.value) : null;
        const sug = q.suggestion;
        const method = e.state !== "value" ? "manual" : sug.value !== null && Math.abs(Number(sug.value.toFixed(4)) - (v ?? NaN)) < 1e-9 ? (sug.method === "none" ? "manual" : sug.method) : "manual";
        return {
          roundQuestionId: q.questionId,
          valueState: e.state,
          valueNum: v,
          method,
          note: e.note,
          basis: { mean: "mean" in q ? q.mean : null, n: q.n, suggestion: sug.value, includeStatuses: agg!.includeStatuses },
        };
      });
      await api(`/api/rounds/${roundId}/representatives`, "PUT", { items });
      setMsg({ kind: "ok", text: `代表値を ${items.length} 件保存しました。` });
      load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (changed.length && !confirm("保存していない代表値の変更があります。破棄して確定しますか？")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ version: number }>(`/api/rounds/${roundId}/finalize`, "POST", { note: finalNote });
      setMsg({ kind: "ok", text: `集計結果を確定しました（v${r.version}）。` });
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
      setBusy(false);
    }
  }

  const subs = agg.includedSubmissions;
  const repCell = (q: { questionId: string; code: string }, fmtHint: string) => {
    const e = edits[q.questionId] ?? { state: "", value: "", note: "" };
    return (
      <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
        <select
          aria-label={`${q.code} 代表値の状態`}
          value={e.state}
          onChange={(ev) => setEdits({ ...edits, [q.questionId]: { ...e, state: ev.target.value as RepEdit["state"] } })}
          style={{ width: 90, padding: "0.3rem" }}
        >
          <option value="">未確定</option>
          <option value="value">値</option>
          <option value="not_applicable">適用外</option>
          <option value="no_data">データなし</option>
        </select>
        {e.state === "value" && (
          <input
            aria-label={`${q.code} 代表値`}
            data-testid={`rep-${q.code}`}
            type="number"
            step="any"
            value={e.value}
            placeholder={fmtHint}
            onChange={(ev) => setEdits({ ...edits, [q.questionId]: { ...e, value: ev.target.value } })}
            style={{ width: 80, padding: "0.3rem" }}
          />
        )}
      </div>
    );
  };

  const cellValue = (p: QuestionAggregate["perSurveyor"][number]) => {
    if (p.state === "answered" || p.state === "fixed") {
      if (p.value !== null) return <>{p.value}{p.state === "fixed" && <sup>固</sup>}</>;
      return <span className="small">{p.text}</span>;
    }
    return <span className="muted small">{STATE_SHORT[p.state] ?? p.state}</span>;
  };

  return (
    <div className="stack">
      <div className="card row no-print">
        <label className="check">
          <input type="checkbox" checked={includeSubmitted} onChange={(e) => setIncludeSubmitted(e.target.checked)} /> 未審査の提出も含めて暫定表示
        </label>
        <span className="grow" />
        <a className="btn btn-small" href={`/api/rounds/${roundId}/export?type=summary${includeSubmitted ? "&include=submitted" : ""}`} data-testid="csv-summary">
          CSV：集計
        </a>
        <a className="btn btn-small" href={`/api/rounds/${roundId}/export?type=raw`} data-testid="csv-raw">
          CSV：原回答
        </a>
        <a className="btn btn-small" href={`/api/rounds/${roundId}/export?type=observations`} data-testid="csv-observations">
          CSV：滞在者・通行者
        </a>
      </div>
      <div className="alert alert-info small">
        「平均値」はアプリが原回答から算出した値、「代表値」は主催者が確定する値です（分析ツールExcelの「代表値または平均値（手動入力）」欄に相当）。集計対象：
        {subs.length} 件（{agg.includeStatuses.map((s) => (s === "accepted" ? "採用" : "未審査")).join("・")}）。要素別の「点数」・総合点は算出しません（分析ツールには過去調査の点数を手入力する欄はあるものの、今回調査の点数を算出する式を確認できないため。docs/CALCULATION_SPEC.md 参照）。
      </div>
      {agg.warnings.map((w) => (
        <div key={w} className="alert alert-warn small">
          {w}
        </div>
      ))}

      <IndicatorTable title={`滞在者・通行者（滞在者計測 ${stayMinutes ?? "未設定"} 分／通行者計測 ${passMinutes ?? "未設定"} 分）`} list={agg.observation.indicators.slice(0, 7)} />
      <details className="card">
        <summary>属性別の人数・割合</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>区分</th>
                <th className="num">滞在</th>
                <th className="num">通行</th>
              </tr>
            </thead>
            <tbody>
              {(["single", "family", "group", "party"] as const).map((g) => (
                <tr key={g}>
                  <td>{{ single: "1人", family: "家族", group: "グループ", party: "団体" }[g]}（人／グループ数）</td>
                  <td className="num">
                    {agg.observation.stay.byGroupType[g].people}／{agg.observation.stay.byGroupType[g].groups}
                  </td>
                  <td className="num">
                    {agg.observation.pass.byGroupType[g].people}／{agg.observation.pass.byGroupType[g].groups}
                  </td>
                </tr>
              ))}
              {Object.entries(agg.observation.stay.attributes).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{k.startsWith("walk") ? "—" : v}</td>
                  <td className="num">{agg.observation.pass.attributes[k as keyof typeof agg.observation.pass.attributes]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <IndicatorTable title="割合" list={agg.observation.indicators.slice(7)} />
      </details>

      <IndicatorTable title="空間A（沿道建物・土地）の指標 ― 確定した代表値（件数）から算出" list={agg.spaceA} />

      <div className="card">
        <div className="row">
          <h3 className="grow" style={{ margin: 0 }}>
            設問別：調査者別の原回答・平均値・代表値
          </h3>
          <button className="btn-small" onClick={() => applySuggestions(true)}>
            未確定の項目に提案値を入れる
          </button>
          <button className="btn-small" onClick={() => applySuggestions(false)}>
            全て提案値で上書き
          </button>
        </div>
        <p className="muted small">提案値：4段階・件数は平均値、はい/いいえ/不明は最頻値（同数なら空欄）。保存するまで代表値は確定しません。</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>設問</th>
                {subs.map((s) => (
                  <th key={s.id} className="num small">
                    {s.surveyorName}
                  </th>
                ))}
                <th className="num">回答数</th>
                <th className="num">平均値</th>
                <th className="num">提案値</th>
                <th>代表値（確定）</th>
              </tr>
            </thead>
            <tbody>
              {SECTION_ORDER.filter((s) => s !== "observation" && s !== "basic").map((section) => {
                const qs = section === "kanyo_type" ? [] : agg.questions.filter((q) => q.section === section && q.visible && q.answerFormat !== "text");
                const types = section === "kanyo_type" ? agg.activityTypes : [];
                const inputTypes = section === "kanyo_type" ? agg.questions.filter((q) => q.section === section && q.visible) : [];
                if (!qs.length && !types.length && !inputTypes.length) return null;
                return (
                  <Fragment key={section}>
                    <tr>
                      <th colSpan={subs.length + 5}>{SECTION_LABELS[section]}</th>
                    </tr>
                    {types.map((t) => (
                      <tr key={t.questionId} data-code={t.code}>
                        <td className="small">
                          {t.text} <span className="badge">自動算出</span> <VerificationBadge v={t.verification} />
                          <div className="muted">算出元：{t.sources.join(", ")}（各調査者の最大値）{t.missingReason && ` ／ ${t.missingReason}`}</div>
                          {t.excelCompatibleMean !== null && <div className="muted">参考：Excel記入例の算式（6列・空欄=0）での平均 {fmt(t.excelCompatibleMean)}</div>}
                        </td>
                        {t.perSurveyor.map((p) => (
                          <td key={p.submissionId} className="num">
                            {p.value ?? <span className="muted">—</span>}
                          </td>
                        ))}
                        <td className="num">{t.n}</td>
                        <td className="num">{fmt(t.mean)}</td>
                        <td className="num">{fmt(t.suggestion.value)}</td>
                        <td>{repCell(t, fmt(t.suggestion.value))}</td>
                      </tr>
                    ))}
                    {[...inputTypes, ...qs].map((q) => (
                      <tr key={q.questionId} data-code={q.code}>
                        <td className="small">
                          <span className="muted">{q.originalNo}</span> {q.kind === "subjective" ? "【主観】" : q.kind === "activity" ? "【活動】" : ""}
                          {q.text} {q.verification !== "pdf_excel_verified" && <VerificationBadge v={q.verification} />}
                          {(q.counts.not_applicable > 0 || q.counts.unanswered + q.counts.missing > 0) && (
                            <div className="muted">
                              未回答 {q.counts.unanswered + q.counts.missing}／適用外 {q.counts.not_applicable}
                            </div>
                          )}
                        </td>
                        {q.perSurveyor.map((p) => (
                          <td key={p.submissionId} className="num">
                            {cellValue(p)}
                          </td>
                        ))}
                        <td className="num">{q.n}</td>
                        <td className="num" data-testid={`mean-${q.code}`}>
                          {q.answerFormat === "ynu3" ? <span className="muted small">平均しない</span> : fmt(q.mean)}
                        </td>
                        <td className="num" title={q.suggestion.reason}>
                          {fmt(q.suggestion.value)}
                        </td>
                        <td>{repCell(q, fmt(q.suggestion.value))}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>主観と活動の乖離（代表値の差が2以上で＊。分析ツールExcelと同じ判定）</h3>
        <table>
          <thead>
            <tr>
              <th>要素</th>
              <th>No</th>
              <th className="num">主観</th>
              <th className="num">活動</th>
              <th>判定</th>
            </tr>
          </thead>
          <tbody>
            {agg.gaps.map((g) => (
              <tr key={g.subjectiveCode}>
                <td>{ELEMENT_LABELS[g.element as keyof typeof ELEMENT_LABELS] ?? g.element}</td>
                <td>{g.pairNo}</td>
                <td className="num">{fmt(g.subjective)}</td>
                <td className="num">{fmt(g.activity)}</td>
                <td>
                  {g.flag === null ? <span className="muted small">判定不可</span> : g.flag ? "＊" : ""}
                  {g.source !== "representative" && <span className="muted small">（未確定値を含む）</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>空間B 表示（✓=はい／□=いいえ／－=不明・該当なし）</h3>
        <div className="row small">
          {agg.spaceB.map((b) => (
            <span key={b.code} className="badge" title={b.text}>
              {b.code} {b.display}
              {b.source !== "representative" && "*"}
            </span>
          ))}
        </div>
        <p className="muted small">* は代表値が未確定（提案値で表示）。</p>
      </div>

      {msg && <div className={`alert ${msg.kind === "ok" ? "alert-ok" : "alert-error"}`}>{msg.text}</div>}
      <div className="card row no-print" style={{ marginBottom: "5rem" }}>
        <input type="text" placeholder="確定時のメモ（任意）" value={finalNote} onChange={(e) => setFinalNote(e.target.value)} style={{ maxWidth: 400 }} />
        <span className="grow" />
        <button className="btn-primary" disabled={busy || changed.length === 0} onClick={saveReps} data-testid="save-representatives">
          代表値を保存（{changed.length}）
        </button>
        <button className="btn-primary" disabled={busy} onClick={finalize} data-testid="finalize">
          集計結果を確定
        </button>
      </div>
    </div>
  );
}
