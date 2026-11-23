"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** 認証や404のHTTP応答を維持したまま、主催者画面のリンク遷移を表示する。 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!link || link.hasAttribute("download") || link.getAttribute("target") === "_blank") return;
      const next = new URL(link.getAttribute("href")!, window.location.href);
      if (next.origin !== window.location.origin || next.pathname === window.location.pathname) return;
      setPendingFrom(window.location.pathname);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPendingFrom(null), 20_000);
    }
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (pendingFrom !== pathname) return null;
  return <div className="navigation-loading" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true" />画面を読み込んでいます…</div>;
}
