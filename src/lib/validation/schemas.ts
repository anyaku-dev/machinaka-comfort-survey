import { z } from "zod";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "IDの形式が不正です");
const nonNegInt = z.number().int().min(0).max(500);

/** 参加トークン: 32バイト乱数の base64url（43文字） */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "参加リンクが無効です");
/** 調査者キー: 32バイト乱数の base64url */
export const surveyorKeySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "調査者キーが不正です");

export const answerInputSchema = z.object({
  questionId: uuid,
  state: z.enum(["answered", "unanswered", "not_applicable"]),
  value: z.union([z.number().finite(), z.string().max(2000)]).nullable().optional(),
});

export const observationInputSchema = z
  .object({
    presence: z.enum(["stay", "pass"]),
    groupType: z.enum(["single", "family", "group", "party"]),
    groupSize: z.number().int().min(1).max(500),
    male: nonNegInt.nullable().optional(),
    female: nonNegInt.nullable().optional(),
    genderUnknown: nonNegInt.nullable().optional(),
    infant: nonNegInt.nullable().optional(),
    child: nonNegInt.nullable().optional(),
    teen: nonNegInt.nullable().optional(),
    adult: nonNegInt.nullable().optional(),
    elderly: nonNegInt.nullable().optional(),
    ageUnknown: nonNegInt.nullable().optional(),
    walkFast: nonNegInt.nullable().optional(),
    walkSlow: nonNegInt.nullable().optional(),
    japanese: nonNegInt.nullable().optional(),
    foreigner: nonNegInt.nullable().optional(),
    nationalityUnknown: nonNegInt.nullable().optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((o, ctx) => {
    for (const msg of observationProblems(o, { gender: true, age: true, behavior: true, nationality: true }, true)) {
      ctx.addIssue({ code: "custom", message: msg });
    }
  });

export type ObservationInput = z.infer<typeof observationInputSchema>;

export interface VisibleAttributes {
  gender: boolean;
  age: boolean;
  behavior: boolean;
  nationality: boolean;
}

const GROUPS = {
  gender: { label: "性別", keys: ["male", "female", "genderUnknown"] },
  age: { label: "年齢", keys: ["infant", "child", "teen", "adult", "elderly", "ageUnknown"] },
  behavior: { label: "行動", keys: ["walkFast", "walkSlow"] },
  nationality: { label: "国籍", keys: ["japanese", "foreigner", "nationalityUnknown"] },
} as const;

/**
 * 観察グループの整合性チェック（クライアント・サーバー共通）。
 * lenientMissing=true のときは、属性が全て未入力（null/undefined）の区分は検査しない（サーバー側で表示設定と照合）。
 */
export function observationProblems(
  o: Partial<Record<string, unknown>> & { presence?: string; groupType?: string; groupSize?: number },
  visible: VisibleAttributes,
  lenientMissing = false,
): string[] {
  const problems: string[] = [];
  const size = typeof o.groupSize === "number" ? o.groupSize : 0;
  if (o.groupType === "single" && size !== 1) problems.push("「1人」のグループ人数は1人です。");
  if (o.groupType !== "single" && o.groupType && size < 2) problems.push("家族・グループ・団体は2人以上です。");
  for (const [g, def] of Object.entries(GROUPS) as [keyof typeof GROUPS, (typeof GROUPS)[keyof typeof GROUPS]][]) {
    if (!visible[g]) continue;
    if (g === "behavior" && o.presence !== "pass") continue;
    const vals = def.keys.map((k) => o[k]);
    if (lenientMissing && vals.every((v) => v === null || v === undefined)) continue;
    const sum = vals.reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0);
    if (sum !== size) problems.push(`${def.label}の内訳の合計（${sum}人）がグループ人数（${size}人）と一致しません。`);
  }
  return problems;
}

export const groupSizeWarning = (groupType: string, size: number): string | null => {
  if (groupType === "party" && size < 10) return "活用の手引きでは「団体」は10人以上でツアー等団体行動をしている集団です。";
  if (groupType === "group" && size >= 10) return "10人以上でツアー等団体行動をしている場合は「団体」です（活用の手引き）。";
  return null;
};

export const submissionPayloadSchema = z.object({
  answers: z.array(answerInputSchema).max(1000),
  observations: z.array(observationInputSchema).max(3000),
  clientSavedAt: z.string().max(40).optional(),
});
export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;

export const participantOpenSchema = z.object({ token: tokenSchema });

export const participantRegisterSchema = z.object({
  token: tokenSchema,
  displayName: z.string().trim().min(1, "氏名を入力してください").max(100),
  affiliation: z.string().trim().max(200).default(""),
  ageBand: z.enum(["", "10s", "20s", "30s", "40s", "50s", "60s", "70plus", "no_answer"]).default(""),
  gender: z.enum(["", "male", "female", "other", "no_answer"]).default(""),
});

export const participantAuthSchema = z.object({
  token: tokenSchema,
  surveyorId: uuid,
  surveyorKey: surveyorKeySchema,
});

export const participantDraftSchema = participantAuthSchema.extend({
  draft: z.record(z.string(), z.unknown()),
});

export const participantSubmitSchema = participantAuthSchema.extend({
  idempotencyKey: uuid,
  payload: submissionPayloadSchema,
});

// ---------------------------------------------------------------- 主催者
const text = (max: number) => z.string().max(max);

export const surveyCreateSchema = z.object({
  name: z.string().trim().min(1, "調査名を入力してください").max(200),
  purpose: text(4000).default(""),
  organizerName: text(200).default(""),
  siteName: text(200).default(""),
  siteAddress: text(300).default(""),
  siteType: z.enum(["street", "plaza", "other"]).default("street"),
});

export const surveyUpdateSchema = surveyCreateSchema.partial();

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "時刻はHH:MM形式で入力してください")
  .nullable();
