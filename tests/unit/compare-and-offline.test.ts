import { describe, expect, it } from "vitest";
import { diffConditions, type ComparableRound } from "@/lib/calculation/compare";
import { buildPayload, draftFromPayload, emptyDraft, newObservation, type ParticipantQuestion } from "@/lib/offline/local-store";

const round = (o: Partial<ComparableRound> = {}): ComparableRound => ({
  roundId: "r",
  roundNumber: 1,
  title: "",
  status: "closed",
  surveyDate: "2026-05-11",
  isHoliday: false,
  startTime: "14:00",
  endTime: "15:00",
  isNight: false,
  eventName: "",
  stayMeasureMinutes: 15,
  passMeasureMinutes: 10,
  scopeText: "A",
  frontageScopeText: "B",
  peripheralScopeText: "C",
  masterVersion: "ver1.1",
  calcVersion: "app-calc-1.0.0",
  visibleCodes: ["X", "Y"],
  weatherStart: "sunny",
  weatherEnd: "sunny",
  finalizedVersion: 1,
  indicators: {},
  representatives: {},
  ...o,
});

describe("比較条件の差異", () => {
  it("同条件なら差異なし", () => expect(diffConditions(round(), round())).toEqual([]));
  it("計測時間・曜日区分・範囲・設問構成・確定状態の差を列挙する", () => {
    const d = diffConditions(round(), round({ stayMeasureMinutes: 30, surveyDate: "2026-05-10", scopeText: "Z", visibleCodes: ["X"], finalizedVersion: null, startTime: "18:00" }));
    const keys = d.map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(["stayMinutes", "dayKind", "scope", "questions", "finalized", "timeOfDay"]));
  });
  it("計測時間未設定も差異として示す", () => {
    expect(diffConditions(round(), round({ passMeasureMinutes: null })).find((x) => x.key === "passMinutes")!.other).toBe("未設定");
  });
});

describe("端末側の提出内容の組み立て", () => {
  const qs: ParticipantQuestion[] = [
    { id: "q1", code: "ANS-01-S", section: "anshin", element: "anshin", kind: "subjective", pairNo: 1, originalNo: "", category: null, text: "", answerFormat: "scale4", options: [], applicability: null, fixedValue: null, notes: null, displayOrder: 1, isCustom: false },
    { id: "q2", code: "A01", section: "space_a", element: null, kind: "count", pairNo: null, originalNo: "", category: null, text: "", answerFormat: "count", options: null, applicability: null, fixedValue: null, notes: null, displayOrder: 2, isCustom: false },
    { id: "q3", code: "A02", section: "space_a", element: null, kind: "count", pairNo: null, originalNo: "", category: null, text: "", answerFormat: "count", options: null, applicability: null, fixedValue: null, notes: null, displayOrder: 3, isCustom: false },
    { id: "q4", code: "B01", section: "space_b", element: null, kind: "fact", pairNo: null, originalNo: "", category: null, text: "", answerFormat: "ynu3", options: null, applicability: null, fixedValue: { value: 1 }, notes: null, displayOrder: 4, isCustom: false },
    { id: "o1", code: "OBS-GENDER", section: "observation", element: null, kind: "observation_attribute", pairNo: null, originalNo: "", category: null, text: "", answerFormat: "observation", options: null, applicability: null, fixedValue: null, notes: null, displayOrder: 5, isCustom: false },
  ];
  it("0件・未回答・適用外を区別し、固定値の設問は送らない", () => {
    const d = { ...emptyDraft(), answers: { q2: { state: "answered" as const, value: 0 }, q1: { state: "not_applicable" as const, value: null } } };
    const p = buildPayload(qs, d, { gender: true, age: false, behavior: false, nationality: false });
    expect(p.answers).toEqual([
      { questionId: "q1", state: "not_applicable" },
      { questionId: "q2", state: "answered", value: 0 },
      { questionId: "q3", state: "unanswered" },
    ]);
  });
  it("非表示の属性は送らない", () => {
    const d = { ...emptyDraft(), observations: [{ ...newObservation("stay"), male: 1 }] };
    const p = buildPayload(qs, d, { gender: true, age: false, behavior: false, nationality: false });
    expect(p.observations[0]).toEqual({ presence: "stay", groupType: "single", groupSize: 1, male: 1, female: 0, genderUnknown: 0 });
  });
  it("差し戻し時に前回提出内容を下書きに戻せる", () => {
    const d = draftFromPayload({ answers: [{ questionId: "q2", state: "answered", value: 0 }, { questionId: "q3", state: "unanswered" }], observations: [{ presence: "pass", groupType: "single", groupSize: 1 }] })!;
    expect(d.answers).toEqual({ q2: { state: "answered", value: 0 } });
    expect(d.observations[0].presence).toBe("pass");
  });
});
