import { describe, expect, it } from "vitest";
import { csvCell, neutralizeFormula, toCsv } from "@/lib/csv/csv";

describe("CSV", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\t=x", "\r=x", "＝1+1", "＋1"])("数式として解釈されうる文字列 %j を無害化する", (v) => {
    expect(neutralizeFormula(v).startsWith("'")).toBe(true);
  });
  it("通常の文字列・数値はそのまま", () => {
    expect(csvCell("さくら通り")).toBe("さくら通り");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });
  it("カンマ・改行・引用符をエスケープ", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });
  it("BOM付き・CRLF", () => {
    const s = toCsv([["a", 1], ["b", null]]);
    expect(s.startsWith("\uFEFF")).toBe(true);
    expect(s).toBe("\uFEFFa,1\r\nb,\r\n");
  });
});
