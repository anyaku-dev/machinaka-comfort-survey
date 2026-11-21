import Link from "next/link";
import { notFound } from "next/navigation";
import { RoundBadge } from "@/components/status";
import { mapSurvey } from "@/lib/server/rounds";
import { requireOrganizer } from "@/lib/server/session";
import SurveyForm from "../survey-form";
import SurveyActions from "./survey-actions";

export default async function SurveyPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const { supabase } = await requireOrganizer();
  if (!/^[0-9a-f-]{36}$/i.test(surveyId)) notFound();
  const { data } = await supabase
    .from("surveys")
    .select("*, survey_rounds(id, round_number, title, status, survey_date, started_at, closed_at, submissions(count))")
    .eq("id", surveyId)
    .maybeSingle();
  if (!data) notFound();
  const s = mapSurvey(data);
  const rounds = [...(data.survey_rounds ?? [])].sort((a, b) => b.round_number - a.round_number);
  return (
    <main>
      <p className="small">
        <Link href="/organizer">← 調査一覧</Link>
      </p>
      <h1>{s.name}</h1>
      <h2>調査回</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>回</th>
              <th>状態</th>
              <th>実施日</th>
              <th className="num">提出件数</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/organizer/rounds/${r.id}`}>{r.title || `第${r.round_number}回`}</Link>
                </td>
                <td>
                  <RoundBadge status={r.status} />
                </td>
                <td>{r.survey_date ?? "未設定"}</td>
                <td className="num">{(r.submissions as unknown as { count: number }[])?.[0]?.count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SurveyActions surveyId={s.id} latestRoundId={rounds[0]?.id ?? null} />
      <h2>調査の基本情報</h2>
      <SurveyForm
        surveyId={s.id}
        initial={{ name: s.name, purpose: s.purpose, organizerName: s.organizerName, siteName: s.siteName, siteAddress: s.siteAddress, siteType: s.siteType }}
      />
    </main>
  );
}
