import { json, must, withOrganizer } from "@/lib/server/api";

type Ctx = { params: Promise<{ roundId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const count = must(await supabase.rpc("purge_personal_data", { p_round_id: roundId }));
    return json({ ok: true, purged: count });
  });
}
