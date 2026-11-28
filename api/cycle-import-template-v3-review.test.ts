import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./context";
import type { TemplateDefinition } from "../src/types/excel-import";
const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  inserted: [] as unknown[],
  updates: [] as unknown[],
  transactions: 0,
  insertError: undefined as unknown,
  updateCount: 1,
}));
// Shim only permits the original delivery to load despite its missing ORM export.
// Fixed code uses the real ORM table. No test opens a network connection.
vi.mock("@db/schema", async importOriginal => {
  const original = await importOriginal<Record<string, unknown>>();
  const { mysqlTable, bigint, varchar, timestamp } =
    await import("drizzle-orm/mysql-core");
  return {
    ...original,
    cycleImportTemplates:
      original.cycleImportTemplates ??
      mysqlTable("cycle_import_templates", {
        id: bigint("id", { mode: "number" }),
        rootId: bigint("rootId", { mode: "number" }),
        version: bigint("version", { mode: "number" }),
        name: varchar("name", { length: 255 }),
        family: varchar("family", { length: 64 }),
        status: varchar("status", { length: 20 }),
        definitionJson: varchar("definitionJson", { length: 1000 }),
        verifiedCasesJson: varchar("verifiedCasesJson", { length: 1000 }),
        createdBy: bigint("createdBy", { mode: "number" }),
        validatedBy: bigint("validatedBy", { mode: "number" }),
        validatedAt: timestamp("validatedAt"),
        updatedAt: timestamp("updatedAt"),
      }),
  };
});
vi.mock("./queries/connection", () => {
  const db = {
    execute: async () => [
      [
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
        "updatedAt",
      ].map(name => ({ name })),
      [],
    ],
    select: () => {
      let locked = false;
      let userLock = false;
      const q = {
        from: (table: Parameters<typeof getTableName>[0]) => {
          userLock = getTableName(table) === "users";
          return q;
        },
        where: () => q,
        orderBy: () => q,
        limit: () => q,
        for: () => {
          locked = true;
          return q;
        },
        then: (
          resolve: (v: unknown[]) => unknown,
          reject: (e: unknown) => unknown
        ) =>
          Promise.resolve(
            userLock
              ? [{ id: 7 }]
              : ((locked ? state.rows.shift() : state.rows.pop()) ?? [])
          ).then(resolve, reject),
      };
      return q;
    },
    insert: () => ({
      values: async (values: unknown) => {
        if (state.insertError) throw state.insertError;
        state.inserted.push(values);
        return [{ insertId: 17 }];
      },
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          state.updates.push(values);
          return [{ affectedRows: state.updateCount }];
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      state.transactions++;
      return fn(db);
    },
  };
  return { getDb: () => db };
});
import { cycleImportTemplateRouter } from "./cycle-import-template-router";
const caller = (commercialOnly = false, authenticated = true) =>
  cycleImportTemplateRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user: authenticated
      ? ({ id: 7, role: "user", commercialOnly } as TrpcContext["user"])
      : undefined,
  });
