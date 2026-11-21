import { requireOrganizer, roundOr404 } from "@/lib/server/session";
import LinkPanel from "./link-panel";

export default async function LinkPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const { supabase } = await requireOrganizer();
  const { round } = await roundOr404(supabase, roundId);
  const { data: history } = await supabase
    .from("participant_links")
    .select("id, created_at, expires_at, revoked_at, revoked_reason")
    .eq("round_id", roundId)
    .order("created_at", { ascending: false });
  return <LinkPanel roundId={roundId} status={round.status} history={history ?? []} />;
}
