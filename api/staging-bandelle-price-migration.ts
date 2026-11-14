import mysql, { type RowDataPacket } from "mysql2/promise";
import { initialBandellePrices, validateBandellePrices } from "../src/lib/bandelle-pricebook";

/** Additive, idempotent migration; only the verified Collaudo database is allowed. */
export async function migrateStagingBandellePrices() {
  const url = process.env.DATABASE_URL ?? "";
  const expected = process.env.DDCOST_EXPECTED_TIDB_BRANCH_USERNAME ?? "";
  const callback = process.env.MICROSOFT_REDIRECT_URI ?? "";
  if (process.env.DDCOST_STAGING_MIGRATE_BANDELLE_PRICES !== "1" || process.env.VITE_APP_ID !== "ddcost-collaudo"
    || expected !== "9ovJ2FwEUzJE8ck.root" || !url || !callback
    || new URL(callback).origin !== "https://ddcost-collaudo.onrender.com") throw new Error("[Bandelle prices] Refused non-staging migration");
  const target = new URL(url);
  if (target.protocol !== "mysql:" || target.hostname !== "gateway01.us-west-2.prod.aws.tidbcloud.com"
    || decodeURIComponent(target.username) !== expected || target.pathname !== "/ddcost") throw new Error("[Bandelle prices] Refused incorrect database branch");
  const db = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: true }, connectTimeout: 8000 });
  const digestSql = "SELECT (SELECT COUNT(*) FROM cycles) AS cycles, (SELECT COUNT(*) FROM quotes) AS quotes," +
    "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM cycles) AS cyclesDigest," +
    "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM quotes) AS quotesDigest," +
    "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM commercial_offers) AS offersDigest";
  let inTx = false;
  try {
    const [before] = await db.query<RowDataPacket[]>(digestSql);
    if (Number(before[0]?.cycles) < 177 || Number(before[0]?.quotes) < 63) throw new Error("[Bandelle prices] Missing historical baseline");
    await db.query("CREATE TABLE IF NOT EXISTS bandelle_price_revisions (id BIGINT UNSIGNED NOT NULL PRIMARY KEY," +
      "dataJson MEDIUMTEXT NOT NULL,createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,createdBy BIGINT UNSIGNED NULL," +
      "createdByName VARCHAR(320) NOT NULL,description TEXT NOT NULL,operationsJson MEDIUMTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    const seed = JSON.stringify(initialBandellePrices());
    await db.execute("INSERT IGNORE INTO bandelle_price_revisions (id,dataJson,createdByName,description,operationsJson) VALUES (1,?,'Listino iniziale','Tabelle Giotto Plus del 24/10/2026','[]')", [seed]);
    const [latest] = await db.query<RowDataPacket[]>("SELECT id,dataJson FROM bandelle_price_revisions ORDER BY id DESC LIMIT 1");
    validateBandellePrices(JSON.parse(latest[0].dataJson));
    // Prove round-trip, revision uniqueness and rollback on the actual DB.
    await db.beginTransaction(); inTx = true;
    const next = Number(latest[0].id) + 1;
    const insert = "INSERT INTO bandelle_price_revisions (id,dataJson,createdByName,description,operationsJson) VALUES (?,?,'Test temporaneo','Rollback verifica','[]')";
    await db.execute(insert, [next, seed]);
    const [test] = await db.query<RowDataPacket[]>("SELECT dataJson FROM bandelle_price_revisions WHERE id=?", [next]);
    if (test[0]?.dataJson !== seed) throw new Error("[Bandelle prices] Round-trip failed");
    let collision = false;
    try { await db.execute(insert, [next, seed]); } catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
      collision = true;
    }
    if (!collision) throw new Error("[Bandelle prices] Revision uniqueness failed");
    await db.rollback(); inTx = false;
    const [final] = await db.query<RowDataPacket[]>("SELECT id FROM bandelle_price_revisions ORDER BY id DESC LIMIT 1");
    if (Number(final[0].id) !== Number(latest[0].id)) throw new Error("[Bandelle prices] Rollback failed");
    const [after] = await db.query<RowDataPacket[]>(digestSql);
    if (JSON.stringify(before[0]) !== JSON.stringify(after[0])) throw new Error("[Bandelle prices] Historical data changed");
    console.log(`[Bandelle prices] OK: ${Object.keys(initialBandellePrices()).length} prices; revision ${latest[0].id}; round-trip, unique revision and rollback verified; economic histories unchanged`);
  } finally { if (inTx) await db.rollback(); await db.end(); }
}
