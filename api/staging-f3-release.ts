/** Explicit, fail-closed release task for the one authorized staging service. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { collectLogicalBackup } from "./backup";

const origin = "https://ddcost-collaudo.onrender.com";
const username = "9ovJ2FwEUzJE8ck.root";
const optional = new Set(["cycle_import_templates", "cycle_create_receipts"]);
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const schemaHash = (ddl: string) => hash(ddl.replace(/\bAUTO_INCREMENT=\d+\s*/g, ""));
const baselineSchema = z.strictObject({
  backupSha256: z.string().regex(/^[a-f0-9]{64}$/),
  tables: z.record(z.string().regex(/^[a-z_]+$/), z.strictObject({
    count: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    schemaSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })),
});
type Backup = Awaited<ReturnType<typeof collectLogicalBackup>>;

export function assertF3StagingTarget(vars: NodeJS.ProcessEnv) {
  if (vars.DDCOST_STAGING_F3_ACTION !== "migrate-and-test"
    || vars.RENDER_SERVICE_ID !== "srv-db5np90473hc73bq8c1g"
    || vars.RENDER_GIT_BRANCH !== "feature/editor-cicli-v7-reviewed"
    || vars.RENDER_GIT_REPO_SLUG !== "matdb80/ddcost-pwa"
    || vars.RENDER_EXTERNAL_URL !== origin
    || vars.VITE_APP_ID !== "ddcost-collaudo"
    || vars.DDCOST_EXPECTED_TIDB_BRANCH_USERNAME !== username
    || !/^[a-f0-9]{40}$/.test(vars.DDCOST_STAGING_F3_COMMIT ?? "")
    || vars.RENDER_GIT_COMMIT !== vars.DDCOST_STAGING_F3_COMMIT)
    throw new Error("[F3 release] Refused service/branch/release identity");
  let target: URL, callback: URL;
  try {
    target = new URL(vars.DATABASE_URL ?? "");
    callback = new URL(vars.MICROSOFT_REDIRECT_URI ?? "");
  } catch { throw new Error("[F3 release] Invalid target configuration"); }
  if (target.protocol !== "mysql:" || target.hostname !== "gateway01.us-west-2.prod.aws.tidbcloud.com"
    || decodeURIComponent(target.username) !== username || target.pathname !== "/ddcost"
    || callback.origin !== origin)
    throw new Error("[F3 release] Refused database identity");
}

export function assertBackupBaseline(backup: Backup, raw: string) {
  let baseline: z.infer<typeof baselineSchema>;
  try { baseline = baselineSchema.parse(JSON.parse(raw)); }
  catch { throw new Error("[F3 release] Invalid backup verification metadata"); }
  const names = Object.keys(baseline.tables).sort();
  const actual = backup.tables.filter(t => !optional.has(t)).sort();
  if (names.length < 5 || JSON.stringify(names) !== JSON.stringify(actual))
    throw new Error("[F3 release] Backup table inventory differs");
  for (const table of actual) {
    const expected = baseline.tables[table];
    if (backup.rowCounts[table] !== expected.count || backup.tableChecksums[table] !== expected.sha256
      || schemaHash(backup.tableDefinitions[table]) !== expected.schemaSha256)
      throw new Error(`[F3 release] Backup baseline differs: ${table}`);
  }
  return baseline.backupSha256;
}

export async function assertF3Schema(db: Connection) {
  const required = {
    cycle_import_templates: {
      id: "bigint", rootId: "bigint", version: "bigint", name: "varchar", family: "varchar", status: "enum",
      definitionJson: "mediumtext", verifiedCasesJson: "mediumtext", createdBy: "bigint", validatedBy: "bigint",
      validatedAt: "timestamp", createdAt: "timestamp", updatedAt: "timestamp",
    },
    cycle_create_receipts: {
      id: "bigint", userId: "bigint", idempotencyKey: "varchar", payloadHash: "char", cycleId: "bigint",
      normalizedCode: "varchar", status: "enum", createdAt: "timestamp", updatedAt: "timestamp",
    },
  };
  for (const [table, columns] of Object.entries(required)) {
    const [rows] = await db.execute<RowDataPacket[]>(
      "SELECT COLUMN_NAME AS name, DATA_TYPE AS type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?", [table]);
    if (Object.entries(columns).some(([name, type]) => !rows.some(r => r.name === name && r.type === type)))
      throw new Error(`[F3 release] Schema incomplete: ${table}`);
  }
  const unique = {
    cycle_import_templates: [["id"], ["rootId", "version"]],
    cycle_create_receipts: [["id"], ["userId", "idempotencyKey"], ["userId", "normalizedCode"]],
  };
  for (const [table, groups] of Object.entries(unique)) {
    const [rows] = await db.execute<RowDataPacket[]>(
      "SELECT INDEX_NAME AS name, COLUMN_NAME AS col, SEQ_IN_INDEX AS pos FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND NON_UNIQUE=0 ORDER BY INDEX_NAME,SEQ_IN_INDEX", [table]);
    const indices = new Map<string, string[]>();
    for (const r of rows) indices.set(r.name, [...(indices.get(r.name) ?? []), r.col]);
    if (groups.some(g => ![...indices.values()].some(v => JSON.stringify(g) === JSON.stringify(v))))
      throw new Error(`[F3 release] Unique constraints incomplete: ${table}`);
  }
}

export async function runStagingF3Release() {
  assertF3StagingTarget(process.env);
  const metadata = process.env.DDCOST_STAGING_F3_BACKUP_BASELINE ?? "";
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, connectTimeout: 10000,
    supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false, dateStrings: true,
  });
  try {
    const before = await collectLogicalBackup(db);
    const backupSha256 = assertBackupBaseline(before, metadata);
    const [inventory] = await db.query<RowDataPacket[]>("SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()");
    if (inventory.some(r => !before.tables.includes(r.name)))
      throw new Error("[F3 release] Unbacked table present");
    if (before.records.cycle_import_templates?.length || before.records.cycle_create_receipts?.length)
      throw new Error("[F3 release] Tests require empty F3 tables; existing records preserved");
    console.log("[F3 release] PASS target and backup baseline", backupSha256);
    // Read the versioned SQL verbatim. 0004 remains immutable; 0005 is applied only when absent.
    for (const file of ["0004_cycle_import_templates.sql", "0005_cycle_import_templates_updated_at.sql", "0006_cycle_create_receipts_and_code_reservations.sql"]) {
      if (file.startsWith("0005")) {
        const [cols] = await db.query<RowDataPacket[]>("SHOW COLUMNS FROM cycle_import_templates LIKE 'updatedAt'");
        if (cols.length) continue;
      }
      await db.query(readFileSync(new URL(`../db/migrations/${file}`, import.meta.url), "utf8"));
    }
    await assertF3Schema(db);
    console.log("[F3 release] PASS migrations 0004/0005/0006 and unique constraints");
    const { runStagingF3DbTests } = await import("./staging-f3-db-tests");
    try { await runStagingF3DbTests(db); }
    finally {
      const after = await collectLogicalBackup(db);
      assertBackupBaseline(after, metadata);
      if (after.records.cycle_import_templates.length || after.records.cycle_create_receipts.length)
        throw new Error("[F3 release] Test cleanup incomplete");
      console.log("[F3 release] PASS cleanup; all 16 existing table row hashes and schema preserved (auto-increment counters excluded)");
    }
    console.log("[F3 release] ALL PASS", process.env.RENDER_GIT_COMMIT);
  } finally { await db.end(); }
}
