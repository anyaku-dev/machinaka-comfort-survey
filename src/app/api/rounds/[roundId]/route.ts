import { ApiError, fromDbError, json, readJson, withOrganizer } from "@/lib/server/api";
import { roundUpdateSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ roundId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const b = await readJson(req, roundUpdateSchema);
    const map: Record<string, string> = {
      title: "title",
      scopeText: "scope_text",
      frontageScopeText: "frontage_scope_text",
      peripheralScopeText: "peripheral_scope_text",
      surveyDate: "survey_date",
      isHoliday: "is_holiday",
      startTime: "start_time",
      endTime: "end_time",
      isNight: "is_night",
      eventName: "event_name",
      stayMeasureMinutes: "stay_measure_minutes",
      passMeasureMinutes: "pass_measure_minutes",
      previousActions: "previous_actions",
      notes: "notes",
      siteMetrics: "site_metrics",
    };
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b)) if (v !== undefined) patch[map[k]] = v;
    const { data: cur, error: e1 } = await supabase.from("survey_rounds").select("status").eq("id", roundId).maybeSingle();
    if (e1) throw fromDbError(e1);
    if (!cur) throw new ApiError(404, "not_found", "調査回が見つかりません。");
    if (cur.status !== "draft") throw new ApiError(409, "round_locked", "開始済みの調査回の設定は変更できません。");
    const { data, error } = await supabase.from("survey_rounds").update(patch).eq("id", roundId).select("id");
    if (error) throw fromDbError(error);
    if (!data?.length) throw new ApiError(404, "not_found", "調査回が見つかりません。");
    return json({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { error } = await supabase.rpc("delete_round", { p_round_id: roundId });
    if (error) throw fromDbError(error);
    return json({ ok: true });
  });
}
