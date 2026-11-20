import {quoteRowListino} from "./quote-row-listino";
export {listinoProductIndex} from "./quote-row-listino";
import {refreshQuoteSeriesRal} from "./quote-series-ral-refresh";
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

export function formatQuoteForCopy(doc: Data): string {
  doc=refreshQuoteSeriesRal(doc);
  if (!Array.isArray(doc.prodotti) || doc.prodotti.length === 0)
    throw new Error("Nessun prodotto da copiare");
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
    const listino=quoteRowListino(doc,index);
    if(listino){
      lines.push("Prezzo listino: "+money(listino.listino));
      if(listino.discount)lines.push("Sconto cliente: "+listino.discount);
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
