import { describe, expect, it } from "vitest";
import { groupSizeWarning, observationInputSchema, observationProblems, participantSubmitSchema } from "@/lib/validation/schemas";

const all = { gender: true, age: true, behavior: true, nationality: true };

describe("観察グループの整合性", () => {
  it("属性別人数の合計がグループ人数と一致しないと指摘する", () => {
    const p = observationProblems({ presence: "stay", groupType: "family", groupSize: 3, male: 1, female: 1, genderUnknown: 0, infant: 0, child: 0, teen: 0, adult: 3, elderly: 0, ageUnknown: 0, japanese: 3, foreigner: 0, nationalityUnknown: 0 }, all);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/性別/);
  });
  it("行動は通行者のみ検査する", () => {
    const o = { presence: "stay", groupType: "single", groupSize: 1, male: 1, female: 0, genderUnknown: 0, infant: 0, child: 0, teen: 0, adult: 1, elderly: 0, ageUnknown: 0, japanese: 1, foreigner: 0, nationalityUnknown: 0, walkFast: 0, walkSlow: 0 };
    expect(observationProblems(o, all)).toEqual([]);
    expect(observationProblems({ ...o, presence: "pass" }, all)[0]).toMatch(/行動/);
  });
  it("非表示の属性は検査しない", () => {
    expect(observationProblems({ presence: "stay", groupType: "group", groupSize: 2 }, { gender: false, age: false, behavior: false, nationality: false })).toEqual([]);
  });
  it("1人は1名、家族・グループ・団体は2名以上", () => {
    expect(observationProblems({ presence: "stay", groupType: "single", groupSize: 2 }, { gender: false, age: false, behavior: false, nationality: false })[0]).toMatch(/1人/);
    expect(observationProblems({ presence: "stay", groupType: "group", groupSize: 1 }, { gender: false, age: false, behavior: false, nationality: false })[0]).toMatch(/2人以上/);
  });
  it("団体は10人以上の目安を警告（エラーにはしない）", () => {
    expect(groupSizeWarning("party", 5)).toMatch(/10人以上/);
    expect(groupSizeWarning("party", 12)).toBeNull();
  });
  it("スキーマ：負の人数を拒否", () => {
    expect(observationInputSchema.safeParse({ presence: "stay", groupType: "single", groupSize: 1, male: -1 }).success).toBe(false);
  });
});

describe("提出スキーマ", () => {
  const ok = {
    token: "a".repeat(43),
    surveyorId: "00000000-0000-4000-8000-000000000001",
    surveyorKey: "b".repeat(43),
    idempotencyKey: "00000000-0000-4000-8000-000000000002",
    payload: { answers: [{ questionId: "00000000-0000-4000-8000-000000000003", state: "answered", value: 1 }], observations: [] },
  };
  it("正しい形式を受け付ける", () => expect(participantSubmitSchema.safeParse(ok).success).toBe(true));
  it("不正な回答状態（hidden 等）を拒否", () => {
    const bad = { ...ok, payload: { ...ok.payload, answers: [{ ...ok.payload.answers[0], state: "hidden" }] } };
    expect(participantSubmitSchema.safeParse(bad).success).toBe(false);
  });
  it("短いトークンを拒否", () => expect(participantSubmitSchema.safeParse({ ...ok, token: "abc" }).success).toBe(false));
});
