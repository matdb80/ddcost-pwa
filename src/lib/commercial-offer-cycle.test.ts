import { describe, expect, it } from "vitest";
import { applyStandardCycleToOfferRow } from "./commercial-offer-cycle";

describe("applyStandardCycleToOfferRow", () => {
  it("copies a standard cycle snapshot and preserves commercial terms", () => {
    const row = {
      codice: "manuale",
      descrizione: "Descrizione precedente",
      lotto: 250,
      listino: 12.5,
      sconto_base: "40+10%",
      extra: 5,
      netto: 6.4125,
    };
    const dataJson = JSON.stringify({
      codice: "ART-01",
      descrizione: "Cerniera inox",
      cliente: "Didieffe",
      lotto: "1000",
      costo_standard: 3.2,
      full_cost: 5.6,
      prezzo_minimo: 7,
      righe: [{ codice_articolo: "MP-1" }],
    });

    const result = applyStandardCycleToOfferRow(row, {
      id: 42,
      rootId: 40,
      rev: 3,
      code: "ART-01",
      description: "Cerniera inox",
      client: "Didieffe",
      lot: "1000",
      standardCost: "3.2",
      minimumPrice: "7",
      dataJson,
    });

    expect(result).toMatchObject({
      codice: "ART-01",
      descrizione: "Cerniera inox",
      record_id: 42,
      root_id: 40,
      rev: 3,
      standard_cost: 3.2,
      full_cost: 5.6,
      prezzo_minimo: 7,
      cycle_lot: "1000",
      lotto: 250,
      listino: 12.5,
      sconto_base: "40+10%",
      extra: 5,
      netto: 6.4125,
    });
    expect(result.data).toMatchObject({ dataJson });
  });
});
