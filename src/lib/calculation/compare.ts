/**
 * 過去回との比較。値そのものは各回の集計（確定済みがあれば確定版）から取り出し、
 * 比較条件（計測時間・時間帯・曜日・天候・範囲・設問構成・算定版）の差異を一覧化する。
 */

export interface ComparableRound {
  roundId: string;
  roundNumber: number;
  title: string;
  status: string;
  surveyDate: string | null;
  isHoliday: boolean;
  startTime: string | null;
  endTime: string | null;
  isNight: boolean;
  eventName: string;
  stayMeasureMinutes: number | null;
  passMeasureMinutes: number | null;
  scopeText: string;
  frontageScopeText: string;
  peripheralScopeText: string;
  masterVersion: string;
  calcVersion: string | null;
  /** 表示した設問コードの集合 */
  visibleCodes: string[];
  weatherStart: string | null;
  weatherEnd: string | null;
  finalizedVersion: number | null;
  indicators: Record<string, number | null>;
  representatives: Record<string, { text: string; value: number | null; state: string }>;
}

export interface ConditionDiff {
  key: string;
  label: string;
  base: string;
  other: string;
}

const weekday = (d: string | null) => {
  if (!d) return "未設定";
  const day = new Date(`${d}T00:00:00Z`).getUTCDay();
  return ["日", "月", "火", "水", "木", "金", "土"][day];
};

const dayKind = (r: ComparableRound) => {
  if (!r.surveyDate) return "未設定";
  const w = weekday(r.surveyDate);
  if (r.isHoliday || w === "土" || w === "日") return "休日";
  return "平日";
};

const fmtMinutes = (m: number | null) => (m === null ? "未設定" : `${m}分`);
const toMinutes = (t: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function diffConditions(base: ComparableRound, other: ComparableRound): ConditionDiff[] {
  const diffs: ConditionDiff[] = [];
  const push = (key: string, label: string, a: string, b: string) => {
    if (a !== b) diffs.push({ key, label, base: a, other: b });
  };
  push("stayMinutes", "滞在者の計測時間", fmtMinutes(base.stayMeasureMinutes), fmtMinutes(other.stayMeasureMinutes));
  push("passMinutes", "通行者の計測時間", fmtMinutes(base.passMeasureMinutes), fmtMinutes(other.passMeasureMinutes));
  const bs = toMinutes(base.startTime);
  const os = toMinutes(other.startTime);
  if (bs === null || os === null || Math.abs(bs - os) > 60) {
    push("timeOfDay", "調査時間帯（開始時刻の差が60分超）", `${base.startTime ?? "未設定"}～${base.endTime ?? ""}`, `${other.startTime ?? "未設定"}～${other.endTime ?? ""}`);
  }
  push("dayKind", "平日・休日", dayKind(base), dayKind(other));
  push("night", "夜間計測", base.isNight ? "夜間" : "昼間", other.isNight ? "夜間" : "昼間");
  push("event", "イベント", base.eventName || "なし", other.eventName || "なし");
  push("weather", "天候（開始時／終了時）", `${base.weatherStart ?? "未確定"}／${base.weatherEnd ?? "未確定"}`, `${other.weatherStart ?? "未確定"}／${other.weatherEnd ?? "未確定"}`);
  push("scope", "計測対象範囲（文章）", base.scopeText.trim(), other.scopeText.trim());
  push("frontageScope", "沿道建物・土地の範囲（文章）", base.frontageScopeText.trim(), other.frontageScopeText.trim());
  push("peripheralScope", "周辺エリアの範囲（文章）", base.peripheralScopeText.trim(), other.peripheralScopeText.trim());
  push("master", "設問マスタの版", base.masterVersion, other.masterVersion);
  push("calc", "算定ロジックの版", base.calcVersion ?? "未記録", other.calcVersion ?? "未記録");
  const a = new Set(base.visibleCodes);
  const b = new Set(other.visibleCodes);
  const onlyBase = [...a].filter((c) => !b.has(c));
  const onlyOther = [...b].filter((c) => !a.has(c));
  if (onlyBase.length || onlyOther.length) {
    diffs.push({
      key: "questions",
      label: "表示した設問",
      base: onlyBase.length ? `この回のみ: ${onlyBase.join(", ")}` : "差異なし",
      other: onlyOther.length ? `比較先のみ: ${onlyOther.join(", ")}` : "差異なし",
    });
  }
  push("finalized", "集計の確定", base.finalizedVersion ? `確定版 v${base.finalizedVersion}` : "未確定（暫定集計）", other.finalizedVersion ? `確定版 v${other.finalizedVersion}` : "未確定（暫定集計）");
  return diffs;
}
