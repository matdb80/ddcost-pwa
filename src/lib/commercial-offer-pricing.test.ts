import { describe, expect, it } from "vitest";
import { additionalDiscountPercent, calculateOfferLotPrice, generateListinoFromNet, offerLotTerms, offerLotsForRow, selectedOfferLots, simulationsForOfferRow, withCalculatedOfferRow, withOfferLotTerms, withSelectedOfferLot } from "./commercial-offer-pricing";
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
    expect(small.overheadPerPiece).toBeCloseTo(2.04, 8);
    expect(small.fullCost).toBeCloseTo(12.24, 8);
    expect(small.netPrice).toBe(16.32);
    expect(large.fixedCostPerPiece).toBeCloseTo(0.56, 8);
    expect(large.overheadPerPiece).toBeCloseTo(1.032, 8);
    expect(large.fullCost).toBeCloseTo(6.192, 8);
    expect(large.netPrice).toBe(8.26);
    expect(large.netPrice).toBeLessThan(small.netPrice);

    const persisted = JSON.parse(JSON.stringify(withCalculatedOfferRow({ ...row, lotto: 100 })));
    expect(persisted.costo_standard_lotto).toBeCloseTo(5.16, 8);
    expect(persisted.full_cost).toBeCloseTo(6.192, 8);
    expect(persisted.prezzo_netto_proposto).toBe(8.26);
    expect((persisted.prezzi_proposti_lotti as Array<{ spese_generali_per_pezzo: number }>)[0].spese_generali_per_pezzo).toBeCloseTo(1.032, 8);
    expect(persisted.data.dataJson).toContain('"ART-01"');
  });

  it("applies 75% general expenses to the whole industrial cost before the net margin", () => {
    const row = offerRow();
    row.ricarico_costi_fissi_pct = 75;
    row.margine_netto_desiderato_pct = 20;
    const snapshot = JSON.parse(String(row.data.dataJson)) as Record<string, unknown>;
    snapshot.lotti_personalizzati = [25];
    snapshot.righe = [
      { categoria: "COMPONENTE", codice_articolo: "MP-01", descrizione: "Componente", nr_componenti: 1, costo_unitario: 1.76, considera: true },
    ];
    row.data.dataJson = JSON.stringify(snapshot);

    const price = calculateOfferLotPrice(row, 25);
    expect(price.simulation.costo_standard).toBeCloseTo(1.76, 8);
    expect(price.overheadPerPiece).toBeCloseTo(1.32, 8);
    expect(price.fullCost).toBeCloseTo(3.08, 8);
    expect(price.netPrice).toBe(3.85);
    expect(price.actualMarginPercent).toBeCloseTo(20, 8);
  });

  it("inverts chained discounts and rounds the list price up to a cent", () => {
    const result = generateListinoFromNet(37.14, "40+10%");
    expect(result.listino).toBe(68.78);
    expect(result.netAfterDiscount).toBeGreaterThanOrEqual(37.14);
    expect(result.netAfterDiscount).toBeCloseTo(68.78 * 0.54, 8);
    expect(() => generateListinoFromNet(10, "100%" )).toThrow();
  });

  it("uses a manual final price per lot and recalculates the real margin", () => {
    const row = offerRow();
    const manualRow = withOfferLotTerms(row, 10, { prezzo_netto_manuale: "2,20" });
    const price = calculateOfferLotPrice(manualRow, 10);

    expect(price.calculatedNetPrice).toBe(16.32);
    expect(price.manualNetPrice).toBe(2.2);
    expect(price.netPrice).toBe(2.2);
    expect(price.actualMarginPercent).toBeCloseTo((2.2 - price.fullCost) / 2.2 * 100, 8);

    const persisted = JSON.parse(JSON.stringify(withCalculatedOfferRow(manualRow))) as Record<string, unknown>;
    const proposed = persisted.prezzi_proposti_lotti as Array<Record<string, number | null>>;
    expect(proposed[0].prezzo_netto_calcolato).toBe(16.32);
    expect(proposed[0].prezzo_netto_manuale).toBe(2.2);
    expect(proposed[0].prezzo_netto_proposto).toBe(2.2);
    expect(proposed[0].margine_netto_pct).toBeCloseTo(price.actualMarginPercent, 8);
    expect(calculateOfferLotPrice(persisted, 10).netPrice).toBe(2.2);

    const restored = withOfferLotTerms(manualRow, 10, { prezzo_netto_manuale: undefined });
    expect(calculateOfferLotPrice(restored, 10).netPrice).toBe(16.32);
  });

  it("stores different manual net prices for different lots", () => {
    const row = withOfferLotTerms(offerRow(), 10, { prezzo_netto_manuale: 2.2 });
    const multiLot = withOfferLotTerms(row, 100, { prezzo_netto_manuale: 4.5 });
    const changedPrimary = withSelectedOfferLot({ ...multiLot, lotti_selezionati: [10, 100] }, 10, false);
    const reopened = JSON.parse(JSON.stringify(changedPrimary)) as Record<string, unknown>;

    expect(offerLotTerms(reopened, 10).prezzo_netto_manuale).toBe(2.2);
    expect(offerLotTerms(reopened, 100).prezzo_netto_manuale).toBe(4.5);
    expect(calculateOfferLotPrice(reopened, 10).netPrice).toBe(2.2);
    expect(calculateOfferLotPrice(reopened, 100).netPrice).toBe(4.5);
  });

  it("calculates the additional market discount from the current discounted net", () => {
    expect(additionalDiscountPercent(3.78, 2.2)).toBeCloseTo(41.7989417989, 8);
    expect(() => additionalDiscountPercent(0, 2.2)).toThrow();
  });

  it("recalculates stale saved simulations and preserves the row reference lot", () => {
    const row = offerRow();
    const snapshot = JSON.parse(String(row.data.dataJson)) as Record<string, unknown>;
    snapshot.simulazioni = [
      { lotto: 10, costo_standard: 4, breakdown: {}, full_cost: 4, prezzo_minimo: 4, attrezzaggio_pz: 0 },
      { lotto: 100, costo_standard: 4, breakdown: {}, full_cost: 4, prezzo_minimo: 4, attrezzaggio_pz: 0 },
    ];
    const lines = snapshot.righe as Array<Record<string, unknown>>;
    lines[1].lotto_voce = 20;
    row.data.dataJson = JSON.stringify(snapshot);

    const recalculated = simulationsForOfferRow(row);
    expect(recalculated[0].costo_standard).toBeCloseTo(8.4, 8);
    expect(recalculated[1].costo_standard).toBeCloseTo(5.16, 8);
    expect(recalculated.map((simulation) => simulation.attrezzaggio_pz)).toEqual([1.8, 0.36]);
    expect(calculateOfferLotPrice(row, 10).fixedCostPerPiece).toBeCloseTo(3.8, 8);
    expect(calculateOfferLotPrice(row, 100).fixedCostPerPiece).toBeCloseTo(0.56, 8);
  });

  it("supports multiple offered lots, an added lot, and per-lot listino terms", () => {
    const row = { ...offerRow(), lotti_selezionati: [10, 100], lotti_aggiuntivi: [250] };
    expect(offerLotsForRow(row)).toEqual([10, 100, 250]);
    expect(selectedOfferLots(row)).toEqual([10, 100]);

    const withTerms = withOfferLotTerms(row, 10, { listino: 27.97 });
    const withSecondTerms = withOfferLotTerms(withTerms, 100, { listino: 13.03 });
    const selected = withSelectedOfferLot(withSecondTerms, 250, true);
    expect(selectedOfferLots(selected)).toEqual([10, 100, 250]);
    expect(offerLotTerms(selected, 10).listino).toBe(27.97);
    expect(offerLotTerms(selected, 100).listino).toBe(13.03);
    const saved = withCalculatedOfferRow(selected);
    expect(saved.prezzi_proposti_lotti).toHaveLength(3);
    expect((saved.prezzi_proposti_lotti as Array<{ lotto: number }>).map((item) => item.lotto)).toEqual([10, 100, 250]);
    const reopened = JSON.parse(JSON.stringify(saved)) as Record<string, unknown>;
    expect(selectedOfferLots(reopened)).toEqual([10, 100, 250]);
    expect(offerLotTerms(reopened, 10).listino).toBe(27.97);
    expect(offerLotTerms(reopened, 100).listino).toBe(13.03);
    expect(reopened.data).toEqual(row.data);
  });
});

