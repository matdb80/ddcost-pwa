// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildQuotePdfFile } from "./quote-pdf-file";
import { RAL_FAMILY_NAMES, RAL_FAMILY_NAMES_EN } from "./ral-print-summary";
import { buildOneTimeQuotePrintHtml } from "./quote-pdf";

const latin1 = (bytes: Uint8Array) =>
  Array.from(bytes, b => String.fromCharCode(b)).join("");
/** Byte 0x80–0x9F della codifica WinAnsi (jsdom non ha il decoder windows-1252). */
const CP1252_HIGH: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8A: "Š", 0x8B: "‹", 0x8C: "Œ", 0x8E: "Ž", 0x91: "‘",
  0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜",
  0x99: "™", 0x9A: "š", 0x9B: "›", 0x9C: "œ", 0x9E: "ž", 0x9F: "Ÿ",
};
/** Vista normalizzata del contenuto: decodifica WinAnsi e rimuove l'escape PDF di ( ) \. */
const plain = (bytes: Uint8Array) =>
  Array.from(bytes, b => CP1252_HIGH[b] ?? String.fromCharCode(b)).join("").replace(/\\([()\\])/g, "$1");

const fixture = (overrides: Record<string, unknown> = {}) => ({
  numero_preventivo: "DDC00042/2026",
  cliente: "Cliente prova",
  riferimento_preventivo: "RIF-99",
  prodotti: [
    {
      codice: "FCA00504HBIN",
      descrizione: "Cerniera di serie",
      prodotto_di_serie: true,
      quantita: 4,
      prezzo_serie: 100,
      prezzo_netto_unitario_finale: 100,
      totale_finale: 400,
    },
  ],
  totale_finale: 400,
  ...overrides,
});

describe("quote PDF file (TKT-20261117-84210001)", () => {
  it("produces a valid PDF envelope with the document file name", () => {
    const pdf = buildQuotePdfFile(fixture(), 991, { revision: 1 });
    const text = latin1(pdf.bytes);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("startxref");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf.fileName).toBe("2026_DDC00042_REV.1.pdf");
  });

  it("contains the same client document data as the print copy", () => {
    const text = latin1(buildQuotePdfFile(fixture(), 991, { revision: 3 }).bytes);
    expect(text).toContain("DDC00042/2026");
    expect(text).toContain("Cliente prova");
    expect(text).toContain("RIF-99");
    expect(text).toContain("FCA00504HBIN");
    expect(text).toContain("Cerniera di serie");
    expect(text).toContain("400,00");
    expect(buildQuotePdfFile(fixture(), 991, { revision: 3 }).fileName).toBe("2026_DDC00042_REV.3.pdf");
  });

  it("adds the spese di evasione contribution once below 150 euro and hides it with the total", () => {
    const withContribution = latin1(buildQuotePdfFile(fixture({ totale_finale: 120 })).bytes);
    expect(withContribution).toContain("spese di evasione");
    expect(withContribution).toContain("15,00");
    expect(withContribution).toContain("135,00");
    const atThreshold = latin1(buildQuotePdfFile(fixture({ totale_finale: 150 })).bytes);
    expect(atThreshold).not.toContain("spese di evasione");
    const hidden = latin1(buildQuotePdfFile(fixture({ totale_finale: 120 }), undefined, { hideDocumentTotal: true }).bytes);
    expect(hidden).not.toContain("Totale netto preventivo");
    expect(hidden).not.toContain("spese di evasione");
    expect(hidden).not.toContain("135,00");
  });

  // Visibilità del contributo SEPARATA dal totale (decisione di Matteo in sospeso):
  // a totale nascosto la voce da 15 € può comparire da sola, senza il totale di 135 €.
  it("can show the 15 euro contribution alone while the document total stays hidden", () => {
    const text = plain(buildQuotePdfFile(fixture({ totale_finale: 120 }), undefined, {
      hideDocumentTotal: true,
      showContributionWhenTotalHidden: true,
    }).bytes);
    expect(text).toContain('Contributo "spese di evasione"');
    expect(text).toContain("15,00");
    expect(text).not.toContain("Totale netto preventivo");
    expect(text).not.toContain("135,00");
  });

  it("appends the original sale-conditions page exactly once", () => {
    const text = latin1(buildQuotePdfFile(fixture()).bytes);
    const pageObjects = text.match(/\/Type\s*\/Page(?![a-zs])/g) ?? [];
    // 1 pagina di preventivo + 1 pagina condizioni originale (una sola volta)
    expect(pageObjects.length).toBe(2);
    expect(text).toContain("/Count 2");
  });

  it("translates the document into English when requested", () => {
    const text = latin1(buildQuotePdfFile(fixture({ pdf_in_inglese: true, totale_finale: 100 })).bytes);
    expect(text).toContain("One-time quotation");
    expect(text).toContain('"Spese di evasione" handling contribution');
    expect(text).not.toContain("Totale netto preventivo");
  });
});

