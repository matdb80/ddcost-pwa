import { describe, expect, it } from "vitest";
import { emptyCicloEditorModel, emptyRiga, parseCycleRow, serializeCycleDataJson, type RigaCiclo } from "@/types/cycle";
import { RAW_MATERIALS, finalizeRawMaterialRow, prepareRawMaterialEditor, rawMaterialCalculation } from "./cycle-raw-material";
import { calcolaCostoRiga, ricalcolaCiclo } from "./cycle-calculator";
import { applyStandardCycleToOfferRow } from "./commercial-offer-cycle";
import { simulationsForOfferRow } from "./commercial-offer-pricing";
import { buildCommercialOfferPrintHtml } from "./commercial-offer-pdf";

const row = (patch: Partial<RigaCiclo> = {}): RigaCiclo => ({
  ...prepareRawMaterialEditor({ ...emptyRiga(), categoria: "MATERIA PRIMA DA TRASFORMARE" }, false),
  lunghezza: 1000, larghezza: 50, spessore: 2, nr_componenti: 2, costo_unitario: 3, ...patch,
});

describe("materia prima: geometrie, materiali e unità", () => {
  it.each(RAW_MATERIALS)("calcola il peso del piatto in $label", material => {
    const r = row({ materiale_id: material.id, densita_kg_m3: material.density });
    const result = rawMaterialCalculation(r);
    expect(result.errors).toEqual([]);
    expect(result.volumeMm3).toBe(100000);
    expect(result.weightKg).toBeCloseTo(material.density / 10000, 10);
    expect(result.cost).toBeCloseTo(material.density / 10000 * 6, 10);
  });
  it.each(["piatto", "nastro"] as const)("usa larghezza, spessore e lunghezza per %s", geometry => {
    expect(rawMaterialCalculation(row({ geometria_materia_prima: geometry })).weightKg).toBeCloseTo(0.785, 12);
  });
  it("usa il volume cilindrico del tondino, ignorando vecchie dimensioni del piatto", () => {
    const result = rawMaterialCalculation(row({ geometria_materia_prima: "tondino", diametro: 20 }));
    expect(result.weightKg).toBeCloseTo(Math.PI * 100 * 1000 * 7850 / 1e9, 12);
  });
  it("sottrae il foro dal tubo e non usa lo spessore del vecchio piatto", () => {
    const result = rawMaterialCalculation(row({ geometria_materia_prima: "tubo", diametro: 20, diametro_interno: 16 }));
    expect(result.weightKg).toBeCloseTo(Math.PI * 36 * 1000 * 7850 / 1e9, 12);
  });
  it("il peso manuale prevale, anche senza materiale e dimensioni", () => {
    const r = row({ peso_modalita: "manuale", peso_kg: 2.5, materiale_id: undefined, densita_kg_m3: undefined, lunghezza: 0, larghezza: 0, spessore: 0 });
    expect(rawMaterialCalculation(r)).toMatchObject({ weightKg: 2.5, cost: 15, errors: [] });
  });
  it("il prezzo al metro usa la lunghezza e non il peso", () => {
    const steel = row({ unita_costo_materiale: "m", lunghezza: 1200, costo_unitario: 4 });
    const aluminium = { ...steel, materiale_id: "alluminio" as const, densita_kg_m3: 2700 };
    expect(rawMaterialCalculation(steel).cost).toBeCloseTo(9.6);
    expect(rawMaterialCalculation(aluminium).cost).toBeCloseTo(9.6);
    expect(rawMaterialCalculation(steel).weightKg).not.toBe(rawMaterialCalculation(aluminium).weightKg);
  });
  it("ricalcola il peso automatico dopo una modifica e non aggiunge sfrido", () => {
    const saved = finalizeRawMaterialRow(row());
    const changed = { ...saved, lunghezza: 2000, sfrido: 50 };
    expect(rawMaterialCalculation(changed).weightKg).toBeCloseTo(1.57);
    expect(calcolaCostoRiga(changed, 0.35, 100)).toBeCloseTo(9.42);
    expect(finalizeRawMaterialRow(changed).sfrido).toBe(0);
  });
  it.each([
    { geometria_materia_prima: "tubo", diametro: 20, diametro_interno: 20 },
    { geometria_materia_prima: "tubo", diametro: 20, diametro_interno: 25 },
    { geometria_materia_prima: "tubo", diametro: 20, diametro_interno: 0 },
    { geometria_materia_prima: "tondino", diametro: -1 },
    { lunghezza: 0 }, { lunghezza: Infinity }, { larghezza: NaN }, { spessore: -2 },
    { densita_kg_m3: NaN }, { materiale_id: undefined }, { costo_unitario: -1 },
    { nr_componenti: 0 }, { peso_modalita: "manuale", peso_kg: 0 },
    { peso_modalita: "manuale", peso_kg: Infinity },
    { unita_costo_materiale: "m", peso_modalita: "manuale", peso_kg: 2, lunghezza: 0 },
    { lunghezza: Number.MAX_VALUE, larghezza: Number.MAX_VALUE },
  ] as Partial<RigaCiclo>[])("blocca il salvataggio di misure o costi invalidi: %j", patch => {
    const r = row(patch);
    expect(rawMaterialCalculation(r).cost).toBeNull();
    expect(() => finalizeRawMaterialRow(r)).toThrow();
  });
  it("ammette esplicitamente un costo unitario pari a zero", () => {
    expect(rawMaterialCalculation(row({ costo_unitario: 0 }))).toMatchObject({ cost: 0, errors: [] });
  });
});

