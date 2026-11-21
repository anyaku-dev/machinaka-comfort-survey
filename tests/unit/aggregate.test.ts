import { describe, expect, it } from "vitest";
import { aggregateRound, mean, perHour, ratio, summarizeObservations, uniqueMode } from "@/lib/calculation/aggregate";
import type { CalcInput, CalcObservation, CalcQuestion } from "@/lib/calculation/types";

const q = (over: Partial<CalcQuestion> & { id: string; code: string }): CalcQuestion => ({
  section: "anshin",
  element: "anshin",
  kind: "subjective",
  pairNo: 1,
  originalNo: null,
  text: over.code,
  answerFormat: "scale4",
  options: null,
  visible: true,
  fixedValue: null,
  computedFrom: null,
  verification: "pdf_excel_verified",
  isCustom: false,
  displayOrder: 1,
  ...over,
});

const base = (): CalcInput => ({
  round: { stayMeasureMinutes: 10, passMeasureMinutes: 10 },
  questions: [
    q({ id: "s1", code: "ANS-01-S" }),
    q({ id: "a1", code: "ANS-01-A", kind: "activity", displayOrder: 2 }),
    q({ id: "c1", code: "A01", section: "space_a", element: null, kind: "count", pairNo: null, answerFormat: "count", displayOrder: 3 }),
    q({ id: "b1", code: "B01", section: "space_b", element: null, kind: "fact", pairNo: null, answerFormat: "ynu3", displayOrder: 4 }),
    q({ id: "t1", code: "KAN-T02", section: "kanyo_type", element: "kanyo", kind: "activity_type_computed", pairNo: null, answerFormat: "computed", computedFrom: ["ANS-01-A", "ANS-01-S"], displayOrder: 5 }),
  ],
  submissions: [
    { id: "x", surveyorName: "X", status: "accepted", observationsIncluded: true },
    { id: "y", surveyorName: "Y", status: "accepted", observationsIncluded: true },
    { id: "z", surveyorName: "Z", status: "submitted", observationsIncluded: true },
    { id: "w", surveyorName: "W", status: "excluded", observationsIncluded: true },
  ],
  answers: [
    { submissionId: "x", questionId: "s1", state: "answered", valueNum: 1, valueText: null },
    { submissionId: "y", questionId: "s1", state: "unanswered", valueNum: null, valueText: null },
    { submissionId: "z", questionId: "s1", state: "answered", valueNum: 4, valueText: null },
    { submissionId: "w", questionId: "s1", state: "answered", valueNum: 4, valueText: null },
    { submissionId: "x", questionId: "a1", state: "not_applicable", valueNum: null, valueText: null },
    { submissionId: "y", questionId: "a1", state: "answered", valueNum: 3, valueText: null },
    { submissionId: "x", questionId: "c1", state: "answered", valueNum: 0, valueText: null },
    { submissionId: "y", questionId: "c1", state: "answered", valueNum: 4, valueText: null },
    { submissionId: "x", questionId: "b1", state: "answered", valueNum: 1, valueText: null },
    { submissionId: "y", questionId: "b1", state: "answered", valueNum: 2, valueText: null },
  ],
  observations: [],
  representatives: [],
});

describe("基本関数", () => {
  it("mean は空なら null", () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2])).toBe(1.5);
  });
  it("uniqueMode は同数なら null", () => {
    expect(uniqueMode([1, 1, 2])).toBe(1);
    expect(uniqueMode([1, 2])).toBeNull();
    expect(uniqueMode([])).toBeNull();
  });
  it("ratio は分母0・非数で null", () => {
    expect(ratio(1, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });
  it("perHour は計測分数が無い・0以下なら null", () => {
    expect(perHour(10, null)).toBeNull();
    expect(perHour(10, 0)).toBeNull();
    expect(perHour(10, -5)).toBeNull();
    expect(perHour(10, 30)).toBe(20);
    expect(perHour(0, 30)).toBe(0);
  });
});

