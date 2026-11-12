import {seriesDiscount} from "./series-discount";
import {isSeries} from "./quote-series";
import {documentProductCode,documentProductDescription} from "./document-product-fields";
import {isForfait,forfaitProductError} from "./quote-forfait";
import {quoteDocumentNumber} from "./commercial-offer-number";

/** Pure customer-facing text; never contains internal costing or supplier notes. */
type Data = Record<string, any>;
const money = (value: number): string => value.toLocaleString("it-IT", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}) + " €";
const asText = (v: unknown): string => String(v ?? "").trim();
function asNumber(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("Valore numerico non valido nel preventivo");
  return n;
}

export function listinoProductIndex(doc: Data): number {
  const rows = doc.prodotti as Data[];
  const reference = doc.listino;
  if (!reference) return -1;
  const idx = reference.product_index_riferimento;
  if (Number.isInteger(idx) && idx >= 0 && idx < rows.length) return idx;
  const code = asText(reference.codice_riferimento);
  if (code) {
    const matching = rows.map((p,i) => asText(p.codice) === code || documentProductCode({...p,codice:code},doc) === documentProductCode(p,doc) ? i : -1).filter(i=>i>=0);
    if (matching.length === 1) return matching[0];
  }
  const description = asText(reference.descrizione_riferimento);
  if (description) {
    const matching = rows.map((p,i) => asText(p.descrizione) === description ? i : -1).filter(i=>i>=0);
    if (matching.length === 1) return matching[0];
  }
  // A global reference can only be assigned safely with a single article.
  return rows.length === 1 ? 0 : -1;
}
export function formatQuoteForCopy(doc: Data): string {
  if (!Array.isArray(doc.prodotti) || doc.prodotti.length === 0)
    throw new Error("Nessun prodotto da copiare");
  const listinoIndex = listinoProductIndex(doc);
  const lines: string[] = ["PREVENTIVO UNA TANTUM"];
  const number=quoteDocumentNumber(doc);
  if(number)lines.push("Numero: " + number);
  if (asText(doc.cliente)) lines.push("Cliente: " + asText(doc.cliente));
  if (asText(doc.riferimento_preventivo)) lines.push("Riferimento: " + asText(doc.riferimento_preventivo));
  lines.push("");
  let calculatedTotal = 0;
  doc.prodotti.forEach((p: Data, index: number) => {
    if(isForfait(p)) {
      const error=forfaitProductError(p);
      if(error)throw new Error(error);
      calculatedTotal+=Number(p.valore_forfait);
      lines.push("Articolo "+(index+1),"Descrizione: "+asText(p.descrizione),"a forfait/da definire","Totale riga: "+money(Number(p.valore_forfait)),"");
      return;
    }
    const qty = asNumber(p.quantita);
    const net = asNumber(p.prezzo_netto_unitario_finale ?? p.prezzo_vendita_pre_quadratura ?? p.prezzo_netto_unitario);
    if (qty <= 0) throw new Error("Quantità non valida nel prodotto " + (index+1));
    const lineTotal = qty * net;
    calculatedTotal += lineTotal;
    lines.push("Articolo " + (index+1));
    if (asText(p.codice)) lines.push("Codice articolo: " + documentProductCode(p,doc));
    lines.push("Descrizione: " + documentProductDescription(p));
    if(isSeries(p)&&String(p.sconto_serie??"").trim())lines.push("Prezzo unitario: "+money(Number(p.prezzo_serie)),"Sconto cliente: "+seriesDiscount(p.sconto_serie).label);
    if (!isSeries(p) && index === listinoIndex && doc.listino) {
      const listino = doc.listino.prezzo_listino_generato;
      if (listino !== undefined && listino !== null && listino !== "")
        lines.push("Prezzo listino: " + money(asNumber(listino)));
      const discount = asText(doc.listino.sconto_riferimento);
      if (discount) lines.push("Sconto cliente: " + discount);
    }
    lines.push(
      "Prezzo netto unitario: " + (doc.ral_riepilogo?net.toLocaleString("it-IT",{minimumFractionDigits:4,maximumFractionDigits:4})+" €":money(net)),
      "Quantità: " + qty.toLocaleString("it-IT"),
      "Totale riga: " + money(lineTotal),
      ""
    );
  });
  const docTotal = doc.totale_finale != null
    ? asNumber(doc.totale_finale)
    : calculatedTotal;
  if(doc.ral_riepilogo)lines.push("RAL " + doc.ral_riepilogo.color + " · Cambio colore (una volta): " + money(asNumber(doc.ral_riepilogo.fixed)), "Prezzo verniciato indicativo, da confermare dall’ufficio.");
  lines.push("Totale documento: " + money(docTotal));
  if (asText(doc.note_cliente)) lines.push("", "Note cliente:", asText(doc.note_cliente));
  return lines.join("\n");
}
