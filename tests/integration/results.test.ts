import { beforeAll, describe, expect, it } from "vitest";
import { api, createActiveRound, createOrganizer, q, registerSurveyor, submit, type ActiveRound, type Organizer } from "./helpers";

let A: Organizer;
let round: ActiveRound;
const subs: string[] = [];

const obs = (presence: "stay" | "pass", groupType: string, size: number) => ({
  presence,
  groupType,
  groupSize: size,
  male: size,
  female: 0,
  genderUnknown: 0,
  infant: 0,
  child: 0,
  teen: 0,
  adult: size,
  elderly: 0,
  ageUnknown: 0,
  japanese: size,
  foreigner: 0,
  nationalityUnknown: 0,
  ...(presence === "pass" ? { walkFast: size, walkSlow: 0 } : {}),
});

beforeAll(async () => {
  A = await createOrganizer("r");
  round = await createActiveRound(A, { stay: 10, pass: null });
  const values = [
    { s: 1, a: 4, cnt: 0 },
    { s: 4, a: 2, cnt: 3 },
  ];
  for (const [i, v] of values.entries()) {
    const sv = await registerSurveyor(round.token, i === 0 ? "=HYPERLINK(\"http://evil\")" : "調査者二");
    const r = await submit(round.token, sv, {
      answers: [
        { questionId: q(round, "ANS-01-S"), state: "answered", value: v.s },
        { questionId: q(round, "ANS-01-A"), state: "answered", value: v.a },
        { questionId: q(round, "A01"), state: "answered", value: v.cnt },
        { questionId: q(round, "B01"), state: "answered", value: 1 },
      ],
      observations: i === 0 ? [obs("stay", "single", 1), obs("stay", "family", 3), obs("pass", "single", 1)] : [obs("stay", "group", 2)],
    });
    subs.push(r.body.submissionId);
  }
});