const minutes = z.number().positive("計測時間は0より大きい値にしてください").max(1440).nullable();

export const roundUpdateSchema = z
  .object({
    title: text(200),
    scopeText: text(4000),
    frontageScopeText: text(4000),
    peripheralScopeText: text(4000),
    surveyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    isHoliday: z.boolean(),
    startTime: time,
    endTime: time,
    isNight: z.boolean(),
    eventName: text(200),
    stayMeasureMinutes: minutes,
    passMeasureMinutes: minutes,
    previousActions: text(4000),
    notes: text(4000),
    siteMetrics: z.record(z.string().max(60), z.union([z.string().max(200), z.number()]).nullable()),
  })
  .partial();

export const questionUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        id: uuid,
        visible: z.boolean().optional(),
        fixedValue: z.union([z.object({ value: z.union([z.number().finite(), z.string().max(200)]) }), z.null()]).optional(),
        text: z.string().trim().min(1).max(500).optional(),
      }),
    )
    .max(500),
});

export const customQuestionSchema = z.object({
  section: z.enum(["basic", "space_a", "space_b", "anshin", "kanyo_type", "kanyo", "yasuragi", "kitai"]),
  kind: z.enum(["memo", "count", "fact", "subjective", "activity", "activity_type"]),
  text: z.string().trim().min(1).max(500),
  pairNo: z.number().int().min(1).max(99).nullable().optional(),
});

export const linkIssueSchema = z.object({
  expiresInHours: z.number().int().min(1).max(24 * 90).default(24 * 14),
  maxSubmissions: z.number().int().min(1).max(10000).default(300),
  maxRegistrations: z.number().int().min(1).max(10000).default(200),
});

export const reviewSchema = z.object({
  action: z.enum(["accept", "exclude", "return"]),
  note: z.string().max(2000).default(""),
});

export const representativeSchema = z.object({
  items: z
    .array(
      z.object({
        roundQuestionId: uuid,
        valueState: z.enum(["value", "not_applicable", "no_data"]),
        valueNum: z.number().finite().min(0).max(100000).nullable(),
        method: z.enum(["mean", "mode", "manual", "fixed"]),
        note: z.string().max(2000).default(""),
        basis: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(1000),
});

export const finalizeSchema = z.object({ note: z.string().max(2000).default("") });
