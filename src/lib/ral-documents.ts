import { calculateRal, validRal, ralSourceCode } from "./ral-pricing";
import { calculateOfferLotPrice, cycleForOfferRow, discountFactor, withCalculatedOfferRow, type CommercialOfferRow } from "./commercial-offer-pricing";

export function assertPaintedTemporaryCodes(rows: Record<string, any>[], options: unknown) {
  if (rows.some(r => r.codice_temporaneo?.color && r.codice_temporaneo.code === r.codice) && !validRal(options))
    throw new Error("I codici temporanei verniciati richiedono il RAL del documento. Rigenera i codici se vuoi togliere la verniciatura.");
}
export function prepareRalOffer<T extends { righe: CommercialOfferRow[]; [key: string]: unknown }>(offer: T): T {
  if (offer.ral_consolidato) return offer;
  assertPaintedTemporaryCodes(offer.righe, offer.verniciatura_ral);
  if (!offer.verniciatura_ral) return offer;
  if (!validRal(offer.verniciatura_ral)) throw new Error("Configurazione RAL non valida");
  const options = offer.verniciatura_ral;
  const rows: Array<CommercialOfferRow & {netto_prima_ral:number|null}> = offer.righe.map(original => {
    const row = { ...original, verniciatura_ral: options } as CommercialOfferRow;
    if (cycleForOfferRow(row)) return { ...withCalculatedOfferRow(row), netto_prima_ral: calculateOfferLotPrice(row, Number(row.lotto)).baseNetPrice };
    const list = row.listino;
    const net = list == null || list === "" ? null : Number(list) * discountFactor(String(row.sconto_base || "0")) * (1 - Number(row.extra ?? 0) / 100);
    return { ...row, netto_prima_ral: net };
  });
  const result = calculateRal(rows.map(row => ({ code: ralSourceCode(row, options), net: row.netto_prima_ral as number | null, quantity: Number(row.lotto) })), options);
  return { ...offer, righe: rows.map((row, i) => ({ ...row, netto: result.rows[i].net,
    prezzo_netto_proposto: result.rows[i].net, totale_riga: result.rows[i].total, ral_ricarico_cad: result.rows[i].surcharge,
    ral_percentuale: result.rows[i].percent, ral_su_richiesta: result.rows[i].net === null })),
    ral_riepilogo: result };
}
