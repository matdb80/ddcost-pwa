import type {Product, QuoteDocument} from "./quote-calculation";

const COMPANY = {
  name: "DIDIEFFE GROUP srl",
  address: "Zona Artigianale Pradenich 2/a · 32030 Cesiomaggiore (BL) · Italia",
  vat: "P. IVA / C.F. 00815760251",
  registry: "Registro Imprese BL 00815760251 · REA Belluno 73363",
  phone: "+39 0439 438244",
  email: "info@didieffe.com",
};

/** Customer copy for a one-time quote. Only client-facing fields are read. */
export function buildOneTimeQuotePrintHtml(
  quote: QuoteDocument,
  quoteId?: number,
  logoUrl = "/images/ddf-logo.png",
  options: { hideDocumentTotal?: boolean } = {},
): string {
  const products = Array.isArray(quote.prodotti) ? quote.prodotti as Product[] : [];
  const rows = products.map((product, index) => {
    const code = String(product.codice ?? "").trim();
    const description = String(product.descrizione ?? "").trim();
    const productName = [code, description].filter(Boolean).map(escapeHtml).join(" · ");
    const quantity = number(product.quantita);
    const unitPrice = number(product.prezzo_netto_unitario_finale ?? product.prezzo_netto_unitario);
    const lineTotal = number(product.totale_finale ?? product.totale ?? unitPrice * quantity);
    return `<tr><td class="num">${index + 1}</td><td>${productName || "Prodotto"}</td><td class="num">${formatNumber(quantity)} pz</td><td class="num">€ ${money(unitPrice)}</td><td class="num">€ ${money(lineTotal)}</td></tr>`;
  }).join("");
  const storedTotal = quote.totale_finale ?? quote.totale;
  const total = storedTotal == null
    ? products.reduce((sum, product) => sum + number(product.totale_finale ?? product.totale), 0)
    : number(storedTotal);
  const totalBlock = options.hideDocumentTotal
    ? ""
    : `<div class="total">Totale netto preventivo: € ${money(total)}</div>`;
  const client = escapeHtml(quote.cliente || "");
  const reference = escapeHtml(quote.riferimento_preventivo || "");
  const title = escapeHtml(quote.titolo_preventivo || "Preventivo una tantum");
  const clientNotes = String(quote.note_cliente ?? "").trim();
  const companyDetails = [COMPANY.address, COMPANY.vat, COMPANY.registry, COMPANY.phone, COMPANY.email]
    .map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  const noteBlock = clientNotes
    ? `<section class="notes"><h2>Note</h2><p>${escapeHtml(clientNotes).replace(/\r?\n/g, "<br>")}</p></section>`
    : "";

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #202a30; font: 10pt/1.45 Arial, Helvetica, sans-serif; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #464f56; padding-bottom: 10px; margin-bottom: 20px; }
  header img { width: 46mm; max-height: 28mm; object-fit: contain; }
  .company { text-align: right; font-size: 8pt; line-height: 1.45; }
  .company strong { display: block; font-size: 12pt; color: #303a40; margin-bottom: 2px; }
  h1 { font-size: 19pt; margin: 0 0 8px; color: #303a40; }
  h2 { font-size: 11pt; margin: 18px 0 8px; color: #303a40; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 18px; padding: 10px 12px; border: 1px solid #cbd1d5; border-radius: 4px; margin: 12px 0 20px; }
  .meta b { color: #58636a; font-size: 8pt; display: block; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; }
  th, td { border: 1px solid #cbd1d5; padding: 8px; vertical-align: top; }
  th { background: #edf0f2; font-weight: 700; text-align: left; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .total { text-align: right; font-size: 14pt; font-weight: 700; margin-top: 16px; }
  .notes { margin-top: 22px; border-top: 1px solid #cbd1d5; padding-top: 8px; }
  .notes h2 { margin-top: 6px; }
  @media screen { body { padding: 18px; max-width: 900px; margin: 0 auto; } }
</style></head><body>
<header><img src="${escapeAttribute(logoUrl)}" alt="DDF Didieffe Group"><div class="company"><strong>${COMPANY.name}</strong>${companyDetails}</div></header>
<h1>${title}</h1>
<section class="meta">
  <div><b>Numero preventivo</b>${quoteId ? String(quoteId) : "—"}</div>
  <div><b>Data</b>${new Date().toLocaleDateString("it-IT")}</div>
  <div><b>Cliente</b>${client || "—"}</div>
  <div><b>Riferimento</b>${reference || "—"}</div>
</section>
<h2>Prodotti e prezzi netti</h2>
<table><thead><tr><th class="num">#</th><th>Prodotto</th><th class="num">Quantità</th><th class="num">Prezzo netto unitario</th><th class="num">Totale netto</th></tr></thead><tbody>${rows}</tbody></table>
${totalBlock}
${noteBlock}
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});</script>
</body></html>`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function escapeAttribute(value: unknown): string { return escapeHtml(value); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function money(value: unknown): string {
  return number(value).toLocaleString("it-IT", {minimumFractionDigits:2, maximumFractionDigits:2});
}
function formatNumber(value: unknown): string { return number(value).toLocaleString("it-IT", {maximumFractionDigits:2}); }
