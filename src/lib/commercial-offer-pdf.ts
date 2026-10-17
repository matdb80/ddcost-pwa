import {
  calculateOfferLotPrice,
  cycleForOfferRow,
  offerLotTerms,
  offerLotsForRow,
  simulationsForOfferRow,
  selectedOfferLots,
  type CommercialOfferRow,
} from "./commercial-offer-pricing";

export type OfferPrintMode = "internal" | "customer";
export type CustomerPricePresentation = "netto" | "listino_sconto";
export type CommercialOfferPrintDocument = {
  id?: number;
  nome?: string;
  cliente?: string;
  riferimento?: string;
  note?: string;
  note_cliente?: string;
  righe: CommercialOfferRow[];
};

const COST_CATEGORIES = [
  ["COMPONENTE/ASSIEME", "Componenti / assiemi"],
  ["COMPONENTE", "Componenti"],
  ["MATERIA PRIMA DA TRASFORMARE", "Materia prima"],
  ["LAVORAZIONE INTERNA", "Lavorazioni interne"],
  ["LAVORAZIONE A PESO", "Lavorazioni a peso"],
  ["LAVORAZIONE A PEZZO", "Lavorazioni a pezzo"],
  ["LAVORAZIONE TERZISTA A PESO", "Terzisti a peso"],
  ["LAVORAZIONE TERZISTA A PEZZO", "Terzisti a pezzo"],
  ["SPESA ATTREZZATURA DEDICATA", "Attrezzature dedicate"],
] as const;

const COMPANY = {
  name: "DIDIEFFE GROUP srl",
  address: "Zona Artigianale Pradenich 2/a · 32030 Cesiomaggiore (BL) · Italia",
  vat: "P. IVA / C.F. 00815760251",
  registry: "Registro Imprese BL 00815760251 · REA Belluno 73363",
  phone: "+39 0439 438244",
  email: "info@didieffe.com",
};

