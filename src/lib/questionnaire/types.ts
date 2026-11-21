export type SectionKey =
  | "basic"
  | "space_a"
  | "space_b"
  | "observation"
  | "anshin"
  | "kanyo_type"
  | "kanyo"
  | "yasuragi"
  | "kitai";

export type ElementKey = "anshin" | "kanyo" | "yasuragi" | "kitai";

export type QuestionKind =
  | "subjective"
  | "activity"
  | "activity_type"
  | "activity_type_computed"
  | "fact"
  | "count"
  | "memo"
  | "observation_attribute";

export type AnswerFormat =
  | "scale4"
  | "ynu3"
  | "count"
  | "choice"
  | "number"
  | "time"
  | "text"
  | "computed"
  | "observation";

/** 回答の状態。0件・評価1は answered + 値で表し、未回答・適用外・非表示・固定値と区別する。 */
export type AnswerState = "answered" | "unanswered" | "not_applicable" | "hidden" | "fixed";

export type SiteType = "street" | "plaza" | "other";

export type VerificationStatus =
  /** 調査票PDFの文言と照合済み（テキスト抽出＋目視） */
  | "pdf_verified"
  /** 調査票PDFと分析ツールExcelの両方と照合済み */
  | "pdf_excel_verified"
  /** アプリ独自の定義（公式資料に該当なし） */
  | "app_defined"
  /** 公式資料で確認できていない */
  | "unverified";

export interface ChoiceOption {
  value: number | string;
  label: string;
}

export interface Applicability {
  siteTypes?: SiteType[];
  nightOnly?: boolean;
  dependsOn?: string;
  /** 周辺エリア（概ね300m）も含めて確認する項目（調査票の「※」） */
  peripheral?: boolean;
  /** 個人ではなくグループの数をカウント（期待感 活動2 の「※」） */
  countGroups?: boolean;
  passOnly?: boolean;
}

export interface MasterQuestion {
  id: string;
  version: "ver1.1";
  section: SectionKey;
  element: ElementKey | null;
  kind: QuestionKind;
  code: string;
  pairNo: number | null;
  originalNo: string;
  category: string | null;
  text: string;
  answerFormat: AnswerFormat;
  options: ChoiceOption[] | null;
  applicability: Applicability | null;
  source: string;
  verification: VerificationStatus;
  excelRow: number | null;
  excelLabel: string | null;
  notes: string | null;
  displayOrder: number;
  defaultVisible: boolean;
  /** 活動の種類（自動算出）の算出元コード。Excel式 =MAX(...) をそのまま写したもの */
  computedFrom?: string[] | null;
}
