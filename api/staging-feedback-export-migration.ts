/**
 * One-time STAGING-ONLY migration for feedback export receipts.
 * Adds only an append-only table and backfills the nine ticket identifiers
 * verifiably present in the user's exported file dated 2026-10-12.
 * Does not touch ticket content, resolution status or economic records.
 */
import mysql, { type RowDataPacket } from "mysql2/promise";

const LEGACY_TICKETS = [
  "TKT-20261012-6000001",
  "TKT-20261012-4000001",
  "TKT-20261012-2000005",
  "TKT-20261012-2000004",
  "TKT-20261012-2000003",
  "TKT-20261012-2000002",
  "TKT-20261012-2000001",
  "TKT-20261012-0002",
  "TKT-20261012-0001",
] as const;

export async function migrateStagingFeedbackExports(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const username = process.env.DDCOST_EXPECTED_TIDB_BRANCH_USERNAME ?? "";
  const redirectUrl = process.env.MICROSOFT_REDIRECT_URI ?? "";
  if (process.env.DDCOST_STAGING_MIGRATE_FEEDBACK_EXPORTS !== "1" ||
    process.env.VITE_APP_ID !== "ddcost-collaudo" ||
    username !== "9ovJ2FwEUzJE8ck.root" ||
    !redirectUrl || new URL(redirectUrl).origin !== "https://ddcost-collaudo.onrender.com" ||
    !url) {
    throw new Error("[Feedback export migration] Refused: not the verified staging identity");
  }
  const target = new URL(url);
  if (target.protocol !== "mysql:" ||
    target.hostname !== "gateway01.us-west-2.prod.aws.tidbcloud.com" ||
    decodeURIComponent(target.username) !== username ||
    decodeURIComponent(target.pathname) !== "/ddcost") {
    throw new Error("[Feedback export migration] Refused: not the verified TiDB staging branch");
  }
  const db = await mysql.createConnection({
    uri: url, ssl: { rejectUnauthorized: true }, connectTimeout: 8000,
    supportBigNumbers: true, bigNumberStrings: true,
  });
  try {
    const [tables] = await db.query<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('feedback_tickets','feedback_attachments','feedback_settings')"
    );
    if (tables.length !== 3) throw new Error("[Feedback export migration] Existing feedback schema not found");
    const [ticketRows] = await db.query<RowDataPacket[]>(
      "SELECT ticketNumber FROM feedback_tickets WHERE ticketNumber IN (?)",
      [LEGACY_TICKETS]
    );
    if (ticketRows.length !== LEGACY_TICKETS.length)
      throw new Error("[Feedback export migration] Expected 9 previously exported ticket identifiers");
    const [economicBefore] = await db.query<RowDataPacket[]>(
      "SELECT " +
      "(SELECT COUNT(*) FROM cycles) AS cycles," +
      "(SELECT COUNT(*) FROM quotes) AS quotes," +
      "(SELECT COUNT(*) FROM commercial_offers) AS offers," +
      "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM cycles) AS cyclesDigest," +
      "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM quotes) AS quotesDigest"
    );
    const [ticketBefore] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT(ticketNumber,title,description,status))),0) AS digest FROM feedback_tickets"
    );
    await db.query(
      "CREATE TABLE IF NOT EXISTS feedback_exports (" +
      "id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY," +
      "ticketId bigint unsigned NOT NULL," +
      "exportedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "batchId varchar(64) NOT NULL," +
      "format enum('json','markdown') NOT NULL," +
      "source enum('ui','legacy') NOT NULL DEFAULT 'ui'," +
      "KEY ticketId (ticketId)," +
      "KEY exportedAt (exportedAt)," +
      "UNIQUE KEY ticket_batch (ticketId,batchId)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    // Already in one or more JSON exports supplied to ChatGPT; idempotent.
    await db.query(
      "INSERT IGNORE INTO feedback_exports (ticketId,batchId,format,source) " +
      "SELECT id, 'legacy-upload-20261012', 'json', 'legacy' FROM feedback_tickets WHERE ticketNumber IN (?)",
      [LEGACY_TICKETS]
    );
    const [economicAfter] = await db.query<RowDataPacket[]>(
      "SELECT " +
      "(SELECT COUNT(*) FROM cycles) AS cycles," +
      "(SELECT COUNT(*) FROM quotes) AS quotes," +
      "(SELECT COUNT(*) FROM commercial_offers) AS offers," +
      "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM cycles) AS cyclesDigest," +
      "(SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) FROM quotes) AS quotesDigest"
    );
    const [ticketAfter] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n, COALESCE(SUM(CRC32(CONCAT(ticketNumber,title,description,status))),0) AS digest FROM feedback_tickets"
    );
    const [backfill] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM feedback_exports WHERE batchId='legacy-upload-20261012'"
    );
    if (JSON.stringify(economicBefore[0]) !== JSON.stringify(economicAfter[0]) ||
      JSON.stringify(ticketBefore[0]) !== JSON.stringify(ticketAfter[0]) ||
      Number(backfill[0]?.n) !== 9) {
      throw new Error("[Feedback export migration] Integrity validation failed");
    }
    console.log("[Feedback export migration] OK: nine known exported tickets backfilled; all business/ticket content unchanged");
  } finally {
    await db.end();
  }
}
