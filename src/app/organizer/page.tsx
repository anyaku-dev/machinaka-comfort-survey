import Link from "next/link";
import { RoundBadge } from "@/components/status";
import { requireOrganizer } from "@/lib/server/session";

export default async function OrganizerHome() {
  const { supabase } = await requireOrganizer();
  const { data, error } = await supabase
    .from("surveys")
    .select("id, name, site_name, created_at, survey_rounds(id, round_number, title, status, survey_date, submissions(count))")
    .order("created_at", { ascending: false });
  return (
    <main>
      <div className="row">
        <h1 className="grow">調査一覧</h1>
        <Link className="btn btn-primary" href="/organizer/surveys/new">
          ＋ 調査を作成
        </Link>
      </div>
      {error && <div className="alert alert-error">読み込みに失敗しました。</div>}
      {data && data.length === 0 && <div className="card muted">まだ調査がありません。「調査を作成」から始めてください。</div>}
      {data && data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>調査名</th>
                <th>対象地</th>
                <th>調査回（状態・実施日・提出件数）</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/organizer/surveys/${s.id}`}>{s.name}</Link>
                  </td>
                  <td>{s.site_name}</td>
                  <td>
                    {[...(s.survey_rounds ?? [])]
                      .sort((a, b) => b.round_number - a.round_number)
                      .map((r) => (
                        <div key={r.id} className="row small">
                          <Link href={`/organizer/rounds/${r.id}`}>{r.title || `第${r.round_number}回`}</Link>
                          <RoundBadge status={r.status} />
                          <span>{r.survey_date ?? "日付未設定"}</span>
                          <span className="muted">提出 {(r.submissions as unknown as { count: number }[])?.[0]?.count ?? 0} 件</span>
                        </div>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
