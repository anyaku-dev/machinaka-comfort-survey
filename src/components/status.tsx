export const ROUND_STATUS_LABEL: Record<string, string> = { draft: "下書き", active: "実施中", closed: "終了" };
export const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  draft: "入力中",
  submitted: "提出済み（未審査）",
  returned: "差し戻し中",
  accepted: "採用",
  excluded: "除外",
};

export function RoundBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{ROUND_STATUS_LABEL[status] ?? status}</span>;
}

export function SubmissionBadge({ status }: { status: string }) {
  const cls = status === "accepted" ? "badge-active" : status === "excluded" ? "badge-closed" : status === "returned" ? "badge-warn" : status === "submitted" ? "badge-info" : "badge-draft";
  return <span className={`badge ${cls}`}>{SUBMISSION_STATUS_LABEL[status] ?? status}</span>;
}

export function VerificationBadge({ v }: { v: string }) {
  if (v === "pdf_excel_verified") return <span className="badge badge-active" title="調査票PDF・分析ツールExcelと照合済み">照合済</span>;
  if (v === "pdf_verified") return <span className="badge badge-active" title="調査票PDFと照合済み">調査票照合済</span>;
  if (v === "app_defined") return <span className="badge badge-info">独自</span>;
  return <span className="badge badge-danger" title="公式資料との照合が完了していません">未検証</span>;
}

export const fmt = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(digits);

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }) : "—";
