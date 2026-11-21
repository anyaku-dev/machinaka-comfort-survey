import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  GROUP_TYPE_LABELS,
  CALC_VERSION,
  type AttributeKey,
  type CalcAnswer,
  type CalcInput,
  type CalcObservation,
  type CalcQuestion,
  type CalcRepresentative,
  type CalcSubmission,
  type GroupType,
  type Indicator,
  type SubmissionStatus,
} from "./types";
import type { AnswerState } from "@/lib/questionnaire/types";

export interface PerSurveyorValue {
  submissionId: string;
  surveyorName: string;
  state: AnswerState | "missing";
  value: number | null;
  text: string | null;
}

export interface Suggestion {
  method: "mean" | "mode" | "fixed" | "none";
  value: number | null;
  reason: string;
}

export interface QuestionAggregate {
  questionId: string;
  code: string;
  section: string;
  element: string | null;
  kind: string;
  pairNo: number | null;
  originalNo: string | null;
  text: string;
  answerFormat: string;
  visible: boolean;
  verification: string;
  isCustom: boolean;
  perSurveyor: PerSurveyorValue[];
  counts: Record<AnswerState | "missing", number>;
  n: number;
  mean: number | null;
  mode: number | null;
  distribution: Record<string, number>;
  suggestion: Suggestion;
  representative: CalcRepresentative | null;
}

export interface ActivityTypeAggregate {
  questionId: string;
  code: string;
  text: string;
  sources: string[];
  verification: string;
  perSurveyor: { submissionId: string; surveyorName: string; value: number | null; sourceValues: Record<string, number | null> }[];
  n: number;
  /** アプリの平均：算出元が1つも回答されていない調査者は除外 */
  mean: number | null;
  /**
   * 記入例Excelの算式を再現した参考値：調査者6列（L～Q）のうち算出元が空の列を0として平均。
   * 調査者が6人を超える場合は算出しない。
   */
  excelCompatibleMean: number | null;
  representative: CalcRepresentative | null;
  suggestion: Suggestion;
  missingReason: string | null;
}

export interface AttributeSummary {
  people: number;
  groups: number;
  byGroupType: Record<GroupType, { groups: number; people: number }>;
  attributes: Record<AttributeKey, number>;
  /** 属性を記録していない（非表示等）グループの人数 */
  unrecorded: Record<keyof typeof ATTRIBUTE_GROUPS, number>;
}

export interface ObservationAggregate {
  includedSubmissionIds: string[];
  stay: AttributeSummary;
  pass: AttributeSummary;
  interactionPeople: number;
  indicators: Indicator[];
}

export interface GapFlag {
  element: string;
  pairNo: number;
  subjectiveCode: string;
  activityCode: string;
  subjective: number | null;
  activity: number | null;
  source: "representative" | "suggestion" | "mixed";
  flag: boolean | null;
}

export interface SpaceBDisplay {
  questionId: string;
  code: string;
  text: string;
  value: number | null;
  display: "✓" | "□" | "－";
  source: "representative" | "suggestion" | "none";
}

export interface RoundAggregate {
  calcVersion: string;
  includeStatuses: SubmissionStatus[];
  includedSubmissions: { id: string; surveyorName: string; status: SubmissionStatus }[];
  questions: QuestionAggregate[];
  activityTypes: ActivityTypeAggregate[];
  observation: ObservationAggregate;
  spaceA: Indicator[];
  spaceB: SpaceBDisplay[];
  gaps: GapFlag[];
  warnings: string[];
}

const NUMERIC_FORMATS = new Set(["scale4", "ynu3", "count", "number"]);

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 最頻値。同数の最頻値が複数ある場合は null（代表値は主催者が判断する）。 */
export function uniqueMode(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  let tie = false;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
      tie = false;
    } else if (c === bestCount) {
      tie = true;
    }
  }
  return tie ? null : best;
}

export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

/** 1時間当たり人数。計測分数が無い・0以下の場合は算出しない（null）。 */
export function perHour(people: number, minutes: number | null | undefined): number | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return null;
  return (people / minutes) * 60;
}

