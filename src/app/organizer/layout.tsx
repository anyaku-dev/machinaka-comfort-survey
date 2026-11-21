import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import { requireOrganizer } from "@/lib/server/session";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireOrganizer();
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/organizer">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span className="brand-name">まちなか居心地調査<span className="brand-caption">主催者ダッシュボード</span></span>
        </Link>
        <div className="row small">
          <span className="topbar-user" data-testid="organizer-email">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="container">{children}</div>
    </>
  );
}
