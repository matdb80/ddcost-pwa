import { describe, expect, it } from "vitest";
import { blankProduct, blankQuote, calculateQuote } from "./quote-calculation";
import {
  UNPACKING_SURCHARGE_PERCENT,
  isUnpackingSurchargeActive,
  seriesNetPrice,
  seriesNetPriceWithSurcharge,
} from "./quote-series";
import { SALE_CONDITIONS_SECTIONS } from "./sale-conditions-text";

const seriesRow = (overrides: Record<string, unknown> = {}) => ({
  ...blankProduct(),
  prodotto_di_serie: true,
  codice: "FSP001012NIN",
  descrizione: "Spagnololette",
  quantita: 2,
  prezzo_serie: 50,
  ...overrides,
});

describe("supplemento per sconfezionamento (condizioni di vendita, CONFEZIONI/PACKAGES)", () => {
  it("la regola del 20% è quella espressa nel testo delle condizioni allegate", () => {
    // Il fattore di calcolo deve corrispondere alla percentuale citata nella
    // sezione Confezioni/Packages del testo ufficiale allegato ai documenti.
    const confezioni = SALE_CONDITIONS_SECTIONS.find(s => s.it.title === "Confezioni")!;
    expect(confezioni.it.body).toContain("un aumento del 20%");
    expect(confezioni.en.body).toContain("increase of 20%");
    expect(UNPACKING_SURCHARGE_PERCENT).toBe(20);
  });

  it("si applica solo alle righe di serie con il flag attivo", () => {
    expect(isUnpackingSurchargeActive(seriesRow())).toBe(false);
    expect(isUnpackingSurchargeActive(seriesRow({ supplemento_sconfezionamento: true }))).toBe(true);
    // flag spuntato ma riga NON di serie: inerte, né applicato né selezionabile
    const nonSerie = { ...blankProduct(), supplemento_sconfezionamento: true };
    expect(isUnpackingSurchargeActive(nonSerie)).toBe(false);
    expect(seriesNetPriceWithSurcharge(nonSerie)).toBe(seriesNetPrice(nonSerie));
  });

  it("blankProduct nasce senza supplemento", () => {
    expect(blankProduct().supplemento_sconfezionamento).toBe(false);
  });

  it("aumenta il netto di serie del 20% dopo lo sconto di serie", () => {
    expect(seriesNetPriceWithSurcharge(seriesRow({ supplemento_sconfezionamento: true }))).toBe(60);
    // con sconto di serie: 100 -50% = 50 → +20% = 60
    expect(seriesNetPriceWithSurcharge(seriesRow({ prezzo_serie: 100, sconto_serie: "50%", supplemento_sconfezionamento: true }))).toBe(60);
    // arrotondamento a 4 decimali come il netto di serie: 33.3333 × 1.2 = 39.99996 → 40
    expect(seriesNetPriceWithSurcharge(seriesRow({ prezzo_serie: 33.3333, supplemento_sconfezionamento: true }))).toBe(40);
  });

  it("calculateQuote applica il supplemento a unitario e totale di riga", () => {
    const quote = calculateQuote({
      ...blankQuote(),
      prodotti: [seriesRow({ supplemento_sconfezionamento: true })],
    });
    const row = (quote.prodotti as Record<string, number>[])[0];
    expect(row.prezzo_netto_unitario_finale).toBe(60);
    expect(row.totale_finale).toBe(120);
    expect(quote.totale_finale).toBe(120);
  });

  it("senza flag il prezzo di serie resta invariato", () => {
    const quote = calculateQuote({ ...blankQuote(), prodotti: [seriesRow()] });
    const row = (quote.prodotti as Record<string, number>[])[0];
    expect(row.prezzo_netto_unitario_finale).toBe(50);
    expect(row.totale_finale).toBe(100);
  });
});
