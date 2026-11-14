/**
 * Read-only, administrator-only logical backup of all DDCost tables.
 * Runs on Render using the already-configured TiDB connection.
 * Does not create, update or delete any database records.
 */
import { createHash } from "node:crypto";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import type { Context } from "hono";
import { env } from "./lib/env";
import { authenticateRequest } from "./ms-auth";

const TABLES = [
  "users",
  "colleague_access",
  "sales_assignments",
  "cycles",
  "cycle_import_templates",
  "cycle_create_receipts",
  "quotes",
  "quote_attachments",
  "temporary_product_sequence",
  "temporary_product_codes",
  "cycle_simulations",
  "commercial_offers",
  "offer_number_sequence",
  "legacy_source_archives",
  "feedback_tickets",
  "feedback_attachments",
  "feedback_settings",
  "feedback_exports",
  "product_groups",
  "bandelle_price_revisions",
  "bandelle_t_price_revisions",
] as const;

type BackupTable = (typeof TABLES)[number];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Shared read-only collector; callers own connection lifecycle, never authentication. */
export async function collectLogicalBackup(connection: Connection) {
  try {
    // A single transaction keeps rows from all tables in one snapshot.
    // SQL identifiers below come only from the hard-coded TABLES constant.
    await connection.query("START TRANSACTION");

    // Include *all* current DDCost tables, including feedback and export
    // receipts. On older production environments optional tables may not yet
    // exist; never fabricate them in a read-only backup.
    const [actualTables] = await connection.query<RowDataPacket[]>(
      "SELECT TABLE_NAME AS tableName FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()"
    );
    const known = new Set(actualTables.map(t => String(t.tableName)));
    const required = ["users", "cycles", "quotes", "cycle_simulations", "commercial_offers"];
    if (required.some(t => !known.has(t)))
      throw new Error("Backup source is missing a required economic table");
    const includedTables = TABLES.filter(t => known.has(t));
    if (known.has("feedback_tickets") &&
        ["feedback_attachments", "feedback_settings", "feedback_exports"].some(t => !known.has(t))) {
      throw new Error("Backup refused: feedback tables incomplete");
    }

    const records = {} as Record<BackupTable, RowDataPacket[]>;
    const tableDefinitions = {} as Record<BackupTable, string>;
    const rowCounts = {} as Record<BackupTable, number>;
    const tableChecksums = {} as Record<BackupTable, string>;

    for (const table of includedTables) {
      const [definitionRows] = await connection.query<RowDataPacket[]>(
        "SHOW CREATE TABLE " + table,
      );
      const ddl = definitionRows[0]?.["Create Table"];
      if (typeof ddl !== "string" || !ddl) {
        throw new Error("Missing table definition for " + table);
      }
      tableDefinitions[table] = ddl;

      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM " + table + " ORDER BY " + (table === "colleague_access" ? "oid" : "id"),
      );
      records[table] = rows;
      rowCounts[table] = rows.length;
      tableChecksums[table] = sha256(JSON.stringify(rows));
    }

    await connection.query("COMMIT");

    // This is a logical SQL-schema + JSON-data backup, not a TiDB physical snapshot.
    // Numeric SQL columns and timestamps remain exact strings; dataJson is not parsed.
    const payload = {
      format: "ddcost-tidb-logical-backup",
      formatVersion: 1,
      exportedAtUtc: new Date().toISOString(),
      database: "ddcost",
      tables: [...includedTables],
      rowCounts,
      tableChecksums,
      tableDefinitions,
      records,
    };

    return { ...payload, checksumSha256: sha256(JSON.stringify(payload)) };
  } catch (error) {
    try { await connection.query("ROLLBACK"); } catch { /* read-only */ }
    throw error;
  }
}

export async function downloadBackup(c: Context): Promise<Response> {
  let user: Awaited<ReturnType<typeof authenticateRequest>>;
  try {
    user = await authenticateRequest(c.req.raw.headers);
  } catch {
    return c.json({ error: "Authentication required" }, 401);
  }

  if (user.role !== "admin" || !env.allowedMicrosoftOids.includes(user.unionId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  let connection: Connection | undefined;

  try {
    connection = await mysql.createConnection({
      uri: env.databaseUrl,
      ssl: { rejectUnauthorized: true },
      connectTimeout: 10000,
      supportBigNumbers: true,
      bigNumberStrings: true,
      decimalNumbers: false,
      dateStrings: true,
    });

    const backup = await collectLogicalBackup(connection);
    const json = JSON.stringify(backup, null, 2) + "\n";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = "DDCost_backup_" + stamp + ".json";

    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="' + filename + '"',
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: unknown) {
    const errorCode = (err as { code?: string })?.code ?? "UNKNOWN";
    console.error("[DDCost] Backup export failed, code:", errorCode);
    return c.json({ error: "Backup export failed. No data was modified." }, 500);
  } finally {
    if (connection) {
      try { await connection.end(); } catch { /* connection cleanup */ }
    }
  }
}
