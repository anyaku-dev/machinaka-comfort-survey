/**
 * CSV 生成。表計算ソフトで開いたときの数式インジェクション対策として、
 * 文字列が = + - @ タブ 改行 で始まる場合は先頭に ' を付ける（OWASP CSV Injection の推奨）。
 * 数値型の値（負数を含む）はそのまま出力する。
 */
export type CsvCell = string | number | boolean | null | undefined;

const DANGEROUS_PREFIX = /^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/;

export function neutralizeFormula(value: string): string {
  return DANGEROUS_PREFIX.test(value) ? `'${value}` : value;
}

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    s = String(value);
  } else if (typeof value === "boolean") {
    s = value ? "TRUE" : "FALSE";
  } else {
    s = neutralizeFormula(value);
  }
  if (/[",\r\n]/.test(s) || s !== s.trim()) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: CsvCell[][]): string {
  // Excel で文字化けしないよう UTF-8 BOM を付与し、改行は CRLF
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
