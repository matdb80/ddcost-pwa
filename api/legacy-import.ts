/**
 * DDCost legacy data migration (administrator only).
 * Secure browser upload: archived business data MUST NOT be committed to GitHub.
 * Only the audit-verified 248-record payload is accepted (SHA-256 allowlist).
 * Preview does not write. Commit refuses nonempty target tables and uses
 * one SQL transaction for every historical row and the complete SQLite archive.
 */
import { createHash } from "node:crypto";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import type { Context } from "hono";
import { authenticateRequest } from "./ms-auth";
import { env } from "./lib/env";

const EXPECTED_PAYLOAD_SHA256 =
  "09c02796b70aa712ca6db3ff0ee04e3d558f27a050d066cc88630a519f1e81d8";
const EXPECTED_ARCHIVE_SHA256 =
  "c4d64e24922b34f642b760a129f2455572138b751487f87705cf32fec368b917";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const TABLE_COUNTS = {
  cycles: 175,
  quotes: 63,
  cycle_simulations: 4,
  commercial_offers: 6,
} as const;
type LegacyTable = keyof typeof TABLE_COUNTS;
type LegacyRow = Record<string, unknown>;
type Payload = {
  format: string;
  formatVersion: number;
  rows: Record<LegacyTable, LegacyRow[]>;
  sourceSha256: Record<string, string>;
  originalArchiveSha256: string;
  originalArchiveBase64: string;
  configurationFiles: Record<string, string>;
  expectedCounts: Record<LegacyTable, number>;
};

const SOURCE_HASHES: Record<string, string> = {
  "costi_standard.sqlite": "74dd5884c7a9636c97e07e27162763884a7b2ce8aea6b6402a8d891aec685e94",
  "preventivi_unatantum.sqlite": "317da9bb7f0290f5c80ded98ff4c6a4862b2aa65504698f410693aa52e71b5dc",
  "simulazioni_cicli.sqlite": "8892e53d4330f19ff16d5bdb3311b4378c9bc74e90ec4f7e9df735da8292d310",
  "offerte_commerciali.sqlite": "4b10a41e200898ec2ba2df5a0d4ee3a8fcc770ff9e9a82fc843e0bca19014c14",
  "sconti_standard.json": "e7d2d85f6212280834984cc459315dd5a6e8f8969f7711529bd9710c24261255",
  "unatantum_parametri.json": "ae027f16a071e08fbee418efdb63cb0663916d4d1bcc805376af9db3e24da13f",
};

const EXPECTED_COLUMNS = {
  cycles: [
    "id", "rootId", "rev", "createdAt", "updatedAt", "userId", "code",
    "description", "client", "lot", "standardCost", "minimumPrice", "dataJson",
  ],
  quotes: [
    "id", "rootId", "rev", "createdAt", "updatedAt", "userId", "client",
    "reference", "targetTotal", "totalBeforeRebalance", "totalFinal",
    "numProducts", "generalNotes", "clientNotes", "supplierNotes", "summary",
    "dataJson",
  ],
  cycle_simulations: [
    "id", "createdAt", "userId", "name", "code", "description", "client",
    "sourceRootId", "sourceRev", "standardCost", "minimumPrice", "dataJson",
  ],
  commercial_offers: [
    "id", "createdAt", "updatedAt", "userId", "name", "client",
    "reference", "notes", "numRows", "dataJson",
  ],
} satisfies Record<LegacyTable, string[]>;

const DECIMAL_COLUMNS: Record<string, string[]> = {
  cycles: ["standardCost", "minimumPrice"],
  quotes: ["targetTotal", "totalBeforeRebalance", "totalFinal"],
  cycle_simulations: ["standardCost", "minimumPrice"],
};