export function buildCommercialOfferPrintHtml(
  offer: CommercialOfferPrintDocument,
  mode: OfferPrintMode,
  pricePresentation: CustomerPricePresentation = "netto",
  logoUrl = "/images/ddf-logo.png",
): string {
  const internal = mode === "internal";
  const title = internal ? "Analisi interna dell’offerta" : "Offerta commerciale";
  const client = escapeHtml(offer.cliente || "");
  const reference = escapeHtml(offer.riferimento || "");
  const offerName = escapeHtml(offer.nome || "Offerta commerciale");
  const rows = Array.isArray(offer.righe) ? offer.righe : [];
  const body = internal
    ? rows.map((row, index) => internalProductSection(row, index)).join("")
    : customerOfferTable(rows, pricePresentation);
  const noteSection = (heading: string, raw: unknown) => {
    const note = String(raw ?? "").trim();
    return note ? `<section class="notes"><h2>${heading}</h2><p>${escapeHtml(note).replace(/\n/g, "<br>")}</p></section>` : "";
  };
  const noteBlock = internal
    ? noteSection("Note interne", offer.note) + noteSection("Note da mostrare al cliente", offer.note_cliente)
    : noteSection("Note", offer.note_cliente);
  const companyDetails = [COMPANY.address, COMPANY.vat, COMPANY.registry, COMPANY.phone, COMPANY.email]
    .map((line) => `<div>${escapeHtml(line)}</div>`).join("");

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · ${offerName}</title>
<style>
  @page { size: A4 ${internal ? "landscape" : "portrait"}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #202a30; font: 9pt/1.38 Arial, Helvetica, sans-serif; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #464f56; padding-bottom: 10px; margin-bottom: 14px; }
  header img { width: 46mm; max-height: 28mm; object-fit: contain; }
  .company { text-align: right; font-size: 8pt; line-height: 1.45; }
  .company strong { display: block; font-size: 12pt; color: #303a40; margin-bottom: 2px; }
  h1 { font-size: 17pt; margin: 0 0 8px; color: #303a40; }
  h2 { font-size: 11pt; margin: 12px 0 6px; color: #303a40; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 18px; padding: 8px 10px; border: 1px solid #cbd1d5; border-radius: 4px; margin: 10px 0 14px; }
  .meta b { color: #58636a; font-size: 8pt; display: block; }
  .product { page-break-before: auto; margin: 14px 0 18px; }
  .product + .product { page-break-before: always; }
  .product-heading { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; border-bottom: 1px solid #ccd2d6; padding-bottom: 5px; }
  .product-heading h2 { margin: 0; font-size: 13pt; }
  .muted { color: #647078; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; table-layout: auto; }
  th, td { border: 1px solid #cbd1d5; padding: 4px 5px; vertical-align: top; }
  th { background: #edf0f2; font-weight: 700; text-align: left; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .cost-matrix { font-size: 7pt; }
  .cost-matrix th:first-child { width: 29%; }
  .cost-matrix td { text-align: right; white-space: nowrap; }
  .cost-matrix tr.total td, .cost-matrix tr.total th { background: #e8edef; font-weight: 700; }
  .source-lines { font-size: 7.3pt; }
  .source-lines th, .source-lines td { padding: 3px 4px; }
  .page-break { page-break-before: always; }
  .customer-lines { font-size: 10pt; margin-top: 20px; }
  .customer-lines td { padding: 8px; }
  .customer-total { text-align: right; font-size: 13pt; margin-top: 14px; font-weight: 700; }
  .notes { margin-top: 18px; border-top: 1px solid #cbd1d5; padding-top: 8px; }
  .footnote { font-size: 7.5pt; color: #647078; margin-top: 12px; }
  .nowrap { white-space: nowrap; }
  @media screen { body { padding: 18px; max-width: 1100px; margin: 0 auto; } }
</style></head><body>
<header><img src="${escapeAttribute(logoUrl)}" alt="DDF Didieffe Group"><div class="company"><strong>${COMPANY.name}</strong>${companyDetails}</div></header>
<h1>${title}</h1>
<section class="meta"><div><b>Numero offerta</b>${offerName}${offer.id ? ` · #${offer.id}` : ""}</div><div><b>Data</b>${new Date().toLocaleDateString("it-IT")}</div><div><b>Cliente</b>${client || "—"}</div><div><b>Riferimento</b>${reference || "—"}</div></section>
${body}${noteBlock}
<div class="footnote">Documento generato da DDCost · ${internal ? "Uso interno: contiene dati economici e tecnici riservati." : "Importi espressi in Euro."}</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});</script>
</body></html>`;
}

export function openCommercialOfferPrintWindow(html: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Il browser ha bloccato la finestra di stampa. Abilitare i popup e riprovare.");
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function internalProductSection(row: CommercialOfferRow, index: number): string {
  const cycle = cycleForOfferRow(row);
  const code = escapeHtml(String(row.codice ?? ""));
  const description = escapeHtml(String(row.descrizione ?? ""));
  const offeredLots = selectedOfferLots(row).map(formatNumber).join(" · ") || "nessuno";
  const heading = `<div class="product-heading"><h2>${index + 1}. ${code || "Prodotto"} · ${description}</h2><span class="muted">Lotti offerti: ${offeredLots} pz · rev. ${escapeHtml(String(row.rev ?? "—"))}</span></div>`;
  if (!cycle) return `<section class="product">${heading}<p class="muted">Questa riga non contiene uno snapshot di un Ciclo Standard; sono riportati solo i dati commerciali salvati.</p>${storedOfferSummary(row)}</section>`;

  const simulations = simulationsForOfferRow(row);
  const markup = percentValue(row.ricarico_costi_fissi_pct, cycle.ricarico_spese * 100);
  const margin = percentValue(row.margine_netto_desiderato_pct, cycle.margine_minimo * 100);
  const cycleDetails = `<p class="muted">Ciclo ${escapeHtml(cycle.codice)} · revisione ${escapeHtml(String(cycle.rev ?? row.rev ?? 1))} · lotto base ${escapeHtml(String(cycle.lotto || "—"))} · costo lavoro € ${money(cycle.costo_lavoro_min)}/min · ricarico spese del ciclo ${money(cycle.ricarico_spese * 100)}% · margine minimo del ciclo ${money(cycle.margine_minimo * 100)}%.</p>`;
  const pricingDetails = `<p>Parametri offerta: ricarico costi ${money(markup)}% · margine netto desiderato ${money(margin)}% · lotti selezionati ${offeredLots} pz.</p>`;
  const allLots = offerLotsForRow(row).map((lot) => calculateOfferLotPrice(row, lot).simulation);
  const groups = chunk(allLots.length ? allLots : simulations, 5);
  const tables = groups.map((group, groupIndex) => costMatrix(row, group, groupIndex, groups.length)).join("");
  const sourceLines = sourceCycleLines(cycle.righe);
  return `<section class="product">${heading}${cycleDetails}${pricingDetails}<p class="footnote">Le voci per categoria compongono il costo industriale standard. Le quote fisse e variabili sono una ripartizione analitica dello stesso costo e non vanno sommate di nuovo.</p><h3>Costi e prezzi per tutti i lotti del ciclo e dell’offerta</h3>${tables}<h3 class="page-break">Riferimenti tecnici e costi unitari salvati nel ciclo</h3>${sourceLines}${cycle.note_generali ? `<p><b>Note del ciclo:</b> ${escapeHtml(cycle.note_generali)}</p>` : ""}</section>`;
}

function costMatrix(
  offerRow: CommercialOfferRow,
  simulations: ReturnType<typeof simulationsForOfferRow>,
  groupIndex: number,
  groupCount: number,
): string {
  const headers = simulations.map((simulation) => `<th class="num">${formatNumber(simulation.lotto)} pz</th>`).join("");
  const row = (label: string, getValue: (simulation: SimulationsItem) => unknown, total = false) =>
    `<tr${total ? ` class="total"` : ""}><th>${label}</th>${simulations.map((simulation) => `<td>${money(getValue(simulation))}</td>`).join("")}</tr>`;
  const standardRow = row("Costo industriale standard €/pz", (simulation) => simulation.costo_standard, true);
  const rows = COST_CATEGORIES.map(([category, label]) => row(label, (simulation) => simulation.breakdown?.[category] ?? 0)).join("");
  const setup = row("Quota attrezzaggio €/pz", (simulation) => simulation.attrezzaggio_pz);
  const fixed = row("Costi fissi ammortizzati €/pz", (simulation) => calculateOfferLotPrice(offerRow, Number(simulation.lotto)).fixedCostPerPiece);
  const variable = row("Costi variabili €/pz", (simulation) => calculateOfferLotPrice(offerRow, Number(simulation.lotto)).variableCostPerPiece);
  const full = row("Costo pieno offerta €/pz", (simulation) => calculateOfferLotPrice(offerRow, Number(simulation.lotto)).fullCost, true);
  const net = row("Prezzo netto proposto €/pz", (simulation) => calculateOfferLotPrice(offerRow, Number(simulation.lotto)).netPrice, true);
  const cycleFull = row("Full cost ciclo €/pz", (simulation) => simulation.full_cost);
  const cycleMin = row("Prezzo minimo ciclo €/pz", (simulation) => simulation.prezzo_minimo);
  return `<p class="muted">Lotti ${groupIndex * 5 + 1}–${Math.min(groupIndex * 5 + simulations.length, groupIndex * 5 + 5)}${groupCount > 1 ? ` · tabella ${groupIndex + 1}/${groupCount}` : ""}</p><table class="cost-matrix"><thead><tr><th>Voce di costo / prezzo</th>${headers}</tr></thead><tbody>${rows}${setup}${fixed}${variable}${standardRow}${cycleFull}${cycleMin}${full}${net}</tbody></table>`;
}

type SimulationsItem = ReturnType<typeof simulationsForOfferRow>[number];

function sourceCycleLines(lines: CicloRow[]): string {
  if (!lines.length) return `<p class="muted">Il ciclo non contiene righe tecniche.</p>`;
  const materialRows = lines.map((line) => `<tr>
    <td>${escapeHtml(String(line.categoria ?? ""))}</td><td>${escapeHtml(String(line.codice_articolo ?? ""))}</td>
    <td>${escapeHtml(String(line.descrizione ?? ""))}</td><td>${escapeHtml([line.tipo_materiale, line.tipo_materia_prima].filter(Boolean).join(" / "))}</td>
    <td>${escapeHtml(dimensions(line))}</td><td class="num">${formatNumber(line.nr_componenti)}</td>
    <td class="num">${formatNumber(line.peso_kg)}</td><td class="num">${formatNumber(line.sfrido)}%</td>
    <td>${escapeHtml(String(line.fornitore ?? ""))}</td><td>${escapeHtml(String(line.note ?? ""))}</td>
    <td>${line.considera === false ? "Esclusa" : "Inclusa"}</td>
  </tr>`).join("");
  const costRows = lines.map((line) => `<tr>
    <td>${escapeHtml(String(line.categoria ?? ""))}</td><td>${escapeHtml(String(line.codice_articolo ?? ""))}</td>
    <td>${escapeHtml(String(line.descrizione ?? ""))}</td><td class="num">${formatNumber(line.nr_componenti)}</td>
    <td class="num">€ ${money(line.costo_unitario)}</td><td class="num">€ ${money(line.costo_min)}</td>
    <td class="num">${formatNumber(line.colpi_min)}</td><td class="num">${formatNumber(line.attrezzaggio_min)}</td>
    <td class="num">${formatNumber(line.lotto_voce)}</td><td>${escapeHtml(String(line.fornitore ?? ""))}
    <td>${line.considera === false ? "Esclusa" : "Inclusa"}</td>
  </tr>`).join("");
  return `<h4>Articoli, materiali e riferimenti tecnici</h4><table class="source-lines"><thead><tr><th>Categoria</th><th>Codice</th><th>Descrizione</th><th>Materiale / materia prima</th><th>Dimensioni mm (L×W×S / Ø)</th><th class="num">Qtà</th><th class="num">Peso kg</th><th class="num">Sfrido</th><th>Fornitore</th><th>Note riga</th><th>Nel costo</th></tr></thead><tbody>${materialRows}</tbody></table>
  <h4>Costi unitari, lavorazioni e attrezzaggi</h4><table class="source-lines"><thead><tr><th>Categoria</th><th>Codice</th><th>Descrizione</th><th class="num">Qtà</th><th class="num">Costo unit. €</th><th class="num">Costo min. €</th><th class="num">Pezzi/min</th><th class="num">Setup min</th><th class="num">Lotto voce</th><th>Fornitore</th><th>Nel costo</th></tr></thead><tbody>${costRows}</tbody></table>`;
}

function customerOfferTable(rows: CommercialOfferRow[], presentation: CustomerPricePresentation): string {
  const expanded = rows.flatMap((row, index) => {
    const selectedLots = selectedOfferLots(row);
    const lots = selectedLots.length ? selectedLots : [positiveNumber(row.lotto) ?? 0];
    return lots.map((lot) => ({ row, index, lot }));
  });
  const lines = expanded.map(({ row, index, lot }) => {
    const code = escapeHtml(String(row.codice ?? ""));
    const description = escapeHtml(String(row.descrizione ?? ""));
    let unitNet: number;
    let priceCell: string;
    if (presentation === "listino_sconto") {
      const listPrice = number(offerLotTerms(row, lot).listino);
      const discount = discountText(row);
      const factor = discountFactor(discount);
      unitNet = roundCurrency(listPrice * factor);
      priceCell = `<div>Listino: € ${money(listPrice)}</div><div>Sconto: ${escapeHtml(discount || "—")}</div><div class="muted">Netto unitario: € ${money(unitNet)}</div>`;
    } else {
      try { unitNet = roundCurrency(calculateOfferLotPrice(row, lot).netPrice); }
      catch { unitNet = number(row.prezzo_netto_proposto ?? row.netto ?? row.netto_base); }
      priceCell = `<div>Prezzo netto unitario: <strong>€ ${money(unitNet)}</strong></div>`;
    }
    return `<tr><td>${index + 1}</td><td><strong>${code}</strong><br>${description}</td><td class="num">${formatNumber(lot)} pz</td><td>${priceCell}</td><td class="num">€ ${money(unitNet * lot)}</td></tr>`;
  }).join("");
  const hasAlternativeQuantities = rows.some((row) => selectedOfferLots(row).length > 1);
  const total = hasAlternativeQuantities ? null : expanded.reduce((sum, { row, lot }) => {
    if (presentation === "listino_sconto") return sum + roundCurrency(number(offerLotTerms(row, lot).listino) * discountFactor(discountText(row))) * lot;
    try { return sum + roundCurrency(calculateOfferLotPrice(row, lot).netPrice) * lot; }
    catch { return sum + number(row.prezzo_netto_proposto ?? row.netto ?? row.netto_base) * lot; }
  }, 0);
  const totalBlock = total == null
    ? `<p class="footnote">Le quantità indicate sono alternative. Il totale è riportato per ciascun lotto.</p>`
    : `<div class="customer-total">Totale netto offerta: € ${money(total)}</div>`;
  return `<table class="customer-lines"><thead><tr><th>#</th><th>Prodotto</th><th class="num">Lotto</th><th>${presentation === "netto" ? "Prezzo" : "Listino e sconto"}</th><th class="num">Totale netto</th></tr></thead><tbody>${lines}</tbody></table>${totalBlock}`;
}

function storedOfferSummary(row: CommercialOfferRow): string {
  const list = number(row.listino);
  const discount = discountText(row);
  let net = number(row.netto);
  try { net = list * discountFactor(discount); } catch { /* Keep historical stored net. */ }
  return `<p>Lotto: ${formatNumber(row.lotto)} pz · Listino: € ${money(list)} · Sconto: ${escapeHtml(discount || "—")} · Netto unitario: € ${money(net)}</p>`;
}

function discountText(row: CommercialOfferRow): string {
  const base = String(row.sconto_base ?? "").trim();
  const extra = number(row.extra);
  return base + (extra > 0 ? (base ? "+" : "") + formatNumber(extra) + "%" : "");
}

function discountFactor(raw: string): number {
  const parts = raw.replace(/\s|%/g, "").split("+").filter(Boolean);
  if (!parts.length) return 1;
  return parts.reduce((factor, part) => {
    const value = Number(part.replace(",", "."));
    return Number.isFinite(value) && value >= 0 && value < 100 ? factor * (1 - value / 100) : factor;
  }, 1);
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function escapeAttribute(value: unknown): string { return escapeHtml(value); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function positiveNumber(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function percentValue(value: unknown, fallback: number): number { const parsed = Number(value); return value == null || value === "" || !Number.isFinite(parsed) ? fallback : parsed; }
function money(value: unknown): string { return number(value).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatNumber(value: unknown): string { return number(value).toLocaleString("it-IT", { maximumFractionDigits: 2 }); }
function roundCurrency(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

type CicloRow = {
  categoria?: string; codice_articolo?: string; descrizione?: string;
  tipo_materiale?: string; tipo_materia_prima?: string;
  lunghezza?: number; larghezza?: number; spessore?: number; diametro?: number;
  nr_componenti?: number; costo_unitario?: number; costo_min?: number; peso_kg?: number; sfrido?: number;
  colpi_min?: number; attrezzaggio_min?: number; lotto_voce?: number;
  fornitore?: string; note?: string; considera?: boolean | null;
};

function dimensions(line: CicloRow): string {
  const values = [line.lunghezza, line.larghezza, line.spessore].map((value) => Number(value) || 0);
  const dims = values.some(Boolean) ? values.join(" × ") : "";
  const diameter = Number(line.diametro) > 0 ? `Ø ${formatNumber(line.diametro)}` : "";
  return [dims, diameter].filter(Boolean).join(" · ");
}
