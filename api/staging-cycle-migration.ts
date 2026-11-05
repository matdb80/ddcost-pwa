/**
 * Guarded, one-shot staging-only migration for the dedicated TiDB branch.
 * Only adds soft-delete columns. Never modifies historical rows or JSON.
 */
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

interface ColumnRow extends RowDataPacket {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  NUMERIC_PRECISION: number | null;
  NUMERIC_SCALE: number | null;
}
interface DigestRow extends RowDataPacket {
  cnt: number | string;
  digest: number | string;
}
const TABLES = [
  "users", "cycles", "quotes", "cycle_simulations",
  "commercial_offers", "legacy_source_archives",
] as const;

export async function migrateStagingCycles(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const branchUser = process.env.DDCOST_EXPECTED_TIDB_BRANCH_USERNAME ?? "";
  const redirect = process.env.MICROSOFT_REDIRECT_URI ?? "";

  if (!url || !branchUser || !redirect ||
      new URL(redirect).origin !== "https://ddcost-collaudo.onrender.com" ||
      process.env.VITE_APP_ID !== "ddcost-collaudo") {
    throw new Error("[DDCost migration] Refused: staging identity mismatch");
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "mysql:" ||
      parsed.hostname !== "gateway01.us-west-2.prod.aws.tidbcloud.com" ||
      decodeURIComponent(parsed.username) !== branchUser ||
      !branchUser.endsWith(".root") ||
      decodeURIComponent(parsed.pathname) !== "/ddcost") {
    throw new Error("[DDCost migration] Refused: TiDB branch mismatch");
  }

  const connection = await mysql.createConnection({
    uri: url,
    ssl: { rejectUnauthorized: true },
    connectTimeout: 8000,
  });
  try {
    const [selected] = await connection.query<RowDataPacket[]>(
      "SELECT DATABASE() AS db"
    );
    if (selected[0]?.db !== "ddcost") {
      throw new Error("[DDCost migration] Refused: wrong database");
    }

    const counts = new Map<string, string>();
    for (const table of TABLES) {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM " + mysql.escapeId(table)
      );
      counts.set(table, String(rows[0]?.cnt));
    }
    if (Number(counts.get("cycles")) < 175 ||
        counts.get("legacy_source_archives") !== "1") {
      throw new Error("[DDCost migration] Refused: unexpected historical archive");
    }

    const digestSql = "SELECT COUNT(*) AS cnt, " +
      "COALESCE(SUM(CRC32(COALESCE(dataJson, ''))), 0) AS digest FROM cycles";
    const [before] = await connection.query<DigestRow[]>(digestSql);

    const [columns] = await connection.query<ColumnRow[]>(
      "SELECT COLUMN_NAME, DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE " +
      "FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = 'cycles'"
    );
    const col = new Map(columns.map(c => [c.COLUMN_NAME, c]));
    for (const name of ["standardCost", "minimumPrice"]) {
      if (Number(col.get(name)?.NUMERIC_PRECISION) !== 30 ||
          Number(col.get(name)?.NUMERIC_SCALE) !== 18) {
        throw new Error("[DDCost migration] Refused: monetary precision mismatch");
      }
    }

    if (col.has("deleted") !== col.has("deletedAt")) {
      throw new Error("[DDCost migration] Refused: partial existing schema");
    }
    if (!col.has("deleted")) {
      console.log("[DDCost migration] Adding two soft-delete columns on staging.");
      await connection.query(
        "ALTER TABLE cycles " +
        "ADD COLUMN IF NOT EXISTS deleted TINYINT UNSIGNED NOT NULL DEFAULT 0, " +
        "ADD COLUMN IF NOT EXISTS deletedAt TIMESTAMP NULL DEFAULT NULL"
      );
    }

    const [afterCols] = await connection.query<ColumnRow[]>(
      "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cycles' " +
      "AND COLUMN_NAME IN ('deleted', 'deletedAt')"
    );
    const present = new Map(afterCols.map(c => [c.COLUMN_NAME, c.DATA_TYPE]));
    if (present.get("deleted") !== "tinyint" ||
        present.get("deletedAt") !== "timestamp") {
      throw new Error("[DDCost migration] Wrong resulting column types");
    }
    const [after] = await connection.query<DigestRow[]>(digestSql);
    if (String(before[0]?.cnt) !== String(after[0]?.cnt) ||
        String(before[0]?.digest) !== String(after[0]?.digest)) {
      throw new Error("[DDCost migration] Historical JSON integrity mismatch");
    }
    for (const table of TABLES) {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM " + mysql.escapeId(table)
      );
      if (String(rows[0]?.cnt) !== counts.get(table)) {
        throw new Error("[DDCost migration] Historical record count changed");
      }
    }
    console.log("[DDCost migration] SUCCESS: counts and historical JSON unchanged.");
    console.log("[DDCost migration] Cycles verified:", counts.get("cycles"));
  } finally {
    await connection.end();
  }
}
