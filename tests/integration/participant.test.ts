import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, api, createActiveRound, createOrganizer, q, registerSurveyor, submit, type ActiveRound, type Organizer } from "./helpers";

let A: Organizer;
let round: ActiveRound;

beforeAll(async () => {
  A = await createOrganizer("p");
  round = await createActiveRound(A, { hide: ["ANS-02-S", "OBS-NATIONALITY"], fixed: { "BASIC-TEMP-START": 18 } });
});

describe("入力検証（サーバー側）", () => {
  let s: { surveyorId: string; surveyorKey: string };
  beforeAll(async () => {
    s = await registerSurveyor(round.token, "検証者");
  });
  const bad = async (payload: unknown, re: RegExp) => {
    const r = await submit(round.token, s, payload);
    expect(r.status, JSON.stringify(r.body)).toBe(422);
    expect(r.body.error.message).toMatch(re);
  };
  it("4段階の範囲外（5）", () => bad({ answers: [{ questionId: q(round, "ANS-01-S"), state: "answered", value: 5 }], observations: [] }, /範囲外/));
  it("4段階に小数", () => bad({ answers: [{ questionId: q(round, "ANS-01-S"), state: "answered", value: 2.5 }], observations: [] }, /範囲外/));
  it("件数が負", () => bad({ answers: [{ questionId: q(round, "A01"), state: "answered", value: -1 }], observations: [] }, /範囲外/));
  it("はい/いいえ/不明に4", () => bad({ answers: [{ questionId: q(round, "B01"), state: "answered", value: 4 }], observations: [] }, /範囲外/));
  it("選択肢にない値", () => bad({ answers: [{ questionId: q(round, "BASIC-WEATHER-START"), state: "answered", value: "typhoon" }], observations: [] }, /選択肢/));
  it("他の調査回の設問ID", () => bad({ answers: [{ questionId: randomUUID(), state: "answered", value: 1 }], observations: [] }, /存在しない設問/));
  it("同じ設問への重複回答", () => {
    const id = q(round, "ANS-01-S");
    return bad({ answers: [{ questionId: id, state: "answered", value: 1 }, { questionId: id, state: "answered", value: 2 }], observations: [] }, /重複/);
  });
  it("属性別人数の合計がグループ人数と不一致", () =>
    bad({ answers: [], observations: [{ presence: "stay", groupType: "family", groupSize: 3, male: 1, female: 1, genderUnknown: 0, infant: 0, child: 0, teen: 0, adult: 3, elderly: 0, ageUnknown: 0 }] }, /一致しません/));
  it("1人なのに2名", () => bad({ answers: [], observations: [{ presence: "stay", groupType: "single", groupSize: 2 }] }, /1人|一致/));
  it("表示している属性（性別）の内訳が無い", () => bad({ answers: [], observations: [{ presence: "stay", groupType: "single", groupSize: 1 }] }, /数値が必要/));
  it("不正なJSON", async () => {
    const r = await api("/api/participant/submit", "POST", "{bad json", undefined, true);
    expect(r.status).toBe(400);
  });
  it("hidden 状態を送れない", () => bad({ answers: [{ questionId: q(round, "ANS-01-S"), state: "hidden" }], observations: [] }, /.+/));

  it("非表示・固定値の設問には回答を送れない", async () => {
    const { data } = await A.db.from("round_questions").select("id, code").eq("round_id", round.roundId).in("code", ["ANS-02-S", "BASIC-TEMP-START"]);
    for (const row of data!) {
      const r = await submit(round.token, s, { answers: [{ questionId: row.id, state: "answered", value: 1 }], observations: [] });
      expect(r.status, row.code).toBe(422);
    }
  });
});

