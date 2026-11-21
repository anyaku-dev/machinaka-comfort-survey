"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/components/api-client";
import { VerificationBadge } from "@/components/status";
import { SECTION_LABELS, SECTION_ORDER } from "@/lib/questionnaire/master";
import type { QuestionRow } from "@/lib/server/rounds";

type Edit = { visible: boolean; fixed: string };

const CUSTOM_KINDS: Record<string, { kind: string; label: string }[]> = {
  basic: [{ kind: "memo", label: "記述（メモ）" }],
  space_a: [{ kind: "count", label: "件数" }],
  space_b: [{ kind: "fact", label: "はい／いいえ／不明" }],
  anshin: [
    { kind: "subjective", label: "主観（4段階）" },
    { kind: "activity", label: "活動（4段階）" },
  ],
  kanyo_type: [{ kind: "activity_type", label: "活動の種類（4段階）" }],
  kanyo: [
    { kind: "subjective", label: "主観（4段階）" },
    { kind: "activity", label: "活動（4段階）" },
  ],
  yasuragi: [
    { kind: "subjective", label: "主観（4段階）" },
    { kind: "activity", label: "活動（4段階）" },
  ],
  kitai: [
    { kind: "subjective", label: "主観（4段階）" },
    { kind: "activity", label: "活動（4段階）" },
  ],
};

const fixable = (q: QuestionRow) => ["scale4", "ynu3", "count", "number", "choice", "time"].includes(q.answerFormat);

