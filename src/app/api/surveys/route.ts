import { json, must, readJson, withOrganizer } from "@/lib/server/api";
import { surveyCreateSchema } from "@/lib/validation/schemas";

export async function POST(req: Request) {
  return withOrganizer(req, async ({ supabase, user }) => {
    const body = await readJson(req, surveyCreateSchema);
    const survey = must(
      await supabase
        .from("surveys")
        .insert({
          owner_id: user.id,
          name: body.name,
          purpose: body.purpose,
          organizer_name: body.organizerName,
          site_name: body.siteName,
          site_address: body.siteAddress,
          site_type: body.siteType,
        })
        .select("id")
        .single(),
    );
    const roundId = must(await supabase.rpc("create_round", { p_survey_id: survey.id, p_copy_from: null }));
    return json({ surveyId: survey.id, roundId }, { status: 201 });
  });
}
