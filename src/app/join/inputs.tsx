"use client";
import type { LocalAnswer, ParticipantQuestion } from "@/lib/offline/local-store";

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  label,
  allowUnset = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  label: string;
  allowUnset?: boolean;
}) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`${label}を1減らす`} disabled={value === null || value <= min} onClick={() => onChange(value === null ? null : Math.max(min, value - 1))}>
        −
      </button>
      <span className={`value ${value === null ? "unset" : ""}`} aria-live="polite" data-testid={`value-${label}`}>
        {value === null ? "未" : value}
      </span>
      <button type="button" aria-label={`${label}を1増やす`} disabled={value !== null && value >= max} onClick={() => onChange(value === null ? Math.max(min, 1) : Math.min(max, value + 1))}>
        ＋
      </button>
      {allowUnset && value === null && (
        <button type="button" className="btn-small" onClick={() => onChange(0)} aria-label={`${label}を0件にする`}>
          0件
        </button>
      )}
    </div>
  );
}

export function QuestionInput({
  q,
  answer,
  onChange,
  isNight,
}: {
  q: ParticipantQuestion;
  answer: LocalAnswer | undefined;
  onChange: (a: LocalAnswer | undefined) => void;
  isNight: boolean;
}) {
  const value = answer?.state === "answered" ? answer.value : null;
  const na = answer?.state === "not_applicable";
  const set = (v: number | string | null) => onChange(v === null || v === "" ? undefined : { state: "answered", value: v });
  const opts = q.options ?? [];
  const testid = `q-${q.code}`;
  return (
    <div className="q" data-testid={testid}>
      <div className="q-head">
        <span className="q-no">{q.kind === "subjective" ? "主観" : q.kind === "activity" ? "活動" : q.originalNo}</span>
        <span className="q-text">{q.text}</span>
      </div>
      {q.applicability?.nightOnly && !isNight && <div className="q-note">※本項目は夜間に計測した場合に回答（夜間でない場合は「適用外」）</div>}
      {q.applicability?.countGroups && <div className="q-note">※個人の数ではなく、グループの数をカウントして回答</div>}
      {q.applicability?.dependsOn && <div className="q-note">※No.6 の案内板等が無い場合は「適用外」</div>}
      {q.notes && !q.applicability?.countGroups && <div className="q-note">{q.notes}</div>}
      {(q.answerFormat === "scale4" || q.answerFormat === "ynu3" || q.answerFormat === "choice") && (
        <div className={`choices c${Math.min(opts.length, 4)}`} role="radiogroup" aria-label={q.text}>
          {opts.map((o) => (
            <button
              type="button"
              key={String(o.value)}
              role="radio"
              aria-checked={value === o.value}
              className={`choice ${value === o.value ? "selected" : ""}`}
              onClick={() => set(value === o.value ? null : o.value)}
            >
              {typeof o.value === "number" && <b>{o.value}</b>}
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
      {q.answerFormat === "count" && <Stepper label={q.code} value={typeof value === "number" ? value : null} onChange={(v) => set(v)} allowUnset />}
      {q.answerFormat === "number" && (
        <input type="number" inputMode="decimal" step="any" aria-label={q.text} value={value === null ? "" : String(value)} onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))} />
      )}
      {q.answerFormat === "time" && <input type="time" aria-label={q.text} value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value || null)} />}
      {q.answerFormat === "text" && (
        <textarea aria-label={q.text} maxLength={2000} value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value || null)} />
      )}
      <div className="q-state">
        <button type="button" className={`btn-small state-chip ${na ? "selected" : ""}`} onClick={() => onChange(na ? undefined : { state: "not_applicable", value: null })}>
          適用外
        </button>
        {(value !== null || na) && (
          <button type="button" className="btn-small state-chip" onClick={() => onChange(undefined)}>
            未回答に戻す
          </button>
        )}
        <span className="muted small" style={{ alignSelf: "center" }}>
          {na ? "適用外" : value === null ? "未回答" : q.answerFormat === "count" && value === 0 ? "0件（回答済み）" : "回答済み"}
        </span>
      </div>
    </div>
  );
}
