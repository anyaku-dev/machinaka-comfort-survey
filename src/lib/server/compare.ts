import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateRound } from "@/lib/calculation/aggregate";
import type { ComparableRound } from "@/lib/calculation/compare";
import { getCalcInput } from "./rounds";

const INDICATOR_KEYS = ["stay.people", "pass.people", "interaction.people", "stay.perHour", "pass.perHour", "interaction.perHour", "stay.share"];

/** 比較用データ。確定済み結果があれば最新確定版の値、無ければ採用済み提出からの暫定集計。 */
export async function loadComparable(supabase: SupabaseClient, roundId: string): Promise<ComparableRound> {
  const { round, questions, input } = await getCalcInput(supabase, roundId, ["accepted"]);
  const { data: results } = await supabase.from("round_results").select("version, payload").eq("round_id", roundId).order("version", { ascending: false }).limit(1);
  const finalized = results?.[0] ?? null;
  const agg = finalized ? (finalized.payload as ReturnType<typeof aggregateRound>) : aggregateRound(input);
  const indicators: Record<string, number | null> = {};
  for (const i of [...agg.observation.indicators, ...agg.spaceA]) if (INDICATOR_KEYS.includes(i.key) || i.key.startsWith("spaceA.")) indicators[i.key] = i.value;
  const representatives: ComparableRound["representatives"] = {};
  for (const q of [...agg.questions, ...agg.activityTypes]) {
    if (q.representative) representatives[q.code] = { text: q.text, value: q.representative.valueNum, state: q.representative.valueState };
  }
  const weather = (code: string) => {
    const q = agg.questions.find((x) => x.code === code);
    if (!q) return null;
    const r = q.representative;
    const vals = Object.entries(q.distribution).sort((a, b) => b[1] - a[1]);
    return r?.valueNum != null ? String(r.valueNum) : vals.length ? vals.map(([k, n]) => `${({ sunny: "晴れ", cloudy: "曇り", rain_snow: "雨（雪）" } as Record<string, string>)[k] ?? k}×${n}`).join("・") : null;
  };
  return {
    roundId: round.id,
    roundNumber: round.roundNumber,
    title: round.title,
    status: round.status,
    surveyDate: round.surveyDate,
    isHoliday: round.isHoliday,
    startTime: round.startTime,
    endTime: round.endTime,
    isNight: round.isNight,
    eventName: round.eventName,
    stayMeasureMinutes: round.stayMeasureMinutes,
    passMeasureMinutes: round.passMeasureMinutes,
    scopeText: round.scopeText,
    frontageScopeText: round.frontageScopeText,
    peripheralScopeText: round.peripheralScopeText,
    masterVersion: round.masterVersion,
    calcVersion: round.calcVersion,
    visibleCodes: questions.filter((q) => q.visible && q.answerFormat !== "computed").map((q) => q.code),
    weatherStart: weather("BASIC-WEATHER-START"),
    weatherEnd: weather("BASIC-WEATHER-END"),
    finalizedVersion: finalized?.version ?? null,
    indicators,
    representatives,
  };
}
