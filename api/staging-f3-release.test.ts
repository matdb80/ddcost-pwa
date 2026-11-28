import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { assertBackupBaseline, assertF3Schema, assertF3StagingTarget, schemaHash } from "./staging-f3-release";
import type { collectLogicalBackup } from "./backup";
import type { Connection } from "mysql2/promise";

const valid = {
  DDCOST_STAGING_F3_ACTION: "migrate-and-test",
  RENDER_SERVICE_ID: "srv-db5np90473hc73bq8c1g",
  RENDER_GIT_BRANCH: "feature/editor-cicli-v7-reviewed",
  RENDER_GIT_REPO_SLUG: "matdb80/ddcost-pwa",
  RENDER_EXTERNAL_URL: "https://ddcost-collaudo.onrender.com",
  VITE_APP_ID: "ddcost-collaudo",
  DDCOST_EXPECTED_TIDB_BRANCH_USERNAME: "9ovJ2FwEUzJE8ck.root",
  DATABASE_URL: "mysql://9ovJ2FwEUzJE8ck.root:synthetic@gateway01.us-west-2.prod.aws.tidbcloud.com/ddcost",
  MICROSOFT_REDIRECT_URI: "https://ddcost-collaudo.onrender.com/api/auth/microsoft/callback",
  RENDER_GIT_COMMIT: "a".repeat(40), DDCOST_STAGING_F3_COMMIT: "a".repeat(40),
};
describe("staging F3 release destination guard", () => {
  it("accepts the exact staging release", () => expect(() => assertF3StagingTarget(valid)).not.toThrow());
  it.each(Object.keys(valid))("refuses a changed or missing %s", key => {
    expect(() => assertF3StagingTarget({ ...valid, [key]: "wrong" })).toThrow();
    expect(() => assertF3StagingTarget({ ...valid, [key]: undefined })).toThrow();
  });
  it("rejects production username despite staging labels", () => {
    expect(() => assertF3StagingTarget({ ...valid,
      DATABASE_URL: valid.DATABASE_URL.replace("9ovJ2FwEUzJE8ck", "4PcqbQ4znDT9fsG") })).toThrow("database identity");
  });
  it("does not leak the connection URL when parsing fails", () => {
    expect(() => assertF3StagingTarget({ ...valid, DATABASE_URL: "secret-invalid-url" })).toThrow("Invalid target configuration");
  });
});

const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
function snapshot() {
  const tables = ["users", "cycles", "quotes", "cycle_simulations", "commercial_offers"] as const;
  const records = Object.fromEntries(tables.map(t => [t, [{ id: "1", value: "synthetic" }]]));
  const tableDefinitions = Object.fromEntries(tables.map(t => [t, `CREATE TABLE ${t} (id BIGINT) AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4`]));
  const tableChecksums = Object.fromEntries(tables.map(t => [t, digest(records[t])]));
  const rowCounts = Object.fromEntries(tables.map(t => [t, 1]));
  const backup = { tables: [...tables], records, tableDefinitions, tableChecksums, rowCounts } as unknown as Awaited<ReturnType<typeof collectLogicalBackup>>;
  const baseline = { backupSha256: "b".repeat(64), tables: Object.fromEntries(tables.map(t => [t,
    { count: rowCounts[t], sha256: tableChecksums[t], schemaSha256: schemaHash(tableDefinitions[t]) }])) };
  return { backup, raw: JSON.stringify(baseline) };
}
it("validates all baseline row hashes, counts and schemas", () => {
  const { backup, raw } = snapshot();
  expect(assertBackupBaseline(backup, raw)).toBe("b".repeat(64));
  backup.tableChecksums.cycles = "c".repeat(64);
  expect(() => assertBackupBaseline(backup, raw)).toThrow("cycles");
});
it("rejects missing tables and changed counts/schema", () => {
  const { backup, raw } = snapshot();
  backup.rowCounts.quotes++;
  expect(() => assertBackupBaseline(backup, raw)).toThrow("quotes");
  backup.rowCounts.quotes--;
  backup.tableDefinitions.quotes += ", new_column INT";
  expect(() => assertBackupBaseline(backup, raw)).toThrow("quotes");
  backup.tables.pop();
  expect(() => assertBackupBaseline(backup, raw)).toThrow("inventory");
});
it("ignores only auto-increment counters when comparing DDL", () => {
  const { backup, raw } = snapshot();
  backup.tableDefinitions.cycles = backup.tableDefinitions.cycles.replace("AUTO_INCREMENT=50", "AUTO_INCREMENT=99");
  expect(() => assertBackupBaseline(backup, raw)).not.toThrow();
});
it("rejects malformed baseline metadata", () => {
  expect(() => assertBackupBaseline(snapshot().backup, "{}" )).toThrow("metadata");
});
it("rejects incomplete schema without issuing DDL", async () => {
  const execute = vi.fn().mockResolvedValue([[{ name: "id", type: "bigint" }]]);
  await expect(assertF3Schema({ execute } as unknown as Connection)).rejects.toThrow("Schema incomplete");
  expect(execute.mock.calls.every(([query]) => query.startsWith("SELECT"))).toBe(true);
});
