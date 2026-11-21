import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { devices, expect, test, type Browser, type Page } from "@playwright/test";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

async function newOrganizer(label: string) {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomBytes(12).toString("base64url");
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return { email, password };
}

async function login(page: Page, u: { email: string; password: string }) {
  await page.goto("/organizer");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("メールアドレス").fill(u.email);
  await page.getByLabel("パスワード").fill(u.password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("heading", { name: "調査一覧" })).toBeVisible();
}

async function mobile(browser: Browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ja-JP" });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}

async function joinAndRegister(page: Page, url: string, name: string) {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "調査に参加" })).toBeVisible();
  await expect(page.getByText("E2E範囲：駅前通り")).toBeHidden(); // 範囲は参加後のホームに表示
  await page.getByLabel("氏名 *").fill(name);
  await page.getByLabel("所属").fill("E2Eテスト");
  await page.getByRole("button", { name: "参加する" }).click();
  await expect(page.getByTestId("section-anshin")).toBeVisible();
}

async function answerAnshin(page: Page, subj: number, act: number) {
  await page.getByTestId("section-anshin").click();
  await page.getByTestId("q-ANS-01-S").getByRole("radio", { name: new RegExp(`^${subj}`) }).click();
  await page.getByTestId("q-ANS-01-A").getByRole("radio", { name: new RegExp(`^${act}`) }).click();
  await page.getByTestId("q-ANS-02-A").getByRole("button", { name: "適用外" }).click();
  await page.getByRole("button", { name: "一覧へ" }).click();
}

