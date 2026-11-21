import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, fromDbError } from "./api";
import type {
  CalcAnswer,
  CalcInput,
  CalcObservation,
  CalcQuestion,
  CalcRepresentative,
  CalcSubmission,
  SubmissionStatus,
} from "@/lib/calculation/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/** PostgREST の max_rows（既定1000件）を超える取得に対応するページング。 */
export async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: any }>): Promise<Row[]> {
  const page = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw fromDbError(error);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
    if (from > 200_000) break;
  }
  return out;
}

export interface RoundRow {
  id: string;
  surveyId: string;
  roundNumber: number;
  title: string;
  status: "draft" | "active" | "closed";
  scopeText: string;
  frontageScopeText: string;
  peripheralScopeText: string;
  surveyDate: string | null;
  isHoliday: boolean;
  startTime: string | null;
  endTime: string | null;
  isNight: boolean;
  eventName: string;
  stayMeasureMinutes: number | null;
  passMeasureMinutes: number | null;
  previousActions: string;
  notes: string;
  siteMetrics: Record<string, string | number | null>;
  masterVersion: string;
  calcVersion: string | null;
  snapshotHash: string | null;
  startedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export function mapRound(r: Row): RoundRow {
  return {
    id: r.id,
    surveyId: r.survey_id,
    roundNumber: r.round_number,
    title: r.title,
    status: r.status,
    scopeText: r.scope_text,
    frontageScopeText: r.frontage_scope_text,
    peripheralScopeText: r.peripheral_scope_text,
    surveyDate: r.survey_date,
    isHoliday: r.is_holiday,
    startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
    endTime: r.end_time ? String(r.end_time).slice(0, 5) : null,
    isNight: r.is_night,
    eventName: r.event_name,
    stayMeasureMinutes: r.stay_measure_minutes === null ? null : Number(r.stay_measure_minutes),
    passMeasureMinutes: r.pass_measure_minutes === null ? null : Number(r.pass_measure_minutes),
    previousActions: r.previous_actions,
    notes: r.notes,
    siteMetrics: r.site_metrics ?? {},
    masterVersion: r.master_version,
    calcVersion: r.calc_version,
    snapshotHash: r.snapshot_hash,
    startedAt: r.started_at,
    closedAt: r.closed_at,
    createdAt: r.created_at,
  };
}

export interface SurveyRow {
  id: string;
  name: string;
  purpose: string;
  organizerName: string;
  siteName: string;
  siteAddress: string;
  siteType: "street" | "plaza" | "other";
  createdAt: string;
}

export function mapSurvey(s: Row): SurveyRow {
  return {
    id: s.id,
    name: s.name,
    purpose: s.purpose,
    organizerName: s.organizer_name,
    siteName: s.site_name,
    siteAddress: s.site_address,
    siteType: s.site_type,
    createdAt: s.created_at,
  };
}

export type QuestionRow = CalcQuestion & {
  category: string | null;
  applicability: Record<string, unknown> | null;
  notes: string | null;
  source: string | null;
};

export function mapQuestion(q: Row): QuestionRow {
  return {
    id: q.id,
    code: q.code,
    section: q.section,
    element: q.element,
    kind: q.kind,
    pairNo: q.pair_no,
    originalNo: q.original_no,
    category: q.category,
    text: q.text,
    answerFormat: q.answer_format,
    options: q.options,
    applicability: q.applicability,
    visible: q.visible,
    fixedValue: q.fixed_value,
    computedFrom: q.computed_from,
    verification: q.verification,
    isCustom: q.is_custom,
    displayOrder: q.display_order,
    notes: q.notes,
    source: q.source,
  };
}

export interface SubmissionRow extends CalcSubmission {
  surveyorId: string;
  affiliation: string;
  ageBand: string;
  gender: string;
  revision: number;
  submittedAt: string | null;
  draftSavedAt: string | null;
  reviewNote: string;
  reviewedAt: string | null;
  personalDataPurged: boolean;
}

export async function getRound(supabase: SupabaseClient, roundId: string): Promise<{ round: RoundRow; survey: SurveyRow }> {
  if (!/^[0-9a-f-]{36}$/i.test(roundId)) throw new ApiError(404, "not_found", "調査回が見つかりません。");
  const { data, error } = await supabase.from("survey_rounds").select("*, surveys(*)").eq("id", roundId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ApiError(404, "not_found", "調査回が見つかりません。");
  return { round: mapRound(data), survey: mapSurvey(data.surveys) };
}

export async function getQuestions(supabase: SupabaseClient, roundId: string): Promise<QuestionRow[]> {
  const rows = await fetchAll((from, to) =>
    supabase.from("round_questions").select("*").eq("round_id", roundId).order("display_order").range(from, to),
  );
  return rows.map(mapQuestion);
}

export async function getSubmissions(supabase: SupabaseClient, roundId: string): Promise<SubmissionRow[]> {
  const rows = await fetchAll((from, to) =>
    supabase
      .from("submissions")
      .select("id, surveyor_id, status, revision, submitted_at, draft_saved_at, review_note, reviewed_at, observations_included, created_at, surveyors(display_name, affiliation, age_band, gender, personal_data_purged_at)")
      .eq("round_id", roundId)
      .order("created_at")
      .range(from, to),
  );
  return rows.map((s) => ({
    id: s.id,
    surveyorId: s.surveyor_id,
    surveyorName: s.surveyors?.display_name ?? "",
    affiliation: s.surveyors?.affiliation ?? "",
    ageBand: s.surveyors?.age_band ?? "",
    gender: s.surveyors?.gender ?? "",
    personalDataPurged: Boolean(s.surveyors?.personal_data_purged_at),
    status: s.status as SubmissionStatus,
    revision: s.revision,
    submittedAt: s.submitted_at,
    draftSavedAt: s.draft_saved_at,
    reviewNote: s.review_note,
    reviewedAt: s.reviewed_at,
    observationsIncluded: s.observations_included,
  }));
}

export async function getCalcInput(
  supabase: SupabaseClient,
  roundId: string,
  includeStatuses: SubmissionStatus[] = ["accepted"],
): Promise<{ round: RoundRow; survey: SurveyRow; questions: QuestionRow[]; submissions: SubmissionRow[]; input: CalcInput }> {
  const { round, survey } = await getRound(supabase, roundId);
  const [questions, submissions, answerRows, countRows, obsRows, repRows] = await Promise.all([
    getQuestions(supabase, roundId),
    getSubmissions(supabase, roundId),
    fetchAll((f, t) => supabase.from("answers").select("submission_id, round_question_id, state, value_num, value_text").eq("round_id", roundId).order("id").range(f, t)),
    fetchAll((f, t) => supabase.from("space_counts").select("submission_id, round_question_id, state, count").eq("round_id", roundId).order("id").range(f, t)),
    fetchAll((f, t) => supabase.from("observation_groups").select("*").eq("round_id", roundId).order("submission_id").order("seq").range(f, t)),
    fetchAll((f, t) => supabase.from("representative_values").select("*").eq("round_id", roundId).range(f, t)),
  ]);
  const answers: CalcAnswer[] = [
    ...answerRows.map((a) => ({
      submissionId: a.submission_id,
      questionId: a.round_question_id,
      state: a.state,
      valueNum: a.value_num === null ? null : Number(a.value_num),
      valueText: a.value_text,
    })),
    ...countRows.map((c) => ({
      submissionId: c.submission_id,
      questionId: c.round_question_id,
      state: c.state,
      valueNum: c.count,
      valueText: null,
    })),
  ];
  const observations: CalcObservation[] = obsRows.map((o) => ({
    submissionId: o.submission_id,
    presence: o.presence,
    groupType: o.group_type,
    groupSize: o.group_size,
    male: o.male,
    female: o.female,
    genderUnknown: o.gender_unknown,
    infant: o.infant,
    child: o.child,
    teen: o.teen,
    adult: o.adult,
    elderly: o.elderly,
    ageUnknown: o.age_unknown,
    walkFast: o.walk_fast,
    walkSlow: o.walk_slow,
    japanese: o.japanese,
    foreigner: o.foreigner,
    nationalityUnknown: o.nationality_unknown,
  }));
  const representatives: CalcRepresentative[] = repRows.map((r) => ({
    questionId: r.round_question_id,
    valueState: r.value_state,
    valueNum: r.value_num === null ? null : Number(r.value_num),
    method: r.method,
    note: r.note,
  }));
  return {
    round,
    survey,
    questions,
    submissions,
    input: {
      round: { stayMeasureMinutes: round.stayMeasureMinutes, passMeasureMinutes: round.passMeasureMinutes },
      questions,
      submissions,
      answers,
      observations,
      representatives,
      includeStatuses,
    },
  };
}

export async function getObservationRows(supabase: SupabaseClient, roundId: string): Promise<Row[]> {
  return fetchAll((f, t) => supabase.from("observation_groups").select("*").eq("round_id", roundId).order("submission_id").order("seq").range(f, t));
}
