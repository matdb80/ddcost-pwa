import { ralPrintSwatch } from "./ral-print-swatch";
import {
  quotePrintLabels,
  printLocale,
  type PrintLanguage,
} from "./quote-print-language";
import { refreshQuoteSeriesRal } from "./quote-series-ral-refresh";
import { seriesDiscount } from "./series-discount";
import { ralPrintSummary } from "./ral-print-summary";
import { isSeries, isFixedPrice } from "./quote-series";
import {
  documentProductCode,
  documentProductDescription,
} from "./document-product-fields";
import { isForfait } from "./quote-forfait";
import type { Product, QuoteDocument } from "./quote-calculation";
import { quoteDocumentNumber } from "./commercial-offer-number";
import {
  documentPrintColor,
  documentPrintFinish,
} from "./document-print-color";

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
  options: { hideDocumentTotal?: boolean; revision?: number | null } = {}
): string {
  quote = refreshQuoteSeriesRal(quote);
  // The selected database row takes precedence over an older JSON snapshot.
  const rawRevision = options.revision ?? quote.rev;
  const revision =
    (typeof rawRevision === "number" || typeof rawRevision === "string") &&
    Number.isSafeInteger(Number(rawRevision)) && Number(rawRevision) > 0
      ? String(Number(rawRevision)) : "—";
  const language: PrintLanguage = quote.pdf_in_inglese === true ? "en" : "it",
    t = quotePrintLabels(language),
    locale = printLocale(language);
  const money = (value: unknown) =>
    number(value).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const formatNumber = (value: unknown) =>
    number(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  const colorLabel = documentPrintColor(quote, language);
  const swatch = ralPrintSwatch(/RAL (\d{4})/.exec(colorLabel)?.[1] ?? "");
  const specialMark = '<strong class="special-product">*</strong>';
  const products = Array.isArray(quote.prodotti)
    ? (quote.prodotti as Product[])
    : [];
  const ral =
    products.some(p => !isForfait(p)) &&
    (quote.verniciatura_ral || quote.ral_consolidato)
      ? quote.ral_riepilogo
      : null;
  const rows = products
    .map((product, index) => {
      if (isForfait(product))
        return `<tr><td class="num">${index + 1}</td><td colspan="3">${specialMark} ${escapeHtml(product.descrizione)}<br><strong>${t.forfait}</strong></td><td class="num">€ ${money(product.valore_forfait)}</td></tr>`;
      const code = documentProductCode(product, quote);
      const description = documentProductDescription(product, language);
      const productName = isSeries(product)
        ? [
            code ? `<strong>${escapeHtml(code)}</strong>` : "",
            escapeHtml(description),
          ]
            .filter(Boolean)
            .join(" · ")
        : code
          ? `<strong class="special-product">* ${escapeHtml(code)}</strong> · ${escapeHtml(description)}`
          : `${specialMark} ${escapeHtml(description)}`;
      const quantity = number(product.quantita);
      const unitPrice = number(
        product.prezzo_netto_unitario_finale ?? product.prezzo_netto_unitario
      );
      const lineTotal = number(
        product.totale_finale ?? product.totale ?? unitPrice * quantity
      );
      const discount = isSeries(product)
        ? seriesDiscount(product.sconto_serie).label
        : "";
      const priceDetails = discount
        ? `<div>${t.unitPrice}: € ${money(product.prezzo_serie)}</div><div>${t.discount}: ${escapeHtml(discount)}</div><div>${t.netPrice}${ral ? t.withRal : ""}: <strong>€ ${unitPrice.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong></div>`
        : null;
      return `<tr><td class="num">${index + 1}</td><td>${productName || t.product}${isSeries(product) && !ral ? "" : `<br><strong>${t.color}: ${escapeHtml(documentPrintFinish(quote, product, language))}</strong>${swatch}`}</td><td class="num">${formatNumber(quantity)} ${t.pieces}</td><td class="num">${priceDetails ?? "€ " + (ral ? unitPrice.toLocaleString(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : money(unitPrice))}</td><td class="num">€ ${money(lineTotal)}</td></tr>`;
    })
    .join("");
  const storedTotal = quote.totale_finale ?? quote.totale;
  const total =
    storedTotal == null
      ? products.reduce(
          (sum, product) =>
            sum + number(product.totale_finale ?? product.totale),
          0
        )
      : number(storedTotal);
  const totalBlock = options.hideDocumentTotal
    ? ""
    : `<div class="total">${t.total}: € ${money(total)}</div>`;
  const client = escapeHtml(quote.cliente || "");
  const reference = escapeHtml(quote.riferimento_preventivo || "");
  const enteredTitle = String(quote.titolo_preventivo ?? "").trim();
  const title = escapeHtml(
    !enteredTitle ||
      (language === "en" && /^preventivo una\s*tantum$/i.test(enteredTitle))
      ? t.title
      : enteredTitle
  );
  const clientNotes = String(quote.note_cliente ?? "").trim();
  const companyDetails = [
    COMPANY.address.replace(/Italia$/, t.country),
    COMPANY.vat.replace("P. IVA / C.F.", t.vat),
    COMPANY.registry.replace("Registro Imprese BL", t.registry),
    COMPANY.phone,
    COMPANY.email,
  ]
    .map(line => `<div>${escapeHtml(line)}</div>`)
    .join("");
  const noteBlock = clientNotes
    ? `<section class="notes"><h2>${t.notes}</h2><p>${escapeHtml(clientNotes).replace(/\r?\n/g, "<br>")}</p></section>`
    : "";

  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
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
  .quote-revision { white-space: nowrap; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd1d5; padding: 8px; vertical-align: top; }
  th { background: #edf0f2; font-weight: 700; text-align: left; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .special-product { color: #005eb8; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .special-legend { margin-top: 20px; padding-top: 8px; border-top: 1px solid #cbd1d5; font-size: 9pt; break-inside: avoid; }
  .total { text-align: right; font-size: 14pt; font-weight: 700; margin-top: 16px; }
  .notes { margin-top: 22px; border-top: 1px solid #cbd1d5; padding-top: 8px; }
  .notes h2 { margin-top: 6px; }
  @media screen { body { padding: 18px; max-width: 900px; margin: 0 auto; } }
</style></head><body>
<header><img src="${escapeAttribute(logoUrl)}" alt="DDF Didieffe Group"><div class="company"><strong>${COMPANY.name}</strong>${companyDetails}</div></header>
<h1>${title}</h1>
<section class="meta">
  <div><b>${t.number}</b>${escapeHtml(quoteDocumentNumber(quote) ?? (quoteId ? String(quoteId) : "—"))} <span class="quote-revision">— ${t.revision} ${revision}</span></div>
  <div><b>${t.date}</b>${new Date().toLocaleDateString(locale)}</div>
  <div><b>${t.client}</b>${client || "—"}</div>
  <div><b>${t.reference}</b>${reference || "—"}</div>
  ${products.some(p => !isFixedPrice(p)) || ral ? `<div><b>${t.color}</b><strong>${escapeHtml(colorLabel)}</strong>${swatch}</div>` : ""}
</section>
<h2>${t.products}</h2>
<table><thead><tr><th class="num">#</th><th>${t.product}</th><th class="num">${t.quantity}</th><th class="num">${t.netUnitPrice}</th><th class="num">${t.netTotal}</th></tr></thead><tbody>${rows}</tbody></table>
${ralPrintSummary(ral, undefined, false, language)}
${totalBlock}
${noteBlock}
${products.some(p => !isSeries(p)) ? `<footer class="special-legend">${specialMark} ${t.special}</footer>` : ""}
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});</script>
</body></html>`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value);
}
function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
