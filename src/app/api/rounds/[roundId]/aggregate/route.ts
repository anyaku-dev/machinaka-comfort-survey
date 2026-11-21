import { computeAggregate, parseInclude } from "@/lib/server/aggregate";
import { json, withOrganizer } from "@/lib/server/api";

type Ctx = { params: Promise<{ roundId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { aggregate } = await computeAggregate(supabase, roundId, parseInclude(req.url));
    return json(aggregate);
  });
}
