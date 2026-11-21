/**
 * 調査者端末での入力保持・未送信キュー。
 * - 入力は変更のたびに localStorage に保存する（画面移動・再読込・通信断で失わない）。
 * - 提出は「送信ID（冪等キー）＋内容」を outbox に保存してから送る。通信失敗時は outbox を残し、
 *   利用者が明示的に「再送」する。同じ送信IDの再送はサーバーで1件として扱われる。
 * - バックグラウンド同期 API には依存しない。
 */

export type LocalAnswer = { state: "answered" | "not_applicable"; value: number | string | null };

export interface LocalObservation {
  localId: string;
  presence: "stay" | "pass";
  groupType: "single" | "family" | "group" | "party";
  groupSize: number;
  male: number;
  female: number;
  genderUnknown: number;
  infant: number;
  child: number;
  teen: number;
  adult: number;
  elderly: number;
  ageUnknown: number;
  walkFast: number;
  walkSlow: number;
  japanese: number;
  foreigner: number;
  nationalityUnknown: number;
  note: string;
}

export interface LocalDraft {
  answers: Record<string, LocalAnswer>;
  observations: LocalObservation[];
  updatedAt: string;
}

export interface LocalSession {
  surveyorId: string;
  surveyorKey: string;
  displayName: string;
}

export interface Outbox {
  idempotencyKey: string;
  payload: SubmitPayload;
  createdAt: string;
  lastError: string | null;
  attempts: number;
}

export interface ParticipantQuestion {
  id: string;
  code: string;
  section: string;
  element: string | null;
  kind: string;
  pairNo: number | null;
  originalNo: string;
  category: string | null;
  text: string;
  answerFormat: string;
  options: { value: number | string; label: string }[] | null;
  applicability: { nightOnly?: boolean; peripheral?: boolean; countGroups?: boolean; siteTypes?: string[]; dependsOn?: string; passOnly?: boolean } | null;
  fixedValue: { value: number | string } | null;
  notes: string | null;
  displayOrder: number;
  isCustom: boolean;
}

export interface SubmitPayload {
  answers: { questionId: string; state: "answered" | "unanswered" | "not_applicable"; value?: number | string | null }[];
  observations: Record<string, unknown>[];
  clientSavedAt?: string;
}

export interface VisibleAttributes {
  gender: boolean;
  age: boolean;
  behavior: boolean;
  nationality: boolean;
}

export const emptyDraft = (): LocalDraft => ({ answers: {}, observations: [], updatedAt: new Date(0).toISOString() });

export async function storageKey(token: string): Promise<string> {
  const data = new TextEncoder().encode(`mcs-local:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return "mcs:" + Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const store = {
  session: (k: string) => read<LocalSession>(`${k}:session`),
  setSession: (k: string, s: LocalSession | null) => write(`${k}:session`, s),
  draft: (k: string) => read<LocalDraft>(`${k}:draft`),
  setDraft: (k: string, d: LocalDraft | null) => write(`${k}:draft`, d),
  outbox: (k: string) => read<Outbox>(`${k}:outbox`),
  setOutbox: (k: string, o: Outbox | null) => write(`${k}:outbox`, o),
  cache: <T>(k: string) => read<T>(`${k}:open`),
  setCache: (k: string, v: unknown) => write(`${k}:open`, v),
};

export function visibleAttributes(questions: ParticipantQuestion[]): VisibleAttributes {
  const has = (c: string) => questions.some((q) => q.code === c);
  return { gender: has("OBS-GENDER"), age: has("OBS-AGE"), behavior: has("OBS-BEHAVIOR"), nationality: has("OBS-NATIONALITY") };
}

/** 入力対象の設問（固定値・自動算出・観察属性を除く）。 */
export function answerableQuestions(questions: ParticipantQuestion[]): ParticipantQuestion[] {
  return questions.filter((q) => !q.fixedValue && q.answerFormat !== "computed" && q.answerFormat !== "observation");
}

export function buildPayload(questions: ParticipantQuestion[], draft: LocalDraft, attrs: VisibleAttributes): SubmitPayload {
  const answers: SubmitPayload["answers"] = answerableQuestions(questions).map((q) => {
    const a = draft.answers[q.id];
    if (!a) return { questionId: q.id, state: "unanswered" };
    if (a.state === "not_applicable") return { questionId: q.id, state: "not_applicable" };
    if (a.value === null || a.value === "" || a.value === undefined) return { questionId: q.id, state: "unanswered" };
    return { questionId: q.id, state: "answered", value: a.value };
  });
  const observations = draft.observations.map((o) => {
    const out: Record<string, unknown> = { presence: o.presence, groupType: o.groupType, groupSize: o.groupSize };
    if (attrs.gender) Object.assign(out, { male: o.male, female: o.female, genderUnknown: o.genderUnknown });
    if (attrs.age) Object.assign(out, { infant: o.infant, child: o.child, teen: o.teen, adult: o.adult, elderly: o.elderly, ageUnknown: o.ageUnknown });
    if (attrs.behavior && o.presence === "pass") Object.assign(out, { walkFast: o.walkFast, walkSlow: o.walkSlow });
    if (attrs.nationality) Object.assign(out, { japanese: o.japanese, foreigner: o.foreigner, nationalityUnknown: o.nationalityUnknown });
    if (o.note) out.note = o.note;
    return out;
  });
  return { answers, observations, clientSavedAt: draft.updatedAt };
}

export function newObservation(presence: "stay" | "pass" = "stay"): LocalObservation {
  return {
    localId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()),
    presence,
    groupType: "single",
    groupSize: 1,
    male: 0,
    female: 0,
    genderUnknown: 0,
    infant: 0,
    child: 0,
    teen: 0,
    adult: 0,
    elderly: 0,
    ageUnknown: 0,
    walkFast: 0,
    walkSlow: 0,
    japanese: 0,
    foreigner: 0,
    nationalityUnknown: 0,
    note: "",
  };
}

/** サーバーの提出内容（差し戻し時の前回提出）を端末の下書き形式に戻す。 */
export function draftFromPayload(payload: unknown): LocalDraft | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { answers?: unknown; observations?: unknown };
  if (Array.isArray(p.answers) || Array.isArray(p.observations)) {
    const answers: Record<string, LocalAnswer> = {};
    for (const a of (p.answers as SubmitPayload["answers"]) ?? []) {
      if (a.state === "answered") answers[a.questionId] = { state: "answered", value: a.value ?? null };
      if (a.state === "not_applicable") answers[a.questionId] = { state: "not_applicable", value: null };
    }
    const observations = ((p.observations as Record<string, unknown>[]) ?? []).map((o) => ({ ...newObservation(), ...(o as object) }) as LocalObservation);
    return { answers, observations, updatedAt: new Date().toISOString() };
  }
  const d = payload as Partial<LocalDraft>;
  if (d.answers && d.observations) return { answers: d.answers, observations: d.observations, updatedAt: d.updatedAt ?? new Date().toISOString() };
  return null;
}
