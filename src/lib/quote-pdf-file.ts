/**
 * R3 (TKT-20261117-84210001): genera il VERO file PDF del preventivo
 * (bytes application/pdf) per la condivisione — Web Share API con file dove
 * supportata, download + mailto altrove.
 *
 * Il documento riproduce la copia cliente di quote-pdf.ts (stessa lingua,
 * revisione, colori, finiture, riepilogo RAL, note tradotte, scelta di
 * nascondere il totale) e accoda UNA SOLA VOLTA la pagina delle condizioni
 * di vendita: solo il testo ufficiale bilingue (sale-conditions-text.ts),
 * senza intestazioni o grafiche di listino.
 * Per gli ordini con imponibile inferiore a 150 € aggiunge il contributo
 * "spese di evasione" di 15 € una tantum (quote-sale-conditions.ts).
 *
 * Generatore interno senza dipendenze: PDF 1.4 classico, font Helvetica con
 * codifica WinAnsi, flussi non compressi per restare ispezionabili.
 */
import {
  quotePrintLabels,
  printLocale,
  translateClientNotes,
  type PrintLanguage,
} from "./quote-print-language";
import { refreshQuoteSeriesRal } from "./quote-series-ral-refresh";
import { seriesDiscount } from "./series-discount";
import {
  documentProductCode,
  documentProductDescription,
} from "./document-product-fields";
import { isSeries, isFixedPrice } from "./quote-series";
import { isForfait } from "./quote-forfait";
import type { Product, QuoteDocument } from "./quote-calculation";
import { italianOfferYear, quoteDocumentNumber } from "./commercial-offer-number";
import { documentPrintColor, documentPrintFinish } from "./document-print-color";
import { ralColors } from "./ral-pricing";
import { RAL_FAMILY_NAMES, RAL_FAMILY_NAMES_EN } from "./ral-print-summary";
import { saleConditionsLabels, visibleContribution } from "./quote-sale-conditions";
import { SALE_CONDITIONS_TITLE, SALE_CONDITIONS_SECTIONS, SALE_CONDITIONS_CLOSING } from "./sale-conditions-text";
import { QUOTE_LOGO_JPEG_BASE64, QUOTE_LOGO_WIDTH, QUOTE_LOGO_HEIGHT } from "./ddf-logo-asset";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

const COMPANY = {
  name: "DIDIEFFE GROUP srl",
  address: "Zona Artigianale Pradenich 2/a · 32030 Cesiomaggiore (BL) · Italia",
  vat: "P. IVA / C.F. 00815760251",
  registry: "Registro Imprese BL 00815760251 · REA Belluno 73363",
  phone: "+39 0439 438244",
  email: "info@didieffe.com",
};

/** Blu dei prodotti speciali: #005eb8, come `.special-product` della stampa. */
const SPECIAL_BLUE = "0 0.369 0.722 rg";

/**
 * Mappa il testo su WinAnsi (cp1252). Passano i caratteri Latin-1
 * (U+00A0–U+00FF: ü, ñ, Ø, å…) perché in WinAnsi hanno lo stesso codice;
 * la punteggiatura tipografica oltre U+00FF è mappata a mano.
 * Solo ciò che WinAnsi non può rappresentare diventa "?".
 */