function emptyCounts(): Record<AnswerState | "missing", number> {
  return { answered: 0, unanswered: 0, not_applicable: 0, hidden: 0, fixed: 0, missing: 0 };
}

function selectSubmissions(input: CalcInput): CalcSubmission[] {
  const statuses = input.includeStatuses ?? ["accepted"];
  return input.submissions.filter((s) => statuses.includes(s.status));
}

function suggestionFor(q: CalcQuestion, values: number[]): Suggestion {
  if (q.fixedValue && typeof q.fixedValue.value === "number") {
    return { method: "fixed", value: q.fixedValue.value, reason: "主催者が設定した固定値" };
  }
  if (values.length === 0) return { method: "none", value: null, reason: "有効な回答がありません" };
  if (q.answerFormat === "ynu3") {
    const m = uniqueMode(values);
    return m === null
      ? { method: "none", value: null, reason: "回答が割れているため主催者が判断してください（最頻値が複数）" }
      : { method: "mode", value: m, reason: "最頻値（はい／いいえ／不明は平均しない）" };
  }
  return { method: "mean", value: mean(values), reason: "回答済みの値の平均（Excelの AVERAGE と同じく未回答を除外）" };
}

export function aggregateQuestions(input: CalcInput, subs: CalcSubmission[]): QuestionAggregate[] {
  const answerIndex = new Map<string, CalcAnswer>();
  for (const a of input.answers) answerIndex.set(`${a.submissionId}:${a.questionId}`, a);
  const repIndex = new Map(input.representatives.map((r) => [r.questionId, r]));

  return input.questions
    .filter((q) => q.answerFormat !== "computed" && q.answerFormat !== "observation")
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((q) => {
      const counts = emptyCounts();
      const perSurveyor: PerSurveyorValue[] = [];
      const values: number[] = [];
      const distribution: Record<string, number> = {};
      for (const s of subs) {
        const a = answerIndex.get(`${s.id}:${q.id}`);
        const state: AnswerState | "missing" = a ? a.state : "missing";
        counts[state] += 1;
        const value = a && (state === "answered" || state === "fixed") ? a.valueNum : null;
        const text = a && (state === "answered" || state === "fixed") ? a.valueText : null;
        perSurveyor.push({ submissionId: s.id, surveyorName: s.surveyorName, state, value, text });
        if (value !== null && NUMERIC_FORMATS.has(q.answerFormat)) {
          values.push(value);
          distribution[String(value)] = (distribution[String(value)] ?? 0) + 1;
        } else if (text !== null && q.answerFormat === "choice") {
          distribution[text] = (distribution[text] ?? 0) + 1;
        }
      }
      const numeric = NUMERIC_FORMATS.has(q.answerFormat);
      return {
        questionId: q.id,
        code: q.code,
        section: q.section,
        element: q.element,
        kind: q.kind,
        pairNo: q.pairNo,
        originalNo: q.originalNo,
        text: q.text,
        answerFormat: q.answerFormat,
        visible: q.visible,
        verification: q.verification,
        isCustom: q.isCustom,
        perSurveyor,
        counts,
        n: values.length,
        mean: numeric && q.answerFormat !== "ynu3" ? mean(values) : null,
        mode: numeric ? uniqueMode(values) : null,
        distribution,
        suggestion: numeric ? suggestionFor(q, values) : { method: "none", value: null, reason: "数値でない回答（代表値の対象外）" },
        representative: repIndex.get(q.id) ?? null,
      };
    });
}

/**
 * 寛容性「活動の種類」1～20：Excel 入力① L146:Q165 の算式（=MAX(...) / =参照）を調査者ごとに適用する。
 * 算出元が回答済み（answered / fixed）でない場合は値なしとして扱う。
 */
