import colors from "../data/ral-colors.json";
export { colors as ralColors };
export type RalOptions = { color: string; textured: boolean };
export const TEMPORARY_FAMILIES = ["VB", "RN", "QU", "MA", "FP", "CR", "AA", "CS", "CA", "BC", "AM", "AP", "AS", "SP"] as const;
export const TEMPORARY_MATERIALS = { I: "Ferro", X: "Inox AISI 304", "6": "Inox AISI 316", B: "Ottone", A: "Alluminio" } as const;
const knownColors = new Set(colors.map(c => c.code));
const round = (n: number, digits: number) => Math.round((n + Number.EPSILON) * 10 ** digits) / 10 ** digits;
export function validRal(value: unknown): value is RalOptions {
  const r = value as RalOptions | null;
  return Boolean(r && knownColors.has(r.color) && typeof r.textured === "boolean");
}
export function temporaryCodePrefix(sequence: number, family: string, material: string): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999999 ||
    !TEMPORARY_FAMILIES.includes(family as typeof TEMPORARY_FAMILIES[number]) || !Object.hasOwn(TEMPORARY_MATERIALS, material))
    throw new Error("Famiglia, materiale, progressivo o RAL non valido");
  return `T${family}${String(sequence).padStart(7, "0")}${material}`;
}
export function validTemporarySuffix(value: unknown): value is string {
  // Un solo carattere ANCHE dopo la conversione in maiuscolo: «ß» è un
  // carattere solo, ma «ß».toUpperCase() è «SS» e produrrebbe un codice di
  // 13 caratteri. La stessa regola vale per digitazione, incolla, anteprima
  // (temporaryCodePreview → temporaryCode) ed emissione del router.
  return typeof value==="string" && Array.from(value).length===1 && !/[\s\p{C}]/u.test(value)
    && Array.from(value.toUpperCase()).length===1;
}
export function temporaryCode(sequence: number, family: string, material: string, color?: string | null, suffix?: string | null, natural=false): string {
  const prefix=temporaryCodePrefix(sequence,family,material);
  if(natural){
    if(color || (suffix!=null && suffix!=="0"))throw new Error("Grezzo/naturale non può avere un colore RAL o un'altra finitura");
    return prefix+"0";
  }
  if(color){
    if(family==="QU")throw new Error("La famiglia QU è esclusa dalla verniciatura RAL");
    if(!knownColors.has(color)||suffix)throw new Error("Colore RAL non valido o carattere finale incompatibile con il RAL");
    return prefix+"O"+color;
  }
  // Ogni nuovo codice temporaneo è INTERAMENTE MAIUSCOLO (tutte le famiglie):
  // la finitura automatica del ferro è «N» maiuscola e l'eventuale suffisso
  // digitato dall'utente (ottone/alluminio) è convertito in maiuscolo.
  const fixed=material==="I"?"N":material==="X"||material==="6"?"P":null;
  if(fixed){
    if(suffix!=null&&suffix.toUpperCase()!==fixed)throw new Error("Il carattere finale è automatico per ferro e inox");
    return prefix+fixed;
  }
  if(!validTemporarySuffix(suffix))throw new Error("Inserisci un solo carattere finale per ottone o alluminio");
  return prefix+suffix.toUpperCase();
}
/**
 * Anteprima del codice mostrata dal dialogo (TemporaryProductCode): stessa
 * composizione del codice che il router emetterà con quei parametri, suffisso
 * manuale maiuscolo incluso. Unica fonte condivisa da UI e test.
 */
export function temporaryCodePreview(sequence:number,family:string,material:string,color:string|null,suffix:string,natural:boolean,painted:boolean):string{
  const manualSuffix=!natural&&!painted&&(material==="B"||material==="A");
  // Entrambi i rami passano da temporaryCode: anteprima ed emissione usano
  // letteralmente la stessa validazione (suffisso «ß» rifiutato anche qui).
  // A suffisso ancora vuoto il dialogo mostra il prefisso da completare.
  return manualSuffix
    ? (suffix?temporaryCode(sequence,family,material,null,suffix):temporaryCodePrefix(sequence,family,material))
    : temporaryCode(sequence,family,material,painted?color:null,undefined,natural);
}
/** Only newly completed unpainted brass/aluminium codes permit suffix edits.
 * Legacy eleven-character codes and painted codes keep their prior behaviour. */
