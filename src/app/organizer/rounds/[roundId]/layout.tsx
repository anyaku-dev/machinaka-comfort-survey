import Link from "next/link";
import { notFound } from "next/navigation";
import RoundTabs from "@/components/round-tabs";
import { RoundBadge } from "@/components/status";
import { requireOrganizer, roundOr404 } from "@/lib/server/session";

export default async function RoundLayout({ children, params }: { children: React.ReactNode; params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const { supabase } = await requireOrganizer();
  const data = await roundOr404(supabase, roundId).catch(() => null);
  if (!data) notFound();
  const { round, survey } = data;
  return (
    <main>
      <p className="small">
        <Link href="/organizer">調査一覧</Link> ／ <Link href={`/organizer/surveys/${survey.id}`}>{survey.name}</Link>
      </p>
      <div className="row">
        <h1 className="grow" style={{ marginBottom: 0 }}>
          {survey.name}　{round.title || `第${round.roundNumber}回`}
        </h1>
        <RoundBadge status={round.status} />
      </div>
      <RoundTabs roundId={round.id} />
      {children}
    </main>
  );
}