export function aggregateActivityTypes(input: CalcInput, subs: CalcSubmission[]): ActivityTypeAggregate[] {
  const byCode = new Map(input.questions.map((q) => [q.code, q]));
  const answerIndex = new Map<string, CalcAnswer>();
  for (const a of input.answers) answerIndex.set(`${a.submissionId}:${a.questionId}`, a);
  const repIndex = new Map(input.representatives.map((r) => [r.questionId, r]));

  return input.questions
    .filter((q) => q.answerFormat === "computed" && q.computedFrom && q.computedFrom.length > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((q) => {
      const sources = q.computedFrom ?? [];
      const sourceQuestions = sources.map((c) => byCode.get(c)).filter((x): x is CalcQuestion => Boolean(x));
      const anyVisible = sourceQuestions.some((sq) => sq.visible);
      const perSurveyor = subs.map((s) => {
        const sourceValues: Record<string, number | null> = {};
        for (const code of sources) {
          const sq = byCode.get(code);
          const a = sq ? answerIndex.get(`${s.id}:${sq.id}`) : undefined;
          sourceValues[code] = a && (a.state === "answered" || a.state === "fixed") ? a.valueNum : null;
        }
        const present = Object.values(sourceValues).filter((v): v is number => v !== null);
        return {
          submissionId: s.id,
          surveyorName: s.surveyorName,
          value: present.length ? Math.max(...present) : null,
          sourceValues,
        };
      });
      const values = perSurveyor.map((p) => p.value).filter((v): v is number => v !== null);
      const appMean = mean(values);
      const excelCompatibleMean =
        subs.length > 0 && subs.length <= 6
          ? perSurveyor.reduce((acc, p) => acc + (p.value ?? 0), 0) / 6
          : null;
      const missingReason = !anyVisible
        ? "算出元の設問がすべて非表示のため算出できません"
        : values.length === 0
          ? "算出元の設問に回答がありません"
          : null;
      return {
        questionId: q.id,
        code: q.code,
        text: q.text,
        sources,
        verification: q.verification,
        perSurveyor,
        n: values.length,
        mean: appMean,
        excelCompatibleMean,
        representative: repIndex.get(q.id) ?? null,
        suggestion:
          appMean === null
            ? { method: "none", value: null, reason: missingReason ?? "値がありません" }
            : { method: "mean", value: appMean, reason: "算出元が回答済みの調査者だけの平均（Excelは未使用列を0として平均するため値が異なる場合があります）" },
        missingReason,
      };
    });
}

function emptySummary(): AttributeSummary {
  const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 0])) as Record<AttributeKey, number>;
  return {
    people: 0,
    groups: 0,
    byGroupType: {
      single: { groups: 0, people: 0 },
      family: { groups: 0, people: 0 },
      group: { groups: 0, people: 0 },
      party: { groups: 0, people: 0 },
    },
    attributes,
    unrecorded: { gender: 0, age: 0, behavior: 0, nationality: 0 },
  };
}

export function summarizeObservations(groups: CalcObservation[]): { stay: AttributeSummary; pass: AttributeSummary; interactionPeople: number } {
  const stay = emptySummary();
  const pass = emptySummary();
  let interactionPeople = 0;
  for (const g of groups) {
    const s = g.presence === "stay" ? stay : pass;
    s.people += g.groupSize;
    s.groups += 1;
    s.byGroupType[g.groupType].groups += 1;
    s.byGroupType[g.groupType].people += g.groupSize;
    for (const [grp, keys] of Object.entries(ATTRIBUTE_GROUPS) as [keyof typeof ATTRIBUTE_GROUPS, AttributeKey[]][]) {
      if (grp === "behavior" && g.presence === "stay") continue;
      if (keys.every((k) => g[k] === null)) {
        s.unrecorded[grp] += g.groupSize;
        continue;
      }
      for (const k of keys) s.attributes[k] += g[k] ?? 0;
    }
    if (g.presence === "stay" && g.groupType !== "single") interactionPeople += g.groupSize;
  }
  return { stay, pass, interactionPeople };
}

function sumKeys(s: AttributeSummary, keys: AttributeKey[]): number {
  return keys.reduce((a, k) => a + s.attributes[k], 0);
}

