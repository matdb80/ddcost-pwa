import { describe, expect, it } from "vitest";
import {
  buildQuoteAttachmentPages,
  MAX_ATTACHMENT_PAGES,
  type QuoteAttachmentSource,
  type RenderedAttachmentImage,
} from "./quote-attachment-pages";

const b64 = (text: string) => btoa(text);
const img = (w: number, h: number): RenderedAttachmentImage =>
  ({ imageBytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), imageWidth: w, imageHeight: h });

const renderImage = async (_bytes: Uint8Array, _mime: string) => img(800, 600);
/** Doppione che onora il contratto: converte al più `maxPages` pagine. */
const renderPdfPages = (pages: number) => async (_bytes: Uint8Array, maxPages: number) =>
  ({ pages: Array.from({ length: Math.min(pages, Math.max(0, maxPages)) }, () => img(1654, 2339)), totalPages: pages });

const file = (fileName: string, mimeType: string): QuoteAttachmentSource =>
  ({ fileName, mimeType, dataBase64: b64(`contenuto di ${fileName}`) });

describe("quote attachment pages — composizione delle pagine-allegato", () => {
  it("ordina le pagine per caricamento: immagini una pagina, PDF una pagina per pagina", async () => {
    const result = await buildQuoteAttachmentPages(
      [file("foto.png", "image/png"), file("disegno.pdf", "application/pdf"), file("retro.jpg", "image/jpeg")],
      { renderImage, renderPdfPages: renderPdfPages(2) },
    );
    expect(result.warnings).toEqual([]);
    expect(result.pages.map(p => p.caption)).toEqual([
      "Allegato: foto.png",
      "Allegato: disegno.pdf — pagina 1 di 2",
      "Allegato: disegno.pdf — pagina 2 di 2",
      "Allegato: retro.jpg",
    ]);
    expect(result.pages[1].imageWidth).toBe(1654);
    expect(result.pages[0].imageWidth).toBe(800);
  });

  it("PDF di una pagina sola: nessun suffisso pagina nella didascalia", async () => {
    const result = await buildQuoteAttachmentPages(
      [file("scheda.pdf", "application/pdf")],
      { renderPdfPages: renderPdfPages(1) },
    );
    expect(result.pages.map(p => p.caption)).toEqual(["Allegato: scheda.pdf"]);
  });

  it("didascalie inglesi quando il documento è in inglese", async () => {
    const result = await buildQuoteAttachmentPages(
      [file("drawing.pdf", "application/pdf"), file("photo.webp", "image/webp")],
      { language: "en", renderImage, renderPdfPages: renderPdfPages(2) },
    );
    expect(result.pages.map(p => p.caption)).toEqual([
      "Attachment: drawing.pdf — page 1 of 2",
      "Attachment: drawing.pdf — page 2 of 2",
      "Attachment: photo.webp",
    ]);
  });

  it("esclude i tipi non stampabili con avviso, senza pagine", async () => {
    const result = await buildQuoteAttachmentPages(
      [file("note.txt", "text/plain"), file("listino.xlsx", "application/octet-stream")],
      { renderImage, renderPdfPages: renderPdfPages(1) },
    );
    expect(result.pages).toEqual([]);
    expect(result.warnings).toEqual([
      "Allegati non stampabili, esclusi dal PDF: note.txt, listino.xlsx.",
    ]);
  });

  it("avviso tipi esclusi anche in inglese", async () => {
    const result = await buildQuoteAttachmentPages(
      [file("notes.txt", "text/plain")],
      { language: "en" },
    );
    expect(result.warnings).toEqual([
      "Non-printable attachments, excluded from the PDF: notes.txt.",
    ]);
  });

  it("taglia al tetto di pagine con avviso e continua a contare gli esclusi", async () => {
    const result = await buildQuoteAttachmentPages(
      [file("grande.pdf", "application/pdf"), file("extra.png", "image/png")],
      { renderImage, renderPdfPages: renderPdfPages(MAX_ATTACHMENT_PAGES + 3) },
    );
    expect(result.pages).toHaveLength(MAX_ATTACHMENT_PAGES);
    expect(result.pages[0].caption).toBe(`Allegato: grande.pdf — pagina 1 di ${MAX_ATTACHMENT_PAGES + 3}`);
    expect(result.pages.at(-1)!.caption).toBe(`Allegato: grande.pdf — pagina ${MAX_ATTACHMENT_PAGES} di ${MAX_ATTACHMENT_PAGES + 3}`);
    expect(result.warnings).toEqual([
      `Raggiunto il limite di ${MAX_ATTACHMENT_PAGES} pagine allegato: 4 pagine non incluse.`,
    ]);
  });

  it("senza allegati: nessuna pagina e nessun avviso", async () => {
    const result = await buildQuoteAttachmentPages([], { renderImage });
    expect(result).toEqual({ pages: [], warnings: [] });
  });

  it("v17 caso 1: PDF illeggibile tra due immagini — immagini incluse in ordine, avviso col nome del solo PDF", async () => {
    const result = await buildQuoteAttachmentPages(
      [file("fronte.png", "image/png"), file("disegno-illeggibile.pdf", "application/pdf"), file("retro.png", "image/png")],
      {
        renderImage,
        renderPdfPages: async () => { throw new Error("Invalid PDF structure"); },
      },
    );
    expect(result.pages.map(p => p.caption)).toEqual([
      "Allegato: fronte.png",
      "Allegato: retro.png",
    ]);
    expect(result.warnings).toEqual([
      "Allegati non leggibili, esclusi dal PDF: disegno-illeggibile.pdf.",
    ]);
  });

  it("v17: anche un'immagine illeggibile è esclusa singolarmente, senza fermare i file successivi", async () => {
    const result = await buildQuoteAttachmentPages(
      [file("rotta.png", "image/png"), file("sana.png", "image/png")],
      {
        renderImage: async (bytes: Uint8Array) => {
          if (new TextDecoder().decode(bytes).includes("rotta")) throw new Error("Image could not be decoded");
          return img(800, 600);
        },
      },
    );
    expect(result.pages.map(p => p.caption)).toEqual(["Allegato: sana.png"]);
    expect(result.warnings).toEqual([
      "Allegati non leggibili, esclusi dal PDF: rotta.png.",
    ]);
  });

  it("v17: avviso allegati illeggibili in inglese", async () => {
    const result = await buildQuoteAttachmentPages(
      [file("broken.pdf", "application/pdf")],
      { language: "en", renderPdfPages: async () => { throw new Error("Invalid PDF"); } },
    );
    expect(result.pages).toEqual([]);
    expect(result.warnings).toEqual([
      "Unreadable attachments, excluded from the PDF: broken.pdf.",
    ]);
  });

  it("v17 caso 2: dopo 19 pagine converte solo la prima del PDF da 5 (maxPages=1) e segnala le 4 omesse", async () => {
    const requested: number[] = [];
    const renderPdfSpy = async (_b: Uint8Array, maxPages: number) => {
      requested.push(maxPages);
      return { pages: Array.from({ length: Math.min(5, maxPages) }, () => img(1654, 2339)), totalPages: 5 };
    };
    const files = [
      ...Array.from({ length: MAX_ATTACHMENT_PAGES - 1 }, (_, i) => file(`foto-${i + 1}.png`, "image/png")),
      file("disegno-5pagine.pdf", "application/pdf"),
    ];
    const result = await buildQuoteAttachmentPages(files, { renderImage, renderPdfPages: renderPdfSpy });
    // il limite effettivo: al renderer arriva 1 sola pagina da convertire
    expect(requested).toEqual([1]);
    expect(result.pages).toHaveLength(MAX_ATTACHMENT_PAGES);
    expect(result.pages.at(-1)!.caption).toBe("Allegato: disegno-5pagine.pdf — pagina 1 di 5");
    expect(result.warnings).toEqual([
      `Raggiunto il limite di ${MAX_ATTACHMENT_PAGES} pagine allegato: 4 pagine non incluse.`,
    ]);
  });

  it("v17: PDF interamente oltre il tetto — nessuna conversione (maxPages=0), conteggio esatto delle omesse", async () => {
    const requested: number[] = [];
    const renderPdfSpy = async (_b: Uint8Array, maxPages: number) => {
      requested.push(maxPages);
      return { pages: [], totalPages: 5 };
    };
    const files = [
      ...Array.from({ length: MAX_ATTACHMENT_PAGES }, (_, i) => file(`foto-${i + 1}.png`, "image/png")),
      file("altro.pdf", "application/pdf"),
    ];
    const result = await buildQuoteAttachmentPages(files, { renderImage, renderPdfPages: renderPdfSpy });
    expect(requested).toEqual([0]);
    expect(result.pages).toHaveLength(MAX_ATTACHMENT_PAGES);
    expect(result.warnings).toEqual([
      `Raggiunto il limite di ${MAX_ATTACHMENT_PAGES} pagine allegato: 5 pagine non incluse.`,
    ]);
  });

  it("v17: un tipo non stampabile oltre il tetto resta «non stampabile», non una pagina omessa", async () => {
    const files = [
      ...Array.from({ length: MAX_ATTACHMENT_PAGES }, (_, i) => file(`foto-${i + 1}.png`, "image/png")),
      file("note.txt", "text/plain"),
    ];
    const result = await buildQuoteAttachmentPages(files, { renderImage });
    expect(result.pages).toHaveLength(MAX_ATTACHMENT_PAGES);
    expect(result.warnings).toEqual([
      "Allegati non stampabili, esclusi dal PDF: note.txt.",
    ]);
  });

  it("misti: immagini e PDF inclusi, altri esclusi, avviso dopo l'elaborazione", async () => {
    const result = await buildQuoteAttachmentPages(
      [file("a.gif", "image/gif"), file("b.txt", "text/plain"), file("c.pdf", "application/pdf")],
      { renderImage, renderPdfPages: renderPdfPages(3) },
    );
    expect(result.pages.map(p => p.caption)).toEqual([
      "Allegato: a.gif",
      "Allegato: c.pdf — pagina 1 di 3",
      "Allegato: c.pdf — pagina 2 di 3",
      "Allegato: c.pdf — pagina 3 di 3",
    ]);
    expect(result.warnings).toEqual([
      "Allegati non stampabili, esclusi dal PDF: b.txt.",
    ]);
  });
});
