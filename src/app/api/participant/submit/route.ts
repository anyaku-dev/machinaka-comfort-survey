import { json, readJson, withPublic } from "@/lib/server/api";
import { callParticipant, hashSurveyorKey, hashToken } from "@/lib/server/participant";
import { participantSubmitSchema } from "@/lib/validation/schemas";

export async function POST(req: Request) {
  return withPublic(async () => {
    const body = await readJson(req, participantSubmitSchema);
    const data = await callParticipant("participant_submit", {
      p_token_hash: hashToken(body.token),
      p_surveyor_id: body.surveyorId,
      p_key_hash: hashSurveyorKey(body.surveyorKey),
      p_idempotency_key: body.idempotencyKey,
      p_payload: body.payload,
    });
    return json(data);
  });
}