export function observationIndicators(
  summary: { stay: AttributeSummary; pass: AttributeSummary; interactionPeople: number },
  round: { stayMeasureMinutes: number | null; passMeasureMinutes: number | null },
): Indicator[] {
  const { stay, pass, interactionPeople } = summary;
  const noMinutes = (m: number | null) => (m === null || m <= 0 ? "計測分数が設定されていないため算出しません" : null);
  const stayPH = perHour(stay.people, round.stayMeasureMinutes);
  const passPH = perHour(pass.people, round.passMeasureMinutes);
  const interactionPH = perHour(interactionPeople, round.stayMeasureMinutes);
  const list: Indicator[] = [
    { key: "stay.people", label: "滞在者数（計測時間内の合計）", value: stay.people, unit: "人", formula: "滞在グループの人数の合計", basis: `滞在 ${stay.groups} グループ`, status: "excel_verified", missingReason: null },
    { key: "pass.people", label: "通行者数（計測時間内の合計）", value: pass.people, unit: "人", formula: "通行グループの人数の合計", basis: `通行 ${pass.groups} グループ`, status: "excel_verified", missingReason: null },
    { key: "interaction.people", label: "交流者数（二人以上で滞在していた人）", value: interactionPeople, unit: "人", formula: "滞在のうち家族・グループ・団体の人数の合計", basis: "1人以外の滞在グループ", status: "excel_verified", missingReason: null },
    { key: "stay.perHour", label: "滞在者数（1時間当たり）", value: stayPH, unit: "人/時間", formula: "滞在者数 ÷ 滞在者計測分数 × 60", basis: `滞在者計測 ${round.stayMeasureMinutes ?? "未設定"} 分`, status: "excel_verified", missingReason: noMinutes(round.stayMeasureMinutes) },
    { key: "pass.perHour", label: "通行者数（1時間当たり）", value: passPH, unit: "人/時間", formula: "通行者数 ÷ 通行者計測分数 × 60", basis: `通行者計測 ${round.passMeasureMinutes ?? "未設定"} 分`, status: "excel_verified", missingReason: noMinutes(round.passMeasureMinutes) },
    { key: "interaction.perHour", label: "交流者数（1時間当たり）", value: interactionPH, unit: "人/時間", formula: "交流者数 ÷ 滞在者計測分数 × 60", basis: `滞在者計測 ${round.stayMeasureMinutes ?? "未設定"} 分`, status: "excel_verified", missingReason: noMinutes(round.stayMeasureMinutes) },
    {
      key: "stay.share",
      label: "滞在者割合（1時間当たり人数ベース）",
      value: stayPH !== null && passPH !== null ? ratio(stayPH, stayPH + passPH) : null,
      unit: "割合",
      formula: "滞在者数/時間 ÷（滞在者数/時間＋通行者数/時間）",
      basis: "Excel 計算_集計 K19",
      status: "excel_verified",
      missingReason: stayPH === null || passPH === null ? "滞在・通行の両方の計測分数が必要です" : stayPH + passPH === 0 ? "人数が0のため算出しません" : null,
    },
  ];
  const ratioIndicators = (prefix: "stay" | "pass", s: AttributeSummary, label: string) => {
    const out: Indicator[] = [];
    for (const [grp, keys] of Object.entries(ATTRIBUTE_GROUPS) as [keyof typeof ATTRIBUTE_GROUPS, AttributeKey[]][]) {
      if (grp === "behavior" && prefix === "stay") continue;
      const denom = sumKeys(s, keys);
      for (const k of keys) {
        out.push({
          key: `${prefix}.ratio.${k}`,
          label: `${label}の${ATTRIBUTE_LABELS[k]}の割合`,
          value: ratio(s.attributes[k], denom),
          unit: "割合",
          formula: `${ATTRIBUTE_LABELS[k]} ÷ 同区分の記録人数合計`,
          basis: `${s.attributes[k]} / ${denom}（未記録 ${s.unrecorded[grp]} 人は分母に含めない）`,
          status: "excel_verified",
          missingReason: denom === 0 ? "記録人数が0のため算出しません" : null,
        });
      }
    }
    for (const gt of ["single", "family", "group", "party"] as GroupType[]) {
      out.push({
        key: `${prefix}.groupShare.${gt}`,
        label: `${label}のグループ構成（${GROUP_TYPE_LABELS[gt]}）`,
        value: ratio(s.byGroupType[gt].people, s.people),
        unit: "割合",
        formula: "グループ属性別の人数 ÷ 人数合計",
        basis: `${s.byGroupType[gt].people} / ${s.people}`,
        status: "excel_verified",
        missingReason: s.people === 0 ? "人数が0のため算出しません" : null,
      });
    }
    return out;
  };
  return [...list, ...ratioIndicators("stay", stay, "滞在者"), ...ratioIndicators("pass", pass, "通行者")];
}

