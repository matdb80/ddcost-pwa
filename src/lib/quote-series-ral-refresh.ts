import { calculateRal, ralSourceCode, validRal } from "./ral-pricing";
import { isSeries, seriesNetPrice, seriesPriceError } from "./quote-series";
import { isForfait } from "./quote-forfait";
type Doc = Record<string, any>;
/** Old saved quotes charged RAL only on costed rows. Detect the missing layer,
 * without rerunning historical labor, material, margins or target allocation. */
export function needsSeriesRalRefresh(doc: Doc): boolean {
  if (
    !doc ||
    !validRal(doc.verniciatura_ral) ||
    doc.ral_consolidato ||
    !Array.isArray(doc.prodotti)
  )
    return false;
  const series = doc.prodotti.filter(isSeries);
  return (
    series.length > 0 &&
    (doc.ral_riepilogo?.rows?.length !==
      doc.prodotti.filter((p: Doc) => !isForfait(p)).length ||
      series.some(
        (p: Doc) => p.netto_prima_ral == null || p.ral_percentuale == null
      ))
  );
}
export function refreshQuoteSeriesRal<T extends Doc>(doc: T): T {
  if (!needsSeriesRalRefresh(doc)) return doc;
  const copy = structuredClone(doc),
    rows: Doc[] = copy.prodotti.filter((p: Doc) => !isForfait(p));
  const options = doc.verniciatura_ral;
  if (!validRal(options)) return doc;
  const result = calculateRal(
    rows.map((p, i) => {
      let net: number;
      if (isSeries(p)) {
        const error = seriesPriceError(p.prezzo_serie);
        if (error) throw new Error(error);
        net = seriesNetPrice(p);
      } else {
        if (p.netto_prima_ral == null || p.netto_prima_ral === "")
          throw new Error(
            `Ricalcola il preventivo: manca il prezzo prima RAL del prodotto ${i + 1}.`
          );
        net = Number(p.netto_prima_ral);
      }
      return {
        code: ralSourceCode(p, options),
        net,
        quantity: Number(p.quantita),
      };
    }),
    options
  );
  // Preserve the saved costed lines byte-for-byte in their economic values.
  // Only the missing series layer is being repaired, not historical rounding.
  result.rows.forEach((r, i) => {
    const p = rows[i];
    if (
      !isSeries(p) &&
      [
        p.prezzo_netto_unitario_finale,
        p.ral_ricarico_cad,
        p.totale_finale,
      ].every(v => v != null && v !== "" && Number.isFinite(Number(v)))
    )
      Object.assign(r, {
        net: Number(p.prezzo_netto_unitario_finale),
        surcharge: Number(p.ral_ricarico_cad),
        total: Number(p.totale_finale),
      });
  });
  result.subtotal =
    Math.round(
      (result.rows.reduce((sum, r) => sum + r.total!, 0) + Number.EPSILON) * 100
    ) / 100;
  result.total =
    Math.round((result.subtotal + result.fixed + Number.EPSILON) * 100) / 100;
  result.rows.forEach((r, i) =>
    Object.assign(rows[i], {
      netto_prima_ral: r.baseNet,
      ral_ricarico_cad: r.surcharge,
      ral_percentuale: r.percent,
      prezzo_netto_unitario_finale: r.net,
      totale_finale: r.total,
    })
  );
  const forfait = copy.prodotti
    .filter(isForfait)
    .reduce((sum: number, p: Doc) => sum + Number(p.valore_forfait), 0);
  Object.assign(copy, {
    ral_riepilogo: result,
    totale_finale: result.total! + forfait,
    totale: result.total! + forfait,
  });
  if (!copy.prodotti.some(isForfait))
    Object.assign(copy, {
      prezzo_netto_unitario:
        Number(copy.quantita) > 0
          ? copy.totale_finale / Number(copy.quantita)
          : null,
    });
  const euro = (v: number) =>
    v.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const lines = copy.prodotti.map((p: Doc, i: number) =>
    isForfait(p)
      ? `${i + 1}. ${p.descrizione} - a forfait/da definire - € ${euro(p.totale_finale)}`
      : `${i + 1}. ${p.descrizione} - ${p.quantita} pz - € ${euro(p.prezzo_netto_unitario_finale)}/pz - € ${euro(p.totale_finale)}`
  );
  Object.assign(copy, {
    summary:
      "PREVENTIVO UNA TANTUM\nCliente: " +
      (copy.cliente || "") +
      "\nRiferimento: " +
      (copy.riferimento_preventivo || "") +
      "\n\n" +
      lines.join("\n") +
      "\nCambio colore RAL: € " +
      euro(result.fixed) +
      "\n\nTotale: € " +
      euro(copy.totale_finale),
  });
  return copy;
}