function input() {
  const definition: TemplateDefinition = {
    schemaVersion: 2,
    family: "F3-LETTERS",
    name: "Test",
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
            toRow: 3,
            kind: "cost",
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
  return {
    name: "Test",
    status: "draft" as "draft" | "tested" | "approved",
    definition,
    verifiedCases: [] as string[],
  };
}
const root = { id: 1, rootId: 1, version: 1 };
const latest = { id: 2, rootId: 1, version: 2 };
beforeEach(() => {
  state.rows = [];
  state.inserted = [];
  state.updates = [];
  state.transactions = 0;
  state.insertError = undefined;
  state.updateCount = 1;
});
describe("V3 API con database simulato", () => {
  it("utente anonimo non legge né scrive", async () => {
    await expect(caller(false, false).list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller(false, false).save(input())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(state.transactions).toBe(0);
  });
  it("commerciale non legge template né scrive", async () => {
    await expect(caller(true).listApproved()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller(true).save(input())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(state.transactions).toBe(0);
  });
  it("rifiuta approved senza casi", async () => {
    const i = input();
    i.status = "approved";
    await expect(caller().save(i)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(state.transactions).toBe(0);
  });
  it("rifiuta tested senza casi", async () => {
    const i = input();
    i.status = "tested";
    await expect(caller().save(i)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rifiuta casi discordanti da definition", async () => {
    const i = input();
    i.status = "approved";
    i.verifiedCases = ["a".repeat(64)];
    await expect(caller().save(i)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rifiuta nome discordante", async () => {
    const i = input();
    i.definition.name = "Altro";
    await expect(caller().save(i)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("rifiuta expectedVersion senza radice", async () => {
    await expect(
      caller().save({ ...input(), expectedVersion: 999 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("nuova radice è inizializzata nella transazione", async () => {
    expect(await caller().save(input())).toEqual({
      id: 17,
      rootId: 17,
      version: 1,
    });
    expect(state.transactions).toBe(1);
    expect(state.updates).toEqual([{ rootId: 17 }]);
  });
  it("radice non inizializzata fa fallire la transazione", async () => {
    state.updateCount = 0;
    await expect(caller().save(input())).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
  it("rifiuta gruppo senza radice canonica", async () => {
    state.rows = [[{ id: 5, rootId: 999, version: 2 }]];
    await expect(
      caller().save({ ...input(), rootId: 999, expectedVersion: 2 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.inserted).toHaveLength(0);
  });
  it("rifiuta revisione superata", async () => {
    state.rows = [[root], [latest]];
    await expect(
      caller().save({ ...input(), rootId: 1, expectedVersion: 1 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.inserted).toHaveLength(0);
  });
  it("aggiunge versione senza aggiornare la precedente", async () => {
    state.rows = [[root], [latest]];
    expect(
      await caller().save({ ...input(), rootId: 1, expectedVersion: 2 })
    ).toEqual({ id: 17, rootId: 1, version: 3 });
    expect(state.updates).toHaveLength(0);
    expect(state.inserted).toHaveLength(1);
  });
  it("errore database non duplicato resta errore interno", async () => {
    state.rows = [[root], [latest]];
    state.insertError = new Error("database unavailable");
    await expect(
      caller().save({ ...input(), rootId: 1, expectedVersion: 2 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
  it("duplicato unique index diventa conflitto", async () => {
    state.rows = [[root], [latest]];
    state.insertError = { code: "ER_DUP_ENTRY" };
    await expect(
      caller().save({ ...input(), rootId: 1, expectedVersion: 2 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("listApproved restituisce una sola revisione per radice", async () => {
    const i = input();
    i.definition.verifiedCaseHashes = ["a".repeat(64)];
    const data = {
      name: "Test",
      status: "approved",
      definitionJson: JSON.stringify(i.definition),
      verifiedCasesJson: JSON.stringify(i.definition.verifiedCaseHashes),
      validatedBy: 7,
      validatedAt: new Date(),
      rootId: 1,
    };
    state.rows = [
      [
        { ...data, id: 2, version: 2 },
        { ...data, id: 1, version: 1 },
      ],
    ];
    const rows = await caller().listApproved();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 2, definition: i.definition });
  });
});

function f3Input(status: "draft" | "tested" | "approved") {
  const i = input();
  i.status = status;
  i.definition.f3Profile = {
    engineRevision: 1,
    structure: JSON.stringify({
      columns: {
        kind: 0,
        description: 2,
        quantity: 8,
        speed: 10,
        unit: 11,
        rate: 12,
        cost: 14,
      },
      variant: "",
      rows: [
        { offset: 2, kind: "cost", category: "c", unit: "pz", option: null },
      ],
    }),
    bindings: [],
  };
  if (status !== "draft") {
    i.verifiedCases = ["a".repeat(64)];
    i.definition.verifiedCaseHashes = [...i.verifiedCases];
  }
  return i;
}
describe("F3 template lifecycle gates", () => {
  it("requires a draft before a new tested or approved root", async () => {
    for (const status of ["tested", "approved"] as const)
      await expect(caller().save(f3Input(status))).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    expect(state.inserted).toHaveLength(0);
  });
  it("does not approve a draft directly", async () => {
    const i = f3Input("approved");
    state.rows = [
      [root],
      [
        {
          ...latest,
          status: "draft",
          definitionJson: JSON.stringify(i.definition),
          verifiedCasesJson: JSON.stringify(i.verifiedCases),
        },
      ],
    ];
    await expect(
      caller().save({ ...i, rootId: 1, expectedVersion: 2 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.inserted).toHaveLength(0);
  });
  it("requires approval to preserve the tested definition and cases", async () => {
    const i = f3Input("approved");
    state.rows = [
      [root],
      [
        {
          ...latest,
          status: "tested",
          definitionJson: "{}",
          verifiedCasesJson: JSON.stringify(i.verifiedCases),
        },
      ],
    ];
    await expect(
      caller().save({ ...i, rootId: 1, expectedVersion: 2 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("creates an approved revision from the exact tested definition", async () => {
    const i = f3Input("approved");
    state.rows = [
      [root],
      [
        {
          ...latest,
          status: "tested",
          definitionJson: JSON.stringify(i.definition),
          verifiedCasesJson: JSON.stringify(i.verifiedCases),
        },
      ],
    ];
    expect(
      await caller().save({ ...i, rootId: 1, expectedVersion: 2 })
    ).toEqual({ id: 17, rootId: 1, version: 3 });
    expect(state.updates).toHaveLength(0);
  });
});
