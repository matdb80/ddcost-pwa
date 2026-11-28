import { describe, expect, it } from "vitest";
import { buildCommercialOfferPrintHtml } from "./commercial-offer-pdf";
import { calculateOfferLotPrice } from "./commercial-offer-pricing";
import { buildDistributorOffer, distributorNetPriceFromFinalPrice, previewCommercialOfferSplit } from "./commercial-offer-split";

function offer() {
  return {
    nome: "2026/001",
    cliente: "Cliente finale",
    righe: [{
      codice: "ART-01",
      descrizione: "Prodotto di prova",
      lotto: 10,
      lotti_selezionati: [10, 100],
      prezzi_lotti: {
        "10": { prezzo_netto_manuale: 10 },
        "100": { prezzo_netto_manuale: 9 },
      },
      ricarico_costi_fissi_pct: 20,
      margine_netto_desiderato_pct: 25,
      data: {
        record_id: 7,
        root_id: 7,
        rev: 2,
        codice: "ART-01",
        descrizione: "Prodotto di prova",
        lotto: "100",
        dataJson: JSON.stringify({
          codice: "ART-01",
          descrizione: "Prodotto di prova",
          lotto: "100",
          costo_lavoro_min: 0.6,
          ricarico_spese: 0.25,
          margine_minimo: 0.2,
          lotti_personalizzati: [10, 100],
          righe: [{ categoria: "COMPONENTE", codice_articolo: "MP-01", descrizione: "Componente", nr_componenti: 1, costo_unitario: 4, considera: true }],
        }),
      },
    }],
  };
}

describe("commercial offer split between end customer and distributor", () => {
  it("calculates the distributor net by reversing markup on purchase price", () => {
    expect(distributorNetPriceFromFinalPrice(100, 25)).toBe(80);
    expect(distributorNetPriceFromFinalPrice(100, 0)).toBe(100);
    expect(() => distributorNetPriceFromFinalPrice(0, 25)).toThrow("Il prezzo finale al cliente deve essere maggiore di zero");
    expect(() => distributorNetPriceFromFinalPrice(100, -1)).toThrow("Il ricarico del distributore deve essere una percentuale non negativa");
  });

  it("previews and derives a distributor price separately for each selected lot", () => {
    const original = offer();
    const preview = previewCommercialOfferSplit(original, 25);
    const distributor = buildDistributorOffer(original, "Distributore", 25);
    const distributorLots = distributor.righe[0].prezzi_lotti as Record<string, { prezzo_finale_riferimento?: number }>;
    const originalLots = original.righe[0].prezzi_lotti as Record<string, { prezzo_netto_manuale?: number }>;

    expect(preview.map(({ lotto, prezzoFinaleCliente, prezzoDistributore }) => [lotto, prezzoFinaleCliente, prezzoDistributore]))
      .toEqual([[10, 10, 8], [100, 9, 7.2]]);
    expect(distributor.cliente).toBe("Distributore");
    expect(calculateOfferLotPrice(distributor.righe[0], 10).netPrice).toBe(8);
    expect(calculateOfferLotPrice(distributor.righe[0], 100).netPrice).toBe(7.2);
    expect(distributorLots["10"].prezzo_finale_riferimento).toBe(10);
    expect(originalLots["10"].prezzo_netto_manuale).toBe(10);
  });

  it("uses the discounted list price when that is the selected final-customer presentation", () => {
    const base = offer();
    const row = {
      ...base.righe[0],
      sconto_base: "40+10%",
      listino: 20,
      prezzi_lotti: { "10": { listino: 20 }, "100": { listino: 18 } },
    };

    const preview = previewCommercialOfferSplit({ ...base, righe: [row] }, 25, "listino_sconto");

    expect(preview.map(({ prezzoFinaleCliente }) => prezzoFinaleCliente)).toEqual([10.8, 9.72]);
    expect(preview[0].prezzoDistributore).toBeCloseTo(8.64, 10);
    expect(preview[1].prezzoDistributore).toBeCloseTo(7.776, 10);
  });

  it("bases the markup on the cent-rounded price shown to the final customer", () => {
    const base = offer();
    const row = {
      ...base.righe[0],
      prezzi_lotti: { "10": { prezzo_netto_manuale: "10,129" } },
      lotto: 10,
      lotti_selezionati: [10],
    };

    const [price] = previewCommercialOfferSplit({ ...base, righe: [row] }, 25);

    expect(price.prezzoFinaleCliente).toBe(10.13);
    expect(price.prezzoDistributore).toBeCloseTo(8.104, 10);
  });

  it("prints separate distributor and agreed end-customer prices without exposing the calculated proposal", () => {
    const original = offer();
    const distributor = buildDistributorOffer({
      ...original,
      righe: [{ ...original.righe[0], lotti_selezionati: [10] }],
    }, "Distributore", 25);
    const html = buildCommercialOfferPrintHtml(distributor, "customer", "netto", "/logo.png", {
      showCalculatedPriceComparison: false,
      showFinalCustomerReferencePrice: true,
      unitPriceFractionDigits: 4,
    });

    expect(html).toContain("<h1>Offerta commerciale</h1>");
    expect(html).not.toContain("Offerta commerciale al distributore");
    expect(html).not.toContain("Offerta commerciale al cliente finale");
    expect(html).toContain("text-align: center");
    expect(html).toContain(".meta-value { display: block; font-size: 10.8pt; font-weight: 700; }");
    expect(html).toContain("<b>Numero offerta</b><span class=\"meta-value\">2026/001</span>");
    expect(html).toMatch(/<b>Data<\/b><span class="meta-value">\d{2}\/\d{2}\/\d{4}<\/span>/);
    expect(html).toContain("<b>Cliente</b><span class=\"meta-value\">Distributore</span>");
    expect(html).toContain("<b>Riferimento</b><span class=\"meta-value\">—</span>");
    expect(html).toContain("Prezzo finale cliente €/pz");
    expect(html).toContain("€ 8,0000");
    expect(html).toContain("€ 10,00");
    expect(html).toContain("Totale netto al distributore");
    expect(html).not.toContain("<del>");
  });
});
