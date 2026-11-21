import { fmtDateTime } from "@/components/status";
import { requireOrganizer } from "@/lib/server/session";

const ACTION_LABEL: Record<string, string> = {
  "round.create": "調査回を作成",
  "round.start": "調査を開始（設定を固定）",
  "round.close": "調査を終了",
  "round.delete": "調査回を削除",
  "link.issue": "参加リンクを発行",
  "link.revoke": "参加リンクを失効",
  "question.add_custom": "独自項目を追加",
  "surveyor.register": "調査者が参加登録",
  "submission.submit": "回答を提出",
  "submission.accept": "提出を採用",
  "submission.exclude": "提出を除外",
  "submission.return": "提出を差し戻し",
  "submission.observations_included": "人数集計への算入を変更",
  "representative.set": "代表値を設定",
  "result.finalize": "集計結果を確定",
  "personal_data.purge": "調査者の個人情報を削除",
};

export default async function HistoryPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const { supabase } = await requireOrganizer();
  const { data } = await supabase.from("audit_logs").select("*").eq("round_id", roundId).order("created_at", { ascending: false }).limit(500);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>日時</th>
            <th>操作者</th>
            <th>操作</th>
            <th>詳細</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((a) => (
            <tr key={a.id}>
              <td className="small">{fmtDateTime(a.created_at)}</td>
              <td className="small">{a.actor_type === "organizer" ? "主催者" : a.actor_type === "participant" ? "調査者" : "システム"}</td>
              <td>{ACTION_LABEL[a.action] ?? a.action}</td>
              <td className="mono small">{JSON.stringify(a.detail)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
