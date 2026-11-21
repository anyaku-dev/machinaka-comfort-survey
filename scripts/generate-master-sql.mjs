// 設問マスタ（src/lib/questionnaire/master.ts）からマイグレーションSQLを生成する。
// 使い方: npm run master:sql   （--check で差分検査のみ）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUESTION_MASTER } from "../src/lib/questionnaire/master.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "supabase/migrations/20261115000300_question_master_ver1_1.sql");

const lit = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replaceAll("'", "''")}'`;
};
const json = (v) => (v === null || v === undefined ? "null" : `${lit(JSON.stringify(v))}::jsonb`);
const arr = (v) => (v && v.length ? `array[${v.map(lit).join(", ")}]::text[]` : "null");

export function buildSql() {
  const rows = QUESTION_MASTER.map(
    (q) =>
      `  (${[
        lit(q.id),
        lit(q.version),
        lit(q.section),
        lit(q.element),
        lit(q.kind),
        lit(q.code),
        lit(q.pairNo),
        lit(q.originalNo),
        lit(q.category),
        lit(q.text),
        lit(q.answerFormat),
        json(q.options),
        json(q.applicability),
        arr(q.computedFrom),
        lit(q.source),
        lit(q.verification),
        lit(q.excelRow),
        lit(q.excelLabel),
        lit(q.notes),
        lit(q.displayOrder),
        lit(q.defaultVisible),
      ].join(", ")})`,
  );
  return `-- 自動生成ファイル（scripts/generate-master-sql.mjs）。手で編集しない。
-- 国土交通省「まちなかの居心地の良さを測る指標（改訂版 ver.1.1）」設問マスタ
insert into public.question_master (
  id, version, section, element, kind, code, pair_no, original_no, category, text, answer_format,
  options, applicability, computed_from, source, verification, excel_row, excel_label, notes, display_order, default_visible
) values
${rows.join(",\n")};
`;
}

const sql = buildSql();
if (process.argv.includes("--check")) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (current !== sql) {
    console.error("question master SQL is out of date. Run: npm run master:sql");
    process.exit(1);
  }
  console.log("question master SQL is up to date");
} else {
  fs.writeFileSync(out, sql);
  console.log(`wrote ${path.relative(root, out)} (${QUESTION_MASTER.length} rows)`);
}