export default function QuestionEditor({ roundId, locked, questions }: { roundId: string; locked: boolean; questions: QuestionRow[] }) {
  const router = useRouter();
  const initial = useMemo(
    () => Object.fromEntries(questions.map((q) => [q.id, { visible: q.visible, fixed: q.fixedValue ? String(q.fixedValue.value) : "" }])) as Record<string, Edit>,
    [questions],
  );
  const [edits, setEdits] = useState<Record<string, Edit>>(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState({ section: "anshin", kind: "subjective", text: "", pairNo: "" });

  const editOf = (id: string): Edit => edits[id] ?? initial[id];
  const dirty = questions.filter((q) => editOf(q.id).visible !== initial[q.id].visible || editOf(q.id).fixed !== initial[q.id].fixed);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const updates = dirty.map((q) => {
        const e = editOf(q.id);
        let fixedValue: { value: number | string } | null = null;
        if (e.fixed.trim() !== "") {
          fixedValue = { value: ["choice", "time"].includes(q.answerFormat) ? e.fixed.trim() : Number(e.fixed) };
        }
        return { id: q.id, visible: e.visible, fixedValue };
      });
      await api(`/api/rounds/${roundId}/questions`, "PATCH", { updates });
      setMsg({ kind: "ok", text: "設問設定を保存しました。" });
      router.refresh();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function addCustom(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/rounds/${roundId}/questions`, "POST", {
        section: custom.section,
        kind: custom.kind,
        text: custom.text,
        pairNo: custom.pairNo ? Number(custom.pairNo) : null,
      });
      setCustom({ ...custom, text: "", pairNo: "" });
      setMsg({ kind: "ok", text: "独自項目を追加しました。" });
      router.refresh();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function removeCustom(id: string) {
    if (!confirm("この独自項目を削除しますか？")) return;
    try {
      await api(`/api/rounds/${roundId}/questions/${id}`, "DELETE");
      router.refresh();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  const setAll = (section: string, visible: boolean) =>
    setEdits((prev) => {
      const next = { ...prev };
      for (const q of questions) {
        if (q.section === section && q.answerFormat !== "computed" && !["OBS-PRESENCE", "OBS-GROUP"].includes(q.code)) next[q.id] = { ...(next[q.id] ?? initial[q.id]), visible };
      }
      return next;
    });

  return (
    <div>
      {locked ? (
        <div className="alert alert-info">この調査回は開始済みのため、設問は固定されています（開始時のスナップショット）。</div>
      ) : (
        <div className="alert alert-info">
          標準設問の文言は変更できません（国交省 ver.1.1 の原文を保持）。不要な設問は非表示に、必要な項目は独自項目として追加してください。固定値を設定すると調査者には表示されず、全員がその値を回答したものとして扱います。
        </div>
      )}
      {SECTION_ORDER.map((section) => {
        const qs = questions.filter((q) => q.section === section);
        if (!qs.length) return null;
        return (
          <section key={section} className="card">
            <div className="row">
              <h2 className="grow" style={{ margin: 0 }}>
                {SECTION_LABELS[section]}
              </h2>
              {!locked && section !== "kanyo_type" && (
                <>
                  <button className="btn-small" onClick={() => setAll(section, true)}>
                    全て表示
                  </button>
                  <button className="btn-small" onClick={() => setAll(section, false)}>
                    全て非表示
                  </button>
                </>
              )}
            </div>
            {section === "kanyo_type" && (
              <p className="muted small">
                1～20は調査票の指示どおり４要素の活動の回答から自動計算します（調査者には表示しません）。算出式は分析ツールExcelの式を採用しています（docs/CALCULATION_SPEC.md）。
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>表示</th>
                    <th>原票番号</th>
                    <th>設問</th>
                    <th>形式</th>
                    <th>照合</th>
                    <th>固定値</th>
                  </tr>
                </thead>
                <tbody>
                  {qs.map((q) => {
                    const e = editOf(q.id);
                    const required = ["OBS-PRESENCE", "OBS-GROUP"].includes(q.code);
                    return (
                      <tr key={q.id} data-code={q.code}>
                        <td>
                          {q.answerFormat === "computed" ? (
                            <span className="muted small">自動</span>
                          ) : (
                            <input
                              type="checkbox"
                              aria-label={`${q.code} を表示`}
                              disabled={locked || required}
                              checked={e.visible}
                              onChange={(ev) => setEdits({ ...edits, [q.id]: { ...e, visible: ev.target.checked } })}
                            />
                          )}
                        </td>
                        <td className="small">
                          {q.originalNo}
                          <div className="muted mono">{q.code}</div>
                        </td>
                        <td>
                          {q.kind === "subjective" && <span className="badge">主観</span>} {q.kind === "activity" && <span className="badge">活動</span>} {q.text}
                          {q.notes && <div className="muted small">{q.notes}</div>}
                          {q.applicability && (q.applicability as { nightOnly?: boolean }).nightOnly && <div className="badge badge-warn">夜間のみ</div>}
                          {q.isCustom && !locked && (
                            <button className="btn-small" onClick={() => removeCustom(q.id)}>
                              削除
                            </button>
                          )}
                        </td>
                        <td className="small">{q.answerFormat}</td>
                        <td>
                          <VerificationBadge v={q.verification} />
                        </td>
                        <td>
                          {fixable(q) ? (
                            q.options && q.answerFormat !== "count" ? (
                              <select
                                aria-label={`${q.code} の固定値`}
                                disabled={locked}
                                value={e.fixed}
                                onChange={(ev) => setEdits({ ...edits, [q.id]: { ...e, fixed: ev.target.value } })}
                              >
                                <option value="">（なし）</option>
                                {q.options.map((o) => (
                                  <option key={String(o.value)} value={String(o.value)}>
                                    {o.value} {o.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                aria-label={`${q.code} の固定値`}
                                type={q.answerFormat === "time" ? "time" : "number"}
                                disabled={locked}
                                value={e.fixed}
                                style={{ maxWidth: 120 }}
                                onChange={(ev) => setEdits({ ...edits, [q.id]: { ...e, fixed: ev.target.value } })}
                              />
                            )
                          ) : (
                            <span className="muted small">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {msg && <div className={`alert ${msg.kind === "ok" ? "alert-ok" : "alert-error"}`}>{msg.text}</div>}
      {!locked && (
        <>
          <div className="sticky-bottom no-print">
            <div className="inner" style={{ maxWidth: 1200 }}>
              <span className="grow muted small">{dirty.length} 件の変更</span>
              <button className="btn-primary" disabled={busy || dirty.length === 0} onClick={save} data-testid="save-questions">
                設問設定を保存
              </button>
            </div>
          </div>
          <form className="card" onSubmit={addCustom} style={{ marginBottom: "5rem" }}>
            <h2 style={{ marginTop: 0 }}>独自項目を追加</h2>
            <div className="row">
              <div className="field">
                <label htmlFor="c-section">区分</label>
                <select
                  id="c-section"
                  value={custom.section}
                  onChange={(e) => setCustom({ ...custom, section: e.target.value, kind: CUSTOM_KINDS[e.target.value][0].kind })}
                >
                  {Object.keys(CUSTOM_KINDS).map((s) => (
                    <option key={s} value={s}>
                      {SECTION_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="c-kind">種類</label>
                <select id="c-kind" value={custom.kind} onChange={(e) => setCustom({ ...custom, kind: e.target.value })}>
                  {CUSTOM_KINDS[custom.section].map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              {["subjective", "activity"].includes(custom.kind) && (
                <div className="field">
                  <label htmlFor="c-pair">項目番号（主観と活動の対応付け）</label>
                  <input id="c-pair" type="number" min={1} max={99} value={custom.pairNo} onChange={(e) => setCustom({ ...custom, pairNo: e.target.value })} placeholder="自動" />
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="c-text">項目の文言</label>
              <input id="c-text" type="text" maxLength={500} required value={custom.text} onChange={(e) => setCustom({ ...custom, text: e.target.value })} />
            </div>
            <button type="submit" disabled={busy}>
              追加
            </button>
          </form>
        </>
      )}
    </div>
  );
}