describe("archivi e propagazione del calcolo", () => {
  it.each([0, 2])("conserva il costo storico con peso %s e sfrido precedente", weight => {
    const legacy = { ...emptyRiga(), categoria: "MATERIA PRIMA DA TRASFORMARE" as const,
      peso_kg: weight, lunghezza: 1000, larghezza: 50, spessore: 2, nr_componenti: 2, costo_unitario: 3, sfrido: 10 };
    const original = structuredClone(legacy);
    const oldCost = calcolaCostoRiga(legacy, 0.35, 100);
    const edited = prepareRawMaterialEditor(legacy);
    expect(edited.peso_modalita).toBe("manuale");
    expect(edited.sfrido).toBe(0);
    expect(calcolaCostoRiga(finalizeRawMaterialRow(edited), 0.35, 100)).toBeCloseTo(oldCost, 12);
    expect(legacy).toEqual(original);
  });
  it("le righe nuove partono con peso automatico e non ereditano un peso di un'altra categoria", () => {
    expect(prepareRawMaterialEditor({ ...emptyRiga(), peso_kg: 5 }, false)).toMatchObject({ peso_modalita: "automatico", peso_kg: 0, sfrido: 0 });
  });
  it("mantiene nuovi campi, costi e simulazioni dopo salvataggio, riapertura e offerta", () => {
    const model = ricalcolaCiclo({ ...emptyCicloEditorModel(), codice: "RAW-TEST", lotto: "100", righe: [finalizeRawMaterialRow(row())] });
    const record = { id: 10, rootId: 10, rev: 1, code: model.codice, lot: model.lotto, dataJson: JSON.stringify(serializeCycleDataJson(model)) };
    const reopened = parseCycleRow(record);
    expect(reopened.righe[0]).toEqual(model.righe[0]);
    expect(ricalcolaCiclo(reopened).costo_standard).toBeCloseTo(4.71);
    expect(reopened.simulazioni.every(s => Math.abs(s.costo_standard - 4.71) < 1e-10)).toBe(true);
    const offerRow = applyStandardCycleToOfferRow({}, record);
    expect(simulationsForOfferRow(offerRow).every(s => Math.abs(s.costo_standard - 4.71) < 1e-10)).toBe(true);
  });
  it("moltiplica quantità di componenti e assiemi una volta soltanto", () => {
    const model = ricalcolaCiclo({ ...emptyCicloEditorModel(), lotto: "100", righe: [
      { ...emptyRiga(), categoria: "COMPONENTE/ASSIEME", assembly_auto: true, nr_componenti: 3 },
      finalizeRawMaterialRow(row({ parent_idx: 0 })),
    ] });
    expect(model.costo_standard).toBeCloseTo(14.13);
    expect(model.simulazioni.every(s => Math.abs(s.costo_standard - 14.13) < 1e-10)).toBe(true);
  });
  it("il PDF interno distingue €/metro, diametro interno e peso senza colonna sfrido nuova", () => {
    const material = finalizeRawMaterialRow(row({ geometria_materia_prima: "tubo", tipo_materia_prima: "Tubo", diametro: 20, diametro_interno: 16, unita_costo_materiale: "m" }));
    const model = ricalcolaCiclo({ ...emptyCicloEditorModel(), lotto: "100", righe: [material] });
    const offer = applyStandardCycleToOfferRow({}, { id: 10, dataJson: JSON.stringify(serializeCycleDataJson(model)) });
    const html = buildCommercialOfferPrintHtml({ righe: [offer] }, "internal");
    expect(html).toContain("Ø int. 16");
    expect(html).toContain("/m</td>");
    expect(html).not.toContain("Sfrido storico</th>");
    expect(html).not.toContain("NaN");
  });
});
