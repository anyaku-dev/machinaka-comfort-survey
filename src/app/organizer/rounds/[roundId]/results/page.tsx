import { fmtDateTime } from "@/components/status";
import { requireOrganizer, roundOr404 } from "@/lib/server/session";
import ResultsPanel from "./results-panel";

export default async function ResultsPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const { supabase } = await requireOrganizer();
  const { round } = await roundOr404(supabase, roundId);
  const { data: results } = await supabase
    .from("round_results")
    .select("version, calc_version, finalized_at, note")
    .eq("round_id", roundId)
    .order("version", { ascending: false });
  if (round.status === "draft") return <div className="alert alert-info">調査開始後に集計できます。</div>;
  return (
    <>
      <div className="card small">
        確定履歴：
        {results && results.length ? (
          results.map((r) => (
            <span key={r.version} className="badge" style={{ marginRight: 6 }} data-testid="finalized-version">
              v{r.version}（{fmtDateTime(r.finalized_at)}／{r.calc_version}）{r.note && `：${r.note}`}
            </span>
          ))
        ) : (
          <span className="muted">未確定</span>
        )}
      </div>
      <ResultsPanel roundId={roundId} stayMinutes={round.stayMeasureMinutes} passMinutes={round.passMeasureMinutes} />
    </>
  );
}
