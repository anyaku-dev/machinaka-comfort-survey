import { ApiError, json, must, readJson, withOrganizer } from "@/lib/server/api";
import { assertValueFits } from "@/lib/server/questions";
import { getQuestions } from "@/lib/server/rounds";
import { representativeSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ roundId: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { items } = await readJson(req, representativeSchema);
    const questions = new Map((await getQuestions(supabase, roundId)).map((q) => [q.id, q]));
    for (const it of items) {
      const q = questions.get(it.roundQuestionId);
      if (!q) throw new ApiError(422, "invalid", "この調査回に存在しない設問です。");
      if (it.valueState === "value") {
        if (it.valueNum === null) throw new ApiError(422, "invalid", `${q.code}: 代表値を入力してください`);
        assertValueFits(q, it.valueNum, "representative");
      } else if (it.valueNum !== null) {
        throw new ApiError(422, "invalid", `${q.code}: 値なしの場合は数値を指定しないでください`);
      }
    }
    const count = must(await supabase.rpc("set_representative_values", { p_round_id: roundId, p_items: items }));
    return json({ ok: true, saved: count });
  });
}
