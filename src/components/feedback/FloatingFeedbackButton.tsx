import { useState } from "react";
import { useLocation } from "react-router";
import { trpc } from "@/providers/trpc";
import { MessageSquare } from "lucide-react";
import FeedbackModal from "./FeedbackModal";

interface FloatingFeedbackButtonProps {
  cycleId?: number;
  cycleRev?: number;
}

export default function FloatingFeedbackButton({ cycleId, cycleRev }: FloatingFeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const match = /^\/cicli\/(\d+)$/.exec(location.pathname);
  const pageCycleId = match ? Number(match[1]) : undefined;
  const cycleQuery = trpc.cycle.get.useQuery(
    { id: pageCycleId! },
    { enabled: !!pageCycleId && !cycleId }
  );
  const currentId = cycleId ?? pageCycleId;
  const currentRev = cycleRev ?? cycleQuery.data?.rev ?? undefined;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        title="Invia segnalazione"
        aria-label="Invia segnalazione"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
      <FeedbackModal open={open} onOpenChange={setOpen} cycleId={currentId} cycleRev={currentRev} />
    </>
  );
}
