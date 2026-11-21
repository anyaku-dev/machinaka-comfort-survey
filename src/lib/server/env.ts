import "server-only";

/** サーバー専用の秘密値。NEXT_PUBLIC_ を付けないこと。 */
export function serverEnv() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const linkKey = process.env.LINK_TOKEN_ENCRYPTION_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY が設定されていません（サーバー側の環境変数）");
  if (!linkKey) throw new Error("LINK_TOKEN_ENCRYPTION_KEY が設定されていません（サーバー側の環境変数）");
  const keyBytes = Buffer.from(linkKey, "base64");
  if (keyBytes.length !== 32) throw new Error("LINK_TOKEN_ENCRYPTION_KEY は32バイトを base64 で指定してください");
  return { secretKey, linkKey: keyBytes, appBaseUrl: process.env.APP_BASE_URL?.replace(/\/$/, "") || null };
}
