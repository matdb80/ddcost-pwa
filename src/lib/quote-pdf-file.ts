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
  deliveryWeeksPhrase,
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
import { ralColors, presentTemporaryCode } from "./ral-pricing";
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
/** Griglia prodotti: bordo #cbd1d5, come la stampa. L'intestazione resta
 * BIANCA: il modello approvato è la stampa del browser, che omette gli sfondi
 * («grafica di sfondo» disattivata): niente riempimento #edf0f2 del th. */
const TABLE_BORDER_RGB = "0.796 0.82 0.835";

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

/**
 * Larghezze reali dei font core (AFM Helvetica / Helvetica-Bold, per 1000 em),
 * indici 32–126. La stampa usa Arial: metricamente identica a Helvetica.
 * Servono per allineare a destra e mandare a capo come il browser.
 */
const HELVETICA_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  222, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD_ASCII = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  278, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
/** Segni fuori ASCII che emettiamo via cp1252 (stesse larghezze per entrambi i pesi, salvo scostamenti AFM noti). */
const HELVETICA_EXTRA: Record<string, number> = { "€": 556, "—": 1000, "–": 556, "·": 278, "“": 333, "”": 333, "‘": 222, "’": 222, "„": 333, "…": 1000, "•": 350, "°": 400, "×": 584, "½": 834, "¼": 834, "¾": 834 };

/** Larghezza reale del testo in Helvetica/Bold (em → pt). Gli accentati ereditano la lettera base. */
function textWidth(text: string, size: number, bold = false): number {
  const ascii = bold ? HELVETICA_BOLD_ASCII : HELVETICA_ASCII;
  let units = 0;
  for (const ch of String(text ?? "")) {
    const extra = HELVETICA_EXTRA[ch];
    if (extra) { units += extra; continue; }
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
    const code = base.codePointAt(0) ?? 63;
    units += code >= 32 && code <= 126 ? ascii[code - 32] : 556;
  }
  return units * size / 1000;
}

/** A capo come il browser: per parole, con le larghezze reali del font. */
function wrap(text: string, size: number, maxWidth: number, bold = false): string[] {
  const spaceW = textWidth(" ", size, bold);
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (textWidth(current, size, bold) + spaceW + textWidth(word, size, bold) <= maxWidth) current += " " + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length ? lines : [""];
}

interface PdfPage { ops: string[]; images: Set<string> }

/** Riga di testo nella cella prodotto: grassetto e/o prefisso blu da evidenziare. */
interface ProductLine { text: string; bold?: boolean; specialPrefix?: string }

