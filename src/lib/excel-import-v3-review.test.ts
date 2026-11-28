import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { templateDefinitionSchema } from "./excel-import-template-schema";
import { matchTemplate } from "./excel-template-matcher";
import {
  parseExcelInWorker,
  parseF3InWorker,
} from "./excel-import-worker-client";
import type {
  CellEvidence,
  SheetEvidence,
  TemplateDefinition,
} from "../types/excel-import";

function definition(): TemplateDefinition {
  return {
    schemaVersion: 2,
    family: "F3-LETTERS",
    name: "Fixture sintetica",
    signature: [
      { normalized: "codice", relativeRow: 0, relativeColumn: 0 },
      { normalized: "descrizione", relativeRow: 0, relativeColumn: 1 },
    ],
    products: [
      {
        key: "base",
        label: "Prodotto",
        startAnchor: ["codice"],
        optional: false,
        rowRules: [
          {
            fromRow: 3,
            toRow: 4,
            kind: "cost",
            category: "COMPONENTE",
            mappings: [
              {
                target: "descrizione",
                sourceColumn: 2,
                transform: "text",
                required: true,
              },
            ],
          },
        ],
      },
    ],
    exclusionLabels: [],
    verifiedCaseHashes: [],
  };
}
function sheet(values: Array<[number, number, string]>): SheetEvidence {
  const cells: Record<string, CellEvidence> = {};
  values.forEach(([row, column, displayText]) => {
    const address = `${column}:${row}`;
    cells[address] = {
      address,
      row,
      column,
      raw: displayText,
      displayText,
      hiddenRow: false,
      hiddenColumn: false,
    };
  });
  return {
    name: "Foglio rinominato",
    hidden: false,
    cells,
    merges: [],
    effectiveRows: 10,
    effectiveColumns: 10,
  };
}
function match(s: SheetEvidence, d = definition()) {
  return matchTemplate(s, { id: 1, rootId: 1, version: 1, definition: d });
}

