"use client";
import { groupSizeWarning, observationProblems } from "@/lib/validation/schemas";
import { newObservation, type LocalObservation, type VisibleAttributes } from "@/lib/offline/local-store";
import { Stepper } from "./inputs";

const GROUP_TYPES: [LocalObservation["groupType"], string][] = [
  ["single", "1人"],
  ["family", "家族"],
  ["group", "グループ"],
  ["party", "団体"],
];

const ATTR_GROUPS: { key: keyof VisibleAttributes; label: string; items: [keyof LocalObservation, string][]; passOnly?: boolean }[] = [
  { key: "gender", label: "性別", items: [["male", "男性"], ["female", "女性"], ["genderUnknown", "わからない"]] },
  {
    key: "age",
    label: "年齢",
    items: [
      ["infant", "乳幼児"],
      ["child", "小学生"],
      ["teen", "中高生"],
      ["adult", "大人"],
      ["elderly", "高齢者"],
      ["ageUnknown", "わからない"],
    ],
  },
  { key: "behavior", label: "行動（通行者のみ）", items: [["walkFast", "スタスタ歩いている"], ["walkSlow", "のんびり歩いている"]], passOnly: true },
  { key: "nationality", label: "国籍", items: [["japanese", "日本人"], ["foreigner", "外国人"], ["nationalityUnknown", "わからない"]] },
];

export function summarize(o: LocalObservation): string {
  const gt = GROUP_TYPES.find(([k]) => k === o.groupType)?.[1];
  return `${o.presence === "stay" ? "滞在" : "通行"}・${gt}・${o.groupSize}人`;
}

export function ObservationEditor({
  value,
  onChange,
  attrs,
}: {
  value: LocalObservation;
  onChange: (o: LocalObservation) => void;
  attrs: VisibleAttributes;
}) {
  const o = value;
  const problems = observationProblems(o as unknown as Record<string, unknown>, attrs);
  const warn = groupSizeWarning(o.groupType, o.groupSize);

  const setType = (t: LocalObservation["groupType"]) => {
    const size = t === "single" ? 1 : t === "party" ? Math.max(o.groupSize, 10) : Math.max(o.groupSize, 2);
    onChange(resetIfSizeChanged({ ...o, groupType: t, groupSize: size }, o));
  };
  const setSize = (n: number | null) => onChange(resetIfSizeChanged({ ...o, groupSize: n ?? 1 }, o));

  return (
    <div className="stack">
      <div>
        <label>滞在・通行</label>
        <div className="choices c2">
          {(["stay", "pass"] as const).map((p) => (
            <button type="button" key={p} className={`choice ${o.presence === p ? "selected" : ""}`} aria-pressed={o.presence === p} onClick={() => onChange({ ...o, presence: p })}>
              <b>{p === "stay" ? "滞在" : "通行"}</b>
              <span className="small">{p === "stay" ? "立ち止まり何かしらの活動をした" : "滞在者以外"}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label>1人・家族・グループ・団体</label>
        <div className="choices c4">
          {GROUP_TYPES.map(([k, l]) => (
            <button type="button" key={k} className={`choice ${o.groupType === k ? "selected" : ""}`} aria-pressed={o.groupType === k} onClick={() => setType(k)}>
              <b>{l}</b>
            </button>
          ))}
        </div>
        <p className="q-note">グループ：家族以外の少人数グループ／家族は夫婦2人も含む／団体：10人以上でツアー等団体行動をしている集団</p>
      </div>
      {o.groupType !== "single" && (
        <div>
          <label>グループの人数</label>
          <Stepper label="グループ人数" value={o.groupSize} min={2} max={500} onChange={setSize} />
          {warn && <div className="alert alert-warn small">{warn}</div>}
        </div>
      )}
      {ATTR_GROUPS.filter((g) => attrs[g.key] && (!g.passOnly || o.presence === "pass")).map((g) => {
        const sum = g.items.reduce((a, [k]) => a + (o[k] as number), 0);
        return (
          <div key={g.key} className="q">
            <div className="row">
              <strong className="grow">{g.label}</strong>
              <span className={`badge ${sum === o.groupSize ? "badge-active" : "badge-warn"}`}>
                {sum}／{o.groupSize}人
              </span>
            </div>
            {o.groupSize === 1 ? (
              <div className={`choices c${Math.min(g.items.length, 3)}`}>
                {g.items.map(([k, l]) => (
                  <button
                    type="button"
                    key={k}
                    className={`choice ${(o[k] as number) === 1 ? "selected" : ""}`}
                    aria-pressed={(o[k] as number) === 1}
                    onClick={() => {
                      const next = { ...o };
                      for (const [kk] of g.items) (next[kk] as number) = 0;
                      (next[k] as number) = 1;
                      onChange(next);
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            ) : (
              g.items.map(([k, l]) => (
                <div key={k} className="attr-row">
                  <span>{l}</span>
                  <Stepper label={`${g.label}-${l}`} value={o[k] as number} max={o.groupSize} onChange={(v) => onChange({ ...o, [k]: v ?? 0 })} />
                </div>
              ))
            )}
          </div>
        );
      })}
      <div>
        <label htmlFor="obs-note">メモ（任意）</label>
        <input id="obs-note" type="text" maxLength={500} value={o.note} onChange={(e) => onChange({ ...o, note: e.target.value })} />
      </div>
      {problems.length > 0 && (
        <div className="alert alert-warn small" data-testid="obs-problems">
          {problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function resetIfSizeChanged(next: LocalObservation, prev: LocalObservation): LocalObservation {
  if (next.groupSize === prev.groupSize) return next;
  // 1人に変わった場合など、内訳を作り直す
  const base = newObservation(next.presence);
  if (next.groupSize === 1 || prev.groupSize === 1) {
    return { ...base, localId: next.localId, presence: next.presence, groupType: next.groupType, groupSize: next.groupSize, note: next.note };
  }
  return next;
}
