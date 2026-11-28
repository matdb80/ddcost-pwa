/**
 * Pagine-allegato per il PDF cliente (ordine: preventivo → allegati → condizioni,
 * queste ultime sempre in fondo e una sola volta).
 *
 * UNA SOLA pipeline di resa, condivisa dai due pulsanti («Esporta PDF cliente»
 * e «Prepara email»): gli allegati sono rasterizzati qui (immagini → JPEG;
 * PDF → un JPEG per pagina a 200 dpi via pdf.js) e il generatore interno
 * (quote-pdf-file.ts) riceve pagine già pronte, restando sincrono e
 * deterministico. A parità di allegati i due percorsi producono lo stesso file.
 *
 * Decisioni attuate (proposta «allegati nel PDF cliente», 2026-11-22):
 * rasterizzazione uniforme ~200 dpi; pdf.js solo per rasterizzare; tipi inclusi
 * image/* + application/pdf, gli altri esclusi con avviso; nessun flag
 * per-allegato (nessuna migrazione DB); didascalia col nome file in testa alla
 * pagina; tetto di MAX_ATTACHMENT_PAGES pagine-allegato con avviso.
 */
import type { QuotePdfAttachmentPage } from "./quote-pdf-file";

export const MAX_ATTACHMENT_PAGES = 20;
export const ATTACHMENT_PAGE_DPI = 200;
const JPEG_QUALITY = 0.92;
/** Lato lungo massimo delle immagini rasterizzate: lato lungo di una A4 a 200 dpi. */
const MAX_SIDE_PX = 2339;

export interface QuoteAttachmentSource {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}
export interface QuoteAttachmentPagesResult {
  pages: QuotePdfAttachmentPage[];
  warnings: string[];
}
export interface RenderedAttachmentImage {
  imageBytes: Uint8Array;
  imageWidth: number;
  imageHeight: number;
}
export interface RenderedPdfAttachment {
  /** Pagine effettivamente rasterizzate: al più `maxPages`. */
  pages: RenderedAttachmentImage[];
  /** Pagine totali del documento PDF (anche quelle non convertite). */
  totalPages: number;
}
/** Renderer iniettabili: i test unitari non toccano canvas né pdf.js. */
export interface AttachmentRenderers {
  renderImage?: (bytes: Uint8Array, mimeType: string) => Promise<RenderedAttachmentImage>;
  renderPdfPages?: (bytes: Uint8Array, maxPages: number) => Promise<RenderedPdfAttachment>;
}

export function base64ToBytes(dataBase64: string): Uint8Array {
  return Uint8Array.from(atob(dataBase64), ch => ch.charCodeAt(0));
}

function caption(en: boolean, fileName: string, page?: number, total?: number): string {
  const base = en ? `Attachment: ${fileName}` : `Allegato: ${fileName}`;
  if (page != null && total != null && total > 1)
    return base + (en ? ` — page ${page} of ${total}` : ` — pagina ${page} di ${total}`);
  return base;
}

/**
 * Comporre le pagine-allegato nell'ordine di caricamento dei file. I tipi non
 * stampabili sono esclusi con avviso; oltre il tetto pagine si taglia con avviso.
 *
 * v17 — due garanzie richieste dal collaudo:
 * 1. Un allegato illeggibile (PDF corrotto, immagine non decodificabile) è
 *    escluso SINGOLARMENTE con avviso che lo nomina: gli altri allegati
 *    continuano a entrare nel documento, nell'ordine di caricamento.
 * 2. Il tetto pagine limita la CONVERSIONE, non solo l'inserimento: al renderer
 *    PDF è passato il numero massimo di pagine da rasterizzare (0 oltre il
 *    tetto: il documento è letto solo per contare le pagine omesse).
 */
export async function buildQuoteAttachmentPages(
  files: QuoteAttachmentSource[],
  options: { language?: "it" | "en" } & AttachmentRenderers = {},
): Promise<QuoteAttachmentPagesResult> {
  const en = options.language === "en";
  const renderImage = options.renderImage ?? browserRenderImage;
  const renderPdfPages = options.renderPdfPages ?? browserRenderPdfPages;
  const pages: QuotePdfAttachmentPage[] = [];
  const warnings: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  let truncated = 0;
  for (const file of files) {
    const isImage = file.mimeType.startsWith("image/");
    const isPdf = file.mimeType === "application/pdf";
    if (!isImage && !isPdf) { skipped.push(file.fileName); continue; }
    const remaining = MAX_ATTACHMENT_PAGES - pages.length;
    try {
      if (isImage) {
        if (remaining <= 0) { truncated += 1; continue; } // immagine = 1 pagina, non decodificata
        const img = await renderImage(base64ToBytes(file.dataBase64), file.mimeType);
        pages.push({ caption: caption(en, file.fileName), ...img });
      } else {
        // maxPages limita la conversione; oltre il tetto (0) il PDF è letto
        // solo per il conteggio esatto delle pagine omesse.
        const rendered = await renderPdfPages(base64ToBytes(file.dataBase64), remaining);
        for (const [i, img] of rendered.pages.slice(0, remaining).entries())
          pages.push({ caption: caption(en, file.fileName, i + 1, rendered.totalPages), ...img });
        if (rendered.totalPages > remaining) truncated += rendered.totalPages - remaining;
      }
    } catch {
      failed.push(file.fileName);
    }
  }
  if (skipped.length)
    warnings.push(en
      ? `Non-printable attachments, excluded from the PDF: ${skipped.join(", ")}.`
      : `Allegati non stampabili, esclusi dal PDF: ${skipped.join(", ")}.`);
  if (failed.length)
    warnings.push(en
      ? `Unreadable attachments, excluded from the PDF: ${failed.join(", ")}.`
      : `Allegati non leggibili, esclusi dal PDF: ${failed.join(", ")}.`);
  if (truncated > 0)
    warnings.push(en
      ? `Attachment page limit (${MAX_ATTACHMENT_PAGES}) reached: ${truncated} page(s) not included.`
      : `Raggiunto il limite di ${MAX_ATTACHMENT_PAGES} pagine allegato: ${truncated} pagine non incluse.`);
  return { pages, warnings };
}

function canvasToJpeg(canvas: HTMLCanvasElement): RenderedAttachmentImage {
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { imageBytes: base64ToBytes(dataUrl.split(",")[1]), imageWidth: canvas.width, imageHeight: canvas.height };
}

/** Immagine (png/jpeg/gif/webp): appiattita su bianco e ridimensionata al più al lato A4@200dpi. */
async function browserRenderImage(bytes: Uint8Array, mimeType: string): Promise<RenderedAttachmentImage> {
  const bitmap = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }));
  try {
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvasToJpeg(canvas);
  } finally {
    bitmap.close();
  }
}

/** Pagine del PDF allegato renderizzate a 200 dpi con pdf.js (importato a
 * richiesta), al più `maxPages`: le pagine oltre il tetto non sono convertite. */
async function browserRenderPdfPages(bytes: Uint8Array, maxPages: number): Promise<RenderedPdfAttachment> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const totalPages = doc.numPages;
    const out: RenderedAttachmentImage[] = [];
    for (let n = 1; n <= Math.min(totalPages, Math.max(0, maxPages)); n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: ATTACHMENT_PAGE_DPI / 72 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      out.push(canvasToJpeg(canvas));
      page.cleanup();
    }
    return { pages: out, totalPages };
  } finally {
    await doc.destroy();
  }
}
