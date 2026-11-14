import { describe, expect, it } from "vitest";
import { requireCurrentRevision } from "./cycle-version-guard";
import { emptyCicloEditorModel, emptyRiga, parseCycleRow, serializeCycleDataJson } from "../src/types/cycle";
import { attachToAssembly, orderedHierarchy } from "../src/lib/cycle-hierarchy";
import { ricalcolaCiclo } from "../src/lib/cycle-calculator";

describe("TKT-20261013-10060001 — keep level-2 assembly after next save", () => {
  it("preserves the assembly when a separate top-level row is added in the next revision", () => {
    const first = emptyCicloEditorModel();
    first.lotto = "100";
    first.codice = "TEST-ASSEMBLY";
    first.righe = [
      { ...emptyRiga(), codice_articolo: "ASSY", descrizione: "Assieme", costo_unitario: 0 },
      { ...emptyRiga(), codice_articolo: "PART", descrizione: "Componente L2", costo_unitario: 2.50 },
    ];
    const assembled = ricalcolaCiclo({
      ...first, righe: attachToAssembly(first.righe, 1, 0),
    });
    const revision2 = {
      id: 2120001, rootId: 120001, rev: 2,
      code: first.codice, lot: first.lotto,
      standardCost: String(assembled.costo_standard),
      minimumPrice: String(assembled.prezzo_minimo),
      dataJson: JSON.stringify(serializeCycleDataJson(assembled)),
    };
    const reopened = parseCycleRow(revision2);
    expect(reopened.righe[0].assembly_auto).toBe(true);
    expect(reopened.righe[1].parent_idx).toBe(0);
    expect(orderedHierarchy(reopened.righe).map(x => x.depth)).toEqual([1,2]);

    const third = ricalcolaCiclo({
      ...reopened,
      righe: [...reopened.righe, {
        ...emptyRiga(), codice_articolo: "OUTSIDE",
        descrizione: "Riga non appartenente all'assieme",
        costo_unitario: 1.25,
      }],
    });
    const revision3 = parseCycleRow({
      ...revision2, id: 3120001, rev: 3,
      standardCost: String(third.costo_standard),
      minimumPrice: String(third.prezzo_minimo),
      dataJson: JSON.stringify(serializeCycleDataJson(third)),
    });
    expect(revision3.righe).toHaveLength(3);
    expect(revision3.righe[0].assembly_auto).toBe(true);
    expect(revision3.righe[1].parent_idx).toBe(0);
    expect(revision3.righe[2].parent_idx).toBeUndefined();
    expect(orderedHierarchy(revision3.righe).map(x => x.depth)).toEqual([1,2,1]);
    expect(revision3.costo_standard).toBeCloseTo(3.75);
    expect(revision3.righe[1].codice_articolo).toBe("PART");
  });

  it("rejects stale root rev. 1 after assieme was saved in rev. 2", () => {
    expect(() => requireCurrentRevision(120001,2120001,2)).toThrow(/Revisione superata/);
    expect(() => requireCurrentRevision(2120001,2120001,2)).not.toThrow();
  });
});
