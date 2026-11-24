import type { RalOptions } from "@/lib/ral-pricing";
import {
  ralPdfCodePreview,
  ralTypedCodeIssue,
  ralTypedCodeWarning,
} from "@/lib/quote-ral-typed-code";

type Row = Record<string, any>;

/**
 * v23 — Avviso sotto «Codice articolo» quando il codice digitato contiene già
 * una finitura RAL (es. «…O7035») e sul documento è selezionato un altro RAL.
 * Propone il codice con finitura standard quando è certo (ferro); dopo la
 * correzione mostra il codice che uscirà nel PDF cliente.
 */
export default function RalTypedCodeNotice({ product, ral, disabled, onUseStandard }: {
  product: Row | null | undefined;
  ral: RalOptions | null | undefined;
  disabled?: boolean;
  onUseStandard: (code: string) => void;
}) {
  const issue = ralTypedCodeIssue(product, ral);
  if (issue) {
    return (
      <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p>{ralTypedCodeWarning(issue)}</p>
        {issue.standard && (
          <button
            type="button"
            disabled={disabled}
            className="mt-2 min-h-9 rounded-lg bg-amber-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => onUseStandard(issue.standard!)}
          >
            Usa {issue.standard}
          </button>
        )}
      </div>
    );
  }
  const pdfCode = ralPdfCodePreview(product, ral);
  if (pdfCode) {
    return <p className="text-xs text-slate-600">{"Codice nel PDF cliente: " + pdfCode}</p>;
  }
  return null;
}
