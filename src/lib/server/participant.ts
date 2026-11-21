import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { generateToken, sha256Hex } from "@/lib/security/token";
import { fromDbError } from "./api";

/** 調査者用の DB 関数を service_role で呼ぶ。トークン・調査者キーは平文を DB に渡さずハッシュだけを渡す。 */
export async function callParticipant<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminClient().rpc(fn, args);
  if (error) throw fromDbError(error);
  return data as T;
}

export const hashToken = (token: string) => sha256Hex(`participant-link:${token}`);
export const hashSurveyorKey = (key: string) => sha256Hex(`surveyor-key:${key}`);
export const newSurveyorKey = () => generateToken();