describe("aggregateRound", () => {
  it("既定では採用（accepted）だけを集計し、未審査があれば警告する", () => {
    const agg = aggregateRound(base());
    expect(agg.includedSubmissions.map((s) => s.id)).toEqual(["x", "y"]);
    expect(agg.warnings.join()).toMatch(/未審査の提出が 1 件/);
  });

  it("評価1・未回答・適用外・0件を区別し、平均には回答済みだけを使う", () => {
    const agg = aggregateRound(base());
    const s1 = agg.questions.find((x) => x.code === "ANS-01-S")!;
    expect(s1.counts.answered).toBe(1);
    expect(s1.counts.unanswered).toBe(1);
    expect(s1.mean).toBe(1); // 評価1は値として平均に入り、未回答は除外
    const a1 = agg.questions.find((x) => x.code === "ANS-01-A")!;
    expect(a1.counts.not_applicable).toBe(1);
    expect(a1.mean).toBe(3);
    const c1 = agg.questions.find((x) => x.code === "A01")!;
    expect(c1.n).toBe(2); // 0件は回答として数える
    expect(c1.mean).toBe(2);
  });

  it("はい/いいえ/不明は平均せず、割れたら提案値なし", () => {
    const b1 = aggregateRound(base()).questions.find((x) => x.code === "B01")!;
    expect(b1.mean).toBeNull();
    expect(b1.suggestion.value).toBeNull();
    expect(b1.suggestion.method).toBe("none");
  });

  it("未審査を含める指定ができる", () => {
    const agg = aggregateRound({ ...base(), includeStatuses: ["accepted", "submitted"] });
    expect(agg.questions.find((x) => x.code === "ANS-01-S")!.mean).toBe(2.5);
  });

  it("活動の種類は算出元の最大値（未回答・適用外は値なし）", () => {
    const t = aggregateRound(base()).activityTypes[0];
    expect(t.perSurveyor.map((p) => p.value)).toEqual([1, 3]);
    expect(t.mean).toBe(2);
  });

  it("活動の種類：算出元が全て非表示なら理由を示して算出しない", () => {
    const input = base();
    input.questions = input.questions.map((x) => (["s1", "a1"].includes(x.id) ? { ...x, visible: false } : x));
    input.answers = input.answers.filter((a) => !["s1", "a1"].includes(a.questionId));
    const t = aggregateRound(input).activityTypes[0];
    expect(t.mean).toBeNull();
    expect(t.missingReason).toMatch(/非表示/);
  });

  it("平均値と代表値を別に保持し、乖離判定は代表値を優先する", () => {
    const input = base();
    input.representatives = [
      { questionId: "s1", valueState: "value", valueNum: 4, method: "manual", note: "" },
      { questionId: "a1", valueState: "value", valueNum: 1, method: "manual", note: "" },
    ];
    const agg = aggregateRound(input);
    const s1 = agg.questions.find((x) => x.code === "ANS-01-S")!;
    expect(s1.mean).toBe(1);
    expect(s1.representative?.valueNum).toBe(4);
    expect(agg.gaps[0]).toMatchObject({ subjective: 4, activity: 1, flag: true, source: "representative" });
  });

  it("固定値は提案値として使われる", () => {
    const input = base();
    input.questions = input.questions.map((x) => (x.id === "s1" ? { ...x, fixedValue: { value: 2 } } : x));
    expect(aggregateRound(input).questions.find((x) => x.code === "ANS-01-S")!.suggestion).toMatchObject({ method: "fixed", value: 2 });
  });
});

describe("summarizeObservations", () => {
  const g = (o: Partial<CalcObservation>): CalcObservation => ({
    submissionId: "x",
    presence: "stay",
    groupType: "single",
    groupSize: 1,
    male: null,
    female: null,
    genderUnknown: null,
    infant: null,
    child: null,
    teen: null,
    adult: null,
    elderly: null,
    ageUnknown: null,
    walkFast: null,
    walkSlow: null,
    japanese: null,
    foreigner: null,
    nationalityUnknown: null,
    ...o,
  });
  it("属性を記録していない（非表示）グループは未記録として分母から除く", () => {
    const s = summarizeObservations([
      g({ groupType: "family", groupSize: 3, male: 1, female: 2, genderUnknown: 0 }),
      g({ groupType: "group", groupSize: 2 }),
      g({ presence: "pass", groupSize: 1, walkFast: 1, walkSlow: 0 }),
    ]);
    expect(s.stay.people).toBe(5);
    expect(s.stay.unrecorded.gender).toBe(2);
    expect(s.stay.attributes.female).toBe(2);
    expect(s.interactionPeople).toBe(5);
    expect(s.pass.attributes.walkFast).toBe(1);
    expect(s.pass.people).toBe(1);
  });
  it("0人（記録なし）でもエラーにならない", () => {
    const s = summarizeObservations([]);
    expect(s.stay.people).toBe(0);
  });
});