export function manualTemporaryCodePrefix(metadata: unknown): string | null {
  if(!metadata||typeof metadata!=="object")return null;
  const t=metadata as Record<string,unknown>;
  if(t.color!=null || (t.material!=="B"&&t.material!=="A") || typeof t.code!=="string" || isNaturalTemporaryCode(t.code))return null;
  try{
    const prefix=temporaryCodePrefix(Number(t.sequence),String(t.family),t.material);
    return validManualTemporaryCode(t.code,prefix)?prefix:null;
  }catch{return null;}
}
export function validManualTemporaryCode(code: string, prefix: string, allowEmpty=false): boolean {
  return code.startsWith(prefix) && ((allowEmpty && code===prefix)||validTemporarySuffix(code.slice(prefix.length)));
}
/** The explicit natural finish belongs to the temporary SKU, including after reopening. */export function isNaturalTemporaryCode(value:unknown):boolean {
  const match=/^T([A-Z]{2})(\d{7})([IX6BA])0$/.exec(String(value??"").trim().toUpperCase());
  return Boolean(match && Number(match[2])>0 && TEMPORARY_FAMILIES.includes(match[1] as typeof TEMPORARY_FAMILIES[number]));
}
/**
 * Rigenera il codice con la finitura fissa di un record di emissione storico a
 * 11 caratteri (ferro/inox senza colore, es. «TRN0000037I» → «TRN0000037IN»).
 * Restituisce null per ogni altro record. Condiviso da copia e validatore di
 * salvataggio: le righe storiche con la lettera finale minuscola
 * (es. «TRN0000037In») vengono riconosciute confrontando in maiuscolo.
 */
export function legacyFixedFinishCode(record:{sequence:number;family:string;material:string|null;color:string|null;code:string|null}):string|null{
  const material=record.material??"";
  try{
    if(record.color || !["I","X","6"].includes(material))return null;
    if(record.code!==temporaryCodePrefix(record.sequence,record.family,material))return null;
    return temporaryCode(record.sequence,record.family,material);
  }catch{return null;}
}
/** Older rows may differ from the issued prefix plus finish only in the case of the finish. */
export function matchesLegacyFixedFinish(code: string, expected: string | null): boolean {
  return expected !== null && (code === expected || code === expected.slice(0, -1) + expected.slice(-1).toLowerCase());
}
/**
 * Solo presentazione nei documenti cliente: i codici temporanei storici possono
 * essere stati salvati con la lettera di finitura minuscola (es. «TCS0000009In»)
 * e devono comparire maiuscoli («TCS0000009IN») sui PDF. La funzione NON riscrive
 * il dato salvato: vale per tutte le famiglie e per finiture fisse e manuali,
 * preserva progressivo e zeri iniziali e lascia invariato ogni altro codice
 * (codici di serie, RAL «…O9005», naturali «…0», già maiuscoli).
 */
