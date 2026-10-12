/**
 * Bandelle a T Smeralda — source: user-supplied workbook
 * "Listino Bandelle T Smeralda collo speciale_AGOSTO2022_macro.xlsm", sheet Foglio1.
 *
 * Base prices are copied from source cells D:J (rows 14:18, 33:43, 58:64),
 * supplements from C20:C22, C45:C46, C66:C67, and production notes at B51.
 * IMPORTANT: source sheet already states "Aumentato prezzi del 4,5% dal 01-03-2026".
 * Do not add another 4.5%. Source workbook has NO price formulas; use lookup.
 * Never execute embedded VBA macros.
 */
export type TKind = "standard" | "misura" | "zanca";
export type TPosition = "centrale" | "decentrato";
export type TPriceRow = {
  collo: number;
  code?: string;
  centralCode?: string;
  decentralizedCode?: string;
  prices: (number | null)[];
};
export const TIERS = [
  { min: 4, max: 10, label: "4–10" },
  { min: 11, max: 20, label: "11–20" },
  { min: 21, max: 30, label: "21–30" },
  { min: 31, max: 40, label: "31–40" },
  { min: 41, max: 60, label: "41–60" },
  { min: 61, max: 80, label: "61–80" },
  { min: 81, max: 100, label: "81–100" },
] as const;
export const PRICES: Record<TKind, TPriceRow[]> = {
  standard: [
    { collo:55, centralCode:"FBC00017AVIUGOFF", decentralizedCode:"VBC00017BPIUGOFF",prices:[6.934,5.734,4.8,4,3.334,2.801,2.4] },
    { collo:65, centralCode:"FBC00617AVIUGOFF",prices:[7.2,6,5.067,4.267,3.6,3.067,2.667] },
    { collo:75, centralCode:"FBC00717AVIUGOFF",prices:[7.467,6.267,5.334,4.533,3.866,3.334,2.933] },
    { collo:85, centralCode:"FBC00817AVIUGOFF",prices:[7.733,6.533,5.6,4.8,4.133,3.6,3.2] },
    { collo:95, centralCode:"FBC00917AVIUGOFF",prices:[8.001,6.8,5.867,5.067,4.4,3.866,3.466] },
  ],
  misura: [
    { collo:55,code:"VBC00017__IUGOFF",prices:[8.001,6.8,5.867,5.067,4.4,3.867,3.334] },
    { collo:65,code:"VBC00617__IUGOFF",prices:[8.267,7.066,6.133,5.334,4.667,4.133,3.6] },
    { collo:75,code:"VBC00717__IUGOFF",prices:[8.534,7.334,6.4,5.6,4.934,4.4,3.867] },
    { collo:85,code:"VBC00817__IUGOFF",prices:[8.8,7.6,6.667,5.867,5.2,4.667,4.133] },
    { collo:95,code:"VBC00917__IUGOFF",prices:[9.066,7.867,6.934,6.133,5.467,4.934,4.4] },
    { collo:105,code:"VBC01017__IUGOFF",prices:[9.333,8.133,7.2,6.4,5.734,5.2,4.667] },
    { collo:115,code:"VBC01117__IUGOFF",prices:[10.122,8.886,null,null,null,null,null] },
    { collo:125,code:"VBC01217__IUGOFF",prices:[10.933,9.66,null,null,null,null,null] },
    { collo:135,code:"VBC01317__IUGOFF",prices:[11.769,10.457,null,null,null,null,null] },
    { collo:145,code:"VBC01417__IUGOFF",prices:[12.63,11.28,null,null,null,null,null] },
    { collo:155,code:"VBC01517_IUGOFF",prices:[13.517,12.126,null,null,null,null,null] },
  ],
  zanca: [
    { collo:55,code:"VBC0017Z__IUGOFF",prices:[9.66,8.21,7.09,6.11,5.31,4.67,4.02] },
    { collo:65,code:"VBC0617Z__IUGOFF",prices:[9.98,8.54,7.41,6.44,5.63,5,4.35] },
    { collo:75,code:"VBC0717Z__IUGOFF",prices:[10.3,8.85,7.73,6.76,5.96,5.31,4.67] },
    { collo:85,code:"VBC0817Z__IUGOFF",prices:[10.63,9.18,8.05,7.09,6.28,5.63,5] },
    { collo:95,code:"VBC0917Z__IUGOFF",prices:[10.95,9.5,8.37,7.41,6.6,5.96,5.31] },
    { collo:105,code:"VBC1017Z__IUGOFF",prices:[11.27,9.82,8.69,7.73,6.93,6.28,5.63] },
    { collo:115,code:"VBC1117Z__IUGOFF",prices:[12.23,10.73,null,null,null,null,null] },
  ],
};
export type TRequest = {
  kind: TKind;
  quantity: number;
  collar: number;
  position: TPosition;
  diameterOther: boolean;
  reverseOffset: boolean;
  overlap: boolean;
  zancaLength: number;
  reinforcedApproved: boolean;
};
export type TResponse = {
  code: string;
  size: number;
  tier: string;
  base: number;
  additions: { description: string; euro: number }[];
  unit: number;
  total: number;
  notes: string[];
};
export function quoteBandellaT(r: TRequest): TResponse {
  if (!Number.isInteger(r.quantity) || r.quantity < 4 || r.quantity > 100)
    throw new Error("Listino valido esclusivamente per lotti da 4 a 100 pezzi. Richiedere quotazione manuale.");
  if (!Number.isFinite(r.collar) || r.collar <= 0)
    throw new Error("Indicare un collo D positivo (mm).");
  const rows = PRICES[r.kind];
  if (!rows) throw new Error("Tipologia non valida");
  if (r.collar < rows[0].collo || r.collar > rows[rows.length - 1].collo)
    throw new Error("Collo fuori dai valori tabellati per questa tipologia: preventivo da valutare.");
  const idx = TIERS.findIndex(t => r.quantity >= t.min && r.quantity <= t.max);
  if (idx < 0) throw new Error("Lotto non supportato");
  // Smallest configured collar in an exact halfway tie (no unlisted extrapolation).
  const row = rows.reduce((best, current) =>
    Math.abs(current.collo-r.collar) < Math.abs(best.collo-r.collar) ? current : best
  );
  const base = row.prices[idx];
  if (base === null || base === undefined)
    throw new Error("Per questo collo e lotto il listino non pubblica un prezzo: richiedere quotazione manuale.");
  let code = row.code ?? "";
  if (r.kind === "standard") {
    code = r.position === "centrale" ? row.centralCode ?? "" : row.decentralizedCode ?? "";
    if (!code)
      throw new Error("Occhio decentrato standard non codificato per questo collo. Selezionare 'decentrato a misura'.");
  }
  const additions: TResponse["additions"] = [];
  if (r.diameterOther) additions.push({ description:"Occhio diverso da Ø12", euro:3 });
  if (r.reverseOffset && r.kind === "standard" && r.position === "decentrato")
    additions.push({ description:"Decentratura al contrario", euro:1 });
  if (r.overlap) additions.push({ description:"Applicazione sormonto", euro:r.kind === "zanca" ? 2 : 2.5 });
  if (r.reinforcedApproved && r.kind === "zanca" && r.zancaLength > 35)
    additions.push({description:"Rinforzo/spessore maggiorato concordato", euro:2});
  const notes: string[] = [];
  if (r.collar !== row.collo) notes.push("Collo richiesto "+r.collar+" mm, arrotondato al valore più vicino: "+row.collo+" mm.");
  if (r.kind === "standard") notes.push(r.position === "centrale" ? "Posizionamento centrale Z=2 mm." : "Decentratura standard Z=6 mm.");
  if (r.kind === "misura") notes.push("Posizionamento dell'occhio a disegno; completare codice variabile e quote prima dell'ordine.");
  if (r.kind === "zanca") {
    notes.push("Verificare a disegno la zancatura a filo e il codice variabile.");
    if (r.zancaLength > 35 && !r.reinforcedApproved)
      notes.push("Zanca a filo oltre 35 mm: valutare necessità di rinforzo/spessore maggiorato. L'eventuale supplemento netto di 2 €/pz NON è incluso senza conferma.");
  }
  const unit = Math.round((base+additions.reduce((sum,a)=>sum+a.euro,0))*1000)/1000;
  return { code,size:row.collo,tier:TIERS[idx].label,base,additions,unit,total:Math.round(unit*r.quantity*1000)/1000,notes };
}
