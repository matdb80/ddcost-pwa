import mysql, { type RowDataPacket } from "mysql2/promise";
import { initialBandelleTPrices, validateBandelleTPrices } from "../src/lib/bandelle-t-pricebook";

/** Additive, idempotent migration; only the verified Collaudo database is allowed. */
export async function migrateStagingBandelleTPrices() {
  const url = process.env.DATABASE_URL ?? "";
  const expected = process.env.DDCOST_EXPECTED_TIDB_BRANCH_USERNAME ?? "";
  const callback = process.env.MICROSOFT_REDIRECT_URI ?? "";
  if (process.env.DDCOST_STAGING_MIGRATE_BANDELLE_T_PRICES !== "1" || process.env.VITE_APP_ID !== "ddcost-collaudo"
    || expected !== "9ovJ2FwEUzJE8ck.root" || !url || !callback
    || new URL(callback).origin !== "https://ddcost-collaudo.onrender.com") throw new Error("[Bandelle T prices] Refused non-staging migration");
  const target = new URL(url);
  if (target.protocol !== "mysql:" || target.hostname !== "gateway01.us-west-2.prod.aws.tidbcloud.com"
    || decodeURIComponent(target.username) !== expected || target.pathname !== "/ddcost") throw new Error("[Bandelle T prices] Refused incorrect database branch");
  const db = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: true }, connectTimeout: 8000 });
  const digestSql = "SELECT (SELECT COUNT(*) FROM cycles) AS cycles, (SELECT COUNT(*) FROM quotes) AS quotes," +
    "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM cycles) AS cyclesDigest," +
    "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM quotes) AS quotesDigest," +
    "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM commercial_offers) AS offersDigest," +
    "(SELECT COALESCE(SUM(CRC32(dataJson)),0) FROM bandelle_price_revisions) AS giottoDigest";
  let inTx = false;
  try {
    const [before] = await db.query<RowDataPacket[]>(digestSql);
    if (Number(before[0]?.cycles) < 177 || Number(before[0]?.quotes) < 63) throw new Error("[Bandelle T prices] Missing historical baseline");
    await db.query("CREATE TABLE IF NOT EXISTS bandelle_t_price_revisions (id BIGINT UNSIGNED NOT NULL PRIMARY KEY," +
      "dataJson MEDIUMTEXT NOT NULL,createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,createdBy BIGINT UNSIGNED NULL," +
      "createdByName VARCHAR(320) NOT NULL,description TEXT NOT NULL,operationsJson MEDIUMTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    const seed = JSON.stringify(initialBandelleTPrices());
    await db.execute("INSERT IGNORE INTO bandelle_t_price_revisions (id,dataJson,createdByName,description,operationsJson) VALUES (1,?,'Listino iniziale','Listino Smeralda; aumento 4,5% del 01/03/2026 già incluso','[]')", [seed]);
    const [latest] = await db.query<RowDataPacket[]>("SELECT id,dataJson FROM bandelle_t_price_revisions ORDER BY id DESC LIMIT 1");
    validateBandelleTPrices(JSON.parse(latest[0].dataJson));
    // Prove round-trip, revision uniqueness and rollback on the actual DB.
    await db.beginTransaction(); inTx = true;
    const next = Number(latest[0].id) + 1;
    const insert = "INSERT INTO bandelle_t_price_revisions (id,dataJson,createdByName,description,operationsJson) VALUES (?,?,'Test temporaneo','Rollback verifica','[]')";
    await db.execute(insert, [next, seed]);
    const [test] = await db.query<RowDataPacket[]>("SELECT dataJson FROM bandelle_t_price_revisions WHERE id=?", [next]);
    if (test[0]?.dataJson !== seed) throw new Error("[Bandelle T prices] Round-trip failed");
    let collision = false;
    try { await db.execute(insert, [next, seed]); } catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
      collision = true;
    }
    if (!collision) throw new Error("[Bandelle T prices] Revision uniqueness failed");
    await db.rollback(); inTx = false;
    const [final] = await db.query<RowDataPacket[]>("SELECT id FROM bandelle_t_price_revisions ORDER BY id DESC LIMIT 1");
    if (Number(final[0].id) !== Number(latest[0].id)) throw new Error("[Bandelle T prices] Rollback failed");
    const [after] = await db.query<RowDataPacket[]>(digestSql);
    if (JSON.stringify(before[0]) !== JSON.stringify(after[0])) throw new Error("[Bandelle T prices] Historical data changed");
    console.log(`[Bandelle T prices] OK: ${Object.keys(initialBandelleTPrices()).length} prices; revision ${latest[0].id}; round-trip, unique revision and rollback verified; economic histories unchanged`);
  } finally { if (inTx) await db.rollback(); await db.end(); }
}
