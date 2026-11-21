import "server-only";
import { ApiError } from "./api";
import type { QuestionRow } from "./rounds";

/** 固定値・代表値が設問の回答形式に合っているか検査する（サーバー側の最終判定）。 */
export function assertValueFits(q: Pick<QuestionRow, "answerFormat" | "options" | "code">, value: number | string, purpose: "fixed" | "representative") {
  const bad = (msg: string) => {
    throw new ApiError(422, "invalid", `${q.code}: ${msg}`);
  };
  switch (q.answerFormat) {
    case "scale4":
      if (typeof value !== "number" || value < 1 || value > 4) bad("1～4の値を指定してください");
      if (purpose === "fixed" && !Number.isInteger(value)) bad("固定値は整数で指定してください");
      break;
    case "computed":
      if (purpose === "fixed") bad("自動算出項目には固定値を設定できません");
      if (typeof value !== "number" || value < 0 || value > 4) bad("0～4の値を指定してください");
      break;
    case "ynu3":
      if (typeof value !== "number" || ![1, 2, 3].includes(value)) bad("1（はい）・2（いいえ）・3（不明）のいずれかを指定してください");
      break;
    case "count":
      if (typeof value !== "number" || value < 0 || value > 9999) bad("0以上の件数を指定してください");
      if (purpose === "fixed" && !Number.isInteger(value)) bad("件数は整数で指定してください");
      break;
    case "number":
      if (typeof value !== "number" || value < -100 || value > 100000) bad("数値が範囲外です");
      break;
    case "choice":
      if (purpose === "representative") bad("選択式の設問には数値の代表値を設定できません");
      if (typeof value !== "string" || !(q.options ?? []).some((o) => o.value === value)) bad("選択肢にない値です");
      break;
    case "time":
      if (purpose === "representative") bad("時刻の設問には代表値を設定できません");
      if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) bad("HH:MM 形式で指定してください");
      break;
    default:
      bad("この設問には値を設定できません");
  }
}
