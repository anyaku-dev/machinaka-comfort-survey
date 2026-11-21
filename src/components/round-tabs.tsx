"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function RoundTabs({ roundId }: { roundId: string }) {
  const path = usePathname();
  const base = `/organizer/rounds/${roundId}`;
  const tabs = [
    ["", "概要・設定"],
    ["/questions", "設問"],
    ["/link", "参加QR"],
    ["/responses", "回答"],
    ["/results", "集計・CSV"],
    ["/compare", "過去回比較"],
    ["/history", "操作履歴"],
  ];
  return (
    <nav className="tabs">
      {tabs.map(([p, label]) => {
        const href = base + p;
        const active = p === "" ? path === base : path.startsWith(href);
        return (
          <Link key={p} href={href} className={active ? "active" : ""}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
