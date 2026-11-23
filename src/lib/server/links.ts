import "server-only";
import QRCode from "qrcode";
import { appBaseUrl } from "./env";

export function baseUrl(req: Request): string {
  const configured = appBaseUrl();
  if (configured) return configured;
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}`;
}

/** トークンは URL のフラグメント（#以降）に置く。フラグメントはサーバーのアクセスログや Referer に送られない。 */
export function joinUrl(base: string, token: string): string {
  return `${base}/join#${token}`;
}

export async function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 480 });
}
