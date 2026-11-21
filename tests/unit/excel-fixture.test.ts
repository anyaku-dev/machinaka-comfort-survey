/**
 * 国交省 分析ツール（記入例）001740897.xlsx のキャッシュ値との照合。
 * フィクスチャは scripts/extract-excel-fixture.py で抽出（tests/fixtures/mlit-example-v1.1.json）。
 */
import { describe, expect, it } from "vitest";
import fixture from "../fixtures/mlit-example-v1.1.json";
import { aggregateRound, gapFlag, spaceAIndicators, spaceBDisplay, summarizeObservations, observationIndicators } from "@/lib/calculation/aggregate";
import type { CalcAnswer, CalcInput, CalcObservation, CalcQuestion } from "@/lib/calculation/types";
import { QUESTION_MASTER } from "@/lib/questionnaire/master";

const byRow = new Map(QUESTION_MASTER.filter((q) => q.excelRow).map((q) => [q.excelRow as number, q]));

function toCalcQuestions(): CalcQuestion[] {
  return QUESTION_MASTER.map((q) => ({
    id: q.code,
    code: q.code,
    section: q.section,
    element: q.element,
    kind: q.kind,
    pairNo: q.pairNo,
    originalNo: q.originalNo,
    text: q.text,
    answerFormat: q.answerFormat,
    options: q.options,
    visible: true,
    fixedValue: null,
    computedFrom: q.computedFrom ?? null,
    verification: q.verification,
    isCustom: false,
    displayOrder: q.displayOrder,
  }));
}

const surveyors = fixture.surveyors.filter((s) => Object.keys(s.values).length > 0);

function buildInput(): CalcInput {
  const answers: CalcAnswer[] = [];
  surveyors.forEach((s) => {
    for (const [row, v] of Object.entries(s.values)) {
      const q = byRow.get(Number(row));
      if (!q || q.answerFormat === "computed") continue;
      answers.push({ submissionId: s.column, questionId: q.code, state: "answered", valueNum: v as number, valueText: null });
    }
  });
  return {
    round: { stayMeasureMinutes: fixture.measureMinutes.stay, passMeasureMinutes: fixture.measureMinutes.pass },
    questions: toCalcQuestions(),
    submissions: surveyors.map((s) => ({ id: s.column, surveyorName: s.column, status: "accepted", observationsIncluded: true })),
    answers,
    observations: [],
    representatives: [],
  };
}

describe("記入例Excelとの照合：居心地の良さ（平均値）", () => {
  const agg = aggregateRound(buildInput());

  it("主観・活動の各項目の平均値が Excel K列（=AVERAGE(L:Q)）と一致する", () => {
    let checked = 0;
    for (const [row, k] of Object.entries(fixture.excelAverageK)) {
      const r = Number(row);
      if (r >= 146 && r <= 175) continue; // 活動の種類は別テスト
      const q = byRow.get(r);
      if (!q) continue; // 独自項目欄（※エリア特性に応じて追加）は対象外
      const a = agg.questions.find((x) => x.code === q.code)!;
      expect(a.mean, `${q.code} (row ${r})`).toBeCloseTo(k as number, 10);
      checked++;
    }
    expect(checked).toBe(86);
  });

  it("寛容性『活動の種類』1～20：Excelの算式（6列・空欄=0の平均）を再現できる", () => {
    for (const t of agg.activityTypes) {
      const q = QUESTION_MASTER.find((m) => m.code === t.code)!;
      const k = (fixture.excelAverageK as Record<string, number>)[String(q.excelRow)];
      expect(t.excelCompatibleMean, t.code).toBeCloseTo(k, 10);
    }
    expect(agg.activityTypes).toHaveLength(20);
  });

  it("活動の種類の算出元は Excel 入力① の式（=MAX/参照）と一致する", () => {
    const rowOf = (code: string) => QUESTION_MASTER.find((m) => m.code === code)!.excelRow;
    for (const [row, f] of Object.entries(fixture.activityTypeFormulas)) {
      const q = byRow.get(Number(row))!;
      const refs = [...(f.formulaL as string).matchAll(/L(\d+)/g)].map((m) => Number(m[1]));
      expect((q.computedFrom ?? []).map(rowOf).sort(), q.code).toEqual(refs.sort());
    }
  });

  it("アプリの平均（算出元が回答済みの調査者のみ）は Excel と異なりうることを明示する", () => {
    const t = agg.activityTypes.find((x) => x.code === "KAN-T01")!;
    expect(t.mean).toBeCloseTo(4, 10); // 5名とも4
    expect(t.excelCompatibleMean).toBeCloseTo(20 / 6, 10); // Excel は空の6列目を0として平均
  });
});

