import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import { requireOrganizer } from "@/lib/server/session";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireOrganizer();
  return (
    <>
      <header className="topbar">
        <Link href="/organizer">まちなか居心地調査（主催者）</Link>
        <div className="row small">
          <span data-testid="organizer-email">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="container">{children}</div>
    </>
  );
}
