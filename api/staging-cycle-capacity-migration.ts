/**
 * STAGING-ONLY one-shot migration: enlarge cycles.dataJson to MEDIUMTEXT.
 * The old TEXT maximum (~64 KiB) can reject detailed high-row-count cycles.
 * Verifies existing economic records before/after and tests a >64-KiB
 * 100-row round-trip inside a rolled-back transaction.
 */
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

export async function migrateStagingCycleCapacity(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const expected = process.env.DDCOST_EXPECTED_TIDB_BRANCH_USERNAME ?? "";
  const callback = process.env.MICROSOFT_REDIRECT_URI ?? "";
  if (
    process.env.DDCOST_STAGING_MIGRATE_CYCLE_CAPACITY !== "1" ||
    process.env.VITE_APP_ID !== "ddcost-collaudo" ||
    expected !== "9ovJ2FwEUzJE8ck.root" ||
    !url || !callback ||
    new URL(callback).origin !== "https://ddcost-collaudo.onrender.com"
  ) throw new Error("[Cycle capacity] Refused: not verified staging");
  const u = new URL(url);
  if (u.protocol !== "mysql:" ||
      u.hostname !== "gateway01.us-west-2.prod.aws.tidbcloud.com" ||
      decodeURIComponent(u.username) !== expected ||
      decodeURIComponent(u.pathname) !== "/ddcost"
  ) throw new Error("[Cycle capacity] Refused: unexpected DB branch");

  const db = await mysql.createConnection({
    uri: url, ssl: { rejectUnauthorized: true }, connectTimeout: 8000,
    supportBigNumbers: true, bigNumberStrings: true,
  });
  const digestSql = "SELECT " +
    "(SELECT COUNT(*) FROM cycles) AS cycles," +
    "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM cycles) AS cycleDigest," +
    "(SELECT COALESCE(MAX(OCTET_LENGTH(dataJson)),0) FROM cycles) AS maxCycleBytes," +
    "(SELECT COUNT(*) FROM quotes) AS quotes," +
    "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM quotes) AS quotesDigest," +
    "(SELECT COUNT(*) FROM commercial_offers) AS offers," +
    "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM commercial_offers) AS offersDigest";
  let inTx = false;
  try {
    const [before] = await db.query<RowDataPacket[]>(digestSql);
    if (!before[0] || Number(before[0].cycles) < 177 ||
        Number(before[0].quotes) < 63) {
      throw new Error("[Cycle capacity] Refused: historical baseline missing");
    }
    const [column] = await db.query<RowDataPacket[]>(
      "SELECT DATA_TYPE,IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cycles' AND COLUMN_NAME='dataJson'"
    );
    if (column.length !== 1 || column[0].IS_NULLABLE !== "YES")
      throw new Error("[Cycle capacity] Refused: unexpected schema");
    const current = String(column[0].DATA_TYPE).toLowerCase();
    if (current === "text") {
      await db.query("ALTER TABLE cycles MODIFY COLUMN dataJson MEDIUMTEXT NULL");
    } else if (!["mediumtext", "longtext"].includes(current)) {
      throw new Error("[Cycle capacity] Refused: incompatible column type");
    }
    const [verifiedColumn] = await db.query<RowDataPacket[]>(
      "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cycles' AND COLUMN_NAME='dataJson'"
    );
    if (!["mediumtext", "longtext"].includes(String(verifiedColumn[0]?.DATA_TYPE).toLowerCase()))
      throw new Error("[Cycle capacity] Column did not expand");
    const [after] = await db.query<RowDataPacket[]>(digestSql);
    if (JSON.stringify(before[0]) !== JSON.stringify(after[0]))
      throw new Error("[Cycle capacity] STOP: historical content changed");
    // A real database write+read, rolled back before the application starts.
    const [users] = await db.query<RowDataPacket[]>("SELECT id FROM users ORDER BY id LIMIT 1");
    if (users.length !== 1) throw new Error("[Cycle capacity] No test user");
    const righe = Array.from({length: 100},(_,i)=>({
      categoria:"COMPONENTE", codice_articolo:"CAP-"+String(i+1).padStart(3,"0"),
      descrizione:"Capacità righe "+(i+1), nr_componenti:1, costo_unitario:i+1,
      note:"Riga di test per capacità dati. ".repeat(24),
    }));
    const payload=JSON.stringify({tipo:"ciclo_standard",righe,
      descrizione:"TEST TRANSIENTE 100 RIGHE; NON PERSISTERE"});
    if (Buffer.byteLength(payload, "utf8") <= 65535) throw new Error("[Cycle capacity] Test payload unexpectedly small");
    await db.beginTransaction();
    inTx = true;
    const [result] = await db.query<ResultSetHeader>(
      "INSERT INTO cycles (userId, code, description, lot, dataJson, rev) " +
      "VALUES (?, ?, ?, ?, ?, 1)",
      [users[0].id, "__STAGING_CAPACITY_ROLLBACK__", "Test transitorio", "100", payload]
    );
    const [test] = await db.query<RowDataPacket[]>(
      "SELECT dataJson FROM cycles WHERE id = ?", [String(result.insertId)]
    );
    if (test.length !== 1 || test[0].dataJson !== payload ||
        JSON.parse(String(test[0].dataJson)).righe.length !== 100 ||
        JSON.parse(String(test[0].dataJson)).righe[99].codice_articolo !== "CAP-100") {
      throw new Error("[Cycle capacity] 100-row database round trip failed");
    }
    await db.rollback();
    inTx = false;
    const [persisted] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM cycles WHERE id=?", [String(result.insertId)]
    );
    if (Number(persisted[0]?.n) !== 0) throw new Error("[Cycle capacity] Test transaction unexpectedly persisted");
    const [final] = await db.query<RowDataPacket[]>(digestSql);
    if (JSON.stringify(before[0]) !== JSON.stringify(final[0]))
      throw new Error("[Cycle capacity] Final history integrity mismatch");
    console.log("[Cycle capacity] OK: MEDIUMTEXT, 100-row >64KiB database round-trip verified, rolled back; economic histories unchanged");
  } finally {
    if (inTx) await db.rollback();
    await db.end();
  }
}
