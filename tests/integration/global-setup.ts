import { spawn, type ChildProcess } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3100";
let server: ChildProcess | null = null;

async function up(url: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

export default async function setup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !(await up(`${supabaseUrl}/auth/v1/health`))) {
    throw new Error("ローカル Supabase が起動していません。`npm run db:start` を実行してください。");
  }
  if (!(await up(BASE_URL))) {
    // ビルド済みアプリを起動（事前に `npm run build`）
    const port = new URL(BASE_URL).port || "3100";
    server = spawn("npx", ["next", "start", "-p", port], { stdio: "ignore", env: { ...process.env, APP_BASE_URL: BASE_URL } });
    for (let i = 0; i < 60; i++) {
      if (await up(BASE_URL)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!(await up(BASE_URL))) throw new Error(`アプリが起動しません（${BASE_URL}）。先に npm run build を実行してください。`);
  }
  return async () => {
    server?.kill();
  };
}
