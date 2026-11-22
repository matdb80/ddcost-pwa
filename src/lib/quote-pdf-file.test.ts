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
    // La pagina condizioni testuale cita il contributo: l'assenza si verifica
    // sull'etichetta del blocco totali (maiuscola iniziale), non sul testo citato.
    expect(atThreshold).not.toContain('Contributo "spese di evasione"');
    const hidden = latin1(buildQuotePdfFile(fixture({ totale_finale: 120 }), undefined, { hideDocumentTotal: true }).bytes);
    expect(hidden).not.toContain("Totale netto preventivo");
    expect(hidden).not.toContain('Contributo "spese di evasione"');
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

  it("appends the clean text sale-conditions page exactly once", () => {
    const bytes = buildQuotePdfFile(fixture()).bytes;
    const raw = latin1(bytes);
    const pageObjects = raw.match(/\/Type\s*\/Page(?![a-zs])/g) ?? [];
    // 1 pagina di preventivo + 1 pagina condizioni testuale (una sola volta)
    expect(pageObjects.length).toBe(2);
    expect(raw).toContain("/Count 2");
    // Solo il testo dello screenshot ufficiale, bilingue, senza la pagina raster originale
    const text = plain(bytes);
    expect(text).toContain("CONDIZIONI DI VENDITA - CONDITIONS OF SALE");
    for (const heading of ["COMMISSIONI", "CONFEZIONI", "TERMINI DI CONSEGNA", "RISCHI IMBALLI", "RESI", "DISEGNI", "PAGAMENTI", "PORTO", "RECLAMI", "DOMICILIO LEGALE",
      "COMMISSIONS", "PACKAGES", "TERMS OF DELIVERY", "PACKAGING RISKS", "RETURNED GOODS", "DRAWINGS", "PAYMENT", "PORT", "COMPLAINTS", "LEGAL DOMICILE"])
      expect(text).toContain(heading);
    // la maggiorazione per sconfezionamento citata in entrambe le lingue (token mai spezzato dal wrapping)
    expect((text.match(/20%/g) ?? []).length).toBeGreaterThanOrEqual(2);
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
    // (v14: corpo uniforme 10pt come il modello approvato — la stampa non riduce le righe)
    expect(text).toMatch(/BT 0 0\.369 0\.722 rg \/F2 10 Tf[^B]*\(\* FCA001\) Tj ET/);
    // asterisco della legenda blu-grassetto 9pt, seguito dal testo normale
    expect(text).toMatch(/BT 0 0\.369 0\.722 rg \/F2 9 Tf[^B]*\(\*\) Tj ET/);
    expect(text).toMatch(/BT 0 g \/F1 9 Tf[^B]*\( PRODOTTO SPECIALE REALIZZATO SU DISEGNO\) Tj ET/);
    // colore e finitura in grassetto 10pt
    expect(text).toMatch(/BT 0 g \/F2 10 Tf[^B]*\(Colore: NERO RAL 9005 · LISCIO\) Tj ET/);
    // «a forfait/da definire» in grassetto 10pt
    expect(text).toMatch(/BT 0 g \/F2 10 Tf[^B]*\(a forfait\/da definire\) Tj ET/);
  });
});

