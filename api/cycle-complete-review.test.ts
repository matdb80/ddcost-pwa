import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readImportBackup } from "./cycle-import-backup-validation";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { TrpcContext } from "./context";
const state = vi.hoisted(() => ({
  receipts: [] as any[],
  cycles: [] as any[],
  templates: [] as any[],
  deletes: 0,
  failUpdate: false,
  failInsert: false,
  stage: "full",
  transactions: 0,
}));
vi.mock("./queries/connection", () => ({ getDb: () => db }));
const dialect = new MySqlDialect();
function tableRows(table: any) {
  const name = getTableName(table);
  return name === "cycles"
    ? state.cycles
    : name === "cycle_create_receipts"
      ? state.receipts
      : name === "cycle_import_templates"
        ? state.templates
        : [{ id: 7, role: "admin" }];
}
const db: any = {
  execute: async (query: any) => {
    const sql = dialect.sqlToQuery(query).sql;
    const params = dialect.sqlToQuery(query).params;
    const table = String(
      params.at(-1) ?? sql.match(/table_name = '([^']+)'/)?.[1] ?? ""
    );
    if (/information_schema.tables/i.test(sql)) {
      const known =
        state.stage === "none"
          ? []
          : ["0004", "0005"].includes(state.stage)
            ? ["cycle_import_templates"]
            : ["cycle_import_templates", "cycle_create_receipts"];
      return [[{ n: known.includes(table) ? 1 : 0 }], []];
    }
    if (/information_schema.columns/i.test(sql)) {
      const names =
        state.stage === "none" ||
        (table === "cycle_create_receipts" && state.stage !== "full")
          ? []
          : table === "cycle_import_templates"
            ? [
                "id",
                "rootId",
                "version",
                "name",
                "family",
                "status",
                "definitionJson",
                "verifiedCasesJson",
                "createdBy",
                "validatedBy",
                "validatedAt",
                "createdAt",
                ...(state.stage === "0004" ? [] : ["updatedAt"]),
              ]
            : [
                "id",
                "userId",
                "idempotencyKey",
                "payloadHash",
                "cycleId",
                "normalizedCode",
                "status",
                "createdAt",
                "updatedAt",
              ];
      return [
        names.map(name => ({ name, COLUMN_NAME: name, columnName: name })),
        [],
      ];
    }
    return [[], []];
  },
  select: () => {
    let table: any, where: any;
    const q: any = {
      from: (t: any) => {
        table = t;
        return q;
      },
      where: (w: any) => {
        where = w;
        return q;
      },
      limit: () => q,
      orderBy: () => q,
      for: () => q,
      then: (resolve: any, reject: any) => {
        let rows = tableRows(table);
        if (where) {
          const x = dialect.sqlToQuery(where);
          const keys = x.params.filter((p: any) => typeof p === "string");
          if (getTableName(table) === "cycle_create_receipts" && keys.length)
            rows = rows.filter(r =>
              x.sql.includes("idempotencyKey")
                ? r.idempotencyKey === keys[0]
                : r.normalizedCode === keys[0]
            );
          if (getTableName(table) === "cycles" && keys.length)
            rows = rows.filter(
              r =>
                r.code?.trim().toUpperCase() === String(keys[0]).toUpperCase()
            );
        }
        return Promise.resolve(structuredClone(rows)).then(resolve, reject);
      },
    };
    return q;
  },
  insert: (table: any) => ({
    values: async (v: any) => {
      if (state.failInsert) throw new Error("simulated insert failure");
      const rows = tableRows(table);
      if (getTableName(table) === "cycle_create_receipts") {
        if (
          state.receipts.some(
            r =>
              r.idempotencyKey === v.idempotencyKey ||
              (v.normalizedCode && r.normalizedCode === v.normalizedCode)
          )
        )
          throw Object.assign(new Error("duplicate"), {
            code: "ER_DUP_ENTRY",
            errno: 1062,
          });
      }
      const id = v.id ?? Math.max(0, ...rows.map(r => r.id ?? 0)) + 1;
      rows.push({ ...structuredClone(v), id });
      return [{ insertId: id, affectedRows: 1 }];
    },
  }),
  update: (table: any) => ({
    set: (v: any) => ({
      where: async (where: any) => {
        if (state.failUpdate) throw new Error("simulated update failure");
        const params = dialect.sqlToQuery(where).params;
        let rows = tableRows(table);
        if (getTableName(table) === "cycle_create_receipts")
          rows = rows.filter(r => params.includes(r.idempotencyKey));
        else rows = rows.filter(r => params.includes(r.id));
        for (const r of rows) Object.assign(r, v);
        return [{ affectedRows: rows.length }];
      },
    }),
  }),
  delete: (table: any) => {
    state.deletes++;
    const rows = tableRows(table);
    rows.splice(0);
    return Promise.resolve([{ affectedRows: 1 }]);
  },
  transaction: async (fn: any) => {
    state.transactions++;
    const snapshot = structuredClone({
      receipts: state.receipts,
      cycles: state.cycles,
      templates: state.templates,
      deletes: state.deletes,
    });
    try {
      return await fn(db);
    } catch (e) {
      Object.assign(state, snapshot);
      throw e;
    }
  },
};
import { createCycleIdempotent, stablePayloadHash } from "./cycle-idempotency";
import { cycleRouter } from "./cycle-router";
import { cycleImportRestoreRouter } from "./cycle-import-restore-router";
import { cycleImportCapabilityRouter } from "./cycle-import-capability-router";
import {
  parseMappingDraft,
  serializeMappingDraft,
} from "../src/types/excel-mapping-draft";
import {
  mappingFromProduct,
  applyMappingDecision,
} from "../src/lib/excel-mapping-draft";
const ctx = (role = "admin") =>
  ({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user: { id: 7, role, commercialOnly: false },
  }) as TrpcContext;
