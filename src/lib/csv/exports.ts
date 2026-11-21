import type { RoundAggregate } from "@/lib/calculation/aggregate";
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, CALC_VERSION, GROUP_TYPE_LABELS, type GroupType } from "@/lib/calculation/types";
import type { CsvCell } from "./csv";

const STATE_LABEL: Record<string, string> = {
  answered: "回答",
  unanswered: "未回答",
  not_applicable: "適用外",
  hidden: "非表示",
  fixed: "固定値",
  missing: "記録なし",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "入力中",
  submitted: "提出済み（未審査）",
  returned: "差し戻し中",
  accepted: "採用",
  excluded: "除外",
};
const VERIFICATION_LABEL: Record<string, string> = {
  pdf_verified: "調査票と照合済み",
  pdf_excel_verified: "調査票・Excelと照合済み",
  app_defined: "アプリ定義（独自項目等）",
  unverified: "未検証",
};
const INDICATOR_STATUS: Record<string, string> = {
  excel_verified: "Excel記入例と照合済みの算式",
  app_calculated: "アプリ算出値",
  unverified: "未検証",
};

export interface ExportMeta {
  surveyName: string;
  roundNumber: number;
  roundTitle: string;
  surveyDate: string | null;
  snapshotHash: string | null;
  exportedAt: string;
}

function metaRows(meta: ExportMeta, kind: string): CsvCell[][] {
  return [
    ["# まちなかの居心地の良さを測る指標 調査アプリ", kind],
    ["# 調査", meta.surveyName, "調査回", meta.roundNumber, meta.roundTitle, "調査日", meta.surveyDate ?? ""],
    ["# 算定ロジック版", CALC_VERSION, "設定スナップショット", meta.snapshotHash ?? "", "出力日時", meta.exportedAt],
  ];
}

export interface RawAnswerExport {
  submissionId: string;
  surveyorName: string;
  submissionStatus: string;
  revision: number;
  questionCode: string;
  originalNo: string | null;
  section: string;
  kind: string;
  text: string;
  isCustom: boolean;
  state: string;
  valueNum: number | null;
  valueText: string | null;
  valueLabel: string | null;
}

/** 原回答（調査者 × 設問）。集計対象かどうかに関わらず全提出を出力する。 */
export function rawAnswersCsv(meta: ExportMeta, rows: RawAnswerExport[]): CsvCell[][] {
  return [
    ...metaRows(meta, "原回答（調査者別）"),
    ["提出ID", "調査者", "提出状態", "提出版", "設問コード", "原票番号", "区分", "種類", "設問文", "独自項目", "回答状態", "数値", "文字", "選択肢ラベル"],
    ...rows.map((r) => [
      r.submissionId,
      r.surveyorName,
      STATUS_LABEL[r.submissionStatus] ?? r.submissionStatus,
      r.revision,
      r.questionCode,
      r.originalNo,
      r.section,
      r.kind,
      r.text,
      r.isCustom ? "独自" : "標準",
      STATE_LABEL[r.state] ?? r.state,
      r.valueNum,
      r.valueText,
      r.valueLabel,
    ]),
  ];
}

export interface ObservationExport {
  submissionId: string;
  surveyorName: string;
  submissionStatus: string;
  observationsIncluded: boolean;
  seq: number;
  presence: string;
  groupType: string;
  groupSize: number;
  values: Record<string, number | null>;
  note: string;
}

