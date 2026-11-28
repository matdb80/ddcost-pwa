import type { RalOptions } from "@/lib/ral-pricing";
import { RAL_PENDING_LABEL, ralSupplementExclusion, ralSupplementExclusionLabel, ralTypedCodeIssue } from "@/lib/quote-ral-typed-code";

type Row = Record<string, any>;

const fmt = (value: unknown): string =>
  Number(value ?? 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

/**
 * v23 — Dettaglio del supplemento RAL sotto la riga prodotto, con percentuale
 * e importo che arrivano dal motore di calcolo (riga già calcolata):
 * «+50% per RAL · +8,75 €/pz». Finché il codice digitato contiene un RAL
 * «cotto» (es. «…O7035») la riga mostra invece «Supplemento RAL da
 * calcolare». Il cambio colore resta una voce unica a livello documento.
 */
export default function RalRowSupplement({ product, calculated, ral, showFinal = true, className }: {
  product: Row | null | undefined;
  calculated?: Row | null;
  ral: RalOptions | null | undefined;
  /** Aggiunge «· Prezzo finale: … €/pz» (falso dove il prezzo finale è già visibile accanto). */
  showFinal?: boolean;
  className?: string;
}) {
  const issue = ralTypedCodeIssue(product, ral);
  if (issue) {
    // Lo stato «da calcolare» resta ambra anche con una className passata dal chiamante.
    return <p className={(className ?? "text-sm") + " font-medium text-amber-800"}>{RAL_PENDING_LABEL}</p>;
  }
  // v24: righe escluse dal supplemento — il motivo («…: riga a forfait»,
  // «…: nylon», …) al posto del solo «+0% per RAL». Vale anche per le righe a
  // forfait, che non hanno percentuale/importo calcolati.
  const exclusion = ralSupplementExclusion(product, ral);
  if (exclusion) {
    return <p className={className ?? "text-sm text-slate-700"}>{ralSupplementExclusionLabel(exclusion)}</p>;
  }
  if (!ral || calculated?.ral_percentuale == null || calculated?.ral_ricarico_cad == null) return null;
  const core = `+${Number(calculated.ral_percentuale)}% per RAL · +${fmt(calculated.ral_ricarico_cad)} €/pz`;
  return (
    <p className={className ?? "text-sm text-slate-700"}>
      {showFinal ? `${core} · Prezzo finale: ${fmt(calculated.prezzo_netto_unitario_finale)} €/pz` : core}
    </p>
  );
}