function hash(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
function get(row: LegacyRow, key: string): string | number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  throw new Error("Unexpected source type for " + key);
}
function textOrNull(row: LegacyRow, key: string): string | null {
  const value = get(row, key);
  return value === null ? null : String(value);
}
function timestamp(row: LegacyRow, key: string, fallback?: string): string {
  const val = get(row, key) ?? fallback;
  if (typeof val !== "string" || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(val)) {
    throw new Error("Invalid source timestamp " + key);
  }
  return val;
}
function id(row: LegacyRow, key: string): number | null {
  const val = get(row, key);
  if (val === null) return null;
  const num = Number(val);
  if (!Number.isSafeInteger(num) || num < 0) throw new Error("Invalid source ID");
  return num;
}
function rawData(row: LegacyRow): string {
  const data = get(row, "data_json");
  if (typeof data !== "string") throw new Error("Missing legacy JSON");
  JSON.parse(data);
  return data; // never parse and reserialize: preserve the original byte sequence
}

function convert(table: LegacyTable, row: LegacyRow, userId: number): unknown[] {
  const t = timestamp(row, "created_at");
  switch (table) {
    case "cycles":
      return [
        id(row, "id"), id(row, "root_id"), id(row, "rev"), t, t, userId,
        textOrNull(row, "codice"), textOrNull(row, "descrizione"),
        textOrNull(row, "cliente"), textOrNull(row, "lotto"),
        textOrNull(row, "costo_standard"), textOrNull(row, "prezzo_minimo"),
        rawData(row),
      ];
    case "quotes":
      return [
        id(row, "id"), id(row, "root_id"), id(row, "rev"), t, t, userId,
        textOrNull(row, "cliente"), textOrNull(row, "riferimento_preventivo"),
        textOrNull(row, "target_totale"), textOrNull(row, "totale_pre_quadratura"),
        textOrNull(row, "totale_finale"), id(row, "num_prodotti"),
        textOrNull(row, "note_generali"), textOrNull(row, "note_cliente"),
        textOrNull(row, "note_fornitori"), textOrNull(row, "summary"),
        rawData(row),
      ];
    case "cycle_simulations":
      return [
        id(row, "id"), t, userId, textOrNull(row, "nome"),
        textOrNull(row, "codice"), textOrNull(row, "descrizione"),
        textOrNull(row, "cliente"), id(row, "source_root_id"),
        id(row, "source_rev"), textOrNull(row, "costo_standard"),
        textOrNull(row, "prezzo_minimo"), rawData(row),
      ];
    case "commercial_offers":
      return [
        id(row, "id"), t, timestamp(row, "updated_at", t), userId,
        textOrNull(row, "nome"), textOrNull(row, "cliente"),
        textOrNull(row, "riferimento"), textOrNull(row, "note"),
        id(row, "num_righe"), rawData(row),
      ];
  }
}

function validatePayload(data: Payload): void {
  if (data.format !== "ddcost-sqlite-legacy-migration" || data.formatVersion !== 1) {
    throw new Error("Unexpected migration file format");
  }
  const zip = Buffer.from(data.originalArchiveBase64, "base64");
  if (hash(zip) !== EXPECTED_ARCHIVE_SHA256 ||
      data.originalArchiveSha256 !== EXPECTED_ARCHIVE_SHA256) {
    throw new Error("Original SQLite archive SHA-256 mismatch");
  }
  for (const [filename, digest] of Object.entries(SOURCE_HASHES)) {
    if (data.sourceSha256?.[filename] !== digest) {
      throw new Error("Legacy source checksum mismatch: " + filename);
    }
  }
  for (const [table, expected] of Object.entries(TABLE_COUNTS)) {
    const key = table as LegacyTable;
    const rows = data.rows?.[key];
    if (!Array.isArray(rows) || rows.length !== expected ||
        data.expectedCounts?.[key] !== expected) {
      throw new Error("Incorrect number of source rows: " + table);
    }
    const ids = new Set<number>();
    for (const row of rows) {
      const sourceId = id(row, "id");
      if (sourceId === null || ids.has(sourceId)) throw new Error("Duplicate source ID");
      ids.add(sourceId);
      rawData(row);
    }
  }
  for (const config of ["sconti_standard.json", "unatantum_parametri.json"]) {
    JSON.parse(data.configurationFiles[config]);
  }
}

