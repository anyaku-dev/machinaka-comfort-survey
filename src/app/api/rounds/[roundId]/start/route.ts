import { CALC_VERSION } from "@/lib/calculation/types";
import { json, must, withOrganizer } from "@/lib/server/api";

type Ctx = { params: Promise<{ roundId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const data = must(await supabase.rpc("start_round", { p_round_id: roundId, p_calc_version: CALC_VERSION }));
    return json(data);
  });
}
