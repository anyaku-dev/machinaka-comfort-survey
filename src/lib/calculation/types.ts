import type { AnswerState } from "@/lib/questionnaire/types";

/** 算定ロジックの版。集計結果・CSV・調査回スナップショットに記録する。 */
export const CALC_VERSION = "app-calc-1.0.0";

export type SubmissionStatus = "draft" | "submitted" | "returned" | "accepted" | "excluded";

export interface CalcQuestion {
  id: string;
  code: string;
  section: string;
  element: string | null;
  kind: string;
  pairNo: number | null;
  originalNo: string | null;
  text: string;
  answerFormat: string;
  options: { value: number | string; label: string }[] | null;
  visible: boolean;
  fixedValue: { value: number | string } | null;
  computedFrom: string[] | null;
  verification: string;
  isCustom: boolean;
  displayOrder: number;
}

export interface CalcSubmission {
  id: string;
  surveyorName: string;
  status: SubmissionStatus;
  observationsIncluded: boolean;
}

export interface CalcAnswer {
  submissionId: string;
  questionId: string;
  state: AnswerState;
  valueNum: number | null;
  valueText: string | null;
}

export type Presence = "stay" | "pass";
export type GroupType = "single" | "family" | "group" | "party";

export const ATTRIBUTE_KEYS = [
  "male",
  "female",
  "genderUnknown",
  "infant",
  "child",
  "teen",
  "adult",
  "elderly",
  "ageUnknown",
  "walkFast",
  "walkSlow",
  "japanese",
  "foreigner",
  "nationalityUnknown",
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export const ATTRIBUTE_GROUPS: Record<"gender" | "age" | "behavior" | "nationality", AttributeKey[]> = {
  gender: ["male", "female", "genderUnknown"],
  age: ["infant", "child", "teen", "adult", "elderly", "ageUnknown"],
  behavior: ["walkFast", "walkSlow"],
  nationality: ["japanese", "foreigner", "nationalityUnknown"],
};

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  male: "男性",
  female: "女性",
  genderUnknown: "性別わからない",
  infant: "乳幼児",
  child: "小学生",
  teen: "中高生",
  adult: "大人",
  elderly: "高齢者",
  ageUnknown: "年齢わからない",
  walkFast: "スタスタ歩いている",
  walkSlow: "のんびり歩いている",
  japanese: "日本人",
  foreigner: "外国人",
  nationalityUnknown: "国籍わからない",
};

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  single: "1人",
  family: "家族",
  group: "グループ",
  party: "団体",
};

export type CalcObservation = {
  submissionId: string;
  presence: Presence;
  groupType: GroupType;
  groupSize: number;
} & { [K in AttributeKey]: number | null };

export interface CalcRepresentative {
  questionId: string;
  valueState: "value" | "not_applicable" | "no_data";
  valueNum: number | null;
  method: "mean" | "mode" | "manual" | "fixed";
  note: string;
}

export interface CalcRound {
  stayMeasureMinutes: number | null;
  passMeasureMinutes: number | null;
}

export interface CalcInput {
  round: CalcRound;
  questions: CalcQuestion[];
  submissions: CalcSubmission[];
  answers: CalcAnswer[];
  observations: CalcObservation[];
  representatives: CalcRepresentative[];
  /** 集計対象とする提出の状態。既定は採用（accepted）のみ。 */
  includeStatuses?: SubmissionStatus[];
}

/** 指標の検証状態。 */
export type IndicatorStatus =
  /** 記入例Excelのキャッシュ値と一致を確認した算式 */
  | "excel_verified"
  /** アプリ独自の算出値（公式Excelに相当する算式なし） */
  | "app_calculated"
  /** 公式との照合が完了していない */
  | "unverified";

export interface Indicator {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  formula: string;
  basis: string;
  status: IndicatorStatus;
  missingReason: string | null;
}
