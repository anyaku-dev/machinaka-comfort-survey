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
        <div className="row small">
          <span>対象地：{survey.siteName || "未設定"}</span>
          <span>実施主体：{survey.organizerName || "未設定"}</span>
          <span>表示設問：{visibleCount} 問</span>
          <span>提出：{submittedCount ?? 0} 件</span>
          <span>開始：{fmtDateTime(round.startedAt)}</span>
          <span>終了：{fmtDateTime(round.closedAt)}</span>
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
