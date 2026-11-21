import { json, must, readJson, withOrganizer } from "@/lib/server/api";
import { reviewSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ submissionId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { submissionId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const b = await readJson(req, reviewSchema);
    const status = must(await supabase.rpc("review_submission", { p_submission_id: submissionId, p_action: b.action, p_note: b.note }));
    return json({ status });
  });
}