describe("commercial offer print documents", () => {
  it("shows all cycle lots and technical cost references in the internal export", () => {
    const row = withOfferLotTerms(offerRow(), 10, { prezzo_netto_manuale: 2.2 });
    const html = buildCommercialOfferPrintHtml({
      id: 42,
      nome: "Offerta di prova",
      note_cliente: "Consegna da concordare",
      cliente: "Cliente",
      note: "Nota interna riservata",
      righe: [row],
    }, "internal");

    expect(html).toContain("DIDIEFFE GROUP srl");
    expect(html).toContain("Costo industriale standard €/pz");
    expect(html).toContain("Spese generali (20,00%) €/pz");
    expect(html).toContain("Numero offerta");
    expect(html).not.toContain("#42");
    expect(html).toContain("10 pz");
    expect(html).toContain("100 pz");
    expect(html).not.toContain("250 pz");
    expect(html).toContain("ATT-01");
    expect(html).toContain("Prezzo netto calcolato prima di modifiche €/pz");
    expect(html).toContain("Prezzo netto finale €/pz");
    expect(html).toContain("Margine netto effettivo %");
    expect(html).toContain("2,20");
    expect(html).toContain("Nota interna riservata");
    expect(html).toContain("Consegna da concordare");
  });

  it("shows gross and net effective margins in the internal export", () => {
    const row = offerRow();
    row.ricarico_costi_fissi_pct = 75;
    row.margine_netto_desiderato_pct = 20;
    const cycle = JSON.parse(String(row.data.dataJson)) as Record<string, unknown>;
    cycle.lotti_personalizzati = [25];
    cycle.righe = [
      { categoria: "COMPONENTE", codice_articolo: "MP-01", descrizione: "Componente", nr_componenti: 1, costo_unitario: 1.76, considera: true },
    ];
    row.data.dataJson = JSON.stringify(cycle);

    const html = buildCommercialOfferPrintHtml({ righe: [row] }, "internal");

    expect(html).toContain("Margine lordo effettivo €/pz");
    expect(html).toContain("Margine lordo effettivo %");
    expect(html).toContain("Margine netto effettivo %");
    expect(html).toContain("2,09");
    expect(html).toContain("54,29");
    expect(html).toContain("20,00");
    expect(html).toContain("costo industriale standard) / prezzo netto finale");
    expect(html).toContain(".cost-matrix tr.total > th, .cost-matrix tr.total > td");
    expect(html).toContain("border-top: 1px solid #607078");
    expect(html).toContain("print-color-adjust: exact");
  });

  it("prints cycle comments beside manual market prices that leave a negative net margin", () => {
    const row = {
      ...offerRow(),
      lotto: 25,
      lotti_selezionati: [25],
      ricarico_costi_fissi_pct: 75,
      margine_netto_desiderato_pct: 20,
      prezzi_lotti: { "25": { prezzo_netto_manuale: 2.2 } },
    };
    const cycle = JSON.parse(String(row.data.dataJson)) as Record<string, unknown>;
    cycle.lotti_personalizzati = [25];
    cycle.note_generali = "Prezzo concordato per vincolo di mercato.";
    cycle.righe = [
      { categoria: "COMPONENTE", codice_articolo: "MP-01", descrizione: "Componente", nr_componenti: 1, costo_unitario: 1.76, considera: true },
    ];
    row.data.dataJson = JSON.stringify(cycle);

    const html = buildCommercialOfferPrintHtml({ righe: [row] }, "internal");

    expect(html).toContain("Prezzo netto imposto dal mercato: costi non interamente coperti");
    expect(html).toContain("Lotto 25 pz: margine lordo effettivo € 0,44/pz (20,00%); margine netto effettivo -40,00%.");
    expect(html).toContain("Prezzo concordato per vincolo di mercato.");
    expect(html.match(/Prezzo concordato per vincolo di mercato\./g)).toHaveLength(1);
    expect(html.indexOf("Prezzo netto imposto dal mercato")).toBeLessThan(html.indexOf("Costi e prezzi per tutti i lotti"));
  });

  it("prints package time and quantity in the internal cycle references", () => {
    const row = offerRow();
    const cycle = JSON.parse(String(row.data.dataJson)) as Record<string, unknown>;
    cycle.righe = [{
      categoria: "LAVORAZIONE INTERNA",
      codice_articolo: "PKG-01",
      descrizione: "Confezionamento",
      nr_componenti: 1,
      confezionamento: true,
      quantita_per_conf: 25,
      tempo_confezionamento_min: 8,
      attrezzaggio_min: 0,
      lotto_voce: 0,
      considera: true,
    }];
    row.data.dataJson = JSON.stringify(cycle);
    const html = buildCommercialOfferPrintHtml({ nome: "Offerta confezionamento", righe: [row] }, "internal");

    expect(html).toContain("Velocità / conf.");
    expect(html).toContain("8 min/scatola<br>25 pz/scatola");
  });

  it("keeps cycle costs and internal notes out of the customer export", () => {
    const html = buildCommercialOfferPrintHtml({
      id: 42,
      nome: "Offerta di prova",
      cliente: "Cliente",
      note: "Nota interna riservata",
      note_cliente: "Consegna da concordare",
      righe: [offerRow()],
    }, "customer", "netto");

    expect(html).toContain("Prezzo netto unitario");
    expect(html).toContain("Consegna da concordare");
    expect(html).toContain("Numero offerta");
    expect(html).not.toContain("#42");
    expect(html).not.toContain("Costo standard €/pz");
    expect(html).not.toContain("ATT-01");
    expect(html).not.toContain("Nota interna riservata");
    expect(html).not.toContain("Spese generali");
  });

  it("omits the customer boilerplate and prints payment and transport terms after the products", () => {
    const offer = {
      nome: "Offerta termini",
      pagamento: "30 giorni <banca>",
      trasporto: "Franco destino",
      righe: [offerRow()],
    };
    const customerHtml = buildCommercialOfferPrintHtml(offer, "customer", "netto");
    const internalHtml = buildCommercialOfferPrintHtml(offer, "internal");

    expect(customerHtml).not.toContain("Documento generato da DDCost");
    expect(customerHtml).not.toContain("Importi espressi in Euro");
    expect(customerHtml).toContain("30 giorni &lt;banca&gt;");
    expect(customerHtml).toContain("Franco destino");
    expect(customerHtml.indexOf("Pagamento")).toBeGreaterThan(customerHtml.lastIndexOf("</table>"));
    expect(customerHtml.indexOf("Trasporto")).toBeGreaterThan(customerHtml.lastIndexOf("</table>"));
    expect(internalHtml).toContain("30 giorni &lt;banca&gt;");
    expect(internalHtml).toContain("Franco destino");
    expect(internalHtml).toContain("Documento generato da DDCost");
    expect(internalHtml).toContain("Uso interno: contiene dati economici e tecnici riservati.");
  });

  it("adds the five section icons in order and leaves offer notes as the final content", () => {
    const offer = {
      nome: "Offerta sezioni",
      pagamento: "30 giorni",
      trasporto: "Franco destino",
      note: "Nota interna finale",
      note_cliente: "Nota cliente finale",
      righe: [offerRow()],
    };
    const customerHtml = buildCommercialOfferPrintHtml(offer, "customer", "netto");
    const internalHtml = buildCommercialOfferPrintHtml(offer, "internal");

    expect(customerHtml).toContain("<span>Intestazione</span>");
    expect(customerHtml).not.toContain("Testata");
    expect(customerHtml.match(/data-section-icon="[^"]+"/g)).toEqual([
      'data-section-icon="person"',
      'data-section-icon="products"',
      'data-section-icon="payment"',
      'data-section-icon="transport"',
      'data-section-icon="notes"',
    ]);
    expect(customerHtml.indexOf('<section class="notes">')).toBeGreaterThan(customerHtml.indexOf("Trasporto"));
    expect(customerHtml.indexOf("Nota cliente finale")).toBeGreaterThan(customerHtml.indexOf("Trasporto"));

    expect(internalHtml.match(/data-section-icon="[^"]+"/g)).toEqual([
      'data-section-icon="person"',
      'data-section-icon="products"',
      'data-section-icon="payment"',
      'data-section-icon="transport"',
      'data-section-icon="notes"',
      'data-section-icon="notes"',
    ]);
    expect(internalHtml.indexOf("Documento generato da DDCost")).toBeLessThan(internalHtml.indexOf('<section class="notes">'));
    expect(internalHtml.indexOf("Nota cliente finale")).toBeGreaterThan(internalHtml.indexOf("Trasporto"));
  });

  it("can hide only the customer document total while retaining each line total", () => {
    const row = {
      ...offerRow(),
      lotto: 10,
      lotti_selezionati: [10],
      prezzi_lotti: { "10": { prezzo_netto_manuale: 2.2 } },
    };
    const hidden = buildCommercialOfferPrintHtml(
      { nome: "Offerta senza totale", righe: [row] },
      "customer",
      "netto",
      undefined,
      { hideDocumentTotal: true },
    );
    const normal = buildCommercialOfferPrintHtml({ nome: "Offerta con totale", righe: [row] }, "customer", "netto");

    expect(hidden).not.toContain("Totale netto offerta");
    expect(hidden).toContain("<td class=\"num\">€ 22,00</td>");
    expect(normal).toContain("Totale netto offerta: € 22,00");
  });

  it("prints every selected customer lot with its own listino and no misleading combined total", () => {
    const row = {
      ...offerRow(),
      lotti_selezionati: [10, 100],
      prezzi_lotti: { "10": { listino: 27.97 }, "100": { listino: 13.03 } },
    };
    const html = buildCommercialOfferPrintHtml({
      nome: "Offerta per quantità",
      righe: [row],
    }, "customer", "listino_sconto");

    expect(html).toContain("10 pz");
    expect(html).toContain("100 pz");
    expect(html).toContain("€ 27,97");
    expect(html).toContain("€ 13,03");
    expect(html).toContain("Le quantità indicate sono alternative");
    expect(html).not.toContain("Totale netto offerta");
  });

  it("prints the manual market net and the extra discount in the customer offer", () => {
    const row = {
      ...offerRow(),
      lotto: 10,
      lotti_selezionati: [10],
      prezzi_lotti: { "10": { listino: 7, prezzo_netto_manuale: 2.2 } },
    };
    const html = buildCommercialOfferPrintHtml({
      nome: "Offerta prezzo mercato",
      righe: [row],
    }, "customer", "listino_sconto");

    expect(html).toContain("Listino: € 7,00");
    expect(html).toContain("Sconto: 40+10+41,80%");
    expect(html).toContain("<del>€ 3,78</del> <strong>€ 2,20</strong>");
    expect(html).toContain("€ 22,00");
  });

  it("uses the manual net in the net presentation and crosses out the calculated proposal", () => {
    const row = {
      ...offerRow(),
      lotto: 10,
      lotti_selezionati: [10],
      prezzi_lotti: { "10": { prezzo_netto_manuale: 2.2 } },
    };
    const html = buildCommercialOfferPrintHtml({ nome: "Offerta netto manuale", righe: [row] }, "customer", "netto");

    expect(html).toContain("<del>€ 16,32</del> <strong>€ 2,20</strong>");
    expect(html).toContain("€ 22,00");
    expect(html).not.toContain("Spese generali");
  });

  it("prints only a manually increased net price in customer PDFs", () => {
    const row = {
      ...offerRow(),
      lotto: 10,
      lotti_selezionati: [10],
      prezzi_lotti: { "10": { listino: 7, prezzo_netto_manuale: 20 } },
    };

    for (const presentation of ["netto", "listino_sconto"] as const) {
      const html = buildCommercialOfferPrintHtml({ nome: "Offerta prezzo manuale", righe: [row] }, "customer", presentation);
      expect(html).toContain("<strong>€ 20,00</strong>");
      expect(html).not.toContain("<del>");
    }
  });
});
