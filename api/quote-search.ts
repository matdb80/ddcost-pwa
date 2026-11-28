import type {Quote} from "@db/schema";
import {documentProductCode} from "../src/lib/document-product-fields";
import {documentPrintFinish} from "../src/lib/document-print-color";
import {ralColors,validRal} from "../src/lib/ral-pricing";

const colors = new Map(ralColors.map(color => [color.code, color]));
const fold = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("it-IT");

export function quoteSearchMatcher(search: string) {
  const needle = fold(search).replace(/^ral\s*[-:]?\s*(\d{4})$/, "ral $1");
  const ralNumber = /^ral\s*[-:]?\s*(\d{4})$/.exec(needle)?.[1];
  const contains = (value: unknown) => fold(value).includes(needle);
  const matchesColor = (value: unknown) => {
    if (value == null) return false;
    const code = String(value);
    const color = colors.get(code);
    return code === ralNumber || contains(code) || contains(color?.name) || contains(color?.english);
  };
  return (quote: Pick<Quote, "id" | "client" | "reference" | "dataJson">) => {
    if ([quote.client, quote.reference].some(contains)) return true;
    let doc;
    try { doc = JSON.parse(quote.dataJson ?? "{}"); } catch { doc = null; }
    if (contains(doc?.numero_preventivo || quote.id)) return true;
    if (!doc) return false;
    if ([doc.cliente, doc.riferimento_preventivo, doc.titolo_preventivo, doc.riferimento_cliente,
      doc.note_cliente, doc.note_generali, doc.note_fornitori].some(contains)) return true;
    if (matchesColor(doc.verniciatura_ral?.color) || (doc.ral_consolidato && matchesColor(doc.ral_riepilogo?.color))) return true;
    if (!Array.isArray(doc.prodotti)) return false;
    return doc.prodotti.some((p: Record<string, unknown> | null) => {
      if (!p || typeof p !== "object") return false;
      if ([p.codice, p.descrizione, p.gruppo_merceologico, p.materiale_prodotto, documentProductCode(p, doc)].some(contains))
        return true;
      if (matchesColor(/O(\d{4})$/i.exec(String(p.codice ?? ""))?.[1])) return true;
      if (p.a_forfait || (doc.verniciatura_ral && !validRal(doc.verniciatura_ral))) return false;
      const finish = documentPrintFinish(doc, p);
      return contains(finish) || matchesColor(/RAL (\d{4})/.exec(finish)?.[1]);
    });
  };
}
