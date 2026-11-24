import { isForfait } from "./quote-forfait";
import { ralCodeInfo, ralOutputCode, validRal, type RalOptions } from "./ral-pricing";

type Row = Record<string, any>;

/**
 * v23 — Codice articolo digitato con la finitura RAL «cotta» nel codice
 * (es. «VBCD091Z03IO7035») mentre sul documento è selezionato un RAL.
 * Il motore non può sapere se il prezzo inserito è già verniciato, quindi la
 * riga resterebbe senza supplemento (0%, esclusa «già RAL») e il PDF
 * mostrerebbe un colore diverso da quello scelto in testata. La riga va
 * corretta inserendo il codice con finitura standard: DDCost lo converte nel
 * RAL del documento e calcola il relativo supplemento. I codici temporanei
 * verniciati generati da DDCost (record codice_temporaneo coerente) hanno il
 * loro flusso di rigenerazione e non sono toccati da questo controllo.
 */
export type RalTypedCodeIssue = {
  index: number;
  /** Codice digitato, in maiuscolo. */
  code: string;
  /** RAL letto nel codice digitato (es. «7035»). */
  typedRal: string;
  /** RAL selezionato sul documento (es. «9010»). */
  targetRal: string;
  /** Codice con finitura standard proposto, solo quando è certo. */
  standard: string | null;
  /** Codice che uscirà nel PDF cliente applicando lo standard. */
  pdfCode: string | null;
};

const BAKED_RAL = /O(\d{4})$/i;

/** Etichetta mostrata sulla riga finché il supplemento non è calcolabile. */
export const RAL_PENDING_LABEL = "Supplemento RAL da calcolare";

export function ralTypedCodeIssue(product: Row | null | undefined, ral: unknown, index = 0): RalTypedCodeIssue | null {
  if (!validRal(ral)) return null;
  if (!product || isForfait(product)) return null;
  const raw = String(product.codice ?? "").trim();
  const code = raw.toUpperCase();
  const match = BAKED_RAL.exec(code);
  if (!match) return null;
  // Codici temporanei verniciati generati da DDCost: flusso esistente
  // (ralSourceCode / rigenerazione guidata), non una digitazione da correggere.
  const temporary = product.codice_temporaneo as { code?: unknown } | null | undefined;
  if (temporary && typeof temporary.code === "string" && temporary.code.trim() === raw) return null;
  // La famiglia QU è esclusa dalla verniciatura a prescindere dal codice.
  if (ralCodeInfo(code).family === "qu") return null;
  // v24: l'esclusione del materiale ha la precedenza sul controllo. Il nylon
  // (materiale «N» in 11ª posizione, come nel motore) non è verniciabile e il
  // motore applica correttamente lo 0%: nessun blocco — la riga mostra il
  // motivo di esclusione (ralSupplementExclusion).
  if (code[10] === "N") return null;
  const base = code.slice(0, code.length - 5); // senza «O» + 4 cifre
  let standard: string | null = null;
  let pdfCode: string | null = null;
  // Il codice standard è CERTO solo per il ferro: base di 11 caratteri con il
  // materiale «I» in decima posizione → finitura standard «N» (nero standard).
  // Per inox, ottone, alluminio o basi di lunghezza diversa l'operatore
  // inserisce manualmente il codice corretto: nessun pulsante proposto.
  if (base.length === 11 && base[10] === "I") {
    const proposed = base + "N";
    const converted = ralOutputCode(proposed, (ral as RalOptions).color);
    // v24: il pulsante «Usa …» solo se la conversione è effettiva, cioè se il
    // codice proposto è valido e il motore restituisce davvero il codice con
    // il RAL richiesto. Codici non alfanumerici (es. «VBCD091-03IN» con il
    // trattino) verrebbero tariffati ma NON convertiti nel PDF: in quel caso
    // resta il solo avviso, con inserimento manuale del codice corretto.
    if (converted !== proposed) {
      standard = proposed;
      pdfCode = converted;
    }
  }
  return { index, code, typedRal: match[1].toUpperCase(), targetRal: (ral as RalOptions).color, standard, pdfCode };
}