describe("記入例Excelとの照合：滞在者・通行者", () => {
  const typeMap: Record<string, CalcObservation["groupType"]> = { "1人": "single", 家族: "family", グループ: "group", 団体: "party" };
  const groups: CalcObservation[] = fixture.observationGroups.map((g) => ({
    submissionId: "x",
    presence: g.presence === "滞在" ? "stay" : "pass",
    groupType: typeMap[g.groupType],
    // Excel は性別の内訳合計を人数としている（計算_集計 C8=SUM(入力①!E254:G257)）
    groupSize: g.male + g.female + g.genderUnknown,
    male: g.male,
    female: g.female,
    genderUnknown: g.genderUnknown,
    infant: g.infant,
    child: g.child,
    teen: g.teen,
    adult: g.adult,
    elderly: g.elderly,
    ageUnknown: g.ageUnknown,
    walkFast: g.walkFast,
    walkSlow: g.walkSlow,
    japanese: g.japanese,
    foreigner: g.foreigner,
    nationalityUnknown: g.nationalityUnknown,
  }));
  const summary = summarizeObservations(groups);
  const ind = Object.fromEntries(observationIndicators(summary, { stayMeasureMinutes: 14, passMeasureMinutes: 12 }).map((i) => [i.key, i.value]));

  it("滞在者数・交流者数・通行者数（計算_集計 C8/D8/AR8）", () => {
    expect(summary.stay.people).toBe(fixture.cached.C8);
    expect(summary.interactionPeople).toBe(fixture.cached.D8);
    expect(summary.pass.people).toBe(fixture.cached.AR8);
  });

  it("1時間当たり人数（E8/F8/F20 = 人数÷計測分×60）", () => {
    expect(ind["stay.perHour"]).toBeCloseTo(fixture.cached.E8 as number, 10);
    expect(ind["interaction.perHour"]).toBeCloseTo(fixture.cached.F8 as number, 10);
    expect(ind["pass.perHour"]).toBeCloseTo(fixture.cached.F20 as number, 10);
  });

  it("計測分数が無い場合は1時間当たり人数を算出しない", () => {
    const i = Object.fromEntries(observationIndicators(summary, { stayMeasureMinutes: null, passMeasureMinutes: 0 }).map((x) => [x.key, x]));
    expect(i["stay.perHour"].value).toBeNull();
    expect(i["stay.perHour"].missingReason).toMatch(/計測分数/);
    expect(i["pass.perHour"].value).toBeNull();
    expect(i["stay.share"].value).toBeNull();
  });
});

describe("記入例Excelとの照合：空間A・空間B・主観と活動の乖離", () => {
  const rep = fixture.representative as Record<string, number>;
  it("空間Aの割合・件数（計算_集計 CH8～CY8）", () => {
    const values: Record<string, number> = {};
    for (let r = 61; r <= 73; r++) values[`A${String(r - 60).padStart(2, "0")}`] = rep[String(r)];
    const i = Object.fromEntries(spaceAIndicators(values).map((x) => [x.key, x.value]));
    expect(i["spaceA.usedRatio"]).toBeCloseTo(fixture.cached.CH8 as number, 10);
    expect(i["spaceA.unusedRatio"]).toBeCloseTo(fixture.cached.CI8 as number, 10);
    expect(i["spaceA.visibleRatio"]).toBeCloseTo(fixture.cached.CJ8 as number, 10);
    expect(i["spaceA.hiddenRatio"]).toBeCloseTo(fixture.cached.CK8 as number, 10);
    expect(i["spaceA.terraceCount"]).toBe(fixture.cached.CL8);
    expect(i["spaceA.landActiveRatio"]).toBeCloseTo(fixture.cached.CW8 as number, 10);
    expect(i["spaceA.landInactiveRatio"]).toBeCloseTo(fixture.cached.CX8 as number, 10);
    expect(i["spaceA.eventCount"]).toBe(fixture.cached.CY8);
  });

  it("空間Aの代表値が未確定なら割合を算出しない", () => {
    const i = spaceAIndicators({ A01: 1 });
    expect(i.find((x) => x.key === "spaceA.usedRatio")!.value).toBeNull();
  });

  it("空間Bの表示（1=✓, 2=空欄/□, 3=－）", () => {
    for (const v of Object.values(fixture.spaceBDisplay)) {
      if (v.value === null) continue;
      const expected = v.display === "" ? "□" : v.display;
      expect(spaceBDisplay(v.value as number)).toBe(expected);
    }
  });

  it("主観と活動の代表値の差が2以上で＊（計算_集計 15行目）", () => {
    let n = 0;
    for (const g of Object.values(fixture.gapFlags)) {
      if (g.subjective === null || g.activity === null) continue;
      expect(gapFlag(g.subjective, g.activity)).toBe(g.flag === "＊");
      n++;
    }
    expect(n).toBeGreaterThan(30);
  });
});
