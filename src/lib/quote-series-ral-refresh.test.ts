import { describe, it, expect } from "vitest";
import { calculateRal, ralOutputCode } from "./ral-pricing";
import {
  documentProductCode,
  normalizeDocumentTemporaryCodes,
} from "./document-product-fields";
import {
  refreshQuoteSeriesRal,
  needsSeriesRalRefresh,
} from "./quote-series-ral-refresh";
import { calculateQuote, blankProduct, blankQuote } from "./quote-calculation";
import { buildOneTimeQuotePrintHtml } from "./quote-pdf";
import { buildCommercialOfferPrintHtml } from "./commercial-offer-pdf";
import { formatQuoteForCopy } from "./quote-copy";
import { salesDocument } from "./commercial-handoff";
const ral = { color: "6021", textured: false };
const series = (code: string, price: number, q = 1) => ({
  ...blankProduct(),
  prodotto_di_serie: true,
  codice: code,
  descrizione: "Articolo prova",
  prezzo_serie: price,
  quantita: q,
  prezzo_netto_unitario_finale: price,
  totale_finale: price * q,
});
const legacy = (): Record<string, any> => {
  const costed = [
    {
      ...blankProduct(),
      codice: "TBC0000010IO6021",
      descrizione: "Cerniera",
      quantita: 22,
      netto_prima_ral: 22.31,
      ral_ricarico_cad: 11.155,
      prezzo_netto_unitario_finale: 33.465,
      totale_finale: 736.23,
      codice_temporaneo: {
        code: "TBC0000010IO6021",
        sequence: 10,
        family: "BC",
        material: "I",
        color: "6021",
      },
      materiale_cad: 999,
      lavoro_h: 999,
    },
    {
      ...blankProduct(),
      codice: "TBC0000011IO6021",
      descrizione: "Cerniera 2",
      quantita: 42,
      netto_prima_ral: 13.1055,
      ral_ricarico_cad: 6.5527,
      prezzo_netto_unitario_finale: 19.6582,
      totale_finale: 825.64,
      codice_temporaneo: {
        code: "TBC0000011IO6021",
        sequence: 11,
        family: "BC",
        material: "I",
        color: "6021",
      },
    },
  ];
  const stock = [
    series("FCA00021ABIN", 10.89, 22),
    series("FCA00504HBIN", 1.98, 42),
    series("FSP001012NIN", 6.83, 11),
    series("FAS00103A3IN", 3.38, 6),
    series("FAS00103", 5.39, 5),
    series("FSP00464F1IN", 1.66, 11),
    series("FSP00463L0IN", 0.62, 11),
  ];
  return {
    ...blankQuote(),
    stato_preventivo: "completo",
    verniciatura_ral: ral,
    prodotti: [...costed, ...stock],
    totale: 2082.05,
    totale_finale: 2082.05,
    ral_riepilogo: calculateRal(
      costed.map(p => ({
        code: p.codice.slice(0, 11),
        net: p.netto_prima_ral,
        quantity: p.quantita,
      })),
      ral
    ),
  };
};
describe("RAL output codes", () => {
  it.each([
    ["FCA00504HBIN", "FCA00504HBIO6021"],
    ["FCA00021ABIN", "FCA00021ABIO6021"],
    ["FSP001012NIN", "FSP001012NIO6021"],
    ["FSP00464F1IN", "FSP00464F1IO6021"],
    ["FSP00463L0IN", "FSP00463L0IO6021"],
    ["FAS00103A3IN", "FAS00103A3IO6021"],
    ["FFP0105XN8XP", "FFP0105XN8XO6021"],
  ])(
    "converts %s without altering the original or charging twice",
    (code, expected) => {
      const p = series(code, 10, 2),
        doc = { ...blankQuote(), verniciatura_ral: ral, prodotti: [p] };
      expect(documentProductCode(p, doc)).toBe(expected);
      expect(p.codice).toBe(code);
      expect(normalizeDocumentTemporaryCodes(doc, "prodotti")).toBe(doc);
      const a = calculateQuote(doc),
        b = calculateQuote(JSON.parse(JSON.stringify(a)));
      expect(b).toEqual(a);
      expect(buildOneTimeQuotePrintHtml(a)).toContain(
        `<strong>${expected}</strong>`
      );
      expect(formatQuoteForCopy(a)).toContain(expected);
      expect(salesDocument("quote", JSON.stringify(a)).rows[0].code).toBe(
        expected
      );
      expect(a.prodotti[0].codice).toBe(code);
    }
  );
  it.each(["LRNG211605N4", "TQU0000001In", "FCA00504HBIO9005", "FAS00103"])(
    "does not fabricate or replace excluded/incomplete/already RAL code %s",
    code => expect(ralOutputCode(code, "6021")).toBe(code)
  );
  it("uses the requested color for display, then restores the base with RAL disabled", () => {
    const p = series("FCA00504HBIN", 10);
    expect(
      documentProductCode(p, {
        verniciatura_ral: { color: "9010", textured: false },
      })
    ).toBe("FCA00504HBIO9010");
    expect(documentProductCode(p, {})).toBe("FCA00504HBIN");
  });
  it("also transforms commercial offer codes after pricing, including consolidated copies", () => {
    const offer = {
      verniciatura_ral: ral,
      righe: [
        { codice: "FCA00504HBIN", lotto: 2, listino: 10, sconto_base: "0" },
      ],
    };
    for (const mode of ["customer", "internal"] as const)
      expect(buildCommercialOfferPrintHtml(offer, mode)).toContain(
        "<strong>FCA00504HBIO6021</strong>"
      );
    expect(buildCommercialOfferPrintHtml(offer, "customer")).toContain("80,00");
    expect(offer.righe[0].codice).toBe("FCA00504HBIN");
    expect(
      documentProductCode(offer.righe[0], {
        ral_consolidato: true,
        ral_riepilogo: calculateRal(
          [{ code: "FCA00504HBIN", net: 10, quantity: 2 }],
          ral
        ),
      })
    ).toBe("FCA00504HBIO6021");
  });
});
describe("saved quote series RAL recovery", () => {
  it("reproduces the PDF missing categories, preserves costed prices and adds all series supplements once", () => {
    const old = legacy(),
      snapshot = structuredClone(old),
      updated = refreshQuoteSeriesRal(old);
    expect(needsSeriesRalRefresh(old)).toBe(true);
    expect(needsSeriesRalRefresh(updated)).toBe(false);
    expect(updated.prodotti.slice(0, 2)).toEqual(
      old.prodotti.slice(0, 2).map((p: any) => ({ ...p, ral_percentuale: 50 }))
    );
    expect(
      updated.prodotti.slice(2).map((p: any) => p.ral_percentuale)
    ).toEqual([50, 50, 100, 100, 100, 100, 100]);
    expect(updated.totale_finale).toBe(2390.86);
    expect(updated.ral_riepilogo.fixed).toBe(50);
    expect(updated.summary).toContain("2390,86");
    expect(old).toEqual(snapshot);
    expect(refreshQuoteSeriesRal(JSON.parse(JSON.stringify(updated)))).toEqual(
      updated
    );
    const html = buildOneTimeQuotePrintHtml(old);
    for (const text of [
      "Cardini (Standard)",
      "Spagnolette (Standard)",
      "Aste (Standard)",
      "100,21",
      "161,37",
      "47,23",
      "FCA00504HBIO6021",
      "FSP00463L0IO6021",
    ])
      expect(html).toContain(text);
    expect(html.match(/Cambio colore \(una volta per ordine\)/g)).toHaveLength(
      1
    );
    expect(formatQuoteForCopy(old)).toContain("2390,86");
    expect(() => salesDocument("quote", JSON.stringify(old))).toThrow(
      "Aggiorna e salva"
    );
    expect(salesDocument("quote", JSON.stringify(updated)).rows[4].code).toBe(
      "FSP001012NIO6021"
    );
  });
  it("leaves unaffected historic quotes untouched and refuses to guess missing pre-RAL amounts", () => {
    const old = legacy();
    expect(
      refreshQuoteSeriesRal<Record<string, any>>({
        ...old,
        verniciatura_ral: null,
      }).totale_finale
    ).toBe(old.totale_finale);
    expect(
      refreshQuoteSeriesRal<Record<string, any>>({
        ...old,
        ral_consolidato: true,
      }).totale_finale
    ).toBe(old.totale_finale);
    delete (old.prodotti[0] as any).netto_prima_ral;
    expect(() => refreshQuoteSeriesRal(old)).toThrow(
      "manca il prezzo prima RAL"
    );
  });
  it("applies discounts and inox rates to old series-only quotes without compounding on reopen", () => {
    const doc: Record<string, any> = {
      ...blankQuote(),
      verniciatura_ral: ral,
      prodotti: [{ ...series("FSP001012NXP", 10, 10), sconto_serie: "40+15%" }],
    };
    const a = refreshQuoteSeriesRal(doc);
    expect(a.prodotti[0].prezzo_netto_unitario_finale).toBeCloseTo(7.65, 4);
    expect(a.totale_finale).toBe(126.5);
    expect(refreshQuoteSeriesRal(a)).toEqual(a);
  });
});
