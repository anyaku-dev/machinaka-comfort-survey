import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ZodError, type ZodType } from "zod";
import { createBearerClient, createCookieClient } from "@/lib/supabase/server";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const MCS_STATUS: Record<string, number> = {
  unauthenticated: 401,
  forbidden: 403,
  invalid_surveyor: 403,
  not_found: 404,
  invalid_link: 404,
  link_revoked: 410,
  link_expired: 410,
  round_closed: 409,
  round_not_active: 409,
  round_locked: 409,
  invalid_state: 409,
  already_submitted: 409,
  idempotency_conflict: 409,
  master_immutable: 409,
  invalid: 422,
  invalid_payload: 422,
  rate_limited: 429,
};

/** DB 関数が raise した 'MCS:<code> <message>' を HTTP エラーに変換する。 */
export function fromDbError(err: { message?: string; code?: string } | null | undefined): ApiError {
  const msg = err?.message ?? "";
  const m = /MCS:([a-z_]+)\s*(.*)$/s.exec(msg);
  if (m) return new ApiError(MCS_STATUS[m[1]] ?? 400, m[1], m[2] || "処理できませんでした。");
  if (err?.code === "42501" || /permission denied|row-level security/i.test(msg)) {
    return new ApiError(403, "forbidden", "権限がありません。");
  }
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(err?.code ?? "")) {
    console.error("[db schema]", err?.code, msg);
    return new ApiError(503, "database_schema_missing", "必要なデータベース定義が見つかりません。接続先の Supabase とマイグレーションを確認してください。");
  }
  if (err?.code === "23514" || err?.code === "22P02" || err?.code === "23502") {
    return new ApiError(422, "invalid", "入力値が不正です。");
  }
  console.error("[db]", err?.code, msg);
  return new ApiError(500, "server_error", "サーバーでエラーが発生しました。");
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status, headers: noStore });
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).slice(0, 5).join(" / ");
    return NextResponse.json({ error: { code: "invalid", message } }, { status: 422, headers: noStore });
  }
  console.error("[api]", err);
  return NextResponse.json({ error: { code: "server_error", message: "サーバーでエラーが発生しました。" } }, { status: 500, headers: noStore });
}

export const noStore = { "Cache-Control": "no-store" };

export function json(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: noStore });
}

const MAX_BODY_BYTES = 2_500_000;

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) throw new ApiError(413, "too_large", "送信データが大きすぎます。");
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new ApiError(413, "too_large", "送信データが大きすぎます。");
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, "bad_json", "JSON の形式が不正です。");
  }
  return schema.parse(body);
}

/** Cookie 認証の状態変更リクエストは同一オリジンからのみ受け付ける（CSRF 対策）。 */
function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new ApiError(403, "forbidden", "リクエスト元を確認できません。");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "forbidden", "リクエスト元を確認できません。");
  }
  if (originHost !== host) throw new ApiError(403, "forbidden", "別サイトからのリクエストは受け付けません。");
}

export interface OrganizerContext {
  supabase: SupabaseClient;
  user: User;
}

/** 主催者 API の共通処理：ログイン確認（JWT を Auth サーバーで検証）→ RLS 付きクライアントを渡す。 */
export async function withOrganizer(req: Request, fn: (ctx: OrganizerContext) => Promise<Response>): Promise<Response> {
  try {
    const auth = req.headers.get("authorization");
    let supabase: SupabaseClient;
    if (auth?.startsWith("Bearer ")) {
      supabase = createBearerClient(auth.slice(7));
    } else {
      assertSameOrigin(req);
      supabase = await createCookieClient();
    }
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw new ApiError(401, "unauthenticated", "ログインが必要です。");
    return await fn({ supabase, user: data.user });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function withPublic(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return errorResponse(err);
  }
}

export function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw fromDbError(res.error as { message?: string; code?: string });
  if (res.data === null || res.data === undefined) throw new ApiError(404, "not_found", "見つかりません。");
  return res.data as NonNullable<T>;
}
