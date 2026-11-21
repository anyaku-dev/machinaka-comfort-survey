import { z } from "zod";
import { json, must, readJson, withOrganizer } from "@/lib/server/api";

type Ctx = { params: Promise<{ surveyId: string }> };
const schema = z.object({ copyFrom: z.string().uuid().nullable().default(null) });

export async function POST(req: Request, { params }: Ctx) {
  const { surveyId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { copyFrom } = await readJson(req, schema);
    const roundId = must(await supabase.rpc("create_round", { p_survey_id: surveyId, p_copy_from: copyFrom }));
    return json({ roundId }, { status: 201 });
  });
}
