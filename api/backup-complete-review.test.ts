import { beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  end: vi.fn(),
  connect: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("mysql2/promise", () => ({
  default: { createConnection: mocks.connect },
}));
vi.mock("./ms-auth", () => ({ authenticateRequest: mocks.auth }));
vi.mock("./lib/env", () => ({
  env: { databaseUrl: "mysql://test", allowedMicrosoftOids: ["admin"] },
}));
import { downloadBackup } from "./backup";
const tables = [
  "users",
  "cycles",
  "quotes",
  "cycle_simulations",
  "commercial_offers",
  "colleague_access",
  "sales_assignments",
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ role: "admin", unionId: "admin" });
  mocks.connect.mockResolvedValue({ query: mocks.query, end: mocks.end });
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("information_schema"))
      return [tables.map(tableName => ({ tableName }))];
    if (sql.startsWith("SHOW CREATE"))
      return [[{ "Create Table": "CREATE TABLE example (id bigint)" }]];
    if (sql === "SELECT * FROM colleague_access ORDER BY id")
      throw new Error("Unknown column id");
    if (sql.startsWith("SELECT *")) return [[{ value: "preserved" }]];
    return [[]];
  });
});
it("exports all tables with verified TLS and the colleague primary key", async () => {
  const app = new Hono();
  app.get("/backup", downloadBackup);
  const res = await app.request("/backup");
  expect(res.status).toBe(200);
  expect(mocks.connect).toHaveBeenCalledWith(
    expect.objectContaining({ ssl: { rejectUnauthorized: true } })
  );
  expect(mocks.query).toHaveBeenCalledWith(
    "SELECT * FROM colleague_access ORDER BY oid"
  );
  const body = (await res.json()) as {
    tables: string[];
    records: Record<string, unknown[]>;
    checksumSha256: string;
  };
  expect(body.tables).toEqual(expect.arrayContaining(tables));
  expect(body.records.colleague_access).toEqual([{ value: "preserved" }]);
  expect(body.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(mocks.query).toHaveBeenCalledWith("COMMIT");
  expect(mocks.end).toHaveBeenCalled();
});
it("rejects non-admin access before opening the database", async () => {
  mocks.auth.mockResolvedValue({ role: "user", unionId: "other" });
  const app = new Hono();
  app.get("/backup", downloadBackup);
  expect((await app.request("/backup")).status).toBe(403);
  expect(mocks.connect).not.toHaveBeenCalled();
});
it("review: includes optional templates with rows, DDL and checksum when present", async () => {
  tables.push("cycle_import_templates");
  try {
    const app = new Hono();
    app.get("/backup", downloadBackup);
    const res = await app.request("/backup");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.tables).toContain("cycle_import_templates");
    expect(body.records.cycle_import_templates).toEqual([
      { value: "preserved" },
    ]);
    expect(body.tableDefinitions.cycle_import_templates).toContain(
      "CREATE TABLE"
    );
    expect(body.tableChecksums.cycle_import_templates).toMatch(
      /^[a-f0-9]{64}$/
    );
  } finally {
    tables.pop();
  }
});

it("review: receipt table is included with exact rows and checksum when present", async () => {
  tables.push("cycle_create_receipts");
  try {
    const app = new Hono();
    app.get("/backup", downloadBackup);
    const res = await app.request("/backup");
    const body = (await res.json()) as any;
    expect(body.tables).toContain("cycle_create_receipts");
    expect(body.records.cycle_create_receipts).toEqual([
      { value: "preserved" },
    ]);
    expect(body.tableChecksums.cycle_create_receipts).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    tables.pop();
  }
});
