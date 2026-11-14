/** Additive, idempotent product-group catalog migration for STAGING only. */
import mysql, { type RowDataPacket } from "mysql2/promise";

export async function migrateStagingProductGroups(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const username = process.env.DDCOST_EXPECTED_TIDB_BRANCH_USERNAME ?? "";
  const redirect = process.env.MICROSOFT_REDIRECT_URI ?? "";
  if (process.env.DDCOST_STAGING_MIGRATE_PRODUCT_GROUPS !== "1" ||
      process.env.VITE_APP_ID !== "ddcost-collaudo" ||
      username !== "9ovJ2FwEUzJE8ck.root" || !url ||
      !redirect || new URL(redirect).origin !== "https://ddcost-collaudo.onrender.com") {
    throw new Error("[Product groups] Refused non-staging migration");
  }
  const target = new URL(url);
  if (target.protocol !== "mysql:" ||
      target.hostname !== "gateway01.us-west-2.prod.aws.tidbcloud.com" ||
      decodeURIComponent(target.username) !== username ||
      decodeURIComponent(target.pathname) !== "/ddcost") {
    throw new Error("[Product groups] Refused incorrect database branch");
  }
  const db = await mysql.createConnection({
    uri:url, ssl:{rejectUnauthorized:true}, connectTimeout:8000,
    supportBigNumbers:true, bigNumberStrings:true,
  });
  try {
    const [tables] = await db.query<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('cycles','quotes','commercial_offers','feedback_tickets')"
    );
    if (tables.length !== 4) throw new Error("[Product groups] Missing historical staging tables");
    const digestSql = "SELECT " +
      "(SELECT COUNT(*) FROM cycles) AS cycles," +
      "(SELECT COUNT(*) FROM quotes) AS quotes," +
      "(SELECT COUNT(*) FROM commercial_offers) AS offers," +
      "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM cycles) AS cyclesDigest," +
      "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM quotes) AS quotesDigest," +
      "(SELECT COUNT(*) FROM feedback_tickets) AS tickets";
    const [before] = await db.query<RowDataPacket[]>(digestSql);
    if (Number(before[0]?.cycles) < 177 || Number(before[0]?.quotes) < 63)
      throw new Error("[Product groups] Historical staging baseline mismatch");
    await db.query(
      "CREATE TABLE IF NOT EXISTS product_groups (" +
      "id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY," +
      "name varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL," +
      "createdBy bigint unsigned NOT NULL," +
      "createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "UNIQUE KEY name (name)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    const [fields] = await db.query<RowDataPacket[]>(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='product_groups'"
    );
    if (!["id","name","createdBy","createdAt"].every(n=>fields.some(f=>f.COLUMN_NAME===n)))
      throw new Error("[Product groups] Schema columns missing");
    const [after] = await db.query<RowDataPacket[]>(digestSql);
    if (JSON.stringify(before[0]) !== JSON.stringify(after[0]))
      throw new Error("[Product groups] Economic or ticket data changed during migration");
    console.log("[Product groups] OK: catalog available; historical quote/cycle/offer/ticket counts and digests unchanged");
  } finally {
    await db.end();
  }
}