/** Pennello minimo: testo Helvetica/Helvetica-Bold, righe e rettangoli pieni. */
class Canvas {
  pages: PdfPage[] = [{ ops: [], images: new Set() }];
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
    const width = textWidth(value, size, Boolean(opts.bold));
    this.text(Math.max(MARGIN, x - width), yTop, value, opts);
  }
  /** Segmenti con stili diversi sulla stessa riga (es. «* CODICE» blu-grassetto + descrizione normale). */
  segments(x: number, yTop: number, parts: Array<{ text: string; bold?: boolean; color?: string }>, opts: { size?: number } = {}) {
    const size = opts.size ?? 10;
    let cursor = x;
    for (const part of parts) {
      if (!part.text) continue;
      this.text(cursor, yTop, part.text, { size, bold: part.bold, color: part.color });
      cursor += textWidth(part.text, size, Boolean(part.bold));
    }
  }
  rectFill(x: number, yTop: number, w: number, h: number, rgb: string) {
    this.ops.push(`${rgb} rg ${x.toFixed(2)} ${this.py(yTop + h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  }
  hline(yTop: number, x1 = MARGIN, x2 = PAGE_W - MARGIN, gray = 0.55) {
    this.ops.push(`${gray} G 0.7 w ${x1.toFixed(2)} ${this.py(yTop).toFixed(2)} m ${x2.toFixed(2)} ${this.py(yTop).toFixed(2)} l S 0 G`);
  }
  /** Linea scura 2px #464f56 sotto l'intestazione (border-bottom dell'header di stampa). */
  hlineDark(yTop: number) {
    this.ops.push(`0.275 0.31 0.337 RG 1.5 w ${MARGIN.toFixed(2)} ${this.py(yTop).toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${this.py(yTop).toFixed(2)} l S 0 G`);
  }
  /** Campione colore: riempimento RAL + bordo #58636a (SVG 32×18 della stampa). */
  swatch(x: number, yTop: number, rgb: string) {
    this.ops.push(`${rgb} rg 0.345 0.388 0.416 RG 0.7 w ${x.toFixed(2)} ${this.py(yTop + 13.5).toFixed(2)} 24.00 13.50 re B 0 g 0 G`);
  }
  /** Bordo orizzontale della griglia prodotti (#cbd1d5, come th/td della stampa). */
  hlineBox(yTop: number, x1: number, x2: number) {
    this.ops.push(`${TABLE_BORDER_RGB} RG 0.7 w ${x1.toFixed(2)} ${this.py(yTop).toFixed(2)} m ${x2.toFixed(2)} ${this.py(yTop).toFixed(2)} l S 0 G`);
  }
  /** Bordo verticale della griglia prodotti (#cbd1d5). */
  vline(x: number, y1Top: number, y2Top: number) {
    this.ops.push(`${TABLE_BORDER_RGB} RG 0.7 w ${x.toFixed(2)} ${this.py(y1Top).toFixed(2)} m ${x.toFixed(2)} ${this.py(y2Top).toFixed(2)} l S 0 G`);
  }
  /** Riquadro con bordo arrotondato #cbd1d5 (blocco .meta del modello: border-radius 4px). */
  roundRectStroke(x: number, yTop: number, w: number, h: number, r: number) {
    const k = 0.5522847498 * r; // approssimazione Bézier del quarto di cerchio
    const P = (px: number, pyTop: number) => `${px.toFixed(2)} ${this.py(pyTop).toFixed(2)}`;
    this.ops.push(
      `${TABLE_BORDER_RGB} RG 0.7 w ${P(x, yTop + r)} m ${P(x, yTop + h - r)} l ` +
      `${P(x, yTop + h - r + k)} ${P(x + r - k, yTop + h)} ${P(x + r, yTop + h)} c ` +
      `${P(x + w - r, yTop + h)} l ` +
      `${P(x + w - r + k, yTop + h)} ${P(x + w, yTop + h - r + k)} ${P(x + w, yTop + h - r)} c ` +
      `${P(x + w, yTop + r)} l ` +
      `${P(x + w, yTop + r - k)} ${P(x + w - r + k, yTop)} ${P(x + w - r, yTop)} c ` +
      `${P(x + r, yTop)} l ` +
      `${P(x + r - k, yTop)} ${P(x, yTop + r - k)} ${P(x, yTop + r)} c S 0 G`,
    );
  }
  image(name: string, x: number, yTop: number, w: number, h: number) {
    this.pages[this.pages.length - 1].images.add(name);
    this.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${this.py(yTop + h).toFixed(2)} cm /${name} Do Q`);
  }
  ensureSpace(height: number, onNewPage?: () => void) {
    if (this.y + height > PAGE_H - MARGIN) this.newPage(onNewPage);
  }
  newPage(onNewPage?: () => void) {
    this.pages.push({ ops: [], images: new Set() });
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
 * Pagina-allegato già rasterizzata (quote-attachment-pages.ts): una pagina A4
 * per immagine o per pagina PDF, con didascalia in testa. Il generatore resta
 * sincrono e deterministico: a parità di pagine passate, i byte non cambiano.
 */
export interface QuotePdfAttachmentPage {
  caption: string;
  /** JPEG (Filter /DCTDecode), come il logo. */
  imageBytes: Uint8Array;
  imageWidth: number;
  imageHeight: number;
}

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
    /** Pagine-allegato rasterizzate, inserite tra il preventivo e le condizioni
     * di vendita (sempre in coda). Assente/vuoto → documento invariato. */
    attachmentPages?: QuotePdfAttachmentPage[];
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
  // Intestazione come la stampa: logo a sinistra (img 46mm con max-height 28mm
  // e object-fit: contain → disegnato ~117×79pt, centrato nel suo box), dati
  // aziendali a destra, linea scura 2px #464f56, padding-bottom 10px.
  // Baseline e passi sono quelli misurati sul PDF del modello approvato.
  const LOGO_W = 117;
  const LOGO_H = (QUOTE_LOGO_HEIGHT / QUOTE_LOGO_WIDTH) * LOGO_W;
  c.image("Logo", MARGIN + 6.75, c.y, LOGO_W, LOGO_H);
  const companyLines = [
    COMPANY.address.replace(/Italia$/, t.country),
    COMPANY.vat.replace("P. IVA / C.F.", t.vat),
    COMPANY.registry.replace("Registro Imprese BL", t.registry),
    COMPANY.phone,
    COMPANY.email,
  ];
  let cy = c.y + 13.43; // baseline del nome aziendale (12pt)
  c.textRight(PAGE_W - MARGIN, cy, COMPANY.name, { bold: true, size: 12 });
  companyLines.forEach((line, i) => {
    cy += i === 0 ? 14.53 : 11.6; // strong margin-bottom 2px, poi righe 8pt/1.45
    c.textRight(PAGE_W - MARGIN, cy, line, { size: 8 });
  });
  // La linea sta 10px (7,5pt) sotto il più basso tra logo e blocco aziendale.
  const headerBottom = Math.max(MARGIN + LOGO_H, cy + 2.9) + 8.55;
  c.hlineDark(headerBottom);

  // Titolo 19pt: margin-bottom 20px dell'header + cap height (misurato).
  const enteredTitle = String(quote.titolo_preventivo ?? "").trim();
  const title = !enteredTitle || (language === "en" && /^preventivo una\s*tantum$/i.test(enteredTitle))
    ? t.title : enteredTitle;
  c.y = headerBottom + 34.7;
  for (const line of wrap(title, 19, CONTENT_W, true)) { c.text(MARGIN, c.y, line, { bold: true, size: 19 }); c.y += 24; }

  // Blocco metadati (.meta della stampa): riquadro bordo #cbd1d5 radius 4px,
  // padding 10px 12px, gap righe 7px / colonne 18px, margin 12px 0 20px.
  // Etichette 8pt grassetto #58636a, valori 10pt; la revisione è in grassetto
  // (.quote-revision) e il colore in grassetto con campione.
  type MetaPart = { text: string; bold?: boolean };
  const metaLeft: Array<[string, MetaPart[]]> = [
    [t.number, [
      { text: String(documentNumber ?? (quoteId ? String(quoteId) : "—")) },
      { text: ` — ${t.revision} ${revision}`, bold: true },
    ]],
    [t.client, [{ text: String(quote.cliente ?? "").trim() || "—" }]],
  ];
  const metaRight: Array<[string, MetaPart[]]> = [
    [t.date, [{ text: new Date().toLocaleDateString(locale) }]],
    [t.reference, [{ text: String(quote.riferimento_preventivo ?? "").trim() || "—" }]],
  ];
  if (products.some(p => !isFixedPrice(p)) || ral) metaLeft.push([t.color, [{ text: colorLabel, bold: true }]]);
  // v20: con la consegna stimata il blocco .meta guadagna una riga a tutta
  // larghezza; senza (campo vuoto, anche nei preventivi storici) la riga e
  // la sua altezza spariscono del tutto.
  const deliveryPhrase = deliveryWeeksPhrase(quote.consegna_settimane, language);
  const metaRows = Math.max(metaLeft.length, metaRight.length) + (deliveryPhrase ? 1 : 0);
  const META_PAD = 9.75;                    // padding-inline 12px
  const META_COL_GAP = 13.5;                // gap colonne 18px
  const metaColW = (CONTENT_W - 2 * META_PAD - META_COL_GAP) / 2;
  const metaX2 = MARGIN + META_PAD + metaColW + META_COL_GAP;
  const boxTop = c.y - 24 + 18.2;           // ultima baseline del titolo + gap misurato
  const META_ROW = 31.35;                   // passo righe: 8pt/1.45 + 10pt/1.45 + gap 7px
  const META_LABEL_COLOR = "0.345 0.388 0.416 rg"; // #58636a
  for (let i = 0; i < metaRows; i++) {
    const [l1, v1]: [string, MetaPart[]] = metaLeft[i] ?? ["", []];
    const [l2, v2]: [string, MetaPart[]] = metaRight[i] ?? ["", []];
    const labelY = boxTop + 16 + i * META_ROW;
    const valueY = labelY + 13.5;
    if (l1) {
      c.text(MARGIN + META_PAD, labelY, l1, { size: 8, bold: true, color: META_LABEL_COLOR });
      c.segments(MARGIN + META_PAD, valueY, v1, { size: 10 });
    }
    if (l2) {
      c.text(metaX2, labelY, l2, { size: 8, bold: true, color: META_LABEL_COLOR });
      c.segments(metaX2, valueY, v2, { size: 10 });
    }
    if (l1 === t.color && swatchRgb)
      // campione 32×18px con margin-left 6px, centrato sulla riga del valore
      c.swatch(MARGIN + META_PAD + textWidth(colorLabel, 10, true) + 4.5, valueY - 8.7, swatchRgb);
    // v20: la dicitura è un'unica riga di testo a tutta larghezza, senza
    // etichetta a due colonne, per poter essere cercata come stringa esatta.
    if (deliveryPhrase && i === metaRows - 1)
      c.text(MARGIN + META_PAD, valueY, deliveryPhrase, { size: 10 });
  }
  const boxBottom = boxTop + 16 + (metaRows - 1) * META_ROW + 13.5 + 12.3;
  c.roundRectStroke(MARGIN, boxTop, CONTENT_W, boxBottom - boxTop, 3);
  c.y = boxBottom + 25.9; // baseline dell'intestazione «Prodotti e prezzi netti»

  // Tabella prodotti: stessa impaginazione del modello approvato (stampa
  // browser): griglia con bordo #cbd1d5 su ogni cella, intestazione in
  // grassetto su fondo BIANCO (la stampa omette gli sfondi), colonne
  // numeriche allineate a destra. Ogni riga resta intera: se non entra nella
  // pagina corrente la tabella riprende sulla pagina nuova ripetendo
  // l'intestazione.
  const COL = { num: 18.75, product: 263.25, qty: 53.25, unit: 111.75, total: CONTENT_W - 447 };
  // Bordi verticali delle colonne (x): # | prodotto | quantità | prezzo | totale
  const BX = [
    MARGIN,
    MARGIN + COL.num,
    MARGIN + COL.num + COL.product,
    MARGIN + COL.num + COL.product + COL.qty,
    MARGIN + COL.num + COL.product + COL.qty + COL.unit,
    PAGE_W - MARGIN,
  ];
  const CELL_PAD = 6.5;    // padding 8px dal bordo della cella
  const HEADER_H = 28.5;   // intestazione: 8px + riga 10pt/1.45 + 8px
  const ROW_TOP = 15.85;   // baseline della prima riga di testo sotto il bordo
  const ROW_PITCH = 14.25; // passo tra baseline dello stesso prodotto (10pt/1.45)
  const ROW_BOTTOM = 11.9; // spazio tra l'ultima baseline e il bordo inferiore
  const boxBorders = (yTop: number, height: number) => {
    c.hlineBox(yTop, BX[0], BX[5]);
    c.hlineBox(yTop + height, BX[0], BX[5]);
    for (const x of BX) c.vline(x, yTop, yTop + height);
  };
  const tableHeader = () => {
    const top = c.y;
    boxBorders(top, HEADER_H); // prima i bordi: non coprono mai il testo
    const ty = top + 16.55;
    c.textRight(BX[1] - CELL_PAD, ty, "#", { bold: true, size: 10 });
    c.text(BX[1] + CELL_PAD, ty, t.product, { bold: true, size: 10 });
    c.textRight(BX[3] - CELL_PAD, ty, t.quantity, { bold: true, size: 10 });
    c.textRight(BX[4] - CELL_PAD, ty, t.netUnitPrice, { bold: true, size: 10 });
    c.textRight(BX[5] - CELL_PAD, ty, t.netTotal, { bold: true, size: 10 });
    c.y = top + HEADER_H;
  };
  c.text(MARGIN, c.y, t.products, { bold: true, size: 11 });
  c.y += 12.75; // bordo superiore della tabella (h2 margin-bottom + margin table)
  tableHeader();

  let anySpecial = false;
  products.forEach((product, index) => {
    const productLines: ProductLine[] = [];
    const unitLines: string[] = [];
    let qtyText = "", lineTotal = "";
    if (isForfait(product)) {
      anySpecial = true;
      // come la stampa: asterisco blu-grassetto, descrizione normale, «a forfait/da definire» in grassetto
      wrap(`* ${String(product.descrizione ?? "")}`, 10, COL.product - 2 * CELL_PAD)
        .forEach((text, i) => productLines.push({ text, specialPrefix: i === 0 ? "*" : undefined }));
      wrap(t.forfait, 10, COL.product - 2 * CELL_PAD, true)
        .forEach(text => productLines.push({ text, bold: true }));
      lineTotal = `€ ${money(product.valore_forfait)}`;
    } else {
      // presentazione: i codici temporanei storici con finitura minuscola
      // (es. TCS0000009In) escono maiuscoli senza riscrivere il dato salvato
      const code = presentTemporaryCode(documentProductCode(product, quote));
      const description = documentProductDescription(product, language);
      const series = isSeries(product);
      if (!series) anySpecial = true;
      // come la stampa: codice in grassetto (blu con asterisco per gli speciali)
      const name = series
        ? [code, description].filter(Boolean).join(" · ")
        : code ? `* ${code} · ${description}` : `* ${description}`;
      const prefix = series ? code || undefined : code ? `* ${code}` : "*";
      wrap(name, 10, COL.product - 2 * CELL_PAD, Boolean(code))
        .forEach((text, i) => productLines.push({ text, specialPrefix: i === 0 ? prefix : undefined }));
      if (series && !ral) {
        // prodotto di serie non verniciato: nessuna riga colore (come la stampa)
      } else {
        // colore e finitura in grassetto, come la stampa
        wrap(`${t.color}: ${documentPrintFinish(quote, product, language)}`, 10, COL.product - 2 * CELL_PAD, true)
          .forEach(text => productLines.push({ text, bold: true }));
      }
      qtyText = `${formatNumber(product.quantita)} ${t.pieces}`;
      const unitPrice = Number(product.prezzo_netto_unitario_finale ?? product.prezzo_netto_unitario ?? 0);
      lineTotal = `€ ${money(product.totale_finale ?? product.totale ?? unitPrice * Number(product.quantita ?? 0))}`;
      const discount = series ? seriesDiscount(product.sconto_serie).label : "";
      if (discount) {
        // v15: le righe del prezzo unitario (es. «Prezzo netto con RAL: € 18,0000»)
        // vanno a capo DENTRO la cella, come fa la stampa: senza lo wrap il testo
        // allineato a destra sconfinava a sinistra, nella colonna Quantità.
        // L'altezza riga segue il numero di righe effettivamente disegnate.
        for (const line of [
          `${t.unitPrice}: € ${money(product.prezzo_serie)}`,
          `${t.discount}: ${discount}`,
          `${t.netPrice}${ral ? t.withRal : ""}: € ${money4(unitPrice)}`,
        ]) for (const wrapped of wrap(line, 10, COL.unit - 2 * CELL_PAD)) unitLines.push(wrapped);
      } else {
        unitLines.push(`€ ${ral ? money4(unitPrice) : money(unitPrice)}`);
      }
    }
    // La riga non si spezza mai (come tr{break-inside:avoid} della stampa):
    // se non entra nella pagina corrente si riparte con l'intestazione.
    const rowHeight = ROW_TOP + (Math.max(productLines.length, unitLines.length, 1) - 1) * ROW_PITCH + ROW_BOTTOM;
    c.ensureSpace(rowHeight, tableHeader);
    const top = c.y;
    const firstBaseline = top + ROW_TOP;
    c.textRight(BX[1] - CELL_PAD, firstBaseline, String(index + 1), { size: 10 });
    let ly = firstBaseline;
    productLines.forEach(line => {
      if (line.specialPrefix && line.text.startsWith(line.specialPrefix)) {
        // prefisso in grassetto (blu per gli speciali, come .special-product della stampa)
        c.segments(BX[1] + CELL_PAD, ly, [
          { text: line.specialPrefix, bold: true, color: line.specialPrefix.startsWith("*") ? SPECIAL_BLUE : undefined },
          { text: line.text.slice(line.specialPrefix.length) },
        ], { size: 10 });
      } else {
        c.text(BX[1] + CELL_PAD, ly, line.text, { size: 10, bold: line.bold });
      }
      ly += ROW_PITCH;
    });
    let uy = firstBaseline;
    for (const line of unitLines) { c.textRight(BX[4] - CELL_PAD, uy, line, { size: 10 }); uy += ROW_PITCH; }
    if (qtyText) c.textRight(BX[3] - CELL_PAD, firstBaseline, qtyText, { size: 10 });
    if (lineTotal) c.textRight(BX[5] - CELL_PAD, firstBaseline, lineTotal, { size: 10 });
    boxBorders(top, rowHeight);
    c.y = top + rowHeight;
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
    // v15: il titolo (11pt, ascendente ~8pt) deve stare TUTTO sotto il bordo
    // inferiore della tabella — con +4 i glifi attraversavano la linea.
    c.y += 14;
    c.text(MARGIN, c.y, en ? "RAL surcharge summary" : "Riepilogo supplementi RAL", { bold: true, size: 11 }); c.y += 14;
    const colorName = ralColors.find(cc => cc.code === ral.color);
    const ralLine = `RAL ${ral.color}${colorName ? " — " + (en ? colorName.english : colorName.name) : ""} · ${en ? (ral.textured ? "TEXTURED" : "SMOOTH") : ral.textured ? "GOFFRATO" : "LISCIO"}`;
    c.text(MARGIN, c.y, ralLine, { bold: true, size: 9.5 });
    if (swatchRgb) c.swatch(MARGIN + textWidth(ralLine, 9.5, true) + 4.5, c.y - 8.7, swatchRgb);
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
    c.ensureSpace(contribution ? 82 : 42);
    if (!options.hideDocumentTotal) {
      c.y += 26.1; // baseline del totale: margin-top 16px + riga 14pt/1.45
      c.textRight(PAGE_W - MARGIN, c.y, `${t.total}: € ${money(total)}`, { bold: true, size: 14 });
    } else {
      c.y += 16;
    }
    if (contribution) {
      c.y += options.hideDocumentTotal ? 12 : 19.8; // stampa: margin-top 6px
      c.textRight(PAGE_W - MARGIN, c.y, `${sc.contribution}: € ${money(contribution)}`, { size: 9.5 });
      if (!options.hideDocumentTotal) {
        // a totale nascosto il totale con spese di evasione non si mostra
        c.y += 19.3; // stampa: margin-top 4px
        c.textRight(PAGE_W - MARGIN, c.y, `${sc.totalWithContribution}: € ${money(total + contribution)}`, { bold: true, size: 12 });
      }
    }
  }

  // Note cliente (con traduzione della nota fissa prodotti custom).
  const clientNotes = translateClientNotes(String(quote.note_cliente ?? "").trim(), language);
  if (clientNotes) {
    c.ensureSpace(40);
    c.y += 10;
    c.hlineBox(c.y, MARGIN, PAGE_W - MARGIN); c.y += 12;
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
    c.ensureSpace(40);
    c.y += 20.3; // stampa: margin-top 20px dal contenuto precedente
    c.hlineBox(c.y, MARGIN, PAGE_W - MARGIN);
    c.y += 15.2; // padding-top 8px + riga 9pt/1.45
    // come la stampa: asterisco blu-grassetto, testo della legenda normale
    c.segments(MARGIN, c.y, [
      { text: "*", bold: true, color: SPECIAL_BLUE },
      { text: ` ${t.special}` },
    ], { size: 9 });
  }

  // v16: le pagine-allegato vanno tra il preventivo e le condizioni di vendita,
  // che restano SEMPRE l'ultima pagina, una sola volta (regola invariata).
  renderAttachmentPages(c, options.attachmentPages ?? []);
  renderSaleConditionsPage(c);
  return { bytes: assemblePdf(c.pages, options.attachmentPages ?? []), fileName };
}

/**
 * Pagine-allegato (v16): una pagina A4 ciascuna, tra l'ultima pagina del
 * preventivo e le condizioni. Didascalia piccola in testa (a capo se lunga),
 * immagine adattata al riquadro utile e centrata, proporzioni invariate.
 */
/** Didascalie degli allegati: i nomi file possono non avere spazi, quindi dopo
 * il wrap normale le parole ancora troppo lunghe si spezzano per carattere. */
function wrapCaption(text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const line of wrap(text, size, maxWidth)) {
    let rest = line;
    while (rest && textWidth(rest, size) > maxWidth) {
      let lo = 1, hi = rest.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (textWidth(rest.slice(0, mid), size) <= maxWidth) lo = mid; else hi = mid - 1;
      }
      out.push(rest.slice(0, lo));
      rest = rest.slice(lo);
    }
    if (rest) out.push(rest);
  }
  return out.length ? out : [""];
}