async function getCounts(db: Connection): Promise<Record<LegacyTable, number>> {
  const result = {} as Record<LegacyTable, number>;
  for (const table of Object.keys(TABLE_COUNTS) as LegacyTable[]) {
    const [rows] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM \`" + table + "\`");
    result[table] = Number(rows[0].n);
  }
  return result;
}

async function getArchiveCount(db: Connection): Promise<number> {
  const [exists] = await db.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM information_schema.tables " +
    "WHERE table_schema = DATABASE() AND table_name = 'legacy_source_archives'",
  );
  if (Number(exists[0].n) === 0) return 0;
  const [rows] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM legacy_source_archives");
  return Number(rows[0].n);
}

async function ensurePrecision(db: Connection): Promise<void> {
  for (const [table, columns] of Object.entries(DECIMAL_COLUMNS)) {
    for (const col of columns) {
      const [rows] = await db.execute<RowDataPacket[]>(
        "SELECT NUMERIC_PRECISION AS p, NUMERIC_SCALE AS s FROM information_schema.columns " +
        "WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
        [table, col],
      );
      if (rows.length !== 1) throw new Error("Database column missing: " + table + "." + col);
      if (Number(rows[0].p) < 30 || Number(rows[0].s) < 18) {
        // The tables must be empty: enforced by preflight before any DDL.
        // DDL commits implicitly. Data insertion happens later in one transaction.
        await db.query(
          "ALTER TABLE \`" + table + "\` MODIFY COLUMN \`" + col + "\` DECIMAL(30,18) NULL",
        );
      }
    }
  }
}

async function insertBatches(
  db: Connection, table: LegacyTable, rows: LegacyRow[], userId: number,
): Promise<void> {
  const columns = EXPECTED_COLUMNS[table];
  const width = columns.length;
  for (let offset = 0; offset < rows.length; offset += 20) {
    const chunk = rows.slice(offset, offset + 20);
    const placeholders = chunk.map(
      () => "(" + Array.from({ length: width }, () => "?").join(",") + ")",
    ).join(",");
    const sql = "INSERT INTO \`" + table + "\` (" +
      columns.map((col) => "\`" + col + "\`").join(",") +
      ") VALUES " + placeholders;
    const values = chunk.flatMap((row) => convert(table, row, userId));
    await db.query(sql, values);
  }
}

async function verifyInserted(db: Connection, data: Payload): Promise<void> {
  const counts = await getCounts(db);
  for (const table of Object.keys(TABLE_COUNTS) as LegacyTable[]) {
    if (counts[table] !== TABLE_COUNTS[table]) {
      throw new Error("Imported row count mismatch: " + table);
    }
    const [records] = await db.query<RowDataPacket[]>(
      "SELECT id, dataJson FROM \`" + table + "\` ORDER BY id",
    );
    const expectedRows = data.rows[table];
    for (let i = 0; i < records.length; i++) {
      const expected = expectedRows[i];
      if (String(records[i].id) !== String(expected.id) ||
          records[i].dataJson !== expected.data_json) {
        throw new Error("Historical ID or JSON mismatch: " + table);
      }
    }
  }
  const [archive] = await db.query<RowDataPacket[]>(
    "SELECT archiveBase64, sha256 FROM legacy_source_archives WHERE id = 1",
  );
  if (archive.length !== 1 || archive[0].sha256 !== EXPECTED_ARCHIVE_SHA256 ||
      hash(Buffer.from(archive[0].archiveBase64, "base64")) !== EXPECTED_ARCHIVE_SHA256) {
    throw new Error("SQLite archive verification failed");
  }
}

async function migration(c: Context, commit: boolean): Promise<Response> {
  let user: Awaited<ReturnType<typeof authenticateRequest>>;
  try {
    user = await authenticateRequest(c.req.raw.headers);
  } catch {
    return c.json({ error: "Sign in with Microsoft 365 first" }, 401);
  }
  if (user.role !== "admin" || !env.allowedMicrosoftOids.includes(user.unionId)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const upload = Buffer.from(await c.req.raw.arrayBuffer());
  if (upload.byteLength < 10 || upload.byteLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: "Migration file missing or too large" }, 400);
  }
  if (hash(upload) !== EXPECTED_PAYLOAD_SHA256) {
    return c.json({ error: "Wrong migration file or SHA-256 verification failed" }, 400);
  }

  let data: Payload;
  try {
    data = JSON.parse(upload.toString("utf8")) as Payload;
    validatePayload(data);
  } catch {
    return c.json({ error: "Invalid source archive or historical data" }, 400);
  }

  let db: Connection | undefined;
  let inTransaction = false;
  try {
    db = await mysql.createConnection({
      uri: env.databaseUrl,
      connectTimeout: 10000,
      supportBigNumbers: true,
      bigNumberStrings: true,
      dateStrings: true,
      decimalNumbers: false,
    });
    await db.query("SET time_zone = '+00:00'");

    const counts = await getCounts(db);
    const archived = await getArchiveCount(db);
    const [identities] = await db.execute<RowDataPacket[]>(
      "SELECT id, unionId, role FROM users WHERE id = ?",
      [user.id],
    );
    if (identities.length !== 1 || identities[0].unionId !== user.unionId ||
        identities[0].role !== "admin") {
      throw new Error("Logged-in admin not found in TiDB");
    }
    if (archived !== 0 || Object.values(counts).some((n) => n !== 0)) {
      return c.json({
        error: "Import blocked: business tables or legacy archive are not empty",
        currentCounts: counts,
        legacyArchiveRows: archived,
      }, 409);
    }

    if (!commit) {
      return c.json({
        ok: true,
        dryRun: true,
        expectedCounts: TABLE_COUNTS,
        currentCounts: counts,
        sourceFilesVerified: Object.keys(SOURCE_HASHES).length,
        originalSQLiteArchiveVerified: true,
        willIncreaseDecimalPrecisionTo: "DECIMAL(30,18)",
        willPreserveHistoricalIdsAndRawJson: true,
        willCreateSourceArchiveTable: true,
      });
    }

    // DDL runs only after a successful dry-run and recheck of empty tables.
    await ensurePrecision(db);
    await db.query(
      "CREATE TABLE IF NOT EXISTS legacy_source_archives (" +
      "id BIGINT UNSIGNED NOT NULL PRIMARY KEY," +
      "name VARCHAR(255) NOT NULL," +
      "sha256 CHAR(64) NOT NULL," +
      "archiveBase64 LONGTEXT NOT NULL," +
      "createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
      ")",
    );

    // Recheck after DDL and before transactional inserts.
    const before = await getCounts(db);
    if (Object.values(before).some((n) => n !== 0) ||
        await getArchiveCount(db) !== 0) {
      throw new Error("Concurrent data change, refusing import");
    }

    await db.query("START TRANSACTION");
    inTransaction = true;
    for (const table of Object.keys(TABLE_COUNTS) as LegacyTable[]) {
      await insertBatches(db, table, data.rows[table], Number(user.id));
    }
    await db.execute(
      "INSERT INTO legacy_source_archives (id, name, sha256, archiveBase64) " +
      "VALUES (1, ?, ?, ?)",
      ["DDCost_Archivi_Originali_e_Audit.zip",
       EXPECTED_ARCHIVE_SHA256, data.originalArchiveBase64],
    );
    await verifyInserted(db, data);
    await db.query("COMMIT");
    inTransaction = false;

    return c.json({
      ok: true,
      imported: true,
      counts: TABLE_COUNTS,
      originalSQLiteArchiveSha256: EXPECTED_ARCHIVE_SHA256,
      allOriginalJsonVerified: true,
      message: "248 historical records imported and verified.",
    });
  } catch (error: unknown) {
    if (db && inTransaction) {
      try { await db.query("ROLLBACK"); } catch { /* rollback attempted */ }
    }
    const code = (error as { code?: string })?.code ?? "MIGRATION_ERROR";
    console.error("[DDCost] Legacy import failed:", code);
    return c.json({ error: "Import halted; no historical records committed", code }, 500);
  } finally {
    if (db) {
      try { await db.end(); } catch { /* cleanup */ }
    }
  }
}

export function previewLegacyImport(c: Context): Promise<Response> {
  return migration(c, false);
}
export function commitLegacyImport(c: Context): Promise<Response> {
  return migration(c, true);
}