// Correzioni revisione v4 (2026-11-21).
describe("quote PDF file — v4 review fixes", () => {
  const seriesProduct = (codice: string, prezzo: number, quantita: number, extra: Record<string, unknown> = {}) => ({
    codice,
    descrizione: "Serie",
    prodotto_di_serie: true,
    quantita,
    prezzo_serie: prezzo,
    prezzo_netto_unitario_finale: prezzo,
    totale_finale: prezzo * quantita,
    ...extra,
  });

  it("keeps WinAnsi characters identical to the inserted text (Müller & Muñoz, Staffa Ø12, Foro Ø12 mm)", () => {
    const text = latin1(buildQuotePdfFile(fixture({
      cliente: "Müller & Muñoz",
      note_cliente: "Foro Ø12 mm",
      prodotti: [{
        codice: "FCA001",
        descrizione: "Staffa Ø12",
        prodotto_di_serie: false,
        quantita: 3,
        prezzo_netto_unitario_finale: 40,
        totale_finale: 120,
      }],
      totale_finale: 120,
    }), undefined, { revision: 1 }).bytes);
    expect(text).toContain("Müller & Muñoz");
    expect(text).toContain("Staffa Ø12");
    expect(text).toContain("Foro Ø12 mm");
    expect(text).not.toContain("M?ller");
    expect(text).not.toContain("?12");
  });

  it("derives FSP001012NIO6021 with the shared RAL dictionary (Espagnolette hardware) and its surcharge", () => {
    const quote = (en: boolean) => fixture({
      pdf_in_inglese: en,
      verniciatura_ral: { color: "6021", textured: false },
      prodotti: [seriesProduct("FSP001012NIN", 10, 2, { sconto_serie: "10", prezzo_netto_unitario_finale: 18, totale_finale: 36 })],
      totale_finale: 36,
    });
    const en = plain(buildQuotePdfFile(quote(true)).bytes);
    expect(en).toContain("FSP001012NIO6021");
    expect(en).toContain("Espagnolette hardware (Standard): +100%");
    expect(en).toContain("18.00"); // supplemento: +100% sul netto 9 × 2 pz
    const itText = plain(buildQuotePdfFile(quote(false)).bytes);
    expect(itText).toContain("FSP001012NIO6021");
    expect(itText).toContain("Spagnolette (Standard): +100%");
    expect(itText).toContain("18,00");
  });

  it("uses the same RAL family dictionary as the print copy, for every category", () => {
    const families = Object.keys(RAL_FAMILY_NAMES);
    expect(Object.keys(RAL_FAMILY_NAMES_EN).sort()).toEqual([...families].sort());
    const quote = (en: boolean) => fixture({
      pdf_in_inglese: en,
      verniciatura_ral: { color: "6021", textured: false },
      prodotti: families.map(fam => seriesProduct(`F${fam}0000000IN`, 10, 1)),
      totale_finale: families.length * 10,
    });
    for (const en of [false, true]) {
      const text = plain(buildQuotePdfFile(quote(en)).bytes);
      const print = buildOneTimeQuotePrintHtml(quote(en) as never);
      const dictionary = en ? RAL_FAMILY_NAMES_EN : RAL_FAMILY_NAMES;
      for (const fam of families) {
        expect(text).toContain(dictionary[fam]);
        expect(print).toContain(dictionary[fam]);
      }
    }
  });

  it("renders special code and asterisk blue-bold, finish and forfait bold — like the print copy", () => {
    const text = latin1(buildQuotePdfFile(fixture({
      prodotti: [
        { codice: "FCA001", descrizione: "Staffa Ø12", prodotto_di_serie: false, quantita: 3, prezzo_netto_unitario_finale: 40, totale_finale: 120 },
        { descrizione: "Lavorazione speciale", a_forfait: true, prodotto_di_serie: false, valore_forfait: 50 },
      ],
      totale_finale: 170,
    })).bytes);
    // codice speciale + asterisco in blu #005eb8 e Helvetica-Bold (F2)
    expect(text).toMatch(/BT 0 0\.369 0\.722 rg \/F2 9\.5 Tf[^B]*\(\* FCA001\) Tj ET/);
    // asterisco della legenda blu-grassetto, seguito dal testo normale
    expect(text).toMatch(/BT 0 0\.369 0\.722 rg \/F2 8\.5 Tf[^B]*\(\*\) Tj ET/);
    expect(text).toMatch(/BT 0 g \/F1 8\.5 Tf[^B]*\( PRODOTTO SPECIALE REALIZZATO SU DISEGNO\) Tj ET/);
    // colore e finitura in grassetto
    expect(text).toMatch(/BT 0 g \/F2 8 Tf[^B]*\(Colore: NERO RAL 9005 · LISCIO\) Tj ET/);
    // «a forfait/da definire» in grassetto
    expect(text).toMatch(/BT 0 g \/F2 8 Tf[^B]*\(a forfait\/da definire\) Tj ET/);
  });
});