export function presentTemporaryCode(raw: string): string {
  const code = String(raw ?? "").trim();
  const match = /^T([A-Z]{2})(\d{7})([IX6BA])[a-z]$/.exec(code);
  if (!match || Number(match[2]) === 0 ||
    !TEMPORARY_FAMILIES.includes(match[1] as typeof TEMPORARY_FAMILIES[number])) return code;
  return code.slice(0, -1) + code.slice(-1).toUpperCase();
}
/** Preserve the selected finish, but never change the issued prefix when copying. */
export function temporaryCodeCopyOptions(record:{sequence:number;family:string;material:string|null;color:string|null;code:string|null},currentCode:string){
  const material=record.material??"",prefix=temporaryCodePrefix(record.sequence,record.family,material);
  const code=currentCode.trim();
  const manual=manualTemporaryCodePrefix(record);
  const legacyFixed=legacyFixedFinishCode(record);
  // Il confronto con la finitura rigenerata è case-insensitive: le righe storiche
  // con la lettera finale minuscola (es. TRN0000037In) restano copiabili e la
  // copia riceve un nuovo progressivo con la finitura maiuscola (…IN).
  if(manual ? !validManualTemporaryCode(code,prefix) : code!==record.code && !matchesLegacyFixedFinish(code,legacyFixed))
    throw new Error("Il codice da copiare non corrisponde al codice temporaneo emesso");
  const natural=isNaturalTemporaryCode(code);
  const suffix=!record.color && !natural && (material==="B"||material==="A")?code.slice(prefix.length):undefined;
  // Validate before reserving a fresh number (including incomplete historical brass codes).
  temporaryCode(1,record.family,material,record.color,suffix,natural);
  return {family:record.family,material,color:record.color,suffix,natural};
}
export function ralCodeInfo(raw: string) {
  const code = raw.trim().toUpperCase();
  const natural=isNaturalTemporaryCode(code);
  return { code, family: code.slice(1, 3).toLowerCase(), stainless: "1236X".includes(code[10] ?? " "),
    natural, paintable: !natural && code.slice(1,3)!=="QU" && !/O\d{4}$/.test(code) && code[10] !== "N" };
}
export function ralRate(code: string, textured: boolean) {
  const info = ralCodeInfo(code);
  if (!info.paintable) return { ...info, percent: 0, textured: false };
  const rough = textured && !info.stainless && info.family !== "vb";
  const standard = info.family === "as" || info.family === "sp" ? [100, 50, 150]
    : info.family === "fp" ? [100, 40, 150] : info.family === "vb" ? [200, 200, 200] : [50, 35, 100];
  return { ...info, percent: standard[rough ? 2 : info.stainless ? 1 : 0], textured: rough };
}
export type RalLineInput = { code: string; net: number | null; quantity: number };
export function calculateRal(lines: RalLineInput[], options: RalOptions) {
  if (!validRal(options)) throw new Error("Seleziona un colore RAL valido");
  if (options.textured && lines.some(r => {const info=ralCodeInfo(r.code);return info.stainless&&!info.natural;})) throw new Error("Il goffrato non è compatibile con un ordine contenente inox verniciato");
  const rows = lines.map(line => {
    if (!line.code.trim()) throw new Error("Inserisci il codice articolo per calcolare il RAL");
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || (line.net !== null && (!Number.isFinite(line.net) || line.net < 0))) throw new Error("Quantità o netto cliente non valido");
    const rate = ralRate(line.code, options.textured);
    const surcharge = line.net === null ? null : round(line.net * rate.percent / 100, 4);
    const net = line.net === null ? null : line.net + surcharge!;
    return { ...rate, baseNet: line.net, surcharge, net, quantity: line.quantity,
      total: net === null ? null : round(net * line.quantity, 2) };
  });
  const fixed = rows.some(r => r.paintable) ? rows.some(r => r.textured) ? 100 : 50 : 0;
  const subtotal = round(rows.reduce((sum, r) => sum + (r.total ?? 0), 0), 2);
  return { version: "2026-11-08", color: options.color, textured: options.textured, rows, fixed, subtotal,
    total: rows.some(r => r.total === null) ? null : round(subtotal + fixed, 2), onRequest: rows.some(r => r.total === null) };
}
/** A newly generated painted SKU is priced from its unpainted base exactly once.
 * Calculators always pass a fresh base net, never the previously painted result.
 * A bare SKU ending Odddd, without this creation record, is already consolidated. */
export function ralSourceCode(row: Record<string, unknown>, options: RalOptions): string {
  const code = String(row.codice ?? "").trim().toUpperCase();
  const t = row.codice_temporaneo as { sequence?: number; family?: string; material?: string; color?: string; code?: string } | undefined;
  if(code.slice(1,3)==="QU")return code;
  if (t?.code === code && t.color) {
    if (t.color !== options.color) throw new Error("Il codice temporaneo ha un RAL diverso: rigeneralo per il colore selezionato");
    if (temporaryCode(Number(t.sequence), String(t.family), String(t.material), t.color) !== code) throw new Error("Codice temporaneo incoerente");
    return code.slice(0, 11);
  }
  return code;
}
export function ralLinePrice(row: Record<string, unknown>, net: number): number {
  if (!row.verniciatura_ral || row.ral_consolidato) return net;
  if (!validRal(row.verniciatura_ral)) throw new Error("Configurazione RAL non valida");
  return calculateRal([{ code: ralSourceCode(row, row.verniciatura_ral), net, quantity: 1 }], row.verniciatura_ral).rows[0].net!;
}

/** Display conversion only: pricing must always retain the original base SKU. */
export function ralOutputCode(raw:string,color:string):string {
  const code=raw.trim().toUpperCase();
  if(!knownColors.has(color)||!ralCodeInfo(code).paintable||!/^[A-Z0-9]{11}/.test(code))return raw.trim();
  return code.slice(0,11)+"O"+color;
}