function repValue(rep: CalcRepresentative | null | undefined): number | null {
  return rep && rep.valueState === "value" ? rep.valueNum : null;
}

/** 空間A（沿道建物・土地）の指標。Excel 計算_集計 CH8～CY8 と同じ式。入力は確定済み代表値。 */
export function spaceAIndicators(values: Record<string, number | null>): Indicator[] {
  const codes = ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10", "A11", "A12", "A13"];
  const missing = codes.filter((c) => values[c] === null || values[c] === undefined);
  const v = (c: string) => values[c] ?? 0;
  const sum = (cs: string[]) => cs.reduce((a, c) => a + v(c), 0);
  const used = ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09"];
  const visible = ["A01", "A02", "A04", "A05", "A07", "A08"];
  const hidden = ["A03", "A06", "A09"];
  const terrace = ["A01", "A04", "A07"];
  const reason = (needed: string[], denom: number) => {
    const miss = needed.filter((c) => missing.includes(c));
    if (miss.length) return `代表値が未確定の項目があります（${miss.join(", ")}）`;
    if (denom <= 0) return "分母が0のため算出しません";
    return null;
  };
  const build = (key: string, label: string, needed: string[], num: number, denom: number | null, formula: string, unit = "割合"): Indicator => {
    const mr = reason(needed, denom ?? 1);
    return {
      key,
      label,
      value: mr ? null : denom === null ? num : ratio(num, denom),
      unit,
      formula,
      basis: "空間Aの確定代表値",
      status: "excel_verified",
      missingReason: mr,
    };
  };
  const allBuildings = [...used, "A10"];
  const land = ["A11", "A12", "A13"];
  return [
    build("spaceA.usedRatio", "建物：利用の割合", allBuildings, sum(used), sum(allBuildings), "利用（A01～A09）÷ 建物全体（A01～A10）"),
    build("spaceA.unusedRatio", "建物：未利用の割合", allBuildings, v("A10"), sum(allBuildings), "未利用（A10）÷ 建物全体（A01～A10）"),
    build("spaceA.visibleRatio", "「利用者の様子が見やすい」割合", used, sum(visible), sum(used), "見やすい（A01,A02,A04,A05,A07,A08）÷ 利用建物（A01～A09）"),
    build("spaceA.hiddenRatio", "「利用者の様子が見にくい」割合", used, sum(hidden), sum(used), "見にくい（A03,A06,A09）÷ 利用建物（A01～A09）"),
    build("spaceA.terraceCount", "「屋外の滞留空間あり」の建築数", terrace, sum(terrace), null, "A01＋A04＋A07", "件"),
    build("spaceA.landActiveRatio", "土地：滞留空間として活用の割合", land, v("A11") + v("A12"), sum(land), "活用（A11＋A12）÷ 土地全体（A11～A13）"),
    build("spaceA.landInactiveRatio", "土地：滞留空間として未活用の割合", land, v("A13"), sum(land), "未活用（A13）÷ 土地全体（A11～A13）"),
    build("spaceA.eventCount", "キッチンカーなどイベントを実施（件）", ["A11"], v("A11"), null, "A11", "件"),
  ];
}

export function spaceBDisplay(value: number | null): "✓" | "□" | "－" {
  if (value === 1) return "✓";
  if (value === 2) return "□";
  return "－";
}

