import { json, readJson, withPublic } from "@/lib/server/api";
import { callParticipant, hashSurveyorKey, hashToken } from "@/lib/server/participant";
import { participantDraftSchema } from "@/lib/validation/schemas";

export async function POST(req: Request) {
  return withPublic(async () => {
    const body = await readJson(req, participantDraftSchema);
    const data = await callParticipant("participant_save_draft", {
      p_token_hash: hashToken(body.token),
      p_surveyor_id: body.surveyorId,
      p_key_hash: hashSurveyorKey(body.surveyorKey),
      p_payload: body.draft,
    });
    return json(data);
  });
}
