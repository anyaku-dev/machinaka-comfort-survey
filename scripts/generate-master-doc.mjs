// docs/QUESTION_MASTER.md を設問マスタ（src/lib/questionnaire/master.ts）から生成する。
// 使い方: npm run master:doc
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUESTION_MASTER, SECTION_LABELS, SECTION_ORDER } from "../src/lib/questionnaire/master.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V = { pdf_verified: "調査票PDFと照合", pdf_excel_verified: "調査票PDF・Excelと照合", app_defined: "アプリ定義", unverified: "**未検証**" };
const esc = (s) => String(s ?? "").replaceAll("|", "｜").replaceAll("\n", " ");
const appl = (a) => {
  if (!a) return "";
  const out = [];
  if (a.peripheral) out.push("周辺エリア含む（※）");
  if (a.siteTypes) out.push(`対象地種別: ${a.siteTypes.join(",")}（それ以外は初期非表示）`);
  if (a.nightOnly) out.push("夜間計測時のみ（初期非表示）");
  if (a.countGroups) out.push("グループ数で数える（※）");
  if (a.dependsOn) out.push(`${a.dependsOn} に依存（適用外を選択可）`);
  if (a.passOnly) out.push("通行者のみ");
  return out.join("／");
};

let md = `# 設問マスタ（ver.1.1）

> このファイルは \`npm run master:doc\` で \`src/lib/questionnaire/master.ts\` から自動生成しています。手で編集しないでください。
> DB への投入は \`npm run master:sql\` が生成する \`supabase/migrations/20261115000300_question_master_ver1_1.sql\` です。

## 出典と照合方法

| 資料 | URL | 照合に使った範囲 |
|---|---|---|
| 調査票 ver.1.1 | https://www.mlit.go.jp/toshi/content/001740895.pdf | 全11ページのテキストを抽出（pdfplumber）し、設問文をプログラムで突き合わせ（改行・空白を除去して完全一致） |
| 分析ツール・記入用 | https://www.mlit.go.jp/toshi/content/001740896.xlsx | シート「入力①」G/H列の項目名・行番号、算式 |
| 分析ツール・記入例 | https://www.mlit.go.jp/toshi/content/001740897.xlsx | 算式のキャッシュ値（CALCULATION_SPEC.md 参照） |
| 活用の手引き | https://www.mlit.go.jp/toshi/content/001740894.pdf | 用語の定義（滞在者・通行者、家族・団体、行動、年齢区分）、空間A/Bの数え方 |

- **照合状態**：「調査票PDF・Excelと照合」＝調査票の文言と Excel の行・項目名の両方を確認。「調査票PDFと照合」＝Excel に対応する行が無い（観察属性はExcelでは列）。「**未検証**」＝意図を確認できていない。
- **文言の採用**：調査票（PDF）と Excel の表記が異なる場合は**調査票の文言**を採用し、Excel 表記を「Excel表記」列に残した。
- **テキスト抽出の限界**：PDF の図・レイアウト（チェックボックス□、縦書きの類型名）は抽出できないため、類型名（滞在・回遊・景観・雰囲気・アクセス）は Excel の分類名と結果シートの表記に依拠した。公開前に目視確認すること（ACCEPTANCE_TEST.md）。
- **回答形式**：\`scale4\`＝4段階（主観：1 全くそう思わない～4 とてもそう思う／活動：1 いない～4 たくさんいる）、\`ynu3\`＝1 はい／2 いいえ／3 不明、\`count\`＝件数（0以上の整数）、\`computed\`＝自動算出（調査者は入力しない）、\`observation\`＝滞在者・通行者の観察属性。

## 調査票との主な相違点（Excel 表記）

| コード | 調査票（採用） | Excel 入力① の表記 |
|---|---|---|
`;
for (const q of QUESTION_MASTER) {
  if (q.excelLabel && q.excelLabel !== q.text && q.excelLabel !== q.text.replace(/（※）.*$/, "").replace(/（※）/g, "")) md += `| ${q.code} | ${esc(q.text)} | ${esc(q.excelLabel)} |\n`;
}
md += `
## 未検証として隔離している事項

| コード | 内容 | 扱い |
|---|---|---|
| KAN-T01 | 寛容性❶「遊んでいる」の Excel 式は \`=MAX(L124,L178)\`（安心感No.2・寛容性No.2 の**主観**行）。他の19項目は活動行を参照しており不整合。意図（誤りか仕様か）を確認できない | Excel 式のとおり算出するが「未検証」バッジを表示。代表値は主催者が確認して確定 |
| B-類型名 | 空間B 40～42 の類型「アクセス」は PDF から抽出できず、Excel・結果シートの表記に依拠 | 表示上の分類のみ。集計には影響しない |

## 設問一覧
`;
for (const section of SECTION_ORDER) {
  const qs = QUESTION_MASTER.filter((q) => q.section === section);
  md += `\n### ${SECTION_LABELS[section]}（${qs.length}）\n\n| コード | 原票番号 | 種類 | 設問文（正式文言） | 形式 | 適用条件 | Excel行 | 照合 | 備考 |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const q of qs) {
    const kind = { subjective: "主観", activity: "活動", activity_type: "活動の種類", activity_type_computed: "活動の種類（自動）", fact: "事実", count: "件数", memo: "記述", observation_attribute: "観察属性" }[q.kind] ?? q.kind;
    const extra = [q.notes, q.computedFrom ? `算出元: ${q.computedFrom.join(", ")}（各調査者の最大値）` : null, q.options && q.answerFormat === "observation" ? `区分: ${q.options.map((o) => o.label).join("／")}` : null, q.options && q.answerFormat === "choice" ? `選択肢: ${q.options.map((o) => o.label).join("／")}` : null].filter(Boolean).join(" ");
    md += `| ${q.code} | ${esc(q.originalNo)} | ${kind} | ${esc(q.text)} | ${q.answerFormat} | ${esc(appl(q.applicability))} | ${q.excelRow ?? ""} | ${V[q.verification]} | ${esc(extra)} |\n`;
  }
}
md += `
## 独自項目・版管理のルール

- 主催者は調査回ごとに標準設問の**表示／非表示**と**固定値**を設定し、**独自項目**（コード \`X-<区分>-NN\`、照合状態「アプリ定義」）を追加できる。標準設問の文言は変更できない（DB トリガーで拒否）。
- 調査開始時に設定と設問（文言・選択肢・表示・固定値）を \`survey_rounds.settings_snapshot\` に固定し、SHA-256 を \`snapshot_hash\` に記録する。開始後は \`round_questions\` を変更できない。
- \`question_master\` の行は不変（UPDATE/DELETE をトリガーで拒否）。公式の改訂があった場合は新しい \`version\` の行を追加し、新しい調査回からその版を使う。過去の調査回は自分のスナップショットを参照するため意味が変わらない。
- 「滞在者」は ver.1.1 の定義「その場で立ち止まり、何かしらの活動をした人」とする。分析ツール結果シート②の注記には旧定義（3分以上）が残っているが、アプリでは採用しない。
`;
const out = path.join(root, "docs/QUESTION_MASTER.md");
if (process.argv.includes("--check")) {
  if ((fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "") !== md) {
    console.error("docs/QUESTION_MASTER.md is out of date. Run: npm run master:doc");
    process.exit(1);
  }
  console.log("docs/QUESTION_MASTER.md is up to date");
} else {
  fs.writeFileSync(out, md);
  console.log("wrote docs/QUESTION_MASTER.md");
}
