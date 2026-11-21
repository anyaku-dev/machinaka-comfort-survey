import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/** Server Component / Route Handler 用。Cookie のセッション（主催者）で RLS が適用される。 */
export async function createCookieClient(): Promise<SupabaseClient> {
  const { url, key } = publicEnv();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component からは Cookie を書き換えられない（proxy.ts がセッションを更新する）
        }
      },
    },
  });
}

/** Authorization: Bearer <access_token> で呼ばれた API 用（統合テスト・将来の外部連携）。 */
export function createBearerClient(accessToken: string): SupabaseClient {
  const { url, key } = publicEnv();
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
