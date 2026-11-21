import { ApiError, fromDbError, json, must, readJson, withOrganizer } from "@/lib/server/api";
import { assertValueFits } from "@/lib/server/questions";
import { getQuestions, getRound } from "@/lib/server/rounds";
import { customQuestionSchema, questionUpdateSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ roundId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { updates } = await readJson(req, questionUpdateSchema);
    const { round } = await getRound(supabase, roundId);
    if (round.status !== "draft") throw new ApiError(409, "round_locked", "開始済みの調査回の設問は変更できません。");
    const questions = new Map((await getQuestions(supabase, roundId)).map((q) => [q.id, q]));
    for (const u of updates) {
      const q = questions.get(u.id);
      if (!q) throw new ApiError(422, "invalid", "この調査回に存在しない設問です。");
      const patch: Record<string, unknown> = {};
      if (u.visible !== undefined) patch.visible = u.visible;
      if (u.text !== undefined) {
        if (!q.isCustom && u.text !== q.text) throw new ApiError(422, "invalid", "標準設問の文言は変更できません（独自項目を追加してください）。");
        patch.text = u.text;
      }
      if (u.fixedValue !== undefined) {
        if (u.fixedValue !== null) assertValueFits(q, u.fixedValue.value, "fixed");
        patch.fixed_value = u.fixedValue;
      }
      if (Object.keys(patch).length === 0) continue;
      const { error } = await supabase.from("round_questions").update(patch).eq("id", u.id).eq("round_id", roundId);
      if (error) throw fromDbError(error);
    }
    return json({ ok: true, updated: updates.length });
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const b = await readJson(req, customQuestionSchema);
    const id = must(
      await supabase.rpc("add_custom_question", {
        p_round_id: roundId,
        p_section: b.section,
        p_kind: b.kind,
        p_text: b.text,
        p_pair_no: b.pairNo ?? null,
      }),
    );
    return json({ id }, { status: 201 });
  });
}
