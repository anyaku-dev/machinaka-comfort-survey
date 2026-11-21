import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDateTime, SubmissionBadge } from "@/components/status";
import { GROUP_TYPE_LABELS, type GroupType } from "@/lib/calculation/types";
import { SECTION_LABELS, SECTION_ORDER } from "@/lib/questionnaire/master";
import { fetchAll, getQuestions, getSubmissions } from "@/lib/server/rounds";
import { requireOrganizer, roundOr404 } from "@/lib/server/session";
import ReviewActions from "./review-actions";

const STATE_LABEL: Record<string, string> = { answered: "回答", unanswered: "未回答", not_applicable: "適用外", hidden: "非表示", fixed: "固定値" };

export default async function SubmissionPage({ params }: { params: Promise<{ roundId: string; submissionId: string }> }) {
  const { roundId, submissionId } = await params;
  const { supabase } = await requireOrganizer();
  const { round } = await roundOr404(supabase, roundId);
  const sub = (await getSubmissions(supabase, roundId)).find((s) => s.id === submissionId);
  if (!sub) notFound();
  const questions = await getQuestions(supabase, roundId);
  const [answers, counts, groups, reviews] = await Promise.all([
    fetchAll((f, t) => supabase.from("answers").select("*").eq("submission_id", submissionId).range(f, t)),
    fetchAll((f, t) => supabase.from("space_counts").select("*").eq("submission_id", submissionId).range(f, t)),
    fetchAll((f, t) => supabase.from("observation_groups").select("*").eq("submission_id", submissionId).order("seq").range(f, t)),
    fetchAll((f, t) => supabase.from("submission_reviews").select("*").eq("submission_id", submissionId).order("created_at").range(f, t)),
  ]);
  const byQ = new Map<string, { state: string; value: string | null }>();
  for (const a of answers) byQ.set(a.round_question_id, { state: a.state, value: a.value_num ?? a.value_text });
  for (const c of counts) byQ.set(c.round_question_id, { state: c.state, value: c.count });
  const label = (qid: string, v: string | number | null) => {
    const q = questions.find((x) => x.id === qid);
    const o = q?.options?.find((x) => String(x.value) === String(v));
    return o ? `${v} ${o.label}` : v === null ? "" : String(v);
  };
  return (
    <div>
      <p className="small">
        <Link href={`/organizer/rounds/${roundId}/responses`}>← 回答一覧</Link>
      </p>
      <div className="card">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>
            {sub.surveyorName}
          </h2>
          <SubmissionBadge status={sub.status} />
        </div>
        <p className="small">
          所属：{sub.affiliation || "—"}／提出：{fmtDateTime(sub.submittedAt)}／版 {sub.revision}
        </p>
        {sub.reviewNote && <div className="alert alert-warn">差し戻し理由：{sub.reviewNote}</div>}
        <ReviewActions submissionId={sub.id} status={sub.status} roundActive={round.status === "active"} observationsIncluded={sub.observationsIncluded} />
      </div>
      {sub.status === "draft" ? (
        <div className="alert alert-info">まだ提出されていません。</div>
      ) : (
        <>
          {SECTION_ORDER.filter((s) => s !== "observation").map((section) => {
            const qs = questions.filter((q) => q.section === section && q.answerFormat !== "computed");
            if (!qs.length) return null;
            return (
              <section className="card" key={section}>
                <h3 style={{ marginTop: 0 }}>{SECTION_LABELS[section]}</h3>
                <table>
                  <tbody>
                    {qs.map((q) => {
                      const a = byQ.get(q.id);
                      return (
                        <tr key={q.id}>
                          <td className="small" style={{ width: "8rem" }}>
                            {q.originalNo}
                          </td>
                          <td>{q.text}</td>
                          <td style={{ width: "6rem" }}>
                            <span className={`badge ${a?.state === "answered" ? "badge-active" : ""}`}>{STATE_LABEL[a?.state ?? ""] ?? "記録なし"}</span>
                          </td>
                          <td style={{ width: "12rem" }}>{a ? label(q.id, a.value) : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}
          <section className="card">
            <h3 style={{ marginTop: 0 }}>滞在者・通行者（{groups.length} グループ）</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>滞在/通行</th>
                    <th>属性</th>
                    <th className="num">人数</th>
                    <th>性別 男/女/不明</th>
                    <th>年齢 乳/小/中高/大人/高齢/不明</th>
                    <th>行動 スタスタ/のんびり</th>
                    <th>国籍 日/外/不明</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const j = (...k: string[]) => (g[k[0]] === null ? "記録なし" : k.map((x) => g[x]).join(" / "));
                    return (
                      <tr key={g.id}>
                        <td>{g.seq}</td>
                        <td>{g.presence === "stay" ? "滞在" : "通行"}</td>
                        <td>{GROUP_TYPE_LABELS[g.group_type as GroupType]}</td>
                        <td className="num">{g.group_size}</td>
                        <td>{j("male", "female", "gender_unknown")}</td>
                        <td>{j("infant", "child", "teen", "adult", "elderly", "age_unknown")}</td>
                        <td>{g.presence === "pass" ? j("walk_fast", "walk_slow") : "—"}</td>
                        <td>{j("japanese", "foreigner", "nationality_unknown")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <section className="card">
        <h3 style={{ marginTop: 0 }}>審査の履歴</h3>
        {reviews.length === 0 ? (
          <p className="muted small">履歴はありません。</p>
        ) : (
          <ul className="small">
            {reviews.map((r) => (
              <li key={r.id}>
                {fmtDateTime(r.created_at)}：{r.from_status} → {r.to_status} {r.note && `（${r.note}）`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
