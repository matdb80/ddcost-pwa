import { describe, expect, it } from "vitest";
import { File } from "node:buffer";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { legacyKgMinWorkbook } from "../test-fixtures/legacy-kg-min-workbook";
import { f3Workbook } from "../test-fixtures/f3-workbook";
import { extractCycleWorkbook } from "./excel-cycle-extractor";
import { extractF3Letters } from "./excel-f3-letters";
import { readWorkbookEvidence } from "./excel-workbook-reader";
import {
  asValidatedDraft,
  validateImportDraft,
} from "./excel-import-validation";
import { buildValidatedPreview } from "./excel-import-to-cycle";
import {
  editMapping,
  buildF3Template,
  testF3Definition,
  applyApprovedF3,
  compatibleF3,
  mappingFor,
} from "./excel-f3-workflow";
import type { ImportDraft } from "../types/excel-import";

function select(d: ImportDraft, rate = 0.4, index = 0) {
  d.products.forEach((p, i) => {
    p.selected = i === index;
  });
  d.economicPolicy = {
    name: "historical-purchases-current-labour",
    currency: "EUR",
    labourEurPerMinute: rate,
    lot: 200,
    overheadFraction: 0,
    marginFraction: 0,
    setupLotPolicy: "simulation",
  };
  return d;
}
describe("Historical kg/min layout through the current DDCost engine", () => {
  it("preserves quantities, effective historical weights, per-kg/per-piece treatments and missing setup", () => {
    const w = legacyKgMinWorkbook();
    expect(extractF3Letters(w).products).toHaveLength(0);
    const d = select(extractCycleWorkbook(w)),
      p = d.products[0];
    expect(p.rows).toHaveLength(6);
    expect(p.setupState?.status).toBe("missing");
    expect(p.rows.map(r => r.row.categoria)).toEqual([
      "MATERIA PRIMA DA TRASFORMARE",
      "LAVORAZIONE INTERNA",
      "COMPONENTE",
      "LAVORAZIONE TERZISTA A PESO",
      "LAVORAZIONE TERZISTA A PEZZO",
      "LAVORAZIONE INTERNA",
    ]);
    expect(p.rows[0].row.peso_kg).toBe(0.125);
    expect(p.rows[3].row.peso_kg).toBe(0.1);
    expect(p.rows[2].row.nr_componenti).toBe(8);
    expect(p.rows[0].sources.costo_storico.addresses).toEqual(["N3"]);
    expect(p.rows[0].sources.incidenza_storica.addresses).toEqual(["O3"]);
    expect(
      mappingFor(d, p).fields.find(f => f.target === "peso_kg")?.source
        .addresses
    ).toEqual(["L3"]);
    const preview = buildValidatedPreview(asValidatedDraft(d));
    expect(preview.pwaDirectCost).toBeCloseTo(2.27, 12);
    expect(preview.difference).toBeCloseTo(0, 12);
    expect(preview.provenance.setupState?.minutes).toBeUndefined();
    expect(preview.model.righe[0].fornitore).toBe("Fornitore di prova");
  });
  it("keeps independent parse errors when correcting a missing quantity", () => {
    const w = legacyKgMinWorkbook();
    delete w.sheets[0].cells.H4;
    w.sheets[0].cells.J4.raw = 0;
    let d = select(extractCycleWorkbook(w));
    d = editMapping(d, `${d.products[0].rows[1].key}:nr_componenti`, {
      value: 1,
    });
    const problems = validateImportDraft(d).draft.problems;
    expect(problems.find(p => p.code === "KGMIN_QUANTITY_4")?.resolved).toBe(
      true
    );
    expect(problems.some(p => p.code === "KGMIN_SPEED_4" && !p.resolved)).toBe(
      true
    );
  });
  it("requires a single explicit article code for ambiguous or missing identities", () => {
    const w = legacyKgMinWorkbook("CODE-A CODE-B");
    let d = select(extractCycleWorkbook(w));
    expect(d.products[0].code).toBeUndefined();
    expect(validateImportDraft(d).valid).toBe(false);
    expect(
      mappingFor(d, d.products[0]).fields.find(f => f.target === "cycle.code")
        ?.source.original
    ).toEqual(["CODE-A CODE-B"]);
    expect(() =>
      editMapping(d, "$product:cycle.code", { address: "A3" })
    ).toThrow("un solo codice");
    d = editMapping(d, "$product:cycle.code", { value: "CODE-B" });
    expect(validateImportDraft(d).valid).toBe(true);
    delete w.sheets[0].cells.A3;
    expect(select(extractCycleWorkbook(w)).products[0].code).toBeUndefined();
  });
  it("never substitutes N historical cost or O incidence for a missing unit rate", () => {
    const w = legacyKgMinWorkbook();
    delete w.sheets[0].cells.M3;
    const d = select(extractCycleWorkbook(w)),
      key = d.products[0].rows[0].key;
    expect(d.products[0].rows[0].row.costo_unitario).toBeUndefined();
    expect(validateImportDraft(d).valid).toBe(false);
    for (const address of ["N3", "O3", "N10"])
      expect(() =>
        editMapping(d, `${key}:costo_unitario`, { address })
      ).toThrow("non è una tariffa unitaria");
  });
  it("rejects price summaries and hidden sheets and leaves F3 extraction unchanged", () => {
    const w = legacyKgMinWorkbook();
    w.sheets[0].hidden = true;
    expect(extractCycleWorkbook(w).products).toHaveLength(0);
    w.sheets[0].hidden = false;
    delete w.sheets[0].cells.L1;
    expect(extractCycleWorkbook(w).products).toHaveLength(0);
    expect(extractCycleWorkbook(f3Workbook()).products).toEqual(
      extractF3Letters(f3Workbook()).products
    );
  });
  it("reuses an approved compatible template on a second file, reading its own code and prices", () => {
    let d = select(extractCycleWorkbook(legacyKgMinWorkbook()));
    d = editMapping(d, "$product:cycle.code", {
      address: "A3",
      reusable: true,
    });
    const definition = buildF3Template(d, "Synthetic kg/min");
    expect(definition.family).toBe("LEGACY-KG-MIN");
    expect(testF3Definition(d, definition).rowCount).toBe(6);
    const template = {
      id: 3,
      rootId: 1,
      version: 3,
      status: "approved",
      definition,
    };
    const next = legacyKgMinWorkbook("TEST-KG-B", 2, 1);
    const price = next.sheets[0].cells.N5;
    price.raw = 4;
    price.cached = 4;
    price.displayText = "4";
    const second = extractCycleWorkbook(next);
    expect(compatibleF3(second, second.products[0], template).compatible).toBe(
      true
    );
    const applied = applyApprovedF3(second, second.products[0], template);
    expect(applied.products[0].code).toBe("TEST-KG-B");
    expect(applied.products[0].rows[0].row.costo_unitario).toBe(4);
    expect(
      compatibleF3(second, second.products[0], { ...template, status: "draft" })
        .compatible
    ).toBe(false);
    next.sheets[0].cells.L8.raw = "pz";
    next.sheets[0].cells.L8.displayText = "pz";
    const changed = extractCycleWorkbook(next);
    expect(
      compatibleF3(changed, changed.products[0], template).compatible
    ).toBe(false);
    const f3 = extractF3Letters(f3Workbook());
    expect(compatibleF3(f3, f3.products[0], template).compatible).toBe(false);
  });
});