// Correzioni revisione v12 (2026-11-22): allineamento del PDF allegato alla
// copia «Esporta PDF cliente» e stampa maiuscola dei codici temporanei storici.
describe("quote PDF file — v12: tabella allineata e codici storici maiuscoli", () => {
  /** Il caso reale del collaudo: preventivo DDC90005/2026 revisione 2. */
  const ddc90005 = () => fixture({
    numero_preventivo: "DDC90005/2026",
    cliente: "SIMONE SOMMOVIGO",
    prodotti: [{
      codice: "TCS0000009In", // finitura minuscola, come salvato dallo storico
      descrizione: "CATENACCIO LEGGERO cm15 ZANCATO mm16 NERO",
      materiale_prodotto: "ferro",
      prodotto_di_serie: false,
      quantita: 14,
      prezzo_netto_unitario_finale: 9.18,
      totale_finale: 128.55,
    }],
    totale_finale: 128.55,
  });

  it("presents the historical lowercase finish as uppercase in BOTH customer PDFs, without rewriting the saved code", () => {
    const doc = ddc90005();
    const before = structuredClone(doc);
    const file = plain(buildQuotePdfFile(doc, undefined, { revision: 2 }).bytes);
    const print = buildOneTimeQuotePrintHtml(doc, undefined, undefined, { revision: 2 });
    for (const output of [file, print]) {
      expect(output).toContain("TCS0000009IN");
      expect(output).not.toContain("TCS0000009In");
      expect(output).toContain("14 pz");
      expect(output).toContain("€ 9,18");
      expect(output).toContain("€ 128,55"); // netto
      expect(output).toContain("€ 15,00");  // spese di evasione
      expect(output).toContain("€ 143,55"); // totale con spese di evasione
    }
    expect(doc).toEqual(before); // i dati salvati non vengono riscritti
    expect(buildQuotePdfFile(ddc90005(), undefined, { revision: 2 }).fileName).toBe("2026_DDC90005_REV.2.pdf");
  });

  it("uppercases the finish of every temporary family (fixed and manual), preserving sequence and leading zeros", async () => {
    const { TEMPORARY_FAMILIES } = await import("./ral-pricing");
    expect(TEMPORARY_FAMILIES).toHaveLength(14);
    const cases: Array<[string, string]> = [];
    TEMPORARY_FAMILIES.forEach((fam, i) => {
      const seq = String(i + 1).padStart(7, "0"); // progressivo con zeri iniziali
      cases.push([`T${fam}${seq}In`, `T${fam}${seq}IN`]);  // ferro, finitura fissa
      cases.push([`T${fam}${seq}Xp`, `T${fam}${seq}XP`]);  // inox 304
      cases.push([`T${fam}${seq}6p`, `T${fam}${seq}6P`]);  // inox 316
      cases.push([`T${fam}${seq}Bb`, `T${fam}${seq}BB`]);  // ottone, finitura manuale
      cases.push([`T${fam}${seq}Az`, `T${fam}${seq}AZ`]);  // alluminio, finitura manuale
    });
    const doc = fixture({
      prodotti: cases.map(([saved]) => ({
        codice: saved, descrizione: "Speciale", prodotto_di_serie: false,
        quantita: 1, prezzo_netto_unitario_finale: 10, totale_finale: 10,
      })),
      totale_finale: cases.length * 10,
    });
    const before = structuredClone(doc);
    const file = plain(buildQuotePdfFile(doc).bytes);
    const print = buildOneTimeQuotePrintHtml(doc);
    for (const [saved, shown] of cases) {
      expect(file).toContain(shown);
      expect(print).toContain(shown);
      expect(file).not.toContain(saved);
      expect(print).not.toContain(saved);
    }
    expect(doc).toEqual(before);
  });

  it("leaves series codes, natural finishes, RAL codes and unknown families untouched", async () => {
    const { presentTemporaryCode } = await import("./ral-pricing");
    const untouched = [
      "FCA00504HBIN",        // codice di serie
      "TCS0000009IN",        // già maiuscolo
      "TCS0000009I0",        // naturale/grezzo
      "TCS0000009IO9005",    // RAL
      "TCS0000009I",         // 11 caratteri: completato altrove da documentProductCode
      "TZZ0000001In",        // famiglia inesistente
      "TCS0000000In",        // progressivo zero: mai emesso
      "TCS000009In",         // progressivo corto: non è un temporaneo
      "",
    ];
    for (const code of untouched) expect(presentTemporaryCode(code)).toBe(code.trim());
    expect(presentTemporaryCode("TCS0000009In")).toBe("TCS0000009IN");
    expect(presentTemporaryCode(" TBC0000042Ip ")).toBe("TBC0000042IP");
  });

  /** Nessuna riga orizzontale può cadere dentro il box dei glifi (bordo che «taglia» il testo). */
  const expectNoBorderCrossesText = (bytes: Uint8Array) => {
    const raw = latin1(bytes);
    const streams = [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
      .map(m => m[1]).filter(s => s.includes(" Tj "));
    expect(streams.length).toBeGreaterThan(0);
    for (const stream of streams) {
      const texts = [...stream.matchAll(/BT [^/]*\/F\d ([\d.]+) Tf 1 0 0 1 ([\d.-]+) ([\d.-]+) Tm \((.*?)\) Tj ET/g)]
        .map(m => ({ size: Number(m[1]), x: Number(m[2]), y: Number(m[3]), w: m[4].length * 0.6 * Number(m[1]) }));
      const lines = [...stream.matchAll(/([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g)]
        .map(m => ({ x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) }))
        .filter(l => l.y1 === l.y2);
      for (const t of texts) for (const l of lines) {
        if (t.x > l.x2 || t.x + t.w < l.x1) continue; // nessuna sovrapposizione orizzontale
        const boxLow = t.y - 0.25 * t.size, boxHigh = t.y + 0.95 * t.size; // discendenti e maiuscole accentate
        expect(l.y1 < boxLow || l.y1 > boxHigh,
          `bordo a y=${l.y1} dentro il box [${boxLow.toFixed(2)}, ${boxHigh.toFixed(2)}] del testo a y=${t.y} (${t.size}pt)`).toBe(true);
      }
    }
  };

  it("never draws a table border through the glyphs, on the DDC90005 case", () => {
    expectNoBorderCrossesText(buildQuotePdfFile(ddc90005(), undefined, { revision: 2 }).bytes);
  });

  it("repeats the boxed header on every page of a multi-page quote with multi-line descriptions", () => {
    const longDescription = "CATENACCIO LEGGERO cm15 ZANCATO mm16 NERO con finitura speciale e descrizione su più righe";
    const doc = fixture({
      prodotti: Array.from({ length: 60 }, (_, i) => ({
        codice: `TCS00000${String(i + 1).padStart(2, "0")}In`,
        descrizione: longDescription,
        materiale_prodotto: "ferro",
        prodotto_di_serie: false,
        quantita: 14,
        prezzo_netto_unitario_finale: 9.18,
        totale_finale: 128.55,
      })),
      totale_finale: 60 * 128.55,
    });
    const pdf = buildQuotePdfFile(doc, undefined, { revision: 2 });
    const raw = latin1(pdf.bytes);
    const pages = raw.match(/\/Type\s*\/Page(?![a-zs])/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(4); // almeno 3 pagine tabella + condizioni
    // intestazione BIANCA (la stampa omette gli sfondi): il proxy della
    // ripetizione è il testo dell'intestazione, una volta per pagina tabella
    const headers = raw.match(/\(Prezzo netto unitario\) Tj/g) ?? [];
    expect(headers.length).toBe(pages.length - 1); // intestazione ripetuta in ogni pagina tabella
    expectNoBorderCrossesText(pdf.bytes);           // nessun bordo taglia il testo in nessuna pagina
  });
});

describe("quote PDF file — v13: un solo PDF per entrambi i pulsanti", () => {
  it("is deterministic: two consecutive builds produce byte-identical files (stesso SHA-256 per export ed email)", () => {
    const doc = fixture({
      numero_preventivo: "DDC90005/2026",
      cliente: "SIMONE SOMMOVIGO",
      prodotti: [{
        codice: "TCS0000009In",
        descrizione: "CATENACCIO LEGGERO cm15 ZANCATO mm16 NERO",
        materiale_prodotto: "ferro",
        prodotto_di_serie: false,
        quantita: 14,
        prezzo_netto_unitario_finale: 9.18,
        totale_finale: 128.55,
      }],
      totale_finale: 128.55,
    });
    const first = buildQuotePdfFile(doc, undefined, { revision: 2 });
    const second = buildQuotePdfFile(doc, undefined, { revision: 2 });
    expect(second.fileName).toBe(first.fileName);
    expect(second.bytes.length).toBe(first.bytes.length);
    expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);
  });
});

// Correzioni revisione v14 (2026-11-22): ripristino dell'impaginazione del
// modello approvato (2026_DDC90005_REV.2_CORRETTO.pdf) dopo i rilievi:
// prima riga prodotto ~20 mm troppo in alto e corpo ridotto delle righe a capo.
describe("quote PDF file — v14: impaginazione del modello approvato", () => {
  const ddc = () => fixture({
    numero_preventivo: "DDC90005/2026",
    cliente: "SIMONE SOMMOVIGO",
    riferimento_preventivo: "",
    prodotti: [{
      codice: "TCS0000009In",
      descrizione: "CATENACCIO LEGGERO cm15 ZANCATO mm16 NERO",
      materiale_prodotto: "ferro",
      prodotto_di_serie: false,
      quantita: 14,
      prezzo_netto_unitario_finale: 9.18,
      totale_finale: 128.55,
    }],
    totale_finale: 128.55,
  });

  it("uses the model's type sizes: 19pt title, 10pt table header and ALL product lines at 10pt (wrapped lines included)", () => {
    const text = plain(buildQuotePdfFile(ddc(), undefined, { revision: 2 }).bytes);
    expect(text).toMatch(/\/F2 19 Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \(Preventivo una tantum\) Tj/);
    expect(text).toMatch(/\/F2 10 Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \(Prezzo netto unitario\) Tj/);
    expect(text).toMatch(/\/F2 10 Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \(\* TCS0000009IN\) Tj/);
    expect(text).toMatch(/\/F1 10 Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \( · CATENACCIO LEGGERO cm15\) Tj/);
    // il rilievo: la descrizione a capo NON deve più scendere sotto i 10pt
    expect(text).toMatch(/\/F1 10 Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \(ZANCATO mm16 NERO — FERRO\) Tj/);
    expect(text).toMatch(/\/F2 10 Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \(Colore: NERO RAL 9005 · LISCIO\) Tj/);
    expect(text).not.toMatch(/\/F1 8 Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \(ZANCATO/);
  });

  it("places the first product row back at the model's position (~368pt from the top, not ~20mm higher)", () => {
    const text = plain(buildQuotePdfFile(ddc(), undefined, { revision: 2 }).bytes);
    const m = [...text.matchAll(/\/F1 10 Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \(1\) Tj/g)];
    expect(m.length).toBeGreaterThan(0);
    const yFromTop = 841.89 - Number(m[0][2]); // coordinate PDF → distanza dall'alto
    // modello: baseline della prima riga a 367,6pt dall'alto; la v13 la metteva a ~308pt
    expect(yFromTop).toBeGreaterThan(366);
    expect(yFromTop).toBeLessThan(370);
  });

  it("draws the meta box with bold revision and bold colour value, as in the model", () => {
    const text = plain(buildQuotePdfFile(ddc(), undefined, { revision: 2 }).bytes);
    expect(text).toMatch(/\/F1 10 Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \(DDC90005\/2026\) Tj/);
    expect(text).toMatch(/\/F2 10 Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \( — Revisione 2\) Tj/);
    expect(text).toMatch(/\/F2 10 Tf 1 0 0 1 [\d.]+ [\d.]+ Tm \(NERO RAL 9005\) Tj/);
  });
});

// Correzione v15 (2026-11-23): cella «Prezzo netto unitario» dei prodotti di
// serie con sconto e RAL. Il rilievo: «Prezzo netto con RAL: € 18,0000»
// sconfina nella colonna Quantità. Ora il testo va a capo dentro la cella e
// l'altezza della riga si adegua (caso: FSP001012NIN, 2 pz, € 10, −10%, RAL 6021).
describe("quote PDF file — v15: prezzo unitario di serie a capo nella cella", () => {
  const serieCase = (en: boolean) => fixture({
    numero_preventivo: "DDC90010/2026",
    pdf_in_inglese: en,
    verniciatura_ral: { color: "6021", textured: false },
    prodotti: [{
      codice: "FSP001012NIN",
      descrizione: "Spagnoletta",
      prodotto_di_serie: true,
      quantita: 2,
      prezzo_serie: 10,
      sconto_serie: "10",
      prezzo_netto_unitario_finale: 18,
      totale_finale: 36,
    }],
    totale_finale: 36,
  });

  // Bordo sinistro della colonna «Prezzo netto unitario» + padding cella:
  // MARGIN 39,75 + 18,75 + 263,25 + 53,25 = 375,0; +6,5 = 381,5.
  const UNIT_CELL_MIN_X = 381.4;
  const unitOps = (bytes: Uint8Array) =>
    [...latin1(bytes).matchAll(/BT 0 g \/F1 10 Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \((.*?)\) Tj/g)]
      .map(m => ({ x: Number(m[1]), text: (m[3] ?? "").replace(/\\([()\\])/g, "$1").replace(/\x80/g, "€") }));

  it("IT: il prezzo con RAL va a capo nella cella, senza toccare la colonna Quantità", () => {
    const pdf = buildQuotePdfFile(serieCase(false), undefined, { revision: 1 });
    const text = plain(pdf.bytes);
    // le righe logiche restano, ma spezzate: niente stringa intera in un'unica riga
    expect(text).not.toContain("(Prezzo netto con RAL: € 18,0000)");
    expect(text).toContain("(Prezzo netto con)");
    expect(text).toContain("(RAL: € 18,0000)");
    expect(text).toContain("(Sconto: 10%)");
    // ogni riga della cella resta a destra del bordo sinistro della colonna
    const cell = unitOps(pdf.bytes).filter(o =>
      /Prezzo unitario|Sconto: 10%|Prezzo netto con|RAL: € 18,0000/.test(o.text));
    expect(cell.length).toBeGreaterThanOrEqual(4);
    for (const op of cell) expect(op.x).toBeGreaterThan(UNIT_CELL_MIN_X);
  });

  it("EN: same wrapping — 'Net price including RAL' stays inside the unit-price cell", () => {
    const pdf = buildQuotePdfFile(serieCase(true), undefined, { revision: 1 });
    const text = plain(pdf.bytes);
    expect(text).not.toContain("(Net price including RAL: € 18.0000)");
    expect(text).toContain("(Net price including)");
    expect(text).toContain("(RAL: € 18.0000)");
    expect(text).toContain("(Discount: 10%)");
    const cell = unitOps(pdf.bytes).filter(o =>
      /Unit price|Discount: 10%|Net price including|RAL: € 18\.0000/.test(o.text));
    expect(cell.length).toBeGreaterThanOrEqual(4);
    for (const op of cell) expect(op.x).toBeGreaterThan(UNIT_CELL_MIN_X);
  });

  it("l'altezza della riga si adegua: il bordo inferiore scende sotto l'ultima riga della cella", () => {
    const text = latin1(buildQuotePdfFile(serieCase(false), undefined, { revision: 1 }).bytes);
    // IT: la cella prezzo ha 5 righe disegnate → altezza riga = 15,85 + 4×14,25 + 11,9 = 84,75.
    // Verifica sui bordi orizzontali a tutta larghezza (MARGIN 40 → bordo destro 555,28):
    // la coppia di bordi della riga dati deve distare esattamente 84,75pt.
    const hlines = [...text.matchAll(/0\.796 0\.82 0\.835 RG 0\.7 w 40\.00 ([\d.]+) m 555\.28 [\d.]+ l S/g)]
      .map(m => 841.89 - Number(m[1])) // distanza dall'alto
      .sort((a, b) => a - b);
    const spans = hlines.slice(1).map((y, i) => y - hlines[i]);
    expect(spans.some(s => Math.abs(s - 84.75) < 0.6)).toBe(true);
    // e l'ultima baseline della cella («RAL: € 18,0000») resta dentro la riga:
    // ~11,9pt sopra il bordo inferiore (ROW_BOTTOM), mai oltre.
    const op = /1 0 0 1 [\d.]+ ([\d.]+) Tm \(RAL: \x80 18,0000\) Tj/.exec(text);
    expect(op).toBeTruthy();
    const baselineFromTop = 841.89 - Number(op![1]);
    const rowBottom = hlines.find((y, i) => i > 0 && Math.abs(y - hlines[i - 1] - 84.75) < 0.6) ?? 0;
    expect(rowBottom).toBeGreaterThan(0);
    expect(rowBottom - baselineFromTop).toBeGreaterThan(10.5);
    expect(rowBottom - baselineFromTop).toBeLessThan(13.5);
  });
});