describe("0件・未回答・適用外・評価1・非表示・固定値の区別", () => {
  it("それぞれ別の状態として保存される", async () => {
    const s = await registerSurveyor(round.token, "区別確認");
    const r = await submit(round.token, s, {
      answers: [
        { questionId: q(round, "A01"), state: "answered", value: 0 },
        { questionId: q(round, "A02"), state: "unanswered" },
        { questionId: q(round, "ANS-01-S"), state: "answered", value: 1 },
        { questionId: q(round, "ANS-01-A"), state: "not_applicable" },
      ],
      observations: [{ presence: "stay", groupType: "single", groupSize: 1, male: 0, female: 1, genderUnknown: 0, infant: 0, child: 0, teen: 0, adult: 0, elderly: 1, ageUnknown: 0 }],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const sid = r.body.submissionId;
    const { data: counts } = await A.db.from("space_counts").select("state, count, round_questions(code)").eq("submission_id", sid);
    const c = Object.fromEntries(counts!.map((x) => [(x.round_questions as unknown as { code: string }).code, x]));
    expect(c.A01).toMatchObject({ state: "answered", count: 0 });
    expect(c.A02).toMatchObject({ state: "unanswered", count: null });
    expect(c.A03).toMatchObject({ state: "unanswered", count: null }); // 送信されなかった設問も未回答として記録
    const { data: ans } = await A.db.from("answers").select("state, value_num, round_questions(code)").eq("submission_id", sid);
    const a = Object.fromEntries(ans!.map((x) => [(x.round_questions as unknown as { code: string }).code, x]));
    expect(a["ANS-01-S"]).toMatchObject({ state: "answered", value_num: 1 });
    expect(a["ANS-01-A"]).toMatchObject({ state: "not_applicable", value_num: null });
    expect(a["ANS-02-S"]).toMatchObject({ state: "hidden", value_num: null });
    expect(a["BASIC-TEMP-START"]).toMatchObject({ state: "fixed", value_num: 18 });
    const { data: obs } = await A.db.from("observation_groups").select("*").eq("submission_id", sid);
    expect(obs![0]).toMatchObject({ female: 1, elderly: 1, japanese: null, walk_fast: null }); // 国籍は非表示 → 記録なし
  });
});

describe("重複提出の防止（冪等性）", () => {
  it("同じ送信IDの再送は1件として扱い、最初の結果を返す", async () => {
    const s = await registerSurveyor(round.token, "再送");
    const key = randomUUID();
    const payload = { answers: [{ questionId: q(round, "ANS-01-S"), state: "answered", value: 3 }], observations: [] };
    const [r1, r2] = await Promise.all([submit(round.token, s, payload, key), submit(round.token, s, payload, key)]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect([r1.body.duplicate, r2.body.duplicate].sort()).toEqual([false, true]);
    const r3 = await submit(round.token, s, payload, key);
    expect(r3.body).toMatchObject({ duplicate: true, revision: 1 });
    const { count } = await admin.from("submission_revisions").select("id", { count: "exact", head: true }).eq("submission_id", r1.body.submissionId);
    expect(count).toBe(1);
    const { count: answers } = await admin.from("answers").select("id", { count: "exact", head: true }).eq("submission_id", r1.body.submissionId).eq("state", "answered");
    expect(answers).toBe(1);
  });

  it("提出済みの調査者が別の送信IDで再提出すると拒否される", async () => {
    const s = await registerSurveyor(round.token, "二重");
    expect((await submit(round.token, s, { answers: [], observations: [] })).status).toBe(200);
    const r = await submit(round.token, s, { answers: [], observations: [] });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("already_submitted");
  });

  it("差し戻し後は再提出でき、版が上がる。前回提出内容を取得できる", async () => {
    const s = await registerSurveyor(round.token, "差し戻し");
    const r1 = await submit(round.token, s, { answers: [{ questionId: q(round, "ANS-01-S"), state: "answered", value: 2 }], observations: [] });
    const noNote = await A.call(`/api/submissions/${r1.body.submissionId}/review`, "POST", { action: "return", note: "" });
    expect(noNote.status).toBe(422);
    const ret = await A.call(`/api/submissions/${r1.body.submissionId}/review`, "POST", { action: "return", note: "安心感1を確認してください" });
    expect(ret.body.status).toBe("returned");
    const st = await api("/api/participant/state", "POST", { token: round.token, ...s });
    expect(st.body).toMatchObject({ status: "returned", reviewNote: "安心感1を確認してください" });
    expect(st.body.draftPayload.answers[0].value).toBe(2);
    const r2 = await submit(round.token, s, { answers: [{ questionId: q(round, "ANS-01-S"), state: "answered", value: 4 }], observations: [] });
    expect(r2.body.revision).toBe(2);
    const { data: hist } = await A.db.from("submission_reviews").select("from_status, to_status").eq("submission_id", r1.body.submissionId);
    expect(hist).toEqual([{ from_status: "submitted", to_status: "returned" }]);
  });
});

describe("参加リンク（QR）の失効・再発行・期限・上限", () => {
  it("無効なトークンは拒否", async () => {
    const r = await api("/api/participant/open", "POST", { token: "A".repeat(43) });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("invalid_link");
    expect((await api("/api/participant/open", "POST", { token: "short" })).status).toBe(422);
  });

  it("再発行すると旧リンクは失効し、新リンクだけが使える。再表示は同じURL", async () => {
    const r = await createActiveRound(A);
    const s = await registerSurveyor(r.token, "旧リンク");
    const shown = await A.call(`/api/rounds/${r.roundId}/link`);
    expect(shown.body.link.url).toBe(r.joinUrl);
    const re = await A.call(`/api/rounds/${r.roundId}/link`, "POST", { expiresInHours: 24 });
    const newToken = re.body.link.url.split("#")[1];
    expect(newToken).not.toBe(r.token);
    const old = await api("/api/participant/open", "POST", { token: r.token });
    expect(old.status).toBe(410);
    expect(old.body.error.code).toBe("link_revoked");
    expect((await submit(r.token, s, { answers: [], observations: [] })).status).toBe(410);
    expect((await api("/api/participant/open", "POST", { token: newToken })).status).toBe(200);
    const { data } = await A.db.from("participant_links").select("revoked_at").eq("round_id", r.roundId);
    expect(data!.filter((l) => l.revoked_at === null)).toHaveLength(1);
  });

  it("有効期限切れのリンクは使えない", async () => {
    const r = await createActiveRound(A);
    await admin.from("participant_links").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("round_id", r.roundId);
    const res = await api("/api/participant/register", "POST", { token: r.token, displayName: "期限切れ" });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("link_expired");
  });

  it("提出数の上限を超えると拒否（投稿制限）", async () => {
    const r = await createActiveRound(A, { maxSubmissions: 1 });
    const s1 = await registerSurveyor(r.token, "1人目");
    const s2 = await registerSurveyor(r.token, "2人目");
    expect((await submit(r.token, s1, { answers: [], observations: [] })).status).toBe(200);
    const res = await submit(r.token, s2, { answers: [], observations: [] });
    expect(res.status).toBe(429);
  });
});

describe("調査の終了・開始後の固定", () => {
  it("開始後は設定・設問を変更できない", async () => {
    expect((await A.call(`/api/rounds/${round.roundId}`, "PATCH", { scopeText: "変更" })).status).toBe(409);
    expect((await A.call(`/api/rounds/${round.roundId}/questions`, "PATCH", { updates: [{ id: round.questions[0].id, visible: false }] })).status).toBe(409);
    const direct = await A.db.from("round_questions").update({ visible: false }).eq("id", round.questions[0].id).select();
    expect(direct.error?.message ?? "").toMatch(/round_locked/);
    const { data } = await A.db.from("survey_rounds").select("settings_snapshot, snapshot_hash").eq("id", round.roundId).single();
    expect(data!.snapshot_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data!.settings_snapshot.questions.length).toBeGreaterThan(150);
  });

  it("終了後は提出・参加・途中保存できない。提出済みの再送は受け付け済みとして返す", async () => {
    const r = await createActiveRound(A);
    const s1 = await registerSurveyor(r.token, "終了前");
    const s2 = await registerSurveyor(r.token, "終了後");
    const key = randomUUID();
    expect((await submit(r.token, s1, { answers: [], observations: [] }, key)).status).toBe(200);
    expect((await A.call(`/api/rounds/${r.roundId}/close`, "POST")).status).toBe(200);
    const late = await submit(r.token, s2, { answers: [], observations: [] });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("round_closed");
    expect((await api("/api/participant/register", "POST", { token: r.token, displayName: "x" })).status).toBe(409);
    expect((await api("/api/participant/draft", "POST", { token: r.token, ...s2, draft: {} })).status).toBe(409);
    const again = await submit(r.token, s1, { answers: [], observations: [] }, key);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
  });
});