/** 主観と活動の代表値の差が2以上なら「＊」（Excel 計算_集計 15行目の式）。 */
export function gapFlag(subjective: number | null, activity: number | null): boolean | null {
  if (subjective === null || activity === null) return null;
  return Math.abs(subjective - activity) >= 2;
}

export function aggregateRound(input: CalcInput): RoundAggregate {
  const includeStatuses = input.includeStatuses ?? ["accepted"];
  const subs = selectSubmissions(input);
  const warnings: string[] = [];
  const pendingReview = input.submissions.filter((s) => s.status === "submitted").length;
  if (pendingReview > 0 && !includeStatuses.includes("submitted")) {
    warnings.push(`未審査の提出が ${pendingReview} 件あります（集計対象外）。`);
  }
  if (subs.length === 0) warnings.push("集計対象の提出がありません。");

  const questions = aggregateQuestions(input, subs);
  const activityTypes = aggregateActivityTypes(input, subs);

  const obsSubIds = new Set(subs.filter((s) => s.observationsIncluded).map((s) => s.id));
  const obsGroups = input.observations.filter((o) => obsSubIds.has(o.submissionId));
  const summary = summarizeObservations(obsGroups);
  const contributing = new Set(obsGroups.map((o) => o.submissionId));
  if (contributing.size > 1) {
    warnings.push(
      `滞在者・通行者の記録が ${contributing.size} 名の調査者から集計されています。同じ人を重複して数えていないか確認し、必要に応じて提出ごとの「人数集計に含める」を切り替えてください。`,
    );
  }
  const observation: ObservationAggregate = {
    includedSubmissionIds: [...contributing],
    ...summary,
    indicators: observationIndicators(summary, input.round),
  };

  const byCode = new Map(questions.map((q) => [q.code, q]));
  const valueFor = (code: string): { value: number | null; source: "representative" | "suggestion" | "none" } => {
    const q = byCode.get(code);
    if (!q) return { value: null, source: "none" };
    if (q.representative) return { value: repValue(q.representative), source: "representative" };
    if (q.suggestion.value !== null) return { value: q.suggestion.value, source: "suggestion" };
    return { value: null, source: "none" };
  };

  const spaceAValues: Record<string, number | null> = {};
  for (const q of questions.filter((x) => x.section === "space_a" && x.answerFormat === "count" && !x.isCustom)) {
    spaceAValues[q.code] = q.visible ? repValue(q.representative) : null;
  }
  const spaceA = spaceAIndicators(spaceAValues);

  const spaceB: SpaceBDisplay[] = questions
    .filter((q) => q.section === "space_b" && q.answerFormat === "ynu3" && q.visible)
    .map((q) => {
      const v = valueFor(q.code);
      return { questionId: q.questionId, code: q.code, text: q.text, value: v.value, display: spaceBDisplay(v.value), source: v.source };
    });

  const gaps: GapFlag[] = [];
  const subjectives = questions.filter((q) => q.kind === "subjective" && q.element && q.pairNo !== null);
  for (const s of subjectives) {
    const a = questions.find((q) => q.kind === "activity" && q.element === s.element && q.pairNo === s.pairNo);
    if (!a || !s.visible || !a.visible) continue;
    const sv = valueFor(s.code);
    const av = valueFor(a.code);
    const source = sv.source === "representative" && av.source === "representative" ? "representative" : sv.source === "suggestion" && av.source === "suggestion" ? "suggestion" : "mixed";
    gaps.push({
      element: s.element as string,
      pairNo: s.pairNo as number,
      subjectiveCode: s.code,
      activityCode: a.code,
      subjective: sv.value,
      activity: av.value,
      source,
      flag: gapFlag(sv.value, av.value),
    });
  }

  return {
    calcVersion: CALC_VERSION,
    includeStatuses,
    includedSubmissions: subs.map((s) => ({ id: s.id, surveyorName: s.surveyorName, status: s.status })),
    questions,
    activityTypes,
    observation,
    spaceA,
    spaceB,
    gaps,
    warnings,
  };
}
