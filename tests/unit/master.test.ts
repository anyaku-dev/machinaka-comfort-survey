import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { QUESTION_MASTER } from "@/lib/questionnaire/master";

describe("設問マスタ ver.1.1", () => {
  it("コードとIDが一意", () => {
    expect(new Set(QUESTION_MASTER.map((q) => q.code)).size).toBe(QUESTION_MASTER.length);
  });
  it("全設問が原票番号・正式文言・版・回答形式・出典・照合状態を持つ", () => {
    for (const q of QUESTION_MASTER) {
      expect(q.originalNo, q.code).toBeTruthy();
      expect(q.text, q.code).toBeTruthy();
      expect(q.version).toBe("ver1.1");
      expect(q.answerFormat).toBeTruthy();
      expect(q.source).toMatch(/001740895|調査票/);
      expect(["pdf_verified", "pdf_excel_verified", "app_defined", "unverified"]).toContain(q.verification);
    }
  });
  it("項目数：空間A13・空間B42・安心感11対・寛容性11対・安らぎ感12対・期待感9対・活動の種類23", () => {
    const count = (s: string, k?: string) => QUESTION_MASTER.filter((q) => q.section === s && (!k || q.kind === k)).length;
    expect(count("space_a", "count")).toBe(13);
    expect(count("space_b", "fact")).toBe(42);
    expect(count("anshin")).toBe(22);
    expect(count("kanyo")).toBe(22);
    expect(count("yasuragi")).toBe(24);
    expect(count("kitai")).toBe(18);
    expect(count("kanyo_type")).toBe(23);
  });
  it("主観と活動は別設問で、同じ番号で対になる", () => {
    for (const el of ["anshin", "kanyo", "yasuragi", "kitai"]) {
      const qs = QUESTION_MASTER.filter((q) => q.section === el);
      for (const s of qs.filter((q) => q.kind === "subjective")) {
        expect(qs.some((a) => a.kind === "activity" && a.pairNo === s.pairNo)).toBe(true);
      }
    }
  });
  it("活動の種類の算出元コードが存在する", () => {
    const codes = new Set(QUESTION_MASTER.map((q) => q.code));
    for (const q of QUESTION_MASTER.filter((x) => x.computedFrom)) for (const c of q.computedFrom!) expect(codes.has(c), `${q.code}→${c}`).toBe(true);
  });
  it("滞在者の定義に「3分以上」を使わない", () => {
    const presence = QUESTION_MASTER.find((q) => q.code === "OBS-PRESENCE")!;
    expect(presence.text).toContain("その場で立ち止まり、何かしらの活動をした人");
    expect(presence.text).not.toMatch(/3分|３分/);
  });
  it("マイグレーションSQLがマスタと一致している", () => {
    expect(() => execFileSync(process.execPath, ["--no-warnings", "scripts/generate-master-sql.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
