import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server/env";

let cached: SupabaseClient | null = null;

/**
 * service_role（secret key）クライアント。RLS を迂回するため、調査者用 RPC（participant_*）の呼び出しだけに使う。
 * 主催者のデータ操作には使わない（主催者はユーザーの JWT で RLS を通す）。
 */
export function adminClient(): SupabaseClient {
  if (cached) return cached;
  const { url } = publicEnv();
  const { secretKey } = serverEnv();
  cached = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}
