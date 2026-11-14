import { describe, it, expect } from "vitest";
import type {Product,QuoteDocument} from "./quote-calculation";
import {
  blankProduct,
  blankQuote,
  calculateQuote,
  duplicateProductForNewLot,
} from "./quote-calculation";
import { seriesDiscount } from "./series-discount";
import { seriesNetPrice, seriesProductError } from "./quote-series";
import {
  quoteCostCompleteness,
  withCostCompleteness,
} from "./quote-cost-completeness";
import { quoteInoxError } from "./quote-inox";
import { calculateQuoteMaterial } from "./quote-material-weight";
import { buildOneTimeQuotePrintHtml } from "./quote-pdf";
import { buildCommercialOfferPrintHtml } from "./commercial-offer-pdf";
import { calculateRal, temporaryCode, ralRate } from "./ral-pricing";
import { ralPrintSummary } from "./ral-print-summary";
import { documentProductDescription } from "./document-product-fields";
import { salesDocument } from "./commercial-handoff";
const smooth = { color: "9010", textured: false };
const series = (more = {}) => ({
  ...blankProduct(),
  prodotto_di_serie: true,
  codice: "TFP0000001In",
  descrizione: "Fermaimposta",
  quantita: 10,
  prezzo_serie: 10,
  ...more,
});
const costed = () => ({
  ...blankProduct(),
  descrizione: "Test",
  codice: "TAM0000002In",
  materiale_cad: 1,
  lavoro_h: 1,
  costo_lavoro: 24,
  trattamenti_cad: 1,
});
describe("series discounts and RAL", () => {
  it.each([
    ["", 1],
    ["40%", 0.6],
    ["40+15%", 0.51],
    ["40+15+5%", 0.4845],
    [" 40% + 15% + 5% ", 0.4845],
    ["2,5%", 0.975],
    ["100%", 0],
  ])("applies successive discount %s", (text, factor) =>
    expect(seriesDiscount(text).factor).toBeCloseTo(factor)
  );
  it.each(["1+2+3+4", "-1", "101", "40++5", "abc", "5% x 2", "NaN"])(
    "rejects malformed discount %s",
    s =>
      expect(seriesProductError(series({ sconto_serie: s }))).toMatch(/scont/i)
  );
  it("uses discounted net then RAL, recalculates idempotently and removes only RAL when deselected", () => {
    const doc = {
      ...blankQuote(),
      verniciatura_ral: smooth,
      prodotti: [series({ sconto_serie: "40+15+5%" })],
    };
    const r = calculateQuote(doc);
    expect(seriesNetPrice(doc.prodotti[0])).toBe(4.845);
    expect(r.prodotti[0]).toMatchObject({
      netto_prima_ral: 4.845,
      ral_percentuale: 100,
      ral_ricarico_cad: 4.845,
      prezzo_netto_unitario_finale: 9.69,
      totale_finale: 96.9,
    });
    expect(r.totale_finale).toBe(146.9);
    expect(r.ral_riepilogo.fixed).toBe(50);
    expect(calculateQuote(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(
      calculateQuote({ ...r, verniciatura_ral: null }).totale_finale
    ).toBeCloseTo(48.45);
    const html = buildOneTimeQuotePrintHtml(r);
    for (const text of [
      "40+15+5%",
      "10,00",
      "9,69",
      "146,90",
      "Fermaimposte (Standard)",
      "RAL 9010",
      "Bianco puro",
    ])
      expect(html).toContain(text);
    expect(salesDocument("quote", JSON.stringify(r)).rows[0]).toMatchObject({
      listPrice: "10,00",
      discount: "40+15+5%",
      netPrice: "9,69",
    });
  });
  it("charges the fixed fee once across mixed rows and keeps forfait outside RAL", () => {
    const doc = {
      ...blankQuote(),
      verniciatura_ral: smooth,
      prodotti: [
        series(),
        { ...costed(), prezzo_manuale: 10, quantita: 10 },
        {
          ...blankProduct(),
          a_forfait: true,
          descrizione: "Extra",
          valore_forfait: 20,
        },
      ],
    };
    const r = calculateQuote(doc);
    expect(r.ral_riepilogo.fixed).toBe(50);
    expect(r.totale_finale).toBe(420);
    expect(r.prodotti[2].totale_finale).toBe(20);
    expect(r.prodotti[2].ral_percentuale).toBeUndefined();
  });
  it("honors series inox, nylon, already-painted codes and textured incompatibility", () => {
    const r = calculateQuote({
      ...blankQuote(),
      verniciatura_ral: smooth,
      prodotti: [
        series({ codice: "TFP0000001XP" }),
        series({ codice: "TFP0000002N4" }),
        series({ codice: "TFP0000003IO9010" }),
      ],
    });
    expect(r.prodotti.map((p: any) => p.ral_percentuale)).toEqual([40, 0, 0]);
    expect(r.totale_finale).toBe(390);
    expect(() =>
      calculateQuote({ ...r, verniciatura_ral: { ...smooth, textured: true } })
    ).toThrow(/inox/);
  });
  it("retains unpainted QU but excludes it from RAL and allows AS and SP", () => {
    expect(temporaryCode(1, "QU", "I")).toBe("TQU0000001In");
    expect(() => temporaryCode(1, "QU", "I", "9010")).toThrow(/esclusa/);
    expect(ralRate("TQU0000001In", false).percent).toBe(0);
    for (const f of ["AS", "SP"])
      expect(temporaryCode(1, f, "X", "9010")).toHaveLength(16);
  });
});
describe("cost completeness", () => {
  it("checks only active cost modes and excludes forfait and series", () => {
    const d:QuoteDocument = {
      ...blankQuote(),
      lavoro_modalita: "per_prodotto",
      prodotti: [costed(), series(), { a_forfait: true }],
      trattamenti_modalita: "ore_lavoro",
    };
    d.prodotti[0].trattamenti_cad = 0;
    expect(quoteCostCompleteness(d).issues).toEqual([]);
    d.trattamenti_modalita = "per_prodotto";
    expect(quoteCostCompleteness(d).issues).toEqual([
      "Prodotto 1: trattamenti",
    ]);
    d.trattamenti_modalita = "globale";
    d.trattamenti_totale_euro = 10;
    expect(quoteCostCompleteness(d).issues).toEqual([]);
    d.prodotti[0].lavoro_h = 0;
    d.lavoro_modalita = "complessivo";
    d.lavoro_ore_totali = 10;
    expect(quoteCostCompleteness(d).issues).toEqual([]);
  });
  it("requires an explicit acknowledgement, persists it, invalidates it when inputs change", () => {
    const d:QuoteDocument = {
      ...blankQuote(),
      lavoro_modalita: "per_prodotto",
      prodotti: [{ ...costed(), materiale_cad: 0 }],
    };
    expect(() => withCostCompleteness(d)).toThrow(/Conferma esplicitamente/);
    const confirmed = withCostCompleteness(d, true);
    expect(confirmed.costi_incompleti).toEqual(["Prodotto 1: materiale"]);
    expect(withCostCompleteness(JSON.parse(JSON.stringify(confirmed)))).toEqual(
      confirmed
    );
    expect(() =>
      withCostCompleteness({
        ...confirmed,
        prodotti: [{ ...d.prodotti[0], lavoro_h: 0 }],
      })
    ).toThrow();
    expect(
      withCostCompleteness({ ...confirmed, prodotti: [costed()] })
        .costi_incompleti
    ).toEqual([]);
  });
  it("checks material calculated from geometry rather than its inactive manual price", () => {
    const p = {
      ...costed(),
      materiale_prodotto: "ferro",
      costo_materiale_noto: false,
      materiale_cad: 0,
      geometria_materiale: "tubo",
      lunghezza_mm: 100,
      diametro_mm: 10,
      diametro_interno_mm: 6,
      costo_materiale_kg: 4,
    };
    expect(quoteCostCompleteness({ prodotti: [p] }).issues).toEqual([]);
    expect(
      quoteCostCompleteness({ prodotti: [{ ...p, diametro_interno_mm: 12 }] })
        .issues
    ).toEqual(["Prodotto 1: materiale"]);
  });
});
it("copies the selected first row immediately after its source with an independent quantity and nested data", () => {
  const rows:Product[] = [
    { ...costed(), quantita: 10, oggetto_modifica: ["occhio"] },
    series(),
  ];
  const copy = duplicateProductForNewLot(rows, 0);
  expect(copy[1].descrizione).toBe("Test");
  expect(copy[1].quantita).toBe("");
  copy[1].oggetto_modifica.push("collo");
  expect(rows[0].oggetto_modifica).toEqual(["occhio"]);
  expect(copy[0].quantita).toBe(10);
});
it("distinguishes inox densities, prints the explicit grade and rejects code disagreement", () => {
  const p = {
    ...costed(),
    materiale_prodotto: "inox",
    costo_materiale_noto: false,
    geometria_materiale: "piatto",
    lunghezza_mm: 100,
    larghezza_mm: 100,
    spessore_mm: 1,
    costo_materiale_kg: 10,
  };
  expect(
    calculateQuoteMaterial({ ...p, inox_aisi: "304" }).theoreticalWeightKg
  ).toBeCloseTo(0.079);
  expect(
    calculateQuoteMaterial({ ...p, inox_aisi: "316" }).theoreticalWeightKg
  ).toBeCloseTo(0.08);
  expect(calculateQuoteMaterial(p).theoreticalWeightKg).toBeCloseTo(0.08);
  expect(documentProductDescription({ ...p, inox_aisi: "304" })).toBe(
    "Test — INOX AISI 304"
  );
  expect(quoteInoxError({ ...p, inox_aisi: "" })).toContain("Seleziona");
  expect(
    quoteInoxError({
      ...p,
      inox_aisi: "316",
      codice_temporaneo: { material: "X" },
    })
  ).toContain("rigenera");
});
it("prints commercial RAL categories, both substrates and exclusions without duplicate fixed fees", () => {
  const lines = [
    { code: "TAS0000001In", net: 10, quantity: 2 },
    { code: "TAS0000002XP", net: 10, quantity: 3 },
    { code: "TZZ0000003In", net: 10, quantity: 1 },
    { code: "TFP0000004N4", net: 2, quantity: 1 },
    { code: "TFP0000005IO9010", net: 3, quantity: 1 },
  ];
  const html = ralPrintSummary(calculateRal(lines, smooth));
  for (const s of [
    "Aste (Standard)",
    "Aste (Inox)",
    "Altri articoli (ZZ)",
    "20,00",
    "15,00",
    "nylon",
    "già RAL",
    "Bianco puro",
  ])
    expect(html).toContain(s);
  expect(html.match(/Cambio colore/g)).toHaveLength(1);
  expect(ralPrintSummary(null)).toBe("");
  const offer = buildCommercialOfferPrintHtml(
    {
      verniciatura_ral: smooth,
      righe: lines.map(p => ({
        codice: p.code,
        listino: p.net,
        lotto: p.quantity,
      })),
    },
    "customer"
  );
  expect(offer).toContain("Riepilogo supplementi RAL");
  expect(offer).toContain("Aste (Inox)");
  expect(
    buildCommercialOfferPrintHtml(
      { righe: [{ codice: "TAS0000001In", listino: 10, lotto: 2 }] },
      "customer"
    )
  ).not.toContain("Riepilogo supplementi RAL");
});
it("shows alternative lot supplements separately without an aggregate order total", () => {
  const code = "TFP0000001In";
  const row = {
    codice: code,
    descrizione: "Test",
    lotto: 10,
    lotti_selezionati: [10, 20],
    listino: 10,
    sconto_base: "0",
    data: {
      dataJson: JSON.stringify({
        codice: code,
        lotto: "10",
        costo_lavoro_min: 0.34,
        ricarico_spese: 0,
        margine_minimo: 0,
        righe: [
          {
            categoria: "COMPONENTE",
            nr_componenti: 1,
            costo_unitario: 4,
            considera: true,
          },
        ],
      }),
    },
  };
  const html = buildCommercialOfferPrintHtml(
    { verniciatura_ral: smooth, righe: [row] },
    "customer"
  );
  expect(html).toContain("lotto 10");
  expect(html).toContain("lotto 20");
  expect(html).toContain("non vanno sommati");
  expect(html).not.toContain("Totale netto offerta:");
});
