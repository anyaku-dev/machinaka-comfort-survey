import { getQuestions } from "@/lib/server/rounds";
import { requireOrganizer, roundOr404 } from "@/lib/server/session";
import QuestionEditor from "./question-editor";

export default async function QuestionsPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const { supabase } = await requireOrganizer();
  const { round } = await roundOr404(supabase, roundId);
  const questions = await getQuestions(supabase, roundId);
  return <QuestionEditor roundId={roundId} locked={round.status !== "draft"} questions={questions} />;
}
