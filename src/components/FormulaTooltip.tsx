import { Sigma } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function FormulaTooltip({
  label,
  formula,
  className = "",
}: {
  label: string;
  formula: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Formula usata per ${label}`}
          onClick={(event) => event.stopPropagation()}
          className={`ml-1 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${className}`}
        >
          <Sigma aria-hidden="true" size={14} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-80 whitespace-pre-line text-left leading-relaxed">
        <strong className="font-semibold">{label}</strong>
        <p className="mt-1">{formula}</p>
      </TooltipContent>
    </Tooltip>
  );
}
