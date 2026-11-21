import { CALC_VERSION } from "@/lib/calculation/types";
import { anonymize, computeAggregate } from "@/lib/server/aggregate";
import { ApiError, json, must, readJson, withOrganizer } from "@/lib/server/api";
import { finalizeSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ roundId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { note } = await readJson(req, finalizeSchema);
    const { aggregate, round } = await computeAggregate(supabase, roundId, ["accepted"]);
    if (aggregate.includedSubmissions.length === 0) {
      throw new ApiError(409, "invalid_state", "採用した提出がないため確定できません。");
    }
    const payload = {
      ...anonymize(aggregate),
      round: {
        roundNumber: round.roundNumber,
        surveyDate: round.surveyDate,
        stayMeasureMinutes: round.stayMeasureMinutes,
        passMeasureMinutes: round.passMeasureMinutes,
        snapshotHash: round.snapshotHash,
      },
    };
    const version = must(
      await supabase.rpc("finalize_round_result", { p_round_id: roundId, p_calc_version: CALC_VERSION, p_payload: payload, p_note: note }),
    );
    return json({ version }, { status: 201 });
  });
}