const definition: any = {
  schemaVersion: 2,
  family: "F3-LETTERS",
  name: "Test",
  signature: [
    { normalized: "tipo costo", relativeRow: 0, relativeColumn: 0 },
    { normalized: "voce di costo", relativeRow: 0, relativeColumn: 2 },
  ],
  products: [
    {
      key: "base",
      label: "Test",
      startAnchor: ["tipo costo"],
      optional: false,
      rowRules: [
        {
          fromRow: 3,
          toRow: 3,
          kind: "cost",
          mappings: [
            {
              target: "descrizione",
              constant: "Test",
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
const template = () => ({
  id: 40,
  rootId: 40,
  version: 1,
  name: "Test",
  family: "F3-LETTERS",
  status: "approved",
  definitionJson: JSON.stringify(definition),
  verifiedCasesJson: "null",
  createdBy: 7,
  validatedBy: null,
  validatedAt: null,
});
beforeEach(() =>
  Object.assign(state, {
    receipts: [],
    cycles: [],
    templates: [],
    deletes: 0,
    failUpdate: false,
    failInsert: false,
    stage: "full",
    transactions: 0,
  })
);
describe("COMPLETE independent requirements; DB simulation, not real connections", () => {
  it("same request returns exactly the same response on replay", async () => {
    const a = await createCycleIdempotent(db, 7, "review-key-0000001", {
      code: "X",
    });
    const b = await createCycleIdempotent(db, 7, "review-key-0000001", {
      code: "X",
    });
    expect(b).toEqual(a);
    expect(state.cycles).toHaveLength(1);
  });
  it("existing legacy cycle code cannot be created again", async () => {
    state.cycles.push({ id: 90, userId: 7, code: " OLD " });
    await expect(
      createCycleIdempotent(db, 7, "review-key-0000001", { code: "old" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.cycles).toHaveLength(1);
  });
  it("same key with changed payload reports typed conflict", async () => {
    await createCycleIdempotent(db, 7, "review-key-0000001", { code: "X" });
    await expect(
      createCycleIdempotent(db, 7, "review-key-0000001", { code: "Y" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("two keys for the same code report code conflict without second cycle", async () => {
    await createCycleIdempotent(db, 7, "review-key-0000001", { code: "X" });
    await expect(
      createCycleIdempotent(db, 7, "review-key-0000002", { code: "X" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.cycles).toHaveLength(1);
  });
  it("transaction failure leaves no receipt and no cycle in simulated rollback", async () => {
    state.failUpdate = true;
    await expect(
      createCycleIdempotent(db, 7, "review-key-0000001", { code: "X" })
    ).rejects.toThrow();
    expect(state.receipts).toHaveLength(0);
    expect(state.cycles).toHaveLength(0);
  });
  it("hash is canonical for equivalent object key order", () =>
    expect(stablePayloadHash({ a: 1, b: 2 })).toBe(
      stablePayloadHash({ b: 2, a: 1 })
    ));
  it("actual duplicate UI payload is accepted by cycle.create", async () => {
    const filename = "src/pages/CicliPage.tsx";
    const source = ts.createSourceFile(
      filename,
      readFileSync(filename, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    let object: ts.Node | undefined;
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        n.expression.getText(source) === "duplicateCycle.mutateAsync"
      )
        object = n.arguments[0];
      ts.forEachChild(n, visit);
    };
    visit(source);
    if (!object) throw Error("duplicate payload missing");
    const calculated = {
      codice: "DUP",
      descrizione: "copy",
      cliente: "",
      lotto: "200",
      costo_standard: 1,
      prezzo_minimo: 2,
    };
    const payload = new Function(
      "calculated",
      "serializeCycleDataJson",
      "duplicateCreateKey",
      `return (${object.getText(source)});`
    )(calculated, () => ({}), "review-key-duplicate");
    await expect(
      cycleRouter.createCaller(ctx()).create(payload)
    ).resolves.toHaveProperty("id");
  });
  it("normal writer cannot replace all shared templates", async () => {
    await expect(
      cycleImportRestoreRouter
        .createCaller(ctx("user"))
        .restoreTemplates({ mode: "replace", rows: [] } as any)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.deletes).toBe(0);
  });
  it("unverified approved template must be rejected before writing", async () => {
    await expect(
      cycleImportRestoreRouter
        .createCaller(ctx())
        .restoreTemplates({ mode: "replace", rows: [template()] } as any)
    ).rejects.toThrow();
    expect(state.templates).toHaveLength(0);
  });
  it("partial 0004 database is not reported as usable for templates", async () => {
    state.stage = "0004";
    const r: any = await cycleImportCapabilityRouter.createCaller(ctx()).get();
    expect(r.templatesReady).toBe(false);
    expect(r.idempotencyReady).toBe(false);
  });
  it("malformed MappingDraft field is rejected", () => {
    expect(() =>
      parseMappingDraft(
        JSON.stringify({
          schemaVersion: 1,
          id: "x",
          workbookSha256: "a",
          productKey: "p",
          fields: ["arbitrary"],
          problems: [],
          updatedAt: "invalid",
        })
      )
    ).toThrow();
  });
  it("invalid quantity override does not become valid", () => {
    const m: any = {
      schemaVersion: 1,
      id: "x",
      workbookSha256: "a",
      productKey: "p",
      fields: [
        {
          id: "r:nr_componenti",
          rowKey: "r",
          target: "nr_componenti",
          source: { sheet: "s", addresses: ["I4"], original: ["?"] },
          transform: "number",
          proposed: 1,
          decision: "proposed",
          validation: "pending",
        },
      ],
      problems: [],
      updatedAt: new Date().toISOString(),
    };
    expect(
      applyMappingDecision(m, "r:nr_componenti", -1).fields[0].validation
    ).toBe("invalid");
  });
  it("MappingDraft keeps display and cached value of each source cell", () => {
    const cell = {
      address: "I4",
      row: 4,
      column: 9,
      raw: 1,
      displayText: "1 pz",
      formula: "1+0",
      cached: 1,
      hiddenRow: false,
      hiddenColumn: false,
    };
    const p: any = {
      key: "p",
      rows: [
        {
          key: "r",
          excelRow: 4,
          row: { nr_componenti: 1 },
          sources: {
            nr_componenti: {
              sheet: "s",
              addresses: ["I4"],
              original: [1],
              formulas: ["1+0"],
              transform: "number",
              unit: "pz",
            },
          },
          problems: [],
        },
      ],
      problems: [],
    };
    const d: any = {
      workbook: { sha256: "a", sheets: [{ name: "s", cells: { I4: cell } }] },
      problems: [],
    };
    const m: any = mappingFromProduct(d, p);
    expect(m.fields[0].sourceCells).toEqual([
      expect.objectContaining({
        displayText: "1 pz",
        formula: "1+0",
        cached: 1,
      }),
    ]);
  });
});
const digest = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
function backup(records: Record<string, unknown[]>) {
  const tables = Object.keys(records),
    rowCounts = Object.fromEntries(tables.map(t => [t, records[t].length])),
    tableChecksums = Object.fromEntries(
      tables.map(t => [t, digest(records[t])])
    ),
    tableDefinitions = Object.fromEntries(
      tables.map(t => [t, `CREATE TABLE ${t} (id bigint)`])
    );
  const payload = {
    format: "ddcost-tidb-logical-backup",
    formatVersion: 1,
    tables,
    rowCounts,
    tableChecksums,
    tableDefinitions,
    records,
  };
  return { ...payload, checksumSha256: digest(payload) };
}
const resign = (b: any) => {
  const { checksumSha256: _, ...payload } = b;
  return { ...payload, checksumSha256: digest(payload) };
};
function validTemplate() {
  const d = { ...definition, verifiedCaseHashes: ["a".repeat(64)] };
  return {
    ...template(),
    definitionJson: JSON.stringify(d),
    verifiedCasesJson: JSON.stringify(d.verifiedCaseHashes),
    validatedBy: 7,
    validatedAt: "2026-11-07 00:00:00",
    createdAt: "2026-11-07 00:00:00",
    updatedAt: "2026-11-07 00:00:00",
  };
}
const restore = (b: any, mode: "merge" | "replace" = "merge") =>
  cycleImportRestoreRouter
    .createCaller(ctx())
    .restoreTemplates({ mode, backup: b });
describe("Patch regressions: isolated simulator, no database integration claim", () => {
  it.each(["none", "0004", "0005", "full"])(
    "capability matrix: %s",
    async stage => {
      state.stage = stage;
      const r: any = await cycleImportCapabilityRouter
        .createCaller(ctx())
        .get();
      expect(r.templatesReady).toBe(["0005", "full"].includes(stage));
      expect(r.idempotencyReady).toBe(stage === "full");
    }
  );
  it("missing migration stops creation before the transaction", async () => {
    state.stage = "0005";
    await expect(
      createCycleIdempotent(db, 7, "review-key-0000001", { code: "X" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.transactions).toBe(0);
  });
  it("editor import key survives a component key change", () => {
    const file = "src/pages/CicloEditorPage.tsx";
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    let expression: ts.Node | undefined;
    const visit = (n: ts.Node) => {
      if (
        ts.isPropertyAssignment(n) &&
        n.name.getText(source) === "idempotencyKey"
      )
        expression = n.initializer;
      ts.forEachChild(n, visit);
    };
    visit(source);
    expect(expression).toBeDefined();
    const evaluate = new Function(
      "excelDraftId",
      "cycleCreateKey",
      `return ${expression!.getText(source)}`
    );
    expect(evaluate("persistent-import-id", "first-key")).toBe(
      evaluate("persistent-import-id", "second-key")
    );
  });
  it("real backup shape preserves root ID, validation author and dates", async () => {
    const b = backup({ cycle_import_templates: [validTemplate()] });
    expect(await restore(b, "replace")).toMatchObject({ restored: 1 });
    expect(state.templates[0]).toMatchObject({
      id: 40,
      rootId: 40,
      validatedBy: 7,
      validatedAt: new Date("2026-11-07T00:00:00Z"),
    });
  });
  it("approved without verified cases is rejected in a checksummed envelope", async () => {
    const t = {
      ...validTemplate(),
      definitionJson: JSON.stringify(definition),
      verifiedCasesJson: "[]",
    };
    await expect(
      restore(backup({ cycle_import_templates: [t] }), "replace")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.deletes).toBe(0);
  });
  it("old backup without optional tables preserves existing templates and receipts", async () => {
    state.templates.push(validTemplate());
    state.receipts.push({ id: 8 });
    const b = backup({ cycles: [] });
    expect(await restore(b, "replace")).toMatchObject({ skipped: true });
    expect(state.templates).toHaveLength(1);
    expect(state.receipts).toHaveLength(1);
    expect(state.deletes).toBe(0);
  });
  it.each([
    "checksum",
    "tableChecksum",
    "count",
    "root",
    "version",
    "schema",
    "author",
  ])("rejects damaged %s before writing", async kind => {
    let b: any = backup({ cycle_import_templates: [validTemplate()] });
    if (kind === "checksum") b.checksumSha256 = "0".repeat(64);
    if (kind === "tableChecksum") {
      b.tableChecksums.cycle_import_templates = "0".repeat(64);
      b = resign(b);
    }
    if (kind === "count") {
      b.rowCounts.cycle_import_templates = 2;
      b = resign(b);
    }
    if (
      kind === "root" ||
      kind === "version" ||
      kind === "schema" ||
      kind === "author"
    ) {
      const t: any = validTemplate();
      if (kind === "root") t.rootId = 99;
      if (kind === "version") t.version = 2;
      if (kind === "schema") t.status = "unrecognized";
      if (kind === "author") t.createdBy = 999;
      b = backup({ cycle_import_templates: [t] });
    }
    await expect(restore(b, "replace")).rejects.toThrow();
    expect(state.deletes).toBe(0);
    expect(state.templates).toHaveLength(0);
  });
  it("merge of the same backup is idempotent and conflicting content is rejected", async () => {
    const b = backup({ cycle_import_templates: [validTemplate()] });
    await restore(b);
    expect(await restore(b)).toMatchObject({ restored: 0 });
    await expect(
      restore(
        backup({
          cycle_import_templates: [{ ...validTemplate(), validatedBy: 8 }],
        })
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.templates).toHaveLength(1);
  });
  it("failed insert rolls back replacement in the simulator", async () => {
    state.templates.push({ id: 99 });
    state.failInsert = true;
    await expect(
      restore(backup({ cycle_import_templates: [validTemplate()] }), "replace")
    ).rejects.toThrow();
    expect(state.templates).toEqual([{ id: 99 }]);
    expect(state.deletes).toBe(0);
  });
  it("receipt restore preserves retry result and never erases history", async () => {
    const payload = { code: "X" },
      r = {
        id: 4,
        userId: 7,
        idempotencyKey: "review-key-restored",
        payloadHash: stablePayloadHash(payload),
        cycleId: 91,
        normalizedCode: "X",
        status: "completed",
        createdAt: "2026-11-07 00:00:00",
        updatedAt: "2026-11-07 00:00:00",
      };
    state.cycles.push({ id: 91, userId: 7, code: "X" });
    expect(
      await restore(backup({ cycle_create_receipts: [r] }), "replace")
    ).toMatchObject({ receiptsRestored: 1 });
    expect(
      await createCycleIdempotent(db, 7, r.idempotencyKey, payload)
    ).toEqual({ id: 91 });
    await restore(backup({ cycle_create_receipts: [] }), "replace");
    expect(state.receipts).toHaveLength(1);
    expect(state.cycles).toHaveLength(1);
  });
  it("receipt pointing to another cycle fails before template replacement", async () => {
    const r = {
      id: 4,
      userId: 7,
      idempotencyKey: "review-key-restored",
      payloadHash: "a".repeat(64),
      cycleId: 91,
      normalizedCode: "X",
      status: "completed",
      createdAt: "2026-11-07 00:00:00",
      updatedAt: "2026-11-07 00:00:00",
    };
    await expect(
      restore(
        backup({ cycle_import_templates: [], cycle_create_receipts: [r] }),
        "replace"
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.deletes).toBe(0);
  });
  it("checked backup parser does not execute supplied DDL", () => {
    const b: any = backup({ cycle_import_templates: [] });
    b.tableDefinitions.cycle_import_templates = "DROP DATABASE untrusted";
    const data = readImportBackup(resign(b));
    expect(data.templates).toEqual([]);
    expect(state.transactions).toBe(0);
  });
});

it("receipt can belong to a cycle whose code changed after creation", async () => {
  const r = {
    id: 4,
    userId: 7,
    idempotencyKey: "review-key-renamed",
    payloadHash: stablePayloadHash({ code: "OLD" }),
    cycleId: 91,
    normalizedCode: "OLD",
    status: "completed",
    createdAt: "2026-11-07 00:00:00",
    updatedAt: "2026-11-07 00:00:00",
  };
  state.cycles.push({ id: 91, userId: 7, code: "NEW" });
  expect(await restore(backup({ cycle_create_receipts: [r] }))).toMatchObject({
    receiptsRestored: 1,
  });
  expect(
    await createCycleIdempotent(db, 7, r.idempotencyKey, { code: "OLD" })
  ).toEqual({ id: 91 });
});
it("MappingDraft date scalar survives JSON roundtrip as Date", () => {
  const date = new Date("2026-11-07T00:00:00Z"),
    m: any = {
      schemaVersion: 1,
      id: "x",
      workbookSha256: "a",
      productKey: "p",
      fields: [
        {
          id: "r:d",
          rowKey: "r",
          target: "descrizione",
          source: { sheet: "s", addresses: ["A1"], original: [date] },
          proposed: "x",
          transform: "text",
          decision: "proposed",
          validation: "pending",
        },
      ],
      problems: [],
      updatedAt: date.toISOString(),
    };
  expect(
    parseMappingDraft(serializeMappingDraft(m)).fields[0].source.original[0]
  ).toEqual(date);
});

it("replays receipts created by the original COMPLETE hashing format", async () => {
  const payload = { description: "Legacy request", code: "OLD" };
  state.receipts.push({
    id: 4,
    userId: 7,
    idempotencyKey: "review-legacy-hash",
    payloadHash: digest(payload),
    cycleId: 91,
    normalizedCode: "OLD",
    status: "completed",
  });
  state.cycles.push({ id: 91, userId: 7, code: "OLD" });
  expect(
    await createCycleIdempotent(db, 7, "review-legacy-hash", payload)
  ).toEqual({ id: 91 });
  await expect(
    createCycleIdempotent(db, 7, "review-legacy-hash", {
      ...payload,
      description: "Changed",
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(state.cycles).toHaveLength(1);
});

it("code reservation stays a typed conflict after the created cycle is renamed", async () => {
  await createCycleIdempotent(db, 7, "review-original-code", {
    code: "ORIGINAL",
  });
  state.cycles[0].code = "RENAMED";
  await expect(
    createCycleIdempotent(db, 7, "review-different-key", { code: "ORIGINAL" })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(state.cycles).toHaveLength(1);
});

it("restore dry-run returns the concrete plan without replacing any rows", async () => {
  state.templates.push({ id: 99 });
  const input = backup({ cycle_import_templates: [validTemplate()] });
  const result = await cycleImportRestoreRouter
    .createCaller(ctx())
    .restoreTemplates({ mode: "replace", backup: input, dryRun: true });
  expect(result).toMatchObject({
    preview: {
      templatesToInsert: 1,
      templatesToDelete: 1,
      receiptsToInsert: 0,
    },
  });
  expect(state.templates).toEqual([{ id: 99 }]);
  expect(state.deletes).toBe(0);
});
