import { json, readJson, withPublic } from "@/lib/server/api";
import { callParticipant, hashToken } from "@/lib/server/participant";
import { participantOpenSchema } from "@/lib/validation/schemas";

export async function POST(req: Request) {
  return withPublic(async () => {
    const { token } = await readJson(req, participantOpenSchema);
    const data = await callParticipant("participant_open", { p_token_hash: hashToken(token) });
    return json(data);
  });
}
