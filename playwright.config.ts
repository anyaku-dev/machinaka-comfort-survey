import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure", locale: "ja-JP", timezoneId: "Asia/Tokyo" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // 事前に `npm run build` が必要。ローカル Supabase（npm run db:start）に接続する
    command: `npx next start -p ${new URL(BASE_URL).port || 3100}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { APP_BASE_URL: BASE_URL },
  },
});
