import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateRound, type RoundAggregate } from "@/lib/calculation/aggregate";
import type { SubmissionStatus } from "@/lib/calculation/types";
import { getCalcInput } from "./rounds";

export function parseInclude(url: string): SubmissionStatus[] {
  const include = new URL(url).searchParams.get("include");
  return include === "submitted" ? ["accepted", "submitted"] : ["accepted"];
}

export async function computeAggregate(supabase: SupabaseClient, roundId: string, statuses: SubmissionStatus[]) {
  const data = await getCalcInput(supabase, roundId, statuses);
  return { ...data, aggregate: aggregateRound(data.input) };
}

/** 確定結果に保存する際は調査者名を仮名化する（個人情報削除後も結果を残せるように）。 */
export function anonymize(agg: RoundAggregate): RoundAggregate {
  const alias = new Map(agg.includedSubmissions.map((s, i) => [s.id, `調査者${i + 1}`]));
  const name = (id: string) => alias.get(id) ?? "調査者";
  return {
    ...agg,
    includedSubmissions: agg.includedSubmissions.map((s) => ({ ...s, surveyorName: name(s.id) })),
    questions: agg.questions.map((q) => ({ ...q, perSurveyor: q.perSurveyor.map((p) => ({ ...p, surveyorName: name(p.submissionId) })) })),
    activityTypes: agg.activityTypes.map((a) => ({ ...a, perSurveyor: a.perSurveyor.map((p) => ({ ...p, surveyorName: name(p.submissionId) })) })),
  };
}
