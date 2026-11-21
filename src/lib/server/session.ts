import "server-only";
import { notFound, redirect } from "next/navigation";
import { createCookieClient } from "@/lib/supabase/server";

/** 主催者ページ用：ユーザーを Auth サーバーで検証し、RLS 付きクライアントを返す。 */
export async function requireOrganizer() {
  const supabase = await createCookieClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
}

/** ページ用：所有していない・存在しない調査回は 404 にする（RLS により他人の調査回は見つからない）。 */
export async function roundOr404(supabase: Awaited<ReturnType<typeof createCookieClient>>, roundId: string) {
  const { getRound } = await import("./rounds");
  try {
    return await getRound(supabase, roundId);
  } catch {
    notFound();
  }
}