// Opt-in local verification. Enterprise files remain outside the repository.
it.skipIf(!process.env.DDCOST_IMPORT_WORKBOOK)(
  "reads every cost sheet from the supplied real XLS and reconciles with its stored historical total",
  async () => {
    const path = process.env.DDCOST_IMPORT_WORKBOOK!;
    const bytes = await readFile(path);
    const w = await readWorkbookEvidence(
      new File([bytes], basename(path)) as unknown as globalThis.File
    );
    expect(extractF3Letters(w).products).toHaveLength(0);
    const parsed = extractCycleWorkbook(w);
    expect(parsed.products.length).toBeGreaterThan(1);
    expect(parsed.products.every(p => p.layout === "LEGACY-KG-MIN")).toBe(true);
    for (const [index, product] of parsed.products.entries()) {
      const sheet = w.sheets.find(s => s.name === product.variantGroup)!;
      const expectedRows = Object.values(sheet.cells).filter(
        c => c.column === 14 && c.formula?.toUpperCase().startsWith("PRODUCT(")
      );
      expect(product.rows.length).toBe(expectedRows.length);
      const rates = [
        ...new Set(
          product.rows
            .filter(r => r.row.categoria === "LAVORAZIONE INTERNA")
            .map(r => Number(sheet.cells[`M${r.excelRow}`].raw))
        ),
      ];
      expect(rates).toHaveLength(1);
      let d = select(structuredClone(parsed), rates[0], index);
      if (!product.code)
        d = editMapping(d, "$product:cycle.code", {
          value: `LOCAL-TEST-${index + 1}`,
        });
      const preview = buildValidatedPreview(asValidatedDraft(d));
      const totalLabel = Object.values(sheet.cells).find(
        c =>
          c.column === 13 &&
          c.displayText.trim().toLowerCase() === "costo primo"
      )!;
      const expected = Number(sheet.cells[`N${totalLabel.row}`].raw);
      expect(preview.pwaDirectCost, sheet.name).toBeCloseTo(expected, 12);
      expect(preview.historicalDirectCost, sheet.name).toBeCloseTo(
        expected,
        12
      );
      expect(preview.provenance.setupState?.status).toBe("missing");
      console.info(
        JSON.stringify({
          sheet: sheet.name,
          rows: product.rows.length,
          codeNeedsConfirmation: !product.code,
          historical: expected,
          calculated: preview.pwaDirectCost,
        })
      );
    }
    console.info(
      JSON.stringify({
        sourceSheets: w.sheets.length,
        importedSheets: parsed.products.length,
        excluded: w.sheets
          .filter(s => !parsed.products.some(p => p.variantGroup === s.name))
          .map(s => s.name),
      })
    );
  }
);