/** Tutte le righe del documento con un codice RAL digitato da correggere. */
export function quoteRalTypedCodeIssues(doc: Row | null | undefined): RalTypedCodeIssue[] {
  const ral = doc?.verniciatura_ral;
  if (!validRal(ral) || doc?.ral_consolidato === true || !Array.isArray(doc?.prodotti)) return [];
  return (doc.prodotti as Row[])
    .map((p, i) => ralTypedCodeIssue(p, ral, i))
    .filter((issue): issue is RalTypedCodeIssue => issue !== null);
}

/**
 * Errore bloccante per completamento, salvataggio definitivo, export PDF ed
 * email: nomina le righe da correggere. Il salvataggio in bozza resta
 * consentito (il router non chiama questa validazione per le bozze).
 */
export function quoteRalTypedCodeError(doc: Row | null | undefined): string | null {
  const issues = quoteRalTypedCodeIssues(doc);
  if (!issues.length) return null;
  const rows = issues.map(issue => `riga ${issue.index + 1} (${issue.code})`).join(", ");
  return `${RAL_PENDING_LABEL}: correggi il codice articolo della ${rows} inserendo la finitura standard, prima di completare, salvare o esportare il preventivo.`;
}

/** Avviso sotto il campo «Codice articolo» (dicitura richiesta, invariata). */
export function ralTypedCodeWarning(issue: RalTypedCodeIssue): string {
  return `Il codice inserito è già in RAL ${issue.typedRal}. Inserisci il codice con finitura standard. DDCost lo convertirà in RAL ${issue.targetRal} e calcolerà il relativo supplemento`;
}

/**
 * v24 — Motivi di esclusione dal supplemento RAL mostrati sotto la riga al
 * posto del solo «+0%»: forfait, nylon, famiglia QU e finitura grezza/naturale.
 * Le diciture seguono il formato «Supplemento RAL non applicabile: <motivo>».
 */
export type RalSupplementExclusion = "forfait" | "nylon" | "qu" | "naturale";

const EXCLUSION_REASONS: Record<RalSupplementExclusion, string> = {
  forfait: "riga a forfait",
  nylon: "nylon",
  qu: "famiglia QU",
  naturale: "grezzo/naturale",
};

/**
 * Motivo per cui una riga non ha il supplemento RAL, o null se la riga può
 * essere verniciata (o se non c'è un RAL di documento valido). Vale anche per
 * le righe a forfait, che non hanno campi RAL calcolati. I codici digitati con
 * il RAL «cotto» da correggere restano gestiti da ralTypedCodeIssue.
 */
export function ralSupplementExclusion(product: Row | null | undefined, ral: unknown): RalSupplementExclusion | null {
  if (!validRal(ral) || !product) return null;
  if (isForfait(product)) return "forfait";
  const code = String(product.codice ?? "").trim().toUpperCase();
  if (!code) return null;
  const info = ralCodeInfo(code);
  if (info.family === "qu") return "qu";
  if (info.natural) return "naturale";
  if (code[10] === "N") return "nylon";
  return null;
}

/** Dicitura sotto la riga per un motivo di esclusione. */
export function ralSupplementExclusionLabel(exclusion: RalSupplementExclusion): string {
  return `Supplemento RAL non applicabile: ${EXCLUSION_REASONS[exclusion]}`;
}

/**
 * Anteprima del codice che uscirà nel PDF cliente con il RAL del documento
 * (es. «VBCD091Z03IN» → «VBCD091Z03IO9010»). Null quando il codice non viene
 * convertito (già verniciato, escluso, grezzo o campo vuoto).
 */
export function ralPdfCodePreview(product: Row | null | undefined, ral: unknown): string | null {
  if (!validRal(ral) || !product || isForfait(product)) return null;
  const code = String(product.codice ?? "").trim();
  if (!code) return null;
  const converted = ralOutputCode(code, (ral as RalOptions).color);
  return converted !== code ? converted : null;
}