describe("集計・代表値・確定・CSV", () => {
  it("採用前は集計対象0件。未審査を含めた暫定表示ができる", async () => {
    const a = await A.call(`/api/rounds/${round.roundId}/aggregate`);
    expect(a.body.includedSubmissions).toHaveLength(0);
    const b = await A.call(`/api/rounds/${round.roundId}/aggregate?include=submitted`);
    expect(b.body.includedSubmissions).toHaveLength(2);
  });

  it("採用・除外は履歴に残り、集計対象が変わる", async () => {
    for (const id of subs) expect((await A.call(`/api/submissions/${id}/review`, "POST", { action: "accept" })).body.status).toBe("accepted");
    const a = await A.call(`/api/rounds/${round.roundId}/aggregate`);
    const s = a.body.questions.find((x: { code: string }) => x.code === "ANS-01-S");
    expect(s.mean).toBe(2.5);
    expect(s.perSurveyor.map((p: { value: number }) => p.value)).toEqual([1, 4]);
    const ind = Object.fromEntries(a.body.observation.indicators.map((i: { key: string; value: number | null }) => [i.key, i.value]));
    expect(ind["stay.people"]).toBe(6);
    expect(ind["interaction.people"]).toBe(5);
    expect(ind["stay.perHour"]).toBe(36);
    expect(ind["pass.perHour"]).toBeNull(); // 通行者の計測分数なし → 算出しない
    expect(a.body.warnings.join()).toMatch(/2 名の調査者/);
  });

  it("人数集計から提出を外すと人数が変わる", async () => {
    await A.call(`/api/submissions/${subs[1]}/observations`, "POST", { included: false });
    const a = await A.call(`/api/rounds/${round.roundId}/aggregate`);
    expect(a.body.observation.stay.people).toBe(4);
    await A.call(`/api/submissions/${subs[1]}/observations`, "POST", { included: true });
  });

  it("代表値は平均値と別に保存され、形式外の値は拒否される", async () => {
    const bad = await A.call(`/api/rounds/${round.roundId}/representatives`, "PUT", {
      items: [{ roundQuestionId: q(round, "ANS-01-S"), valueState: "value", valueNum: 7, method: "manual" }],
    });
    expect(bad.status).toBe(422);
    const ok = await A.call(`/api/rounds/${round.roundId}/representatives`, "PUT", {
      items: [
        { roundQuestionId: q(round, "ANS-01-S"), valueState: "value", valueNum: 3, method: "manual", note: "協議で決定" },
        { roundQuestionId: q(round, "ANS-01-A"), valueState: "value", valueNum: 3, method: "mean" },
        { roundQuestionId: q(round, "B01"), valueState: "value", valueNum: 1, method: "mode" },
        { roundQuestionId: q(round, "A02"), valueState: "not_applicable", valueNum: null, method: "manual" },
      ],
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const a = await A.call(`/api/rounds/${round.roundId}/aggregate`);
    const s = a.body.questions.find((x: { code: string }) => x.code === "ANS-01-S");
    expect(s.mean).toBe(2.5);
    expect(s.representative).toMatchObject({ valueNum: 3, method: "manual" });
    const { data: logs } = await A.db.from("audit_logs").select("action").eq("round_id", round.roundId).eq("action", "representative.set");
    expect(logs!.length).toBe(4);
  });

  it("集計を確定すると版が記録され、調査者名は仮名化される", async () => {
    const r1 = await A.call(`/api/rounds/${round.roundId}/finalize`, "POST", { note: "第1版" });
    expect(r1.body.version).toBe(1);
    const r2 = await A.call(`/api/rounds/${round.roundId}/finalize`, "POST", {});
    expect(r2.body.version).toBe(2);
    const { data } = await A.db.from("round_results").select("payload").eq("round_id", round.roundId).eq("version", 1).single();
    expect(JSON.stringify(data!.payload)).not.toContain("HYPERLINK");
    expect(data!.payload.calcVersion).toBe("app-calc-1.0.0");
  });


  it("CSV（原回答）：調査者名の数式は無害化され、回答状態が出力される", async () => {
    const r = await api(`/api/rounds/${round.roundId}/export?type=raw`, "GET", undefined, A.token);
    expect(r.headers.get("content-type")).toMatch(/text\/csv/);
    const bytes = new Uint8Array(await (await fetch(`${process.env.TEST_BASE_URL ?? "http://localhost:3100"}/api/rounds/${round.roundId}/export?type=raw`, { headers: { Authorization: `Bearer ${A.token}` } })).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    expect(r.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(r.text).not.toMatch(/(^|,)=HYPERLINK/m);
    expect(r.text).toMatch(/A01,.*,回答,0,/);
    expect(r.text).toContain("未回答");
  });

  it("CSV（集計）に平均値・代表値・算出しない理由が含まれる", async () => {
    const r = await api(`/api/rounds/${round.roundId}/export?type=summary`, "GET", undefined, A.token);
    expect(r.text).toContain("平均値（アプリ算出）");
    expect(r.text).toContain("代表値（主催者確定）");
    expect(r.text).toMatch(/ANS-01-S,.*,2\.5,.*,value,3,manual,協議で決定/);
    expect(r.text).toContain("計測分数が設定されていないため算出しません");
    expect(r.text).toContain("確定版,v2");
  });

  it("CSV（滞在者・通行者）にグループ単位の原記録が出る", async () => {
    const r = await api(`/api/rounds/${round.roundId}/export?type=observations`, "GET", undefined, A.token);
    const lines = r.text.trim().split(/\r\n/);
    expect(lines.filter((l) => /,(滞在|通行),/.test(l))).toHaveLength(4);
    expect(r.text).toContain("通行者計測時間（分）,未設定");
  });

  it("過去回との比較：新しい回を前回コピーで作り、条件差を表示できる", async () => {
    expect((await A.call(`/api/rounds/${round.roundId}/close`, "POST")).status).toBe(200);
    const nr = await A.call(`/api/surveys/${round.surveyId}/rounds`, "POST", { copyFrom: round.roundId });
    expect(nr.status).toBe(201);
    const { data: copied } = await A.db.from("survey_rounds").select("stay_measure_minutes, scope_text, status").eq("id", nr.body.roundId).single();
    expect(copied).toMatchObject({ stay_measure_minutes: 10, scope_text: "テスト範囲", status: "draft" });
    await A.call(`/api/rounds/${nr.body.roundId}`, "PATCH", { surveyDate: "2026-11-21", stayMeasureMinutes: 20, passMeasureMinutes: 10 });
    expect((await A.call(`/api/rounds/${nr.body.roundId}/start`, "POST")).status).toBe(200);
  });

  it("終了した調査回の個人情報を削除（匿名化）できる", async () => {
    const r = await A.call(`/api/rounds/${round.roundId}/purge`, "POST");
    expect(r.body.purged).toBe(2);
    const { data } = await A.db.from("surveyors").select("display_name, affiliation").eq("round_id", round.roundId);
    expect(data!.every((s) => s.display_name === "（削除済み）" && s.affiliation === "")).toBe(true);
  });
});
