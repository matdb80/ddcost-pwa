import { describe, expect, it } from "vitest";
import { calculateOfferLotPrice, generateListinoFromNet, simulationsForOfferRow, withCalculatedOfferRow } from "./commercial-offer-pricing";
import { buildCommercialOfferPrintHtml } from "./commercial-offer-pdf";

function offerRow() {
  const dataJson = JSON.stringify({
    codice: "ART-01",
    descrizione: "Prodotto di prova",
    cliente: "Cliente ciclo",
    lotto: "100",
    costo_lavoro_min: 0.6,
    ricarico_spese: 0.25,
    margine_minimo: 0.2,
    lotti_personalizzati: [10, 100],
    righe: [
      { categoria: "COMPONENTE", codice_articolo: "MP-01", descrizione: "Componente", nr_componenti: 1, costo_unitario: 4, considera: true },
      { categoria: "LAVORAZIONE INTERNA", codice_articolo: "OP-01", descrizione: "Lavorazione", nr_componenti: 1, colpi_min: 1, attrezzaggio_min: 60, lotto_voce: 0, considera: true },
      { categoria: "SPESA ATTREZZATURA DEDICATA", codice_articolo: "ATT-01", descrizione: "Attrezzatura", nr_componenti: 1, costo_unitario: 20, considera: true },
    ],
  });
  return {
    codice: "ART-01",
    descrizione: "Prodotto di prova",
    lotto: 10,
    ricarico_costi_fissi_pct: 20,
    margine_netto_desiderato_pct: 25,
    sconto_base: "40+10%",
    extra: 0,
    data: {
      record_id: 7,
      root_id: 7,
      rev: 2,
      codice: "ART-01",
      descrizione: "Prodotto di prova",
      cliente: "Cliente ciclo",
      lotto: "100",
      dataJson,
    },
  };
}

describe("commercial offer pricing by lot", () => {
  it("loads all configured cycle lots and marks setup/tooling as fixed cost", () => {
    const row = offerRow();
    expect(simulationsForOfferRow(row).map((simulation) => simulation.lotto)).toEqual([10, 100]);

    const small = calculateOfferLotPrice(row, 10);
    const large = calculateOfferLotPrice(row, 100);
    expect(small.simulation.costo_standard).toBeCloseTo(10.2, 8);
    expect(small.fixedCostPerPiece).toBeCloseTo(5.6, 8);
    expect(small.variableCostPerPiece).toBeCloseTo(4.6, 8);
    expect(small.fullCost).toBeCloseTo(11.32, 8);
    expect(small.netPrice).toBe(15.1);
    expect(large.fixedCostPerPiece).toBeCloseTo(0.56, 8);
    expect(large.fullCost).toBeCloseTo(5.272, 8);
    expect(large.netPrice).toBe(7.03);
    expect(large.netPrice).toBeLessThan(small.netPrice);

    const persisted = JSON.parse(JSON.stringify(withCalculatedOfferRow({ ...row, lotto: 100 })));
    expect(persisted.costo_standard_lotto).toBeCloseTo(5.16, 8);
    expect(persisted.full_cost).toBeCloseTo(5.272, 8);
    expect(persisted.prezzo_netto_proposto).toBe(7.03);
    expect(persisted.data.dataJson).toContain('"ART-01"');
  });

  it("inverts chained discounts and rounds the list price up to a cent", () => {
    const result = generateListinoFromNet(37.14, "40+10%");
    expect(result.listino).toBe(68.78);
    expect(result.netAfterDiscount).toBeGreaterThanOrEqual(37.14);
    expect(result.netAfterDiscount).toBeCloseTo(68.78 * 0.54, 8);
    expect(() => generateListinoFromNet(10, "100%" )).toThrow();
  });
});

describe("commercial offer print documents", () => {
  it("shows all cycle lots and technical cost references in the internal export", () => {
    const html = buildCommercialOfferPrintHtml({
      nome: "Offerta di prova",
      cliente: "Cliente",
      note: "Nota interna riservata",
      righe: [offerRow()],
    }, "internal");

    expect(html).toContain("DIDIEFFE GROUP srl");
    expect(html).toContain("Costo standard €/pz");
    expect(html).toContain("10 pz");
    expect(html).toContain("100 pz");
    expect(html).toContain("ATT-01");
    expect(html).toContain("Nota interna riservata");
  });

  it("keeps cycle costs and internal notes out of the customer export", () => {
    const html = buildCommercialOfferPrintHtml({
      nome: "Offerta di prova",
      cliente: "Cliente",
      note: "Nota interna riservata",
      note_cliente: "Consegna da concordare",
      righe: [offerRow()],
    }, "customer", "netto");

    expect(html).toContain("Prezzo netto unitario");
    expect(html).toContain("Consegna da concordare");
    expect(html).not.toContain("Costo standard €/pz");
    expect(html).not.toContain("ATT-01");
    expect(html).not.toContain("Nota interna riservata");
  });
});
