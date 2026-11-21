import { aggregateRound } from "@/lib/calculation/aggregate";
import { ATTRIBUTE_KEYS } from "@/lib/calculation/types";
import { toCsv } from "@/lib/csv/csv";
import { observationsCsv, rawAnswersCsv, summaryCsv, type ExportMeta, type RawAnswerExport } from "@/lib/csv/exports";
import { parseInclude } from "@/lib/server/aggregate";
import { ApiError, fromDbError, withOrganizer } from "@/lib/server/api";
import { getCalcInput, getObservationRows } from "@/lib/server/rounds";

type Ctx = { params: Promise<{ roundId: string }> };

const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export async function GET(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const type = new URL(req.url).searchParams.get("type") ?? "summary";
    if (!["raw", "summary", "observations"].includes(type)) throw new ApiError(422, "invalid", "出力種別が不正です。");
    const allStatuses = ["submitted", "returned", "accepted", "excluded"] as const;
    const { round, survey, questions, submissions, input } = await getCalcInput(
      supabase,
      roundId,
      type === "summary" ? parseInclude(req.url) : [...allStatuses],
    );
    const { data: results, error } = await supabase.from("round_results").select("version").eq("round_id", roundId).order("version", { ascending: false }).limit(1);
    if (error) throw fromDbError(error);
    const meta: ExportMeta = {
      surveyName: survey.name,
      roundNumber: round.roundNumber,
      roundTitle: round.title,
      surveyDate: round.surveyDate,
      snapshotHash: round.snapshotHash,
      exportedAt: new Date().toISOString(),
    };
    const exported = submissions.filter((s) => s.status !== "draft");
    let rows;
    if (type === "raw") {
      const answerIndex = new Map(input.answers.map((a) => [`${a.submissionId}:${a.questionId}`, a]));
      const out: RawAnswerExport[] = [];
      for (const s of exported) {
        for (const q of questions) {
          if (q.answerFormat === "computed" || q.answerFormat === "observation") continue;
          const a = answerIndex.get(`${s.id}:${q.id}`);
          const raw = a ? (a.valueNum ?? a.valueText) : null;
          const opt = raw === null ? undefined : (q.options ?? []).find((o) => o.value === raw);
          out.push({
            submissionId: s.id,
            surveyorName: s.surveyorName,
            submissionStatus: s.status,
            revision: s.revision,
            questionCode: q.code,
            originalNo: q.originalNo,
            section: q.section,
            kind: q.kind,
            text: q.text,
            isCustom: q.isCustom,
            state: a?.state ?? "missing",
            valueNum: a?.valueNum ?? null,
            valueText: a?.valueText ?? null,
            valueLabel: opt?.label ?? null,
          });
        }
      }
      rows = rawAnswersCsv(meta, out);
    } else if (type === "observations") {
      const obs = await getObservationRows(supabase, roundId);
      const subIndex = new Map(exported.map((s) => [s.id, s]));
      rows = observationsCsv(
        meta,
        obs
          .filter((o) => subIndex.has(o.submission_id))
          .map((o) => {
            const s = subIndex.get(o.submission_id)!;
            const values: Record<string, number | null> = {};
            for (const [k, v] of Object.entries(o)) if (ATTRIBUTE_KEYS.includes(camel(k) as never)) values[camel(k)] = v as number | null;
            return {
              submissionId: s.id,
              surveyorName: s.surveyorName,
              submissionStatus: s.status,
              observationsIncluded: s.observationsIncluded,
              seq: o.seq,
              presence: o.presence,
              groupType: o.group_type,
              groupSize: o.group_size,
              values,
              note: o.note,
            };
          }),
        { stay: round.stayMeasureMinutes, pass: round.passMeasureMinutes },
      );
    } else {
      rows = summaryCsv(meta, aggregateRound(input), results?.[0]?.version ?? null);
    }
    const filename = `mcs_round${round.roundNumber}_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
