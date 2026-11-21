import Link from "next/link";
import { fmtDateTime, SubmissionBadge } from "@/components/status";
import { getSubmissions } from "@/lib/server/rounds";
import { requireOrganizer } from "@/lib/server/session";

export default async function ResponsesPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const { supabase } = await requireOrganizer();
  const subs = await getSubmissions(supabase, roundId);
  const counts = subs.reduce<Record<string, number>>((a, s) => ({ ...a, [s.status]: (a[s.status] ?? 0) + 1 }), {});
  return (
    <div>
      <p className="small">
        入力中 {counts.draft ?? 0}／未審査 {counts.submitted ?? 0}／差し戻し中 {counts.returned ?? 0}／採用 {counts.accepted ?? 0}／除外 {counts.excluded ?? 0}
      </p>
      <p className="muted small">集計は「採用」した提出だけを対象にします（集計画面で未審査を含めた暫定表示も可能）。</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>調査者</th>
              <th>所属</th>
              <th>状態</th>
              <th>提出日時</th>
              <th className="num">版</th>
              <th>人数集計</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} data-testid="submission-row">
                <td>
                  <Link href={`/organizer/rounds/${roundId}/responses/${s.id}`}>{s.surveyorName}</Link>
                </td>
                <td>{s.affiliation}</td>
                <td>
                  <SubmissionBadge status={s.status} />
                </td>
                <td>{fmtDateTime(s.submittedAt)}</td>
                <td className="num">{s.revision}</td>
                <td>{s.observationsIncluded ? "含める" : "含めない"}</td>
              </tr>
            ))}
            {subs.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  まだ参加者はいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
