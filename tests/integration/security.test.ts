import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, anon, api, createActiveRound, createOrganizer, registerSurveyor, submit, type ActiveRound, type Organizer } from "./helpers";

let A: Organizer;
let B: Organizer;
let round: ActiveRound;
let submissionId: string;

beforeAll(async () => {
  A = await createOrganizer("a");
  B = await createOrganizer("b");
  round = await createActiveRound(A);
  const s = await registerSurveyor(round.token, "A調査者");
  const r = await submit(round.token, s, {
    answers: [],
    observations: [{ presence: "pass", groupType: "single", groupSize: 1, male: 1, female: 0, genderUnknown: 0, infant: 0, child: 0, teen: 0, adult: 1, elderly: 0, ageUnknown: 0, walkFast: 1, walkSlow: 0, japanese: 1, foreigner: 0, nationalityUnknown: 0 }],
  });
  submissionId = r.body.submissionId;
});

describe("RLS：別主催者・未ログインからの閲覧拒否", () => {
  it("主催者Bは主催者Aの調査・調査回・設問・提出・回答・観察・参加リンク・履歴を読めない", async () => {
    for (const [table, col, val] of [
      ["surveys", "id", round.surveyId],
      ["survey_rounds", "id", round.roundId],
      ["round_questions", "round_id", round.roundId],
      ["submissions", "round_id", round.roundId],
      ["answers", "round_id", round.roundId],
      ["space_counts", "round_id", round.roundId],
      ["observation_groups", "round_id", round.roundId],
      ["participant_links", "round_id", round.roundId],
      ["surveyors", "round_id", round.roundId],
      ["audit_logs", "round_id", round.roundId],
    ] as const) {
      const { data, error } = await B.db.from(table).select(["participant_links", "surveyors"].includes(table) ? "id" : "*").eq(col, val);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
      const own = await A.db.from(table).select(["participant_links", "surveyors"].includes(table) ? "id" : "*").eq(col, val);
      expect(own.data!.length, `${table} (owner)`).toBeGreaterThan(0);
    }
  });

  it("主催者Bは主催者Aの調査を更新・削除できない（0件）", async () => {
    const u = await B.db.from("surveys").update({ name: "乗っ取り" }).eq("id", round.surveyId).select();
    expect(u.data ?? []).toEqual([]);
    const d = await B.db.from("surveys").delete().eq("id", round.surveyId).select();
    expect(d.data ?? []).toEqual([]);
    const still = await A.db.from("surveys").select("name").eq("id", round.surveyId).single();
    expect(still.data!.name).not.toBe("乗っ取り");
  });

  it("主催者Bは主催者Aの調査回を RPC で操作できない", async () => {
    for (const [fn, args] of [
      ["close_round", { p_round_id: round.roundId }],
      ["revoke_participant_links", { p_round_id: round.roundId }],
      ["review_submission", { p_submission_id: submissionId, p_action: "accept", p_note: "" }],
      ["set_representative_values", { p_round_id: round.roundId, p_items: [] }],
      ["create_round", { p_survey_id: round.surveyId, p_copy_from: null }],
    ] as const) {
      const { error } = await B.db.rpc(fn, args);
      expect(error?.message, fn).toMatch(/MCS:not_found/);
    }
  });

  it("主催者Bは API でも主催者Aのデータにアクセスできない（404）", async () => {
    expect((await B.call(`/api/rounds/${round.roundId}/aggregate`)).status).toBe(404);
    expect((await B.call(`/api/rounds/${round.roundId}/export?type=raw`)).status).toBe(404);
    expect((await B.call(`/api/rounds/${round.roundId}/link`)).body.link).toBeNull();
    expect((await B.call(`/api/rounds/${round.roundId}/link`, "POST", {})).status).toBe(404);
    expect((await B.call(`/api/rounds/${round.roundId}/close`, "POST")).status).toBe(404);
    expect((await B.call(`/api/submissions/${submissionId}/review`, "POST", { action: "accept" })).status).toBe(404);
    expect((await B.call(`/api/surveys/${round.surveyId}`, "PATCH", { name: "x" })).status).toBe(404);
  });

  it("未ログインは API・テーブルにアクセスできない", async () => {
    expect((await api(`/api/rounds/${round.roundId}/aggregate`)).status).toBe(401);
    // Origin なしの Cookie 認証扱いは CSRF 対策で 403、Bearer なし GET は 401
    expect([401, 403]).toContain((await api("/api/surveys", "POST", { name: "x" })).status);
    const c = anon();
    const { data, error } = await c.from("surveys").select("*");
    expect(data ?? []).toEqual([]);
    expect(error?.message ?? "permission denied").toMatch(/permission denied/);
  });

  it("主催者はブラウザ側から回答表・調査者用関数を直接操作できない", async () => {
    const ins = await A.db.from("answers").insert({ submission_id: submissionId, round_id: round.roundId, round_question_id: round.questions[0].id, revision: 1, state: "answered", value_num: 1 });
    expect(ins.error?.message).toMatch(/permission denied/);
    const rpc = await A.db.rpc("participant_open", { p_token_hash: "0".repeat(64) });
    expect(rpc.error?.message).toMatch(/permission denied/);
    const st = await A.db.from("survey_rounds").update({ status: "closed" }).eq("id", round.roundId);
    expect(st.error?.message).toMatch(/permission denied/);
  });

  it("参加リンクのトークンハッシュは主催者からも読めない（列権限）", async () => {
    const { error } = await A.db.from("participant_links").select("token_hash").eq("round_id", round.roundId);
    expect(error?.message).toMatch(/permission denied/);
    const k = await A.db.from("surveyors").select("key_hash");
    expect(k.error?.message).toMatch(/permission denied/);
  });

  it("設問マスタは変更できない（過去調査の意味を変えない）", async () => {
    const { error } = await admin.from("question_master").update({ text: "変更" }).eq("id", "ver1.1:ANS-01-S");
    expect(error?.message).toMatch(/master_immutable|permission denied/);
  });

  it("別オリジンからの Cookie 認証リクエストを拒否する（CSRF）", async () => {
    const r = await fetch(`${process.env.TEST_BASE_URL ?? "http://localhost:3100"}/api/surveys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(r.status).toBe(403);
  });

  it("推測したIDの参加リンク・調査者キーでは参加者APIを使えない", async () => {
    const r = await api("/api/participant/state", "POST", { token: round.token, surveyorId: randomUUID(), surveyorKey: "x".repeat(43) });
    expect(r.status).toBe(403);
  });
});
