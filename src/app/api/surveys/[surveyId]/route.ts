import { ApiError, fromDbError, json, readJson, withOrganizer } from "@/lib/server/api";
import { surveyUpdateSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ surveyId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { surveyId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const b = await readJson(req, surveyUpdateSchema);
    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) patch.name = b.name;
    if (b.purpose !== undefined) patch.purpose = b.purpose;
    if (b.organizerName !== undefined) patch.organizer_name = b.organizerName;
    if (b.siteName !== undefined) patch.site_name = b.siteName;
    if (b.siteAddress !== undefined) patch.site_address = b.siteAddress;
    if (b.siteType !== undefined) patch.site_type = b.siteType;
    const { data, error } = await supabase.from("surveys").update(patch).eq("id", surveyId).select("id");
    if (error) throw fromDbError(error);
    if (!data?.length) throw new ApiError(404, "not_found", "調査が見つかりません。");
    return json({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { surveyId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { data, error } = await supabase.from("surveys").delete().eq("id", surveyId).select("id");
    if (error) throw fromDbError(error);
    if (!data?.length) throw new ApiError(409, "invalid_state", "調査が見つからないか、実施中の調査回があるため削除できません。");
    return json({ ok: true });
  });
}
