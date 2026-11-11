import {documentProductCode} from "../src/lib/document-product-fields";
import {isFixedPrice} from "../src/lib/quote-series";
import { inArray } from "drizzle-orm";
import { temporaryProductCodes } from "@db/schema";
import { getDb } from "./queries/connection";
import { validRal, calculateRal, ralSourceCode, manualTemporaryCodePrefix, validManualTemporaryCode } from "../src/lib/ral-pricing";
import { assertPaintedTemporaryCodes } from "../src/lib/ral-documents";

/** Verify the issuance record, not a user-supplied claim that a code was generated. */
export async function validateTemporaryProductDocument(raw: string | undefined, rowKey: "prodotti" | "righe", draft = false) {
  if (!raw) return;
  const doc = JSON.parse(raw);
  if (!Array.isArray(doc[rowKey])) return;
  const rows = rowKey === "prodotti" ? doc[rowKey].filter((r:any)=>!isFixedPrice(r)) : doc[rowKey];
  if (!draft) {
    assertPaintedTemporaryCodes(rows, doc.verniciatura_ral);
    if(rows.some(r=>r.verniciatura_ral && JSON.stringify(r.verniciatura_ral)!==JSON.stringify(doc.verniciatura_ral)))throw new Error("Tutte le righe devono usare il RAL del documento");
    if (rows.length && doc.verniciatura_ral) {
      if (!validRal(doc.verniciatura_ral)) throw new Error("Configurazione RAL non valida");
      calculateRal(rows.map(r => ({ code: ralSourceCode(r, doc.verniciatura_ral), net: 0, quantity: 1 })), doc.verniciatura_ral);
    }
  }
  const generated = rows.filter(r => r.codice_temporaneo);
  if (!generated.length) return;
  const issued = await getDb().select().from(temporaryProductCodes).where(inArray(temporaryProductCodes.code, generated.map(r => String(r.codice_temporaneo.code))));
  for (const row of generated) {
    const metadata = row.codice_temporaneo;
    const expectedMaterial=({I:"ferro",X:"inox","6":"inox",B:"ottone",A:"alluminio"} as Record<string,string>)[metadata.material];
    if(row.materiale_prodotto && row.materiale_prodotto!==expectedMaterial)throw new Error("Il materiale non corrisponde al codice temporaneo: rigenera il codice");
    const record = issued.find(r => r.code === metadata.code);
    if (!record || ["sequence", "family", "material", "color", "code"].some(k => metadata[k] !== record[k as keyof typeof record]))
      throw new Error("Codice temporaneo non emesso dal contatore globale: rigeneralo prima di salvare");
    // The counter owns the immutable eleven-character prefix. Only the custom
    // finish of newly generated brass/aluminium codes can differ per document.
    const prefix=manualTemporaryCodePrefix(record);
    if(prefix){
      if(!validManualTemporaryCode(String(row.codice??""),prefix,draft))
        throw new Error("Mantieni i primi 11 caratteri del codice temporaneo e inserisci un solo carattere finale");
    }else if(row.codice!==record.code && row.codice!==documentProductCode({...row,codice:record.code,codice_temporaneo:record},doc))throw new Error("Il codice non corrisponde al codice temporaneo emesso");
  }
}
