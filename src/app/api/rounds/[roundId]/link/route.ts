import { ApiError, fromDbError, json, must, readJson, withOrganizer } from "@/lib/server/api";
import { linkEncryptionKey, serverEnv } from "@/lib/server/env";
import { baseUrl, joinUrl, qrDataUrl } from "@/lib/server/links";
import { hashToken } from "@/lib/server/participant";
import { decryptToken, encryptToken, generateToken } from "@/lib/security/token";
import { linkIssueSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ roundId: string }> };

/** 有効な参加リンクの再表示（暗号化保存したトークンを復号して QR を再生成）。 */
export async function GET(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { data, error } = await supabase
      .from("participant_links")
      .select("id, token_ciphertext, created_at, expires_at, revoked_at, max_submissions, max_registrations")
      .eq("round_id", roundId)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) return json({ link: null });
    const token = decryptToken(data.token_ciphertext, linkEncryptionKey());
    const url = joinUrl(baseUrl(req), token);
    return json({
      link: {
        id: data.id,
        url,
        qr: await qrDataUrl(url),
        createdAt: data.created_at,
        expiresAt: data.expires_at,
        expired: new Date(data.expires_at).getTime() <= Date.now(),
        maxSubmissions: data.max_submissions,
        maxRegistrations: data.max_registrations,
      },
    });
  });
}

/** 発行・再発行。既存の有効リンクは DB 関数内で失効させる。 */
export async function POST(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const b = await readJson(req, linkIssueSchema);
    // 設定不備なら DB にリンクを作る前に止める。発行後の 500 を防ぐ。
    serverEnv();
    const key = linkEncryptionKey();
    const token = generateToken();
    const url = joinUrl(baseUrl(req), token);
    const qr = await qrDataUrl(url);
    const expiresAt = new Date(Date.now() + b.expiresInHours * 3600_000).toISOString();
    const id = must(
      await supabase.rpc("issue_participant_link", {
        p_round_id: roundId,
        p_token_hash: hashToken(token),
        p_token_ciphertext: encryptToken(token, key),
        p_expires_at: expiresAt,
        p_max_submissions: b.maxSubmissions,
        p_max_registrations: b.maxRegistrations,
      }),
    );
    return json({ link: { id, url, qr, expiresAt, expired: false, maxSubmissions: b.maxSubmissions, maxRegistrations: b.maxRegistrations } }, { status: 201 });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { roundId } = await params;
  return withOrganizer(req, async ({ supabase }) => {
    const { data, error } = await supabase.rpc("revoke_participant_links", { p_round_id: roundId });
    if (error) throw fromDbError(error);
    if (data === 0) throw new ApiError(404, "not_found", "有効な参加リンクはありません。");
    return json({ ok: true, revoked: data });
  });
}
