import { z } from "zod";
import { fromDbError, json, readJson, withOrganizer } from "@/lib/server/api";

type Ctx = { params: Promise<{ submissionId: string }> };
const schema = z.object({ included: z.boolean() });

export async function POST(req: Request, { params }: Ctx) {
  const { submissionId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { included } = await readJson(req, schema);
    const { error } = await supabase.rpc("set_observations_included", { p_submission_id: submissionId, p_included: included });
    if (error) throw fromDbError(error);
    return json({ ok: true });
  });
}
