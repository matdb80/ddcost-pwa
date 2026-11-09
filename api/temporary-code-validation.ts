import { inArray } from "drizzle-orm";
import { temporaryProductCodes } from "@db/schema";
import { getDb } from "./queries/connection";
import { validRal, calculateRal, ralSourceCode } from "../src/lib/ral-pricing";
import { assertPaintedTemporaryCodes } from "../src/lib/ral-documents";

/** Verify the issuance record, not a user-supplied claim that a code was generated. */
export async function validateTemporaryProductDocument(raw: string | undefined, rowKey: "prodotti" | "righe", draft = false) {
  if (!raw) return;
  const doc = JSON.parse(raw);
  const rows = doc[rowKey];
  if (!Array.isArray(rows)) return;
  if (!draft) {
    assertPaintedTemporaryCodes(rows, doc.verniciatura_ral);
    if(rows.some(r=>r.verniciatura_ral && JSON.stringify(r.verniciatura_ral)!==JSON.stringify(doc.verniciatura_ral)))throw new Error("Tutte le righe devono usare il RAL del documento");
    if (doc.verniciatura_ral) {
      if (!validRal(doc.verniciatura_ral)) throw new Error("Configurazione RAL non valida");
      calculateRal(rows.map(r => ({ code: ralSourceCode(r, doc.verniciatura_ral), net: 0, quantity: 1 })), doc.verniciatura_ral);
    }
  }
  const generated = rows.filter(r => r.codice_temporaneo);
  if (!generated.length) return;
  const issued = await getDb().select().from(temporaryProductCodes).where(inArray(temporaryProductCodes.code, generated.map(r => String(r.codice))));
  for (const row of generated) {
    const metadata = row.codice_temporaneo;
    const expectedMaterial=({I:"ferro",X:"inox","6":"inox",B:"ottone",A:"alluminio"} as Record<string,string>)[metadata.material];
    if(row.materiale_prodotto && row.materiale_prodotto!==expectedMaterial)throw new Error("Il materiale non corrisponde al codice temporaneo: rigenera il codice");
    const record = issued.find(r => r.code === row.codice);
    if (!record || ["sequence", "family", "material", "color", "code"].some(k => metadata[k] !== record[k as keyof typeof record]))
      throw new Error("Codice temporaneo non emesso dal contatore globale: rigeneralo prima di salvare");
  }
}
