import { beforeEach, describe, expect, it } from "vitest";
import { f3Workbook } from "../test-fixtures/f3-workbook";
import { extractF3Letters } from "./excel-f3-letters";
import {
  applyApprovedF3,
  buildF3Template,
  compatibleF3,
  editMapping,
  loadF3Session,
  mappingFor,
  saveF3Session,
  setReusable,
  testF3Definition,
} from "./excel-f3-workflow";
import {
  asValidatedDraft,
  validateImportDraft,
} from "./excel-import-validation";
import { buildValidatedPreview } from "./excel-import-to-cycle";
import { compareImportCosts } from "./excel-import-comparison";
import {
  parseMappingDraft,
  serializeMappingDraft,
} from "../types/excel-mapping-draft";
import { parseCycleRow, serializeCycleDataJson } from "../types/cycle";
import { templateDefinitionSchema } from "./excel-import-template-schema";
function prepared(w = f3Workbook()) {
  let d = extractF3Letters(w);
  d.products[0].selected = true;
  d = editMapping(d, "$product:cycle.code", {
    sheetName: true,
    reusable: true,
  });
  d.economicPolicy = {
    currency: "EUR",
    name: "historical-purchases-current-labour",
    labourEurPerMinute: 0.3,
    lot: 200,
    overheadFraction: 0,
    marginFraction: 0,
    setupLotPolicy: "simulation",
  };
  return d;
}
function approved(d = prepared()) {
  const definition = buildF3Template(d, "Template sintetico");
  const test = testF3Definition(d, definition);
  return {
    id: 3,
    rootId: 1,
    version: 3,
    status: "approved",
    definition: { ...definition, verifiedCaseHashes: [test.workbookSha256] },
  };
}
beforeEach(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
      removeItem: (k: string) => data.delete(k),
    },
  });
});
describe("F3 connected workflow", () => {
  it("uses an approved template on different product data and a shifted/renamed layout", () => {
    const t = approved();
    let second = extractF3Letters(f3Workbook("TEST-B", 7, 2, 1));
    const p = second.products[0];
    expect(compatibleF3(second, p, t).compatible).toBe(true);
    second = applyApprovedF3(second, p, t);
    second.economicPolicy = prepared().economicPolicy;
    const preview = buildValidatedPreview(asValidatedDraft(second));
    expect(preview.model.codice).toBe("TEST-B");
    expect(preview.model.righe[0].costo_unitario).toBe(7);
    expect(preview.pwaDirectCost).toBeCloseTo(7.24);
    expect(preview.provenance.template).toEqual({ rootId: 1, version: 3 });
  });
  it.each(["draft", "tested"])(
    "never automatically applies a %s template",
    status => {
      const d = prepared(),
        t = { ...approved(d), status };
      expect(() => applyApprovedF3(d, d.products[0], t)).toThrow(
        "non approvato"
      );
    }
  );
  it("does not reuse a template with changed units, extra rows or an unsupported profile", () => {
    const t = approved();
    for (const change of ["unit", "row", "profile"]) {
      const w = f3Workbook("TEST-B");
      if (change === "unit") w.sheets[0].cells.L4.displayText = "kg";
      if (change === "row") {
        const c = w.sheets[0].cells;
        for (const col of ["A", "C", "I", "L", "M", "O"])
          c[col + "6"] = { ...c[col + "4"], address: col + "6", row: 6 };
      }
      const d = extractF3Letters(w);
      expect(
        compatibleF3(
          d,
          d.products[0],
          change === "profile"
            ? { ...t, definition: { ...t.definition, f3Profile: undefined } }
            : t
        ).compatible
      ).toBe(false);
    }
  });
  it("keeps file-only correction out of template rules and refuses a false tested result", () => {
    let d = prepared();
    const row = d.products[0].rows[0];
    d = editMapping(d, `${row.key}:nr_componenti`, { value: 2 });
    const def = buildF3Template(d, "Local only");
    expect(
      def.f3Profile?.bindings.some(b => b.target === "nr_componenti")
    ).toBe(false);
    expect(() => testF3Definition(d, def)).toThrow("non riproduce");
    d = setReusable(d, `${row.key}:nr_componenti`, true);
    expect(() =>
      testF3Definition(d, buildF3Template(d, "Reusable"))
    ).not.toThrow();
  });
  it("learns an explicit fixed quantity but keeps next-file cost and source evidence independent", () => {
    let d = prepared();
    const row = d.products[0].rows[0];
    d = editMapping(d, `${row.key}:nr_componenti`, {
      value: 2,
      reusable: true,
    });
    const t = approved(d),
      w = f3Workbook("TEST-B", 9);
    let n = extractF3Letters(w);
    n = applyApprovedF3(n, n.products[0], t);
    expect(n.products[0].rows[0].row.nr_componenti).toBe(2);
    expect(n.products[0].rows[0].row.costo_unitario).toBe(9);
    expect(
      n.mappings?.[0].fields.find(f => f.target === "nr_componenti")?.source
        .original
    ).toEqual([1]);
  });
  it("selects a new source with declarative reciprocal transform", () => {
    let d = prepared();
    const row = d.products[0].rows.find(r => r.excelRow === 5)!;
    const cell = d.workbook.sheets[0].cells.K5;
    cell.raw = 0.5;
    cell.cached = 0.5;
    cell.displayText = "0,5";
    d = editMapping(d, `${row.key}:colpi_min`, {
      address: "K5",
      transform: "minutes_to_rate",
      reusable: true,
    });
    expect(d.products[0].rows[1].row.colpi_min).toBe(2);
    const t = approved(d);
    const w = f3Workbook("TEST-B");
    Object.assign(w.sheets[0].cells.K5, {
      raw: 0.25,
      cached: 0.25,
      displayText: "0,25",
    });
    let n = extractF3Letters(w);
    n = applyApprovedF3(n, n.products[0], t);
    expect(n.products[0].rows[1].row.colpi_min).toBe(4);
  });
  it("rejects historical O as a unit price and negative quantities", () => {
    const d = prepared(),
      id = d.products[0].rows[0].key;
    expect(() =>
      editMapping(d, `${id}:costo_unitario`, { address: "O4" })
    ).toThrow("non è una tariffa");
    expect(() => editMapping(d, `${id}:nr_componenti`, { value: -1 })).toThrow(
      "non valido"
    );
  });
  it("R02 resolves only explicitly corrected quantity, not a separate price error", () => {
    const w = f3Workbook();
    Object.assign(w.sheets[0].cells.I4, { raw: "?", displayText: "?" });
    Object.assign(w.sheets[0].cells.M4, { raw: "?", displayText: "?" });
    let d = prepared(w);
    d = editMapping(d, `${d.products[0].rows[0].key}:nr_componenti`, {
      value: 1,
    });
    const r = validateImportDraft(d);
    expect(r.valid).toBe(false);
    expect(
      r.draft.problems.some(p => p.code === "F3_QUANTITY_4" && !p.resolved)
    ).toBe(false);
    expect(
      r.draft.problems.some(p => p.code === "F3_RATE_4" && !p.resolved)
    ).toBe(true);
  });
  it("invalid source formula stays blocked unless that field has an explicit valid override", () => {
    const w = f3Workbook();
    Object.assign(w.sheets[0].cells.I4, {
      raw: null,
      cached: null,
      formula: "1+0",
    });
    let d = prepared(w);
    expect(validateImportDraft(d).valid).toBe(false);
    d = editMapping(d, `${d.products[0].rows[0].key}:nr_componenti`, {
      value: 1,
    });
    expect(validateImportDraft(d).valid).toBe(true);
  });
  it("does not approve a template on an invalid current draft", () => {
    const d = prepared();
    d.products[0].rows[0].row.nr_componenti = undefined;
    expect(() => testF3Definition(d, buildF3Template(d, "Invalid"))).toThrow();
  });
  it("preserves mapping through refresh and serialized cycle reopening", () => {
    const d = prepared();
    saveF3Session({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      step: 3,
      draft: d,
      name: "Test",
      scope: "file",
    });
    const restored = loadF3Session()!;
    expect(restored.draft).toEqual(JSON.parse(JSON.stringify(d)));
    const mapping = mappingFor(d, d.products[0]);
    expect(parseMappingDraft(serializeMappingDraft(mapping))).toMatchObject({
      productKey: d.products[0].key,
    });
    const model = buildValidatedPreview(asValidatedDraft(d)).model;
    const reopened = parseCycleRow({
      dataJson: JSON.stringify(serializeCycleDataJson(model)),
    });
    expect(reopened._extra.provenienza_import_excel).toEqual(
      model._extra.provenienza_import_excel
    );
  });
  it("separates economic setup contribution and applies explicit historic minimum", () => {
    const d = prepared();
    d.economicPolicy.lot = 100;
    let preview = buildValidatedPreview(asValidatedDraft(d));
    let comparison = compareImportCosts(d, preview);
    expect(comparison.pwaWithoutSetup).toBeCloseTo(2.15);
    expect(comparison.pwaSetup).toBeCloseTo(0.18);
    d.economicPolicy.setupLotPolicy = "historic-minimum";
    preview = buildValidatedPreview(asValidatedDraft(d));
    comparison = compareImportCosts(d, preview);
    expect(comparison.pwaSetup).toBeCloseTo(0.09);
    expect(d.products[0].setupState?.lot).toBe(200);
  });
  it("does not serialize current product identity as a reusable constant", () => {
    let d = prepared();
    d = editMapping(d, "$product:cycle.code", {
      value: "COPY-THIS",
      reusable: true,
    });
    expect(() => buildF3Template(d, "Wrong")).toThrow(
      "non possono essere costanti"
    );
  });
  it("validates template profile ownership and duplicate bindings", () => {
    const t = approved();
    expect(
      templateDefinitionSchema.safeParse({ ...t.definition, family: "F1-704" })
        .success
    ).toBe(false);
    const b = t.definition.f3Profile!;
    expect(
      templateDefinitionSchema.safeParse({
        ...t.definition,
        f3Profile: { ...b, bindings: [...b.bindings, ...b.bindings] },
      }).success
    ).toBe(false);
  });
  it("explicit weight correction resolves its source error without hiding another field error", () => {
    const w = f3Workbook();
    Object.assign(w.sheets[0].cells.A4, { raw: "m", displayText: "m" });
    for (const col of ["G", "H"])
      w.sheets[0].cells[col + "4"] = {
        ...w.sheets[0].cells.I4,
        address: col + "4",
        column: col === "G" ? 7 : 8,
        raw: null,
        cached: null,
        formula: "1/0",
        error: "#DIV/0!",
      };
    let d = prepared(w);
    d = editMapping(d, `${d.products[0].rows[0].key}:peso_kg`, { value: 0.05 });
    expect(validateImportDraft(d).valid).toBe(true);
    d.workbook.sheets[0].cells.I4.error = "#VALUE!";
    expect(validateImportDraft(d).valid).toBe(false);
  });
  it("does not display missing setup as a zero cost contribution", () => {
    const w = f3Workbook();
    for (const [address, cell] of Object.entries(w.sheets[0].cells))
      if (cell.row >= 8) delete w.sheets[0].cells[address];
    const d = prepared(w);
    const preview = buildValidatedPreview(asValidatedDraft(d));
    const comparison = compareImportCosts(d, preview);
    expect(preview.provenance.setupState?.status).toBe("missing");
    expect(comparison.setupMissing).toBe(true);
    expect(comparison.pwaSetup).toBeUndefined();
  });
});