describe("V3 schema dei template", () => {
  it("accetta una configurazione dichiarativa valida", () =>
    expect(templateDefinitionSchema.safeParse(definition()).success).toBe(
      true
    ));
  it.each(["__proto__", "constructor", "inventato", "costo_standard"])(
    "rifiuta destinazione %s",
    target => {
      const d = definition();
      (d.products[0].rowRules[0].mappings[0] as { target: string }).target =
        target;
      expect(templateDefinitionSchema.safeParse(d).success).toBe(false);
    }
  );
  it("rifiuta categoria inventata", () => {
    const d = definition();
    (d.products[0].rowRules[0] as { category: string }).category = "COMPONENT";
    expect(templateDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("rifiuta una fonte ambigua colonna e costante", () => {
    const d = definition();
    d.products[0].rowRules[0].mappings[0].constant = 10;
    expect(templateDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("rifiuta righe fuori dai limiti del reader", () => {
    const d = definition();
    d.products[0].rowRules[0].toRow = 1e9;
    expect(templateDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("rifiuta firme duplicate sullo stesso punto", () => {
    const d = definition();
    d.signature[1] = { ...d.signature[0] };
    expect(templateDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("rifiuta destinazioni duplicate nella stessa regola", () => {
    const d = definition();
    d.products[0].rowRules[0].mappings.push({
      ...d.products[0].rowRules[0].mappings[0],
    });
    expect(templateDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("rifiuta chiavi prodotto duplicate", () => {
    const d = definition();
    d.products.push(structuredClone(d.products[0]));
    expect(templateDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("rifiuta nome vuoto di soli spazi", () => {
    const d = definition();
    d.name = "   ";
    expect(templateDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("rifiuta campi sconosciuti invece di eliminarli in silenzio", () =>
    expect(
      templateDefinitionSchema.safeParse({
        ...definition(),
        execute: "not executable",
      }).success
    ).toBe(false));
});

describe("V3 matching strutturale", () => {
  it("riconosce firma completa su foglio rinominato e spostata", () =>
    expect(
      match(
        sheet([
          [7, 3, "CODICE"],
          [7, 4, "Descrizione"],
        ])
      ).conflicts
    ).toHaveLength(0));
  it("rifiuta colonne scambiate", () =>
    expect(
      match(
        sheet([
          [7, 3, "Descrizione"],
          [7, 4, "CODICE"],
        ])
      ).conflicts.length
    ).toBeGreaterThan(0));
  it("una firma al 90% richiede revisione", () => {
    const d = definition();
    d.signature = Array.from({ length: 10 }, (_, i) => ({
      normalized: `campo ${i}`,
      relativeRow: 0,
      relativeColumn: i,
    }));
    const s = sheet(
      Array.from({ length: 9 }, (_, i) => [1, i + 1, `campo ${i}`])
    );
    expect(match(s, d).conflicts.length).toBeGreaterThan(0);
  });
  it("due ancoraggi esatti sono ambigui", () =>
    expect(
      match(
        sheet([
          [1, 1, "codice"],
          [1, 2, "descrizione"],
          [10, 1, "codice"],
          [10, 2, "descrizione"],
        ])
      ).conflicts.length
    ).toBeGreaterThan(0));
  it("restituisce origine trovata per estrazione relativa", () =>
    expect(
      match(
        sheet([
          [7, 3, "codice"],
          [7, 4, "descrizione"],
        ])
      )
    ).toMatchObject({ anchor: { row: 7, column: 3 } }));
  it("trova origine vuota se la firma ha offset non zero", () => {
    const d = definition();
    d.signature.forEach(s => {
      s.relativeRow += 2;
      s.relativeColumn += 2;
    });
    expect(
      match(
        sheet([
          [7, 3, "codice"],
          [7, 4, "descrizione"],
        ]),
        d
      )
    ).toMatchObject({ score: 1, conflicts: [], anchor: { row: 5, column: 1 } });
  });
  it("normalizza allo stesso modo la firma e le celle", () => {
    const d = definition();
    d.signature[0].normalized = "CÓDICE:";
    expect(
      match(
        sheet([
          [7, 3, "codice"],
          [7, 4, "descrizione"],
        ]),
        d
      ).conflicts
    ).toHaveLength(0);
  });
  it("firma vuota non viene trattata come compatibile", () => {
    const d = definition();
    d.signature = [];
    expect(match(sheet([]), d).conflicts.length).toBeGreaterThan(0);
  });
});

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  static failPost = false;
  terminated = 0;
  message?: { id: string };
  constructor(..._args: unknown[]) {
    super();
    FakeWorker.instances.push(this);
  }
  terminate() {
    this.terminated++;
  }
  postMessage(m: { id: string }) {
    this.message = m;
    if (FakeWorker.failPost)
      throw new DOMException("clone failure", "DataCloneError");
  }
  respond(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}
const input = () => new File(["synthetic"], "test.xlsx");
describe("V3 ciclo di vita Worker (simulato)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWorker.instances = [];
    FakeWorker.failPost = false;
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("F3 mode returns the complete draft and terminates the worker", async () => {
    const promise = parseF3InWorker(input());
    const worker = FakeWorker.instances[0];
    expect(worker.message).toMatchObject({ mode: "f3" });
    const draft = { products: [{ key: "A" }] };
    worker.respond({ id: worker.message!.id, ok: true, draft });
    expect(await promise).toEqual(draft);
    expect(worker.terminated).toBe(1);
  });
  it("F3 cancellation drops a subsequent parser response", async () => {
    const controller = new AbortController();
    const promise = parseF3InWorker(input(), controller.signal);
    const rejected = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    const worker = FakeWorker.instances[0];
    controller.abort();
    worker.respond({ id: worker.message!.id, ok: true, draft: {} });
    await rejected;
    expect(worker.terminated).toBe(1);
  });
  it("annullato prima della chiamata non avvia lavoro", async () => {
    const c = new AbortController();
    c.abort();
    const result = parseExcelInWorker(input(), c.signal).catch(e => e);
    FakeWorker.instances[0]?.respond({
      id: FakeWorker.instances[0].message?.id,
      ok: true,
      workbook: {},
    });
    expect(await result).toMatchObject({ name: "AbortError" });
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it("annullamento durante lettura termina Worker e timer", async () => {
    const c = new AbortController();
    const promise = parseExcelInWorker(input(), c.signal);
    const rejected = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    c.abort();
    await rejected;
    expect(FakeWorker.instances[0].terminated).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("timeout termina Worker", async () => {
    const promise = parseExcelInWorker(input());
    const rejected = expect(promise).rejects.toThrow(/Tempo massimo/);
    await vi.advanceTimersByTimeAsync(25000);
    await rejected;
    expect(FakeWorker.instances[0].terminated).toBe(1);
  });
  it("ignora risposte con id estraneo", async () => {
    const c = new AbortController();
    const promise = parseExcelInWorker(input(), c.signal);
    FakeWorker.instances[0].respond({ id: "wrong", ok: true, workbook: {} });
    expect(FakeWorker.instances[0].terminated).toBe(0);
    const rejected = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    c.abort();
    await rejected;
  });
  it("postMessage fallito libera risorse", async () => {
    FakeWorker.failPost = true;
    await expect(parseExcelInWorker(input())).rejects.toThrow();
    expect(FakeWorker.instances[0].terminated).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("messageerror termina subito", async () => {
    const promise = parseExcelInWorker(input());
    const rejected = expect(promise).rejects.toThrow();
    FakeWorker.instances[0].dispatchEvent(new Event("messageerror"));
    expect(FakeWorker.instances[0].terminated).toBe(1);
    await rejected;
  });
  it("la conclusione avviene una sola volta", async () => {
    const promise = parseExcelInWorker(input());
    const worker = FakeWorker.instances[0];
    worker.respond({ id: worker.message!.id, ok: true, workbook: {} });
    await promise;
    worker.dispatchEvent(new Event("error"));
    expect(worker.terminated).toBe(1);
  });
});

describe("V3 limiti aggiuntivi della correzione", () => {
  it("rifiuta righe sovrapposte nello stesso prodotto", () => {
    const d = definition();
    d.products[0].rowRules.push({
      ...d.products[0].rowRules[0],
      fromRow: 4,
      toRow: 5,
    });
    expect(templateDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("consente righe condivise fra varianti distinte", () => {
    const d = definition();
    d.products.push({ ...structuredClone(d.products[0]), key: "variante" });
    expect(templateDefinitionSchema.safeParse(d).success).toBe(true);
  });
  it("rifiuta hash duplicati nei casi verificati", () => {
    const d = definition();
    d.verifiedCaseHashes = ["a".repeat(64), "a".repeat(64)];
    expect(templateDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("limita lavoro del matcher con intestazioni ripetute", () => {
    const d = definition();
    d.signature = Array.from({ length: 100 }, (_, i) => ({
      normalized: "ripetuto",
      relativeRow: 0,
      relativeColumn: i,
    }));
    const values: Array<[number, number, string]> = Array.from(
      { length: 30_000 },
      (_, i) => [1 + Math.floor(i / 200), 1 + (i % 200), "ripetuto"]
    );
    const result = match(sheet(values), d);
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TEMPLATE_MATCH_LIMIT" }),
      ])
    );
  });
});
