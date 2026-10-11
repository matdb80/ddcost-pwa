import { useState } from "react";
import { useLocation } from "react-router";
import { MessageSquare } from "lucide-react";
import { trpc } from "@/providers/trpc";
import FeedbackModal from "./FeedbackModal";

export default function FloatingFeedbackButton() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const match = /^\/cicli\/(\d+)$/.exec(location.pathname);
  const cycleId = match ? Number(match[1]) : undefined;
  const cycle = trpc.cycle.get.useQuery({ id: cycleId! }, { enabled: !!cycleId });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        aria-label="Segnala un problema o suggerisci una miglioria"
        title="Invia segnalazione"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-600 text-white shadow-lg flex items-center justify-center hover:bg-emerald-700 focus-visible:ring-4 focus-visible:ring-emerald-200">
        <MessageSquare className="w-6 h-6" />
      </button>
      <FeedbackModal open={open} onOpenChange={setOpen}
        cycleId={cycleId} cycleRev={cycle.data?.rev ?? undefined}/>
    </>
  );
}