export function observationsCsv(meta: ExportMeta, rows: ObservationExport[], minutes: { stay: number | null; pass: number | null }): CsvCell[][] {
  return [
    ...metaRows(meta, "滞在者・通行者（グループ単位の原記録）"),
    ["# 滞在者計測時間（分）", minutes.stay ?? "未設定", "通行者計測時間（分）", minutes.pass ?? "未設定"],
    ["提出ID", "調査者", "提出状態", "人数集計に含める", "No", "滞在・通行", "グループ属性", "グループ人数", ...ATTRIBUTE_KEYS.map((k) => ATTRIBUTE_LABELS[k]), "メモ"],
    ...rows.map((r) => [
      r.submissionId,
      r.surveyorName,
      STATUS_LABEL[r.submissionStatus] ?? r.submissionStatus,
      r.observationsIncluded ? "含める" : "含めない",
      r.seq,
      r.presence === "stay" ? "滞在" : "通行",
      GROUP_TYPE_LABELS[r.groupType as GroupType] ?? r.groupType,
      r.groupSize,
      ...ATTRIBUTE_KEYS.map((k) => (r.values[k] === null || r.values[k] === undefined ? "記録なし" : r.values[k])),
      r.note,
    ]),
  ];
}

/** 集計（平均値・代表値・指標）。平均値と確定代表値は別列。 */
export function summaryCsv(meta: ExportMeta, agg: RoundAggregate, finalizedVersion: number | null): CsvCell[][] {
  const rows: CsvCell[][] = [
    ...metaRows(meta, "集計（平均値と代表値を区別）"),
    ["# 集計対象", agg.includedSubmissions.length + "件", "対象状態", agg.includeStatuses.join("/"), "確定版", finalizedVersion ? `v${finalizedVersion}` : "未確定"],
    ...agg.warnings.map((w) => ["# 注意", w]),
    [],
    ["[設問別]"],
    ["設問コード", "原票番号", "区分", "種類", "設問文", "照合状態", "表示", "回答数", "未回答", "適用外", "非表示", "固定値", "平均値（アプリ算出）", "最頻値", "代表値の状態", "代表値（主催者確定）", "代表値の決め方", "代表値メモ"],
  ];
  for (const q of agg.questions) {
    rows.push([
      q.code,
      q.originalNo,
      q.section,
      q.kind,
      q.text,
      VERIFICATION_LABEL[q.verification] ?? q.verification,
      q.visible ? "表示" : "非表示",
      q.counts.answered,
      q.counts.unanswered + q.counts.missing,
      q.counts.not_applicable,
      q.counts.hidden,
      q.counts.fixed,
      q.mean,
      q.mode,
      q.representative ? q.representative.valueState : "未確定",
      q.representative?.valueNum ?? null,
      q.representative?.method ?? null,
      q.representative?.note ?? null,
    ]);
  }
  rows.push([], ["[寛容性 活動の種類（自動算出）]"]);
  rows.push(["設問コード", "項目", "算出元", "照合状態", "算出できた調査者数", "平均値（アプリ：算出元が回答済みの調査者のみ）", "参考：Excel記入例の算式再現（6列・空欄=0）", "代表値の状態", "代表値（主催者確定）", "算出できない理由"]);
  for (const a of agg.activityTypes) {
    rows.push([
      a.code,
      a.text,
      a.sources.join(" / "),
      VERIFICATION_LABEL[a.verification] ?? a.verification,
      a.n,
      a.mean,
      a.excelCompatibleMean,
      a.representative ? a.representative.valueState : "未確定",
      a.representative?.valueNum ?? null,
      a.missingReason,
    ]);
  }
  rows.push([], ["[指標]"], ["指標キー", "指標名", "値", "単位", "式", "根拠", "検証状態", "算出しない理由"]);
  for (const i of [...agg.observation.indicators, ...agg.spaceA]) {
    rows.push([i.key, i.label, i.value, i.unit, i.formula, i.basis, INDICATOR_STATUS[i.status] ?? i.status, i.missingReason]);
  }
  rows.push([], ["[主観と活動の乖離（差が2以上で＊）]"], ["要素", "No", "主観コード", "活動コード", "主観", "活動", "値の出典", "＊"]);
  for (const g of agg.gaps) {
    rows.push([g.element, g.pairNo, g.subjectiveCode, g.activityCode, g.subjective, g.activity, g.source === "representative" ? "確定代表値" : "未確定（平均値等を含む）", g.flag === null ? "判定不可" : g.flag ? "＊" : ""]);
  }
  return rows;
}
