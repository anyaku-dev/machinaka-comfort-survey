import { ApiError, fromDbError, json, withOrganizer } from "@/lib/server/api";

type Ctx = { params: Promise<{ roundId: string; questionId: string }> };

export async function DELETE(req: Request, { params }: Ctx) {
  const { roundId, questionId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { data, error } = await supabase.from("round_questions").delete().eq("id", questionId).eq("round_id", roundId).select("id");
    if (error) throw fromDbError(error);
    if (!data?.length) throw new ApiError(404, "not_found", "削除できる独自項目が見つかりません。");
    return json({ ok: true });
  });
}
