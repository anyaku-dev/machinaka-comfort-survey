import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3100";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;

export const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
export const anon = () => createClient(URL_, PUB, { auth: { persistSession: false, autoRefreshToken: false } });

export interface Organizer {
  id: string;
  email: string;
  password: string;
  token: string;
  db: SupabaseClient;
  call: <T = any>(path: string, method?: string, body?: unknown) => Promise<{ status: number; body: T }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function createOrganizer(label = "org"): Promise<Organizer> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomBytes(12).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = anon();
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  const token = s.data.session!.access_token;
  const db = createClient(URL_, PUB, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  return {
    id: data.user!.id,
    email,
    password,
    token,
    db,
    call: (path, method = "GET", body) => api(path, method, body, token),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(path: string, method = "GET", body?: unknown, token?: string, raw = false): Promise<{ status: number; body: T; text: string; headers: Headers }> {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed as T, text, headers: res.headers };
}

export interface ActiveRound {
  surveyId: string;
  roundId: string;
  token: string;
  joinUrl: string;
  questions: { id: string; code: string; answerFormat: string; section: string }[];
}

export async function createActiveRound(org: Organizer, opts: { stay?: number | null; pass?: number | null; hide?: string[]; fixed?: Record<string, number>; maxSubmissions?: number } = {}): Promise<ActiveRound> {
  const created = await org.call<{ surveyId: string; roundId: string }>("/api/surveys", "POST", { name: `統合テスト ${randomUUID().slice(0, 6)}`, siteName: "テスト通り", siteType: "street" });
  if (created.status !== 201) throw new Error(JSON.stringify(created.body));
  const { surveyId, roundId } = created.body;
  const patch = await org.call(`/api/rounds/${roundId}`, "PATCH", {
    surveyDate: "2026-11-15",
    startTime: "10:00",
    endTime: "11:00",
    scopeText: "テスト範囲",
    stayMeasureMinutes: opts.stay === undefined ? 10 : opts.stay,
    passMeasureMinutes: opts.pass === undefined ? 5 : opts.pass,
  });
  if (patch.status !== 200) throw new Error(JSON.stringify(patch.body));
  if (opts.hide?.length || opts.fixed) {
    const { data } = await org.db.from("round_questions").select("id, code").eq("round_id", roundId);
    const updates = (data ?? [])
      .filter((q) => opts.hide?.includes(q.code) || (opts.fixed && q.code in opts.fixed))
      .map((q) => ({ id: q.id, ...(opts.hide?.includes(q.code) ? { visible: false } : {}), ...(opts.fixed && q.code in opts.fixed ? { fixedValue: { value: opts.fixed[q.code] } } : {}) }));
    const r = await org.call(`/api/rounds/${roundId}/questions`, "PATCH", { updates });
    if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  }
  const st = await org.call(`/api/rounds/${roundId}/start`, "POST");
  if (st.status !== 200) throw new Error(JSON.stringify(st.body));
  const link = await org.call<{ link: { url: string } }>(`/api/rounds/${roundId}/link`, "POST", { expiresInHours: 24, maxSubmissions: opts.maxSubmissions ?? 300 });
  if (link.status !== 201) throw new Error(JSON.stringify(link.body));
  const token = link.body.link.url.split("#")[1];
  const open = await api<{ questions: ActiveRound["questions"] }>("/api/participant/open", "POST", { token });
  return { surveyId, roundId, token, joinUrl: link.body.link.url, questions: open.body.questions };
}

export async function registerSurveyor(token: string, displayName = "調査者") {
  const r = await api<{ surveyorId: string; surveyorKey: string }>("/api/participant/register", "POST", { token, displayName, affiliation: "テスト" });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return r.body;
}

export function submit(token: string, s: { surveyorId: string; surveyorKey: string }, payload: unknown, idempotencyKey: string = randomUUID()) {
  return api("/api/participant/submit", "POST", { token, surveyorId: s.surveyorId, surveyorKey: s.surveyorKey, idempotencyKey, payload });
}

export const q = (r: ActiveRound, code: string) => {
  const found = r.questions.find((x) => x.code === code);
  if (!found) throw new Error(`question ${code} not visible`);
  return found.id;
};
