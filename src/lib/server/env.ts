import "server-only";
import { ApiError } from "./api";

/** サーバー専用の秘密値。NEXT_PUBLIC_ を付けないこと。 */
export function serverEnv() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    console.error("[config] SUPABASE_SECRET_KEY is missing");
    throw new ApiError(503, "participant_config_missing", "参加受付の設定が未完了です。Vercel の環境変数 SUPABASE_SECRET_KEY を設定してください。");
  }
  return { secretKey };
}

/** 暗号鍵は QR の再表示に使い、参加受付に使う secret key とは別に検証する。 */
export function linkEncryptionKey(): Buffer {
  const linkKey = process.env.LINK_TOKEN_ENCRYPTION_KEY;
  if (!linkKey) {
    console.error("[config] LINK_TOKEN_ENCRYPTION_KEY is missing");
    throw new ApiError(503, "link_config_missing", "参加QRの設定が未完了です。Vercel の環境変数 LINK_TOKEN_ENCRYPTION_KEY を設定してください。");
  }
  const keyBytes = Buffer.from(linkKey, "base64");
  if (keyBytes.length !== 32) {
    console.error("[config] LINK_TOKEN_ENCRYPTION_KEY has an invalid length");
    throw new ApiError(503, "link_config_invalid", "LINK_TOKEN_ENCRYPTION_KEY の形式が正しくありません。32バイトの乱数を base64 形式で設定してください。");
  }
  return keyBytes;
}

export function appBaseUrl(): string | null {
  return process.env.APP_BASE_URL?.replace(/\/$/, "") || null;
}