function renderAttachmentPages(c: Canvas, pages: QuotePdfAttachmentPage[]) {
  pages.forEach((page, i) => {
    c.newPage();
    for (const line of wrapCaption(page.caption, 9, CONTENT_W)) {
      c.y += 11;
      c.text(MARGIN, c.y, line, { size: 9 });
    }
    c.y += 10;
    const boxTop = c.y;
    const boxH = PAGE_H - MARGIN - boxTop;
    const scale = Math.min(CONTENT_W / page.imageWidth, boxH / page.imageHeight);
    const w = page.imageWidth * scale;
    const h = page.imageHeight * scale;
    c.image(`Att${i}`, MARGIN + (CONTENT_W - w) / 2, boxTop + (boxH - h) / 2, w, h);
  });
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

/** Serializza gli oggetti PDF: catalogo, font WinAnsi, logo JPEG, eventuali
 * immagini delle pagine-allegato (Att0..AttN), pagine. Senza allegati la
 * numerazione degli oggetti e i dizionari risorsa restano identici a prima. */
function assemblePdf(pages: PdfPage[], attachmentPages: QuotePdfAttachmentPage[] = []): Uint8Array {
  const logoBytes = Uint8Array.from(atob(QUOTE_LOGO_JPEG_BASE64), ch => ch.charCodeAt(0));
  const logoLatin1 = Array.from(logoBytes, b => String.fromCharCode(b)).join("");
  const toLatin1 = (bytes: Uint8Array) => Array.from(bytes, b => String.fromCharCode(b)).join("");
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const firstPageId = 6 + attachmentPages.length;
  const pageIds = pages.map((_, i) => firstPageId + i * 2);
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = `<< /Type /XObject /Subtype /Image /Width ${QUOTE_LOGO_WIDTH} /Height ${QUOTE_LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n${logoLatin1}\nendstream`;
  attachmentPages.forEach((page, i) => {
    objects[6 + i] = `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.imageBytes.length} >>\nstream\n${toLatin1(page.imageBytes)}\nendstream`;
  });
  pages.forEach((page, i) => {
    const pageId = firstPageId + i * 2;
    const contentId = pageId + 1;
    const stream = page.ops.join("\n");
    // /Logo resta in ogni pagina (come da v12); le immagini allegato solo dove usate.
    const extra = attachmentPages
      .map((_, j) => j)
      .filter(j => page.images.has(`Att${j}`))
      .map(j => ` /Att${j} ${6 + j} 0 R`)
      .join("");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R${extra} >> /ProcSet [/PDF /Text /ImageC] >> /Contents ${contentId} 0 R >>`;
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
