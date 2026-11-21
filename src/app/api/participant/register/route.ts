import { json, readJson, withPublic } from "@/lib/server/api";
import { callParticipant, hashSurveyorKey, hashToken, newSurveyorKey } from "@/lib/server/participant";
import { participantRegisterSchema } from "@/lib/validation/schemas";

export async function POST(req: Request) {
  return withPublic(async () => {
    const body = await readJson(req, participantRegisterSchema);
    const surveyorKey = newSurveyorKey();
    const data = await callParticipant<{ surveyorId: string; roundId: string }>("participant_register", {
      p_token_hash: hashToken(body.token),
      p_key_hash: hashSurveyorKey(surveyorKey),
      p_display_name: body.displayName,
      p_affiliation: body.affiliation,
      p_age_band: body.ageBand,
      p_gender: body.gender,
    });
    // 調査者キーはこの応答でだけ返す（端末に保存。DB にはハッシュのみ）
    return json({ ...data, surveyorKey }, { status: 201 });
  });
}
