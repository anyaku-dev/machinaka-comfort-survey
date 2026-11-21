/** ブラウザに公開してよい値だけ（NEXT_PUBLIC_*）。秘密鍵はここに置かない。 */
export function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY が設定されていません（.env.example を参照）");
  }
  return { url, key };
}
