import { fmtDateTime } from "@/components/status";
import { getQuestions } from "@/lib/server/rounds";
import { requireOrganizer, roundOr404 } from "@/lib/server/session";
import RoundSettingsForm from "./round-settings-form";
import RoundStateActions from "./round-state-actions";

export default async function RoundOverview({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const { supabase } = await requireOrganizer();
  const { round, survey } = await roundOr404(supabase, roundId);
  const questions = await getQuestions(supabase, roundId);
  const visibleCount = questions.filter((q) => q.visible && q.answerFormat !== "computed").length;
  const { count: submittedCount } = await supabase.from("submissions").select("id", { count: "exact", head: true }).eq("round_id", roundId).neq("status", "draft");
  return (
    <>
      <div className="card">
        <div className="metric-grid">
          <div className="metric"><span className="metric-label">対象地</span><strong className="metric-value">{survey.siteName || "未設定"}</strong></div>
          <div className="metric"><span className="metric-label">実施主体</span><strong className="metric-value">{survey.organizerName || "未設定"}</strong></div>
          <div className="metric"><span className="metric-label">表示設問</span><strong className="metric-value">{visibleCount} 問</strong></div>
          <div className="metric"><span className="metric-label">提出</span><strong className="metric-value">{submittedCount ?? 0} 件</strong></div>
          <div className="metric"><span className="metric-label">開始</span><strong className="metric-value">{fmtDateTime(round.startedAt)}</strong></div>
          <div className="metric"><span className="metric-label">終了</span><strong className="metric-value">{fmtDateTime(round.closedAt)}</strong></div>
        </div>
        {round.snapshotHash && (
          <p className="muted small">
            開始時スナップショット（設定・設問文を固定）：<span className="mono">{round.snapshotHash.slice(0, 16)}…</span>／算定ロジック {round.calcVersion}
          </p>
        )}
        <RoundStateActions roundId={round.id} status={round.status} surveyId={survey.id} />
      </div>
      <RoundSettingsForm round={round} locked={round.status !== "draft"} />
    </>
  );
}