function cp1252(text: string): string {
  const map: Record<string, string> = {
    "€": "\x80", "‚": "\x82", "ƒ": "\x83", "„": "\x84", "…": "\x85",
    "†": "\x86", "‡": "\x87", "ˆ": "\x88", "‰": "\x89", "Š": "\x8A",
    "‹": "\x8B", "Œ": "\x8C", "Ž": "\x8E", "‘": "\x91", "’": "\x92",
    "“": "\x93", "”": "\x94", "•": "\x95", "–": "\x96", "—": "\x97",
    "˜": "\x98", "™": "\x99", "š": "\x9A", "›": "\x9B", "œ": "\x9C",
    "ž": "\x9E", "Ÿ": "\x9F",
  };
  return text.replace(/[^\x00-\x7F]/g, ch => {
    if (map[ch]) return map[ch];
    const code = ch.charCodeAt(0);
    if (code >= 0xa0 && code <= 0xff) return ch;
    return "?";
  });
}
const esc = (value: string) => cp1252(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Stima prudente della larghezza del testo in Helvetica (per il wrapping). */
function wrap(text: string, size: number, maxWidth: number, bold = false): string[] {
  const factor = bold ? 0.55 : 0.5;
  const maxChars = Math.max(8, Math.floor(maxWidth / (factor * size)));
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if ((current + " " + word).length <= maxChars) current += " " + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length ? lines : [""];
}

interface PdfPage { ops: string[] }

/** Riga di testo nella cella prodotto: grassetto e/o prefisso blu da evidenziare. */
interface ProductLine { text: string; bold?: boolean; specialPrefix?: string }

/** Pennello minimo: testo Helvetica/Helvetica-Bold, righe e rettangoli pieni. */
class Canvas {
  pages: PdfPage[] = [{ ops: [] }];
  y = MARGIN;
  private get ops() { return this.pages[this.pages.length - 1].ops; }
  /** y misurata dall'alto (margine incluso), convertita in coordinate PDF. */
  private py(yTop: number) { return PAGE_H - yTop; }
  text(x: number, yTop: number, value: string, opts: { size?: number; bold?: number | boolean; color?: string } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? "F2" : "F1";
    const color = opts.color ?? "0 g";
    this.ops.push(`BT ${color} /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${this.py(yTop).toFixed(2)} Tm (${esc(value)}) Tj ET`);
  }
  textRight(x: number, yTop: number, value: string, opts: { size?: number; bold?: boolean } = {}) {
    const size = opts.size ?? 10;
    const width = value.length * (opts.bold ? 0.55 : 0.5) * size;
    this.text(Math.max(MARGIN, x - width), yTop, value, opts);
  }
  /** Segmenti con stili diversi sulla stessa riga (es. «* CODICE» blu-grassetto + descrizione normale). */
  segments(x: number, yTop: number, parts: Array<{ text: string; bold?: boolean; color?: string }>, opts: { size?: number } = {}) {
    const size = opts.size ?? 10;
    let cursor = x;
    for (const part of parts) {
      if (!part.text) continue;
      this.text(cursor, yTop, part.text, { size, bold: part.bold, color: part.color });
      cursor += part.text.length * (part.bold ? 0.55 : 0.5) * size;
    }
  }
  rectFill(x: number, yTop: number, w: number, h: number, rgb: string) {
    this.ops.push(`${rgb} rg ${x.toFixed(2)} ${this.py(yTop + h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  }
  hline(yTop: number, x1 = MARGIN, x2 = PAGE_W - MARGIN, gray = 0.55) {
    this.ops.push(`${gray} G 0.7 w ${x1.toFixed(2)} ${this.py(yTop).toFixed(2)} m ${x2.toFixed(2)} ${this.py(yTop).toFixed(2)} l S 0 G`);
  }
  image(name: string, x: number, yTop: number, w: number, h: number) {
    this.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${this.py(yTop + h).toFixed(2)} cm /${name} Do Q`);
  }
  ensureSpace(height: number, onNewPage?: () => void) {
    if (this.y + height > PAGE_H - MARGIN) this.newPage(onNewPage);
  }
  newPage(onNewPage?: () => void) {
    this.pages.push({ ops: [] });
    this.y = MARGIN;
    onNewPage?.();
  }
}

function hexToRgb(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(((n >> 16) & 255) / 255).toFixed(3)} ${(((n >> 8) & 255) / 255).toFixed(3)} ${((n & 255) / 255).toFixed(3)}`;
}

export interface QuotePdfFile { bytes: Uint8Array; fileName: string }

/**
 * Costruisce il PDF del preventivo. `options.revision`/`hideDocumentTotal`
 * sono gli stessi della stampa: il documento condiviso è la stessa copia cliente.
 */
export function buildQuotePdfFile(
  quoteInput: QuoteDocument,
  quoteId?: number,
  options: {
    revision?: number | string | null;
    hideDocumentTotal?: boolean;
    /** Visibilità del contributo a totale nascosto (separata dal totale);
     * default: SHOW_CONTRIBUTION_WHEN_TOTAL_HIDDEN, in attesa della decisione di Matteo. */
    showContributionWhenTotalHidden?: boolean;
  } = {},
): QuotePdfFile {
  const quote = refreshQuoteSeriesRal(quoteInput);
  const rawRevision = options.revision ?? quote.rev;
  const revision =
    (typeof rawRevision === "number" || typeof rawRevision === "string") &&
    Number.isSafeInteger(Number(rawRevision)) && Number(rawRevision) > 0
      ? String(Number(rawRevision)) : "—";
  const documentNumber = quoteDocumentNumber(quote);
  const numberLabel = documentNumber ?? (quoteId ? `PREVENTIVO${quoteId}` : "PREVENTIVO");
  const fileNumber = numberLabel.trim().replace(/\/\d{4}$/, "").replace(/[<>:"/\\|?*\x00-\u001f]/g, "_");
  const fileName = `${italianOfferYear()}_${fileNumber}_REV.${revision === "—" ? "ND" : revision}.pdf`;
  const language: PrintLanguage = quote.pdf_in_inglese === true ? "en" : "it";
  const t = quotePrintLabels(language);
  const locale = printLocale(language);
  const sc = saleConditionsLabels(language);
  const money = (value: unknown) =>
    Number(Number(value ?? 0)).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatNumber = (value: unknown) =>
    Number(Number(value ?? 0)).toLocaleString(locale, { maximumFractionDigits: 2 });
  const money4 = (value: unknown) =>
    Number(Number(value ?? 0)).toLocaleString(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  const products = Array.isArray(quote.prodotti) ? (quote.prodotti as Product[]) : [];
  const colorLabel = documentPrintColor(quote, language);
  const ral = products.some(p => !isForfait(p)) && (quote.verniciatura_ral || quote.ral_consolidato)
    ? quote.ral_riepilogo : null;
  const swatchCode = /RAL (\d{4})/.exec(
    products.filter(p => !isForfait(p)).map(p => documentPrintFinish(quote, p, language)).find(f => /RAL \d{4}/.test(f)) ?? colorLabel,
  )?.[1] ?? "";
  const swatchRgb = hexToRgb(ralColors.find(c => c.code === swatchCode)?.hex ?? "");

  const c = new Canvas();
  // Intestazione: logo a sinistra, dati aziendali a destra (come la stampa).
  const logoH = (QUOTE_LOGO_HEIGHT / QUOTE_LOGO_WIDTH) * 130;
  c.image("Logo", MARGIN, c.y, 130, logoH);
  const companyLines = [
    COMPANY.address.replace(/Italia$/, t.country),
    COMPANY.vat.replace("P. IVA / C.F.", t.vat),
    COMPANY.registry.replace("Registro Imprese BL", t.registry),
    COMPANY.phone,
    COMPANY.email,
  ];
  let cy = c.y + 6;
  c.textRight(PAGE_W - MARGIN, cy, COMPANY.name, { bold: true, size: 12 });
  for (const line of companyLines) { cy += 12; c.textRight(PAGE_W - MARGIN, cy, line, { size: 7.5 }); }
  c.y += Math.max(logoH, cy - c.y + 8) + 10;
  c.hline(c.y); c.y += 16;

  const enteredTitle = String(quote.titolo_preventivo ?? "").trim();
  const title = !enteredTitle || (language === "en" && /^preventivo una\s*tantum$/i.test(enteredTitle))
    ? t.title : enteredTitle;
  for (const line of wrap(title, 16, CONTENT_W, true)) { c.text(MARGIN, c.y, line, { bold: true, size: 16 }); c.y += 19; }
  c.y += 4;

  // Blocco metadati su due colonne.
  const metaLeft: Array<[string, string]> = [
    [t.number, `${documentNumber ?? (quoteId ? String(quoteId) : "—")} — ${t.revision} ${revision}`],
    [t.client, String(quote.cliente ?? "").trim() || "—"],
  ];
  const metaRight: Array<[string, string]> = [
    [t.date, new Date().toLocaleDateString(locale)],
    [t.reference, String(quote.riferimento_preventivo ?? "").trim() || "—"],
  ];
  if (products.some(p => !isFixedPrice(p)) || ral) metaLeft.push([t.color, colorLabel]);
  const metaRows = Math.max(metaLeft.length, metaRight.length);
  for (let i = 0; i < metaRows; i++) {
    const [l1, v1] = metaLeft[i] ?? ["", ""];
    const [l2, v2] = metaRight[i] ?? ["", ""];
    if (l1) { c.text(MARGIN, c.y, l1, { size: 7, color: "0.35 g" }); c.text(MARGIN, c.y + 9, v1, { size: 9.5 }); }
    if (l2) { const x = MARGIN + CONTENT_W / 2; c.text(x, c.y, l2, { size: 7, color: "0.35 g" }); c.text(x, c.y + 9, v2, { size: 9.5 }); }
    if (l1 === t.color && swatchRgb)
      c.rectFill(MARGIN + v1.length * 0.5 * 9.5 + 8, c.y + 7, 20, 10, swatchRgb);
    c.y += 26;
  }
  c.y += 8;

  // Tabella prodotti: stesse colonne della copia cliente (#, prodotto, quantità, prezzi).
  const COL = { num: 22, product: 250, qty: 60, unit: 88, total: CONTENT_W - 22 - 250 - 60 - 88 };
  const X = {
    num: MARGIN,
    product: MARGIN + COL.num + 4,
    qty: MARGIN + COL.num + COL.product + COL.qty,
    unit: MARGIN + COL.num + COL.product + COL.qty + COL.unit,
    total: PAGE_W - MARGIN,
  };
  const tableHeader = () => {
    c.text(X.num, c.y, "#", { bold: true, size: 7.5 });
    c.text(X.product, c.y, t.product, { bold: true, size: 7.5 });
    c.textRight(X.qty, c.y, t.quantity, { bold: true, size: 7.5 });
    c.textRight(X.unit, c.y, t.netUnitPrice, { bold: true, size: 7.5 });
    c.textRight(X.total, c.y, t.netTotal, { bold: true, size: 7.5 });
    c.y += 10;
    c.hline(c.y);
    c.y += 7;
  };
  c.text(MARGIN, c.y, t.products, { bold: true, size: 11 }); c.y += 15;
  tableHeader();

  let anySpecial = false;
  products.forEach((product, index) => {
    const productLines: ProductLine[] = [];
    const unitLines: string[] = [];
    let qtyText = "", lineTotal = "";
    if (isForfait(product)) {
      anySpecial = true;
      // come la stampa: asterisco blu-grassetto, descrizione normale, «a forfait/da definire» in grassetto
      wrap(`* ${String(product.descrizione ?? "")}`, 9.5, COL.product - 8)
        .forEach((text, i) => productLines.push({ text, specialPrefix: i === 0 ? "*" : undefined }));
      wrap(t.forfait, 8, COL.product - 8, true)
        .forEach(text => productLines.push({ text, bold: true }));
      lineTotal = `€ ${money(product.valore_forfait)}`;
    } else {
      const code = documentProductCode(product, quote);
      const description = documentProductDescription(product, language);
      const series = isSeries(product);
      if (!series) anySpecial = true;
      // come la stampa: codice in grassetto (blu con asterisco per gli speciali)
      const name = series
        ? [code, description].filter(Boolean).join(" · ")
        : code ? `* ${code} · ${description}` : `* ${description}`;
      const prefix = series ? code || undefined : code ? `* ${code}` : "*";
      wrap(name, 9.5, COL.product - 8, Boolean(code))
        .forEach((text, i) => productLines.push({ text, specialPrefix: i === 0 ? prefix : undefined }));
      if (series && !ral) {
        // prodotto di serie non verniciato: nessuna riga colore (come la stampa)
      } else {
        // colore e finitura in grassetto, come la stampa
        wrap(`${t.color}: ${documentPrintFinish(quote, product, language)}`, 8, COL.product - 8, true)
          .forEach(text => productLines.push({ text, bold: true }));
      }
      qtyText = `${formatNumber(product.quantita)} ${t.pieces}`;
      const unitPrice = Number(product.prezzo_netto_unitario_finale ?? product.prezzo_netto_unitario ?? 0);
      lineTotal = `€ ${money(product.totale_finale ?? product.totale ?? unitPrice * Number(product.quantita ?? 0))}`;
      const discount = series ? seriesDiscount(product.sconto_serie).label : "";
      if (discount) {
        unitLines.push(`${t.unitPrice}: € ${money(product.prezzo_serie)}`);
        unitLines.push(`${t.discount}: ${discount}`);
        unitLines.push(`${t.netPrice}${ral ? t.withRal : ""}: € ${money4(unitPrice)}`);
      } else {
        unitLines.push(`€ ${ral ? money4(unitPrice) : money(unitPrice)}`);
      }
    }
    const rowHeight = Math.max(productLines.length * 10.5, unitLines.length * 9.5, 10.5) + 9;
    c.ensureSpace(rowHeight + 4, tableHeader);
    const top = c.y;
    c.text(X.num, top, String(index + 1), { size: 8.5 });
    let ly = top;
    productLines.forEach((line, li) => {
      const size = li === 0 ? 9.5 : 8;
      if (line.specialPrefix && line.text.startsWith(line.specialPrefix)) {
        // prefisso in grassetto (blu per gli speciali, come .special-product della stampa)
        c.segments(X.product, ly, [
          { text: line.specialPrefix, bold: true, color: line.specialPrefix.startsWith("*") ? SPECIAL_BLUE : undefined },
          { text: line.text.slice(line.specialPrefix.length) },
        ], { size });
      } else {
        c.text(X.product, ly, line.text, { size, bold: line.bold });
      }
      ly += 10.5;
    });
    let uy = top;
    for (const line of unitLines) { c.textRight(X.unit, uy, line, { size: unitLines.length > 1 ? 7.5 : 9 }); uy += 9.5; }
    if (qtyText) c.textRight(X.qty, top, qtyText, { size: 9 });
    if (lineTotal) c.textRight(X.total, top, lineTotal, { size: 9.5, bold: true });
    c.y += rowHeight - 7;
    c.hline(c.y, MARGIN, PAGE_W - MARGIN, 0.8);
    c.y += 7;
  });

  // Riepilogo supplementi RAL (stessi importi della copia stampata).
  if (ral) {
    const en = language === "en";
    const groups = new Map<string, { label: string; percent: number; amount: number; missing: boolean }>();
    const excluded: string[] = [];
    for (const row of (ral.rows ?? []) as Array<Record<string, any>>) {
      if (!row.paintable) {
        excluded.push(String(row.code) + (row.natural ? (en ? " (unfinished / natural)" : " (grezzo / naturale)")
          : /O\d{4}$/.test(String(row.code)) ? (en ? " (already RAL)" : " (già RAL)")
          : row.family === "qu" ? (en ? " (excluded category)" : " (categoria esclusa)") : " (nylon)"));
        continue;
      }
      const family = String(row.family).toUpperCase();
      const name = (en ? RAL_FAMILY_NAMES_EN[family] : RAL_FAMILY_NAMES[family]) ?? `${en ? "Other items" : "Altri articoli"} (${family})`;
      const label = `${name} (${row.stainless ? (en ? "Stainless steel" : "Inox") : (en ? "Standard" : "Standard")})`;
      const key = label + "|" + row.percent;
      const group = groups.get(key) ?? { label, percent: Number(row.percent), amount: 0, missing: false };
      group.amount += (Number(row.surcharge) || 0) * Number(row.quantity || 0);
      group.missing ||= row.surcharge == null;
      groups.set(key, group);
    }
    c.ensureSpace(60);
    c.y += 4;
    c.text(MARGIN, c.y, en ? "RAL surcharge summary" : "Riepilogo supplementi RAL", { bold: true, size: 11 }); c.y += 14;
    const colorName = ralColors.find(cc => cc.code === ral.color);
    const ralLine = `RAL ${ral.color}${colorName ? " — " + (en ? colorName.english : colorName.name) : ""} · ${en ? (ral.textured ? "TEXTURED" : "SMOOTH") : ral.textured ? "GOFFRATO" : "LISCIO"}`;
    c.text(MARGIN, c.y, ralLine, { bold: true, size: 9.5 });
    if (swatchRgb) c.rectFill(MARGIN + ralLine.length * 0.55 * 9.5 + 8, c.y - 7, 20, 10, swatchRgb);
    c.y += 14;
    for (const g of groups.values()) {
      const line = `${g.label}: +${g.percent}% — ${g.missing ? (en ? "On request" : "Su richiesta") : "€ " + money(g.amount)}`;
      for (const wl of wrap(line, 8.5, CONTENT_W)) { c.ensureSpace(12); c.text(MARGIN + 8, c.y, wl, { size: 8.5 }); c.y += 11; }
    }
    const fixedLabel = en ? "Colour change (once per order)" : "Cambio colore (una volta per ordine)";
    c.ensureSpace(12);
    c.text(MARGIN + 8, c.y, `${fixedLabel}: € ${money(ral.fixed)}`, { size: 8.5, bold: true }); c.y += 11;
    if (excluded.length) {
      const exLabel = en ? "Items excluded from the surcharge, kept at the net customer price" : "Articoli esclusi dal supplemento, mantenuti al netto cliente";
      for (const wl of wrap(`${exLabel}: ${excluded.join(", ")}.`, 8, CONTENT_W - 8)) { c.ensureSpace(11); c.text(MARGIN + 8, c.y, wl, { size: 8 }); c.y += 10; }
    }
    c.y += 6;
  }

  // Totali: rispettano la scelta di nascondere il totale documento.
  const storedTotal = quote.totale_finale ?? quote.totale;
  const total = storedTotal == null
    ? products.reduce((sum, p) => sum + Number(p.totale_finale ?? p.totale ?? 0), 0)
    : Number(storedTotal);
  // La visibilità del contributo "spese di evasione" è SEPARATA dal totale
  // documento. SCELTA ANCORA APERTA in attesa della decisione di Matteo:
  // SHOW_CONTRIBUTION_WHEN_TOTAL_HIDDEN in quote-sale-conditions.ts.
  const contribution = visibleContribution(
    total, options.hideDocumentTotal, options.showContributionWhenTotalHidden
  );
  if (!options.hideDocumentTotal || contribution) {
    c.ensureSpace(contribution ? 66 : 30);
    c.y += 8;
    if (!options.hideDocumentTotal) {
      c.textRight(PAGE_W - MARGIN, c.y, `${t.total}: € ${money(total)}`, { bold: true, size: 13 });
      c.y += 17;
    }
    if (contribution) {
      c.textRight(PAGE_W - MARGIN, c.y, `${sc.contribution}: € ${money(contribution)}`, { size: 9.5 });
      c.y += 14;
      if (!options.hideDocumentTotal) {
        // a totale nascosto il totale con spese di evasione non si mostra
        c.textRight(PAGE_W - MARGIN, c.y, `${sc.totalWithContribution}: € ${money(total + contribution)}`, { bold: true, size: 12 });
        c.y += 16;
      }
    }
  }

  // Note cliente (con traduzione della nota fissa prodotti custom).
  const clientNotes = translateClientNotes(String(quote.note_cliente ?? "").trim(), language);
  if (clientNotes) {
    c.ensureSpace(40);
    c.y += 10;
    c.hline(c.y, MARGIN, PAGE_W - MARGIN, 0.8); c.y += 12;
    c.text(MARGIN, c.y, t.notes, { bold: true, size: 11 }); c.y += 14;
    for (const paragraph of clientNotes.split(/\r?\n/)) {
      for (const line of wrap(paragraph, 9, CONTENT_W)) {
        c.ensureSpace(13);
        c.text(MARGIN, c.y, line, { size: 9 });
        c.y += 12;
      }
    }
  }

  if (anySpecial) {
    c.ensureSpace(24);
    c.y += 12;
    c.hline(c.y, MARGIN, PAGE_W - MARGIN, 0.8); c.y += 11;
    // come la stampa: asterisco blu-grassetto, testo della legenda normale
    c.segments(MARGIN, c.y, [
      { text: "*", bold: true, color: SPECIAL_BLUE },
      { text: ` ${t.special}` },
    ], { size: 8.5 });
  }

  renderSaleConditionsPage(c);
  return { bytes: assemblePdf(c.pages), fileName };
}

/**
 * Pagina «Condizioni di vendita» allegata UNA SOLA VOLTA in coda al PDF:
 * riproduce fedelmente il testo dello screenshot ufficiale (due colonne
 * IT/EN), senza intestazioni, loghi o piè di pagina del listino.
 * Testo condiviso con la stampa: vedi sale-conditions-text.ts.
 */
function renderSaleConditionsPage(c: Canvas) {
  c.newPage();
  // Titolo centrato (stima larghezza Helvetica grassetto, come textRight).
  const titleSize = 12.5;
  const titleWidth = SALE_CONDITIONS_TITLE.length * 0.55 * titleSize;
  c.text(Math.max(MARGIN, (PAGE_W - titleWidth) / 2), c.y, SALE_CONDITIONS_TITLE, { bold: true, size: titleSize });
  c.y += 24;

  const gutter = 18;
  const colW = (CONTENT_W - gutter) / 2;
  const headSize = 8, bodySize = 7.5, headStep = 11, lineStep = 9.4, gap = 5;
  const renderColumn = (x: number, lang: "it" | "en") => {
    let y = c.y;
    for (const section of SALE_CONDITIONS_SECTIONS) {
      c.text(x, y, section[lang].title.toUpperCase(), { bold: true, size: headSize });
      y += headStep;
      for (const line of wrap(section[lang].body, bodySize, colW)) {
        c.text(x, y, line, { size: bodySize });
        y += lineStep;
      }
      y += gap;
    }
    y += 4;
    SALE_CONDITIONS_CLOSING[lang].forEach((line, i) => {
      for (const wrapped of wrap(line, bodySize, colW, i === 0)) {
        c.text(x, y, wrapped, { size: bodySize, bold: i === 0 });
        y += lineStep;
      }
      y += 3;
    });
    return y;
  };
  const endIt = renderColumn(MARGIN, "it");
  void endIt;
  renderColumn(MARGIN + colW + gutter, "en");
}

/** Serializza gli oggetti PDF: catalogo, font WinAnsi, logo JPEG, pagine. */
function assemblePdf(pages: PdfPage[]): Uint8Array {
  const logoBytes = Uint8Array.from(atob(QUOTE_LOGO_JPEG_BASE64), ch => ch.charCodeAt(0));
  const logoLatin1 = Array.from(logoBytes, b => String.fromCharCode(b)).join("");
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageIds = pages.map((_, i) => 6 + i * 2);
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = `<< /Type /XObject /Subtype /Image /Width ${QUOTE_LOGO_WIDTH} /Height ${QUOTE_LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n${logoLatin1}\nendstream`;
  pages.forEach((page, i) => {
    const pageId = 6 + i * 2;
    const contentId = pageId + 1;
    const stream = page.ops.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> /ProcSet [/PDF /Text /ImageC] >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id++) {
    if (!objects[id]) continue;
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++)
    pdf += offsets[id] != null && objects[id]
      ? `${String(offsets[id]).padStart(10, "0")} 00000 n \n`
      : "0000000000 65535 f \n";
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