test("主催者の調査作成→開始→QR参加→複数調査者の提出（通信断・再送を含む）→集計確定→CSV出力", async ({ page, browser }) => {
  page.on("dialog", (d) => d.accept());
  const orgA = await newOrganizer("e2e-a");
  const orgB = await newOrganizer("e2e-b");

  // --- 主催者A：ログイン・調査作成
  await login(page, orgA);
  await page.getByRole("link", { name: "＋ 調査を作成" }).click();
  await page.getByLabel("調査名 *").fill("E2E 駅前通り調査");
  await page.getByLabel("実施主体").fill("E2E協議会");
  await page.getByLabel("対象地名").fill("駅前通り（架空）");
  await page.getByRole("button", { name: "作成して調査回の設定へ" }).click();
  await expect(page.getByRole("heading", { name: "調査回の設定" })).toBeVisible();
  const roundUrl = page.url();

  await page.getByLabel("計測対象範囲").fill("E2E範囲：駅前通り 一丁目～二丁目");
  await page.getByLabel("調査日 *").fill("2026-11-15");
  await page.getByLabel("開始時刻").fill("10:00");
  await page.getByLabel("終了時刻").fill("11:00");
  await page.getByLabel("滞在者 計測時間（分）").fill("10");
  await page.getByLabel("通行者 計測時間（分）").fill("5");
  await page.getByRole("button", { name: "設定を保存" }).click();
  await expect(page.getByText("保存しました。")).toBeVisible();

  // 調査一覧に表示される
  await page.goto("/organizer");
  await expect(page.getByRole("link", { name: "E2E 駅前通り調査" })).toBeVisible();
  await expect(page.getByText("読み込みに失敗しました")).toHaveCount(0);
  await page.goto(roundUrl);

  // --- 設問：国籍を非表示、独自項目を追加
  await page.getByRole("link", { name: "設問" }).click();
  await page.getByLabel("OBS-NATIONALITY を表示").uncheck();
  await page.getByTestId("save-questions").click();
  await expect(page.getByLabel("OBS-NATIONALITY を表示")).not.toBeChecked();
  await page.getByLabel("区分").selectOption("anshin");
  await page.getByLabel("種類").selectOption("subjective");
  await page.getByLabel("項目の文言").fill("E2E独自：街路樹の木陰が心地よいと感じる");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByText("E2E独自：街路樹の木陰が心地よいと感じる")).toBeVisible();

  // --- 開始・QR発行
  await page.getByRole("link", { name: "概要・設定" }).click();
  await page.getByTestId("start-round").click();
  await expect(page).toHaveURL(/\/link$/);
  await page.getByTestId("issue-link").click();
  const joinUrl = (await page.getByTestId("join-url").textContent())!.trim();
  expect(joinUrl).toMatch(/\/join#[A-Za-z0-9_-]{43}$/);
  await expect(page.getByAltText("参加用QRコード")).toBeVisible();

  // --- 調査者1（スマホ）：通常提出
  const s1 = await mobile(browser);
  await joinAndRegister(s1.page, joinUrl, "調査者いち");
  await answerAnshin(s1.page, 4, 1);
  await s1.page.getByTestId("section-space_a").click();
  await s1.page.getByRole("button", { name: "A01を0件にする" }).click();
  await s1.page.getByRole("button", { name: "A02を1増やす" }).click();
  await s1.page.getByRole("button", { name: "A02を1増やす" }).click();
  await expect(s1.page.getByTestId("value-A02")).toHaveText("2");
  await expect(s1.page.getByTestId("q-A01")).toContainText("0件（回答済み）");
  await s1.page.getByRole("button", { name: "一覧へ" }).click();
  await s1.page.getByTestId("section-observation").click();
  await s1.page.getByTestId("add-stay").click();
  await s1.page.getByRole("button", { name: "男性" }).click();
  await s1.page.getByRole("button", { name: "大人" }).click();
  await expect(s1.page.getByText("国籍")).toBeHidden(); // 非表示にした属性は出ない
  await s1.page.getByTestId("obs-done").click();
  await s1.page.getByTestId("add-pass").click();
  await s1.page.getByRole("button", { name: "家族" }).click();
  await expect(s1.page.getByTestId("obs-problems")).toBeVisible(); // 内訳未入力では不整合
  for (const n of ["男性", "女性"]) await s1.page.getByRole("button", { name: `性別-${n}を1増やす` }).click();
  for (let i = 0; i < 2; i++) await s1.page.getByRole("button", { name: "年齢-大人を1増やす" }).click();
  for (let i = 0; i < 2; i++) await s1.page.getByRole("button", { name: "行動（通行者のみ）-のんびり歩いているを1増やす" }).click();
  await expect(s1.page.getByTestId("obs-problems")).toBeHidden();
  await s1.page.getByTestId("obs-done").click();
  await s1.page.getByRole("button", { name: "一覧へ" }).click();
  await s1.page.getByTestId("to-confirm").click();
  await expect(s1.page.getByTestId("unanswered")).toBeVisible();
  await s1.page.getByTestId("submit").click();
  await expect(s1.page.getByTestId("done")).toBeVisible();

  // --- 調査者2（スマホ）：再読込で入力保持 → 通信断で提出 → 未送信 → 復旧後に明示的に再送
  const s2 = await mobile(browser);
  await joinAndRegister(s2.page, joinUrl, "調査者に");
  await answerAnshin(s2.page, 2, 3);
  await s2.page.reload();
  await s2.page.getByTestId("section-anshin").click();
  await expect(s2.page.getByTestId("q-ANS-01-S").getByRole("radio", { name: /^2/ })).toHaveAttribute("aria-checked", "true");
  await s2.page.getByRole("button", { name: "一覧へ" }).click();
  await s2.page.getByTestId("to-confirm").click();
  await s2.ctx.setOffline(true);
  await expect(s2.page.getByTestId("netbar")).toContainText("オフライン");
  await s2.page.getByTestId("submit").click();
  await expect(s2.page.getByTestId("outbox-banner")).toBeVisible();
  await expect(s2.page.getByTestId("notice")).toContainText("未送信");
  await s2.ctx.setOffline(false);
  await expect(s2.page.getByTestId("netbar")).toContainText("通信が回復しました");
  await s2.page.getByTestId("resend").click();
  await expect(s2.page.getByTestId("done")).toBeVisible();
  // もう一度開いても提出完了（重複提出にならない）
  await s2.page.reload();
  await expect(s2.page.getByTestId("done")).toBeVisible();

  // --- 主催者A：回答確認・採用
  await page.goto(roundUrl + "/responses");
  await expect(page.getByTestId("submission-row")).toHaveCount(2);
  for (const name of ["調査者いち", "調査者に"]) {
    await page.goto(roundUrl + "/responses");
    await page.getByRole("link", { name }).click();
    await page.getByTestId("accept").click();
    await expect(page.locator(".badge", { hasText: "採用" }).first()).toBeVisible();
  }

  // --- 集計：平均値と代表値は別。提案値を入れて代表値を保存し、確定
  await page.goto(roundUrl + "/results");
  await expect(page.getByTestId("mean-ANS-01-S")).toHaveText("3");
  await expect(page.getByTestId("ind-stay.people")).toHaveText("1");
  await expect(page.getByTestId("ind-pass.people")).toHaveText("2");
  await expect(page.getByTestId("ind-pass.perHour")).toHaveText("24");
  await page.getByRole("button", { name: "未確定の項目に提案値を入れる" }).click();
  await page.getByTestId("rep-ANS-01-S").fill("3.5");
  await page.getByTestId("save-representatives").click();
  await expect(page.getByText(/代表値を \d+ 件保存しました/)).toBeVisible();
  await expect(page.getByTestId("mean-ANS-01-S")).toHaveText("3");
  await expect(page.getByTestId("rep-ANS-01-S")).toHaveValue("3.5");
  await page.getByTestId("finalize").click();
  await expect(page.getByTestId("finalized-version").first()).toContainText("v1");

  // --- CSV出力（Cookie セッションでダウンロード）
  const summary = await page.request.get(roundUrl.replace("/organizer/rounds/", "/api/rounds/") + "/export?type=summary");
  expect(summary.status()).toBe(200);
  const csv = await summary.text();
  expect(csv).toContain("平均値（アプリ算出）");
  expect(csv).toMatch(/ANS-01-S,.*,3,.*,value,3\.5,manual/);
  expect(csv).toContain("E2E独自：街路樹の木陰が心地よいと感じる");
  const raw = await page.request.get(roundUrl.replace("/organizer/rounds/", "/api/rounds/") + "/export?type=raw");
  const rawCsv = await raw.text();
  expect(rawCsv).toContain("適用外");
  expect(rawCsv).toMatch(/A01,.*,回答,0,/);

  // --- 調査終了 → 終了後の参加・提出は不可
  await page.goto(roundUrl);
  await page.getByTestId("close-round").click();
  await expect(page.locator(".badge", { hasText: "終了" }).first()).toBeVisible();
  const s3 = await mobile(browser);
  await s3.page.goto(joinUrl);
  await expect(s3.page.getByTestId("fatal")).toContainText("終了しました");

  // --- 第2回（前回コピー）を作り、条件を変えて開始 → 過去回比較で条件差が表示される
  await page.goto(roundUrl);
  await page.getByRole("link", { name: "E2E 駅前通り調査" }).click();
  await page.getByRole("button", { name: "前回の設定・設問をコピーして新しい調査回" }).click();
  await expect(page.getByRole("heading", { name: "調査回の設定" })).toBeVisible();
  await expect(page.getByLabel("計測対象範囲")).toHaveValue("E2E範囲：駅前通り 一丁目～二丁目");
  await page.getByLabel("調査日 *").fill("2026-11-24");
  await page.getByLabel("滞在者 計測時間（分）").fill("20");
  await page.getByRole("button", { name: "設定を保存" }).click();
  await expect(page.getByText("保存しました。")).toBeVisible();
  await page.getByTestId("start-round").click();
  await expect(page).toHaveURL(/\/link$/);
  await page.getByRole("link", { name: "過去回比較" }).click();
  const diffs = page.getByTestId("condition-diffs");
  await expect(diffs).toContainText("滞在者の計測時間");
  await expect(diffs).toContainText("20分");
  await expect(diffs).toContainText("平日・休日");
  await expect(page.getByText("確定v1")).toBeVisible();

  // --- 無効なQR
  await s3.page.goto("/join#invalid-token");
  await s3.page.reload();
  await expect(s3.page.getByTestId("fatal")).toContainText("参加リンクが正しくありません");
  await s3.page.goto("/join#" + "A".repeat(43));
  await s3.page.reload();
  await expect(s3.page.getByTestId("fatal")).toContainText("参加リンクが無効です");

  // --- 別主催者Bは主催者Aの調査回を閲覧できない
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await login(pageB, orgB);
  await expect(pageB.getByText("E2E 駅前通り調査")).toHaveCount(0);
  const resp = await pageB.goto(roundUrl + "/results");
  expect(resp!.status()).toBe(404);
  const apiResp = await pageB.request.get(roundUrl.replace("/organizer/rounds/", "/api/rounds/") + "/export?type=raw");
  expect(apiResp.status()).toBe(404);

  await Promise.all([s1.ctx.close(), s2.ctx.close(), s3.ctx.close(), ctxB.close()]);
});
