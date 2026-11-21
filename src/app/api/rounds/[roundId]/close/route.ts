import { fromDbError, json, withOrganizer } from "@/lib/server/api";

type Ctx = { params: Promise<{ roundId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { error } = await supabase.rpc("close_round", { p_round_id: roundId });
    if (error) throw fromDbError(error);
    return json({ ok: true });
  });
}
