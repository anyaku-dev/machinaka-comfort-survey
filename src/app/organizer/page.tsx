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
      <div className="row page-heading">
        <div className="grow">
          <span className="eyebrow">SURVEYS</span>
          <h1>調査一覧</h1>
          <p className="page-intro">調査と実施回の状況を確認できます。</p>
        </div>
        <Link className="btn btn-primary" href="/organizer/surveys/new">
          ＋ 調査を作成
        </Link>
      </div>
      {error && <div className="alert alert-error">読み込みに失敗しました。</div>}
      {data && data.length === 0 && (
        <div className="card empty-state">
          <span className="empty-icon" aria-hidden="true">✦</span>
          <h2>最初の調査を作成しましょう</h2>
          <p className="muted">調査を作成すると、実施回の設定や調査者の招待を進められます。</p>
        </div>
      )}
      {data && data.length > 0 && (
        <div className="survey-grid">
          {data.map((s) => (
            <article className="card survey-card" key={s.id}>
              <div>
                <span className="eyebrow">SURVEY</span>
                <h2><Link href={`/organizer/surveys/${s.id}`}>{s.name}</Link></h2>
                <p className="site-line">⌖ {s.site_name || "対象地未設定"}</p>
              </div>
              <div className="survey-rounds">
                <span className="small muted">調査回</span>
                {[...(s.survey_rounds ?? [])]
                  .sort((a, b) => b.round_number - a.round_number)
                  .map((r) => (
                    <div key={r.id} className="survey-round">
                      <div className="row"><Link href={`/organizer/rounds/${r.id}`}>{r.title || `第${r.round_number}回`}</Link><RoundBadge status={r.status} /></div>
                      <div className="survey-round-meta small muted"><span>{r.survey_date ?? "日付未設定"}</span><span>提出 {(r.submissions as unknown as { count: number }[])?.[0]?.count ?? 0} 件</span></div>
                    </div>
                  ))}
                {(s.survey_rounds ?? []).length === 0 && <p className="small muted">調査回はまだありません。</p>}
              </div>
              <Link className="btn btn-secondary" href={`/organizer/surveys/${s.id}`}>調査を開く →</Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
