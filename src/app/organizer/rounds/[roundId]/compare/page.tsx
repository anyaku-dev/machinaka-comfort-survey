import { fmt } from "@/components/status";
import { diffConditions } from "@/lib/calculation/compare";
import { loadComparable } from "@/lib/server/compare";
import { requireOrganizer, roundOr404 } from "@/lib/server/session";

const LABELS: Record<string, string> = {
  "stay.people": "滞在者数（人）",
  "pass.people": "通行者数（人）",
  "interaction.people": "交流者数（人）",
  "stay.perHour": "滞在者数（人/時間）",
  "pass.perHour": "通行者数（人/時間）",
  "interaction.perHour": "交流者数（人/時間）",
  "stay.share": "滞在者割合",
  "spaceA.usedRatio": "建物：利用の割合",
  "spaceA.visibleRatio": "利用者の様子が見やすい割合",
  "spaceA.terraceCount": "屋外の滞留空間ありの建築数",
  "spaceA.landActiveRatio": "土地：滞留空間として活用の割合",
};

export default async function ComparePage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const { supabase } = await requireOrganizer();
  const { round } = await roundOr404(supabase, roundId);
  const { data: others } = await supabase
    .from("survey_rounds")
    .select("id, round_number")
    .eq("survey_id", round.surveyId)
    .neq("status", "draft")
    .neq("id", roundId)
    .lt("round_number", round.roundNumber)
    .order("round_number", { ascending: false })
    .limit(3);
  if (round.status === "draft") return <div className="alert alert-info">調査開始後に比較できます。</div>;
  const base = await loadComparable(supabase, roundId);
  const past = await Promise.all((others ?? []).map((o) => loadComparable(supabase, o.id)));
  if (past.length === 0) return <div className="alert alert-info">比較できる過去回（同じ調査の、開始済みの以前の回）がありません。</div>;
  const cols = [base, ...past];
  const repCodes = Object.keys(base.representatives).filter((c) => past.some((p) => c in p.representatives));
  return (
    <div className="stack">
      <div className="alert alert-warn small">
        比較条件が異なる場合、値の差は空間の変化ではなく条件の違いによる可能性があります。各回の値は、確定済みならその最新確定版、未確定なら採用済み提出からの暫定集計です。
      </div>
      {past.map((p) => {
        const diffs = diffConditions(base, p);
        return (
          <div className="card" key={p.roundId} data-testid="condition-diffs">
            <h3 style={{ marginTop: 0 }}>
              今回 と {p.title || `第${p.roundNumber}回`} の比較条件の差異（{diffs.length} 件）
            </h3>
            {diffs.length === 0 ? (
              <p className="small">記録上の比較条件に差異はありません。</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>条件</th>
                    <th>今回</th>
                    <th>比較先</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map((d) => (
                    <tr key={d.key}>
                      <td>{d.label}</td>
                      <td className="small">{d.base}</td>
                      <td className="small">{d.other}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      <div className="card table-wrap">
        <h3 style={{ marginTop: 0 }}>指標</h3>
        <table>
          <thead>
            <tr>
              <th>指標</th>
              {cols.map((c, i) => (
                <th key={c.roundId} className="num">
                  {i === 0 ? "今回" : c.title || `第${c.roundNumber}回`}
                  <div className="muted small">
                    {c.surveyDate}／{c.finalizedVersion ? `確定v${c.finalizedVersion}` : "暫定"}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(LABELS).map((k) => (
              <tr key={k}>
                <td>{LABELS[k]}</td>
                {cols.map((c) => (
                  <td key={c.roundId} className="num">
                    {c.indicators[k] === null || c.indicators[k] === undefined ? <span className="muted">—</span> : k.endsWith("Ratio") || k.endsWith("share") ? `${((c.indicators[k] as number) * 100).toFixed(1)}%` : fmt(c.indicators[k], 1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card table-wrap">
        <h3 style={{ marginTop: 0 }}>確定代表値（両方の回で確定している設問）</h3>
        <table>
          <thead>
            <tr>
              <th>設問</th>
              {cols.map((c, i) => (
                <th key={c.roundId} className="num">
                  {i === 0 ? "今回" : c.title || `第${c.roundNumber}回`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {repCodes.map((code) => (
              <tr key={code}>
                <td className="small">
                  <span className="mono">{code}</span> {base.representatives[code].text}
                </td>
                {cols.map((c) => {
                  const r = c.representatives[code];
                  return (
                    <td key={c.roundId} className="num">
                      {!r ? <span className="muted">—</span> : r.state === "value" ? fmt(r.value) : r.state === "not_applicable" ? "適用外" : "データなし"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
