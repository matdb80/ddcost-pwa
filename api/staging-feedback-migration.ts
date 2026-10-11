/** Isolated one-shot SQL migration; never on the production service/database. */
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
const MIGRATION_SQL: string = "-- Migration: Feedback System (Registro Segnalazioni)\n-- Additive only — does not modify existing economic tables\n-- Apply on TiDB before deploying the new feedback features\n\n-- Tickets table\nCREATE TABLE IF NOT EXISTS `feedback_tickets` (\n  `id` bigint unsigned NOT NULL AUTO_INCREMENT,\n  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  `userId` bigint unsigned NOT NULL,\n  `userName` varchar(255) DEFAULT NULL,\n  `userEmail` varchar(320) DEFAULT NULL,\n  `ticketNumber` varchar(50) NOT NULL,\n  `type` enum('bug','miglioramento','nuova_funzione') NOT NULL,\n  `severity` enum('normale','bloccante') NOT NULL DEFAULT 'normale',\n  `status` enum('nuova','da_pianificare','in_lavorazione','risolta_collaudo','rilasciata','duplicata','non_riproducibile') NOT NULL DEFAULT 'nuova',\n  `title` varchar(255) NOT NULL,\n  `description` text NOT NULL,\n  `pageRoute` varchar(255) DEFAULT NULL,\n  `buildVersion` varchar(100) DEFAULT NULL,\n  `cycleId` bigint unsigned DEFAULT NULL,\n  `cycleRev` bigint unsigned DEFAULT NULL,\n  `technicalNote` text DEFAULT NULL,\n  `includeInReleaseCount` tinyint unsigned NOT NULL DEFAULT 1,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `ticketNumber` (`ticketNumber`),\n  KEY `status` (`status`),\n  KEY `type` (`type`),\n  KEY `severity` (`severity`),\n  KEY `createdAt` (`createdAt`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n-- Attachments table (screenshots)\nCREATE TABLE IF NOT EXISTS `feedback_attachments` (\n  `id` bigint unsigned NOT NULL AUTO_INCREMENT,\n  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `ticketId` bigint unsigned NOT NULL,\n  `mimeType` varchar(100) NOT NULL,\n  `fileName` varchar(255) DEFAULT NULL,\n  `sizeBytes` bigint unsigned DEFAULT NULL,\n  `dataBase64` MEDIUMTEXT NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `ticketId` (`ticketId`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n-- Settings table (release threshold)\nCREATE TABLE IF NOT EXISTS `feedback_settings` (\n  `id` bigint unsigned NOT NULL AUTO_INCREMENT,\n  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n  `releaseThreshold` bigint unsigned NOT NULL DEFAULT 10,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n-- Seed default threshold if table is empty\nINSERT INTO `feedback_settings` (`releaseThreshold`)\nSELECT 10\nFROM DUAL\nWHERE NOT EXISTS (SELECT 1 FROM `feedback_settings` LIMIT 1);\n";
const HISTORICAL_TABLES = [
  "users", "cycles", "quotes", "cycle_simulations",
  "commercial_offers", "legacy_source_archives"
] as const;
const NEW_TABLES = ["feedback_tickets", "feedback_attachments", "feedback_settings"] as const;

async function snapshot(connection: mysql.Connection): Promise<Record<string,string>> {
  const data: Record<string,string> = {};
  for (const name of HISTORICAL_TABLES) {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS cnt FROM " + mysql.escapeId(name)
    );
    data[name] = String(rows[0]?.cnt);
  }
  for (const name of ["cycles","quotes","cycle_simulations","commercial_offers"]) {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) AS digest FROM " + mysql.escapeId(name)
    );
    data[name + "_json_digest"] = String(rows[0]?.digest);
  }
  const [money] = await connection.query<RowDataPacket[]>(
    "SELECT TABLE_NAME, COLUMN_NAME, NUMERIC_PRECISION, NUMERIC_SCALE FROM INFORMATION_SCHEMA.COLUMNS " +
    "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('cycles','quotes','cycle_simulations') " +
    "AND DATA_TYPE='decimal'"
  );
  data.decimalSchema = JSON.stringify(money);
  return data;
}

export async function migrateStagingFeedback(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const username = process.env.DDCOST_EXPECTED_TIDB_BRANCH_USERNAME ?? "";
  const redirectUrl = process.env.MICROSOFT_REDIRECT_URI ?? "";
  // This code may exist in main later. Never allow it to modify production.
  if (process.env.DDCOST_STAGING_MIGRATE_FEEDBACK !== "1" ||
      process.env.VITE_APP_ID !== "ddcost-collaudo" ||
      !databaseUrl || !redirectUrl ||
      new URL(redirectUrl).origin !== "https://ddcost-collaudo.onrender.com" ||
      username !== "9ovJ2FwEUzJE8ck.root") {
    throw new Error("[Feedback migration] Refused: staging-only identity mismatch");
  }
  const target = new URL(databaseUrl);
  if (target.protocol !== "mysql:" ||
      target.hostname !== "gateway01.us-west-2.prod.aws.tidbcloud.com" ||
      decodeURIComponent(target.username) !== username ||
      decodeURIComponent(target.pathname) !== "/ddcost") {
    throw new Error("[Feedback migration] Refused: branch connection does not match the staging branch");
  }

  const db = await mysql.createConnection({
    uri: databaseUrl, ssl: { rejectUnauthorized: true }, connectTimeout: 8000,
    supportBigNumbers: true, bigNumberStrings: true,
  });
  try {
    const [selected] = await db.query<RowDataPacket[]>("SELECT DATABASE() AS db");
    if (selected[0]?.db !== "ddcost") {
      throw new Error("[Feedback migration] Refused: database name mismatch");
    }
    const before = await snapshot(db);
    if (Number(before.cycles) < 175 || before.legacy_source_archives !== "1") {
      throw new Error("[Feedback migration] Refused: historical archive mismatch");
    }
    const statements = MIGRATION_SQL.split(";")
      .map(x => x.trim()).filter(Boolean);
    if (statements.length !== 4 ||
        !statements.every(x => /^(?:--[^\n]*\n|\s)*(?:CREATE TABLE IF NOT EXISTS `feedback_|INSERT INTO `feedback_settings`)/i.test(x))) {
      throw new Error("[Feedback migration] Refused: unexpected DDL script");
    }
    console.log("[Feedback migration] Starting additive migration in isolated staging database.");
    for (const statement of statements) {
      await db.query(statement);
    }

    const [tables] = await db.query<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() " +
      "AND TABLE_NAME IN ('feedback_tickets','feedback_attachments','feedback_settings')"
    );
    const actual = new Set(tables.map(row => String(row.TABLE_NAME)));
    if (!NEW_TABLES.every(x => actual.has(x))) {
      throw new Error("[Feedback migration] Missing new table");
    }
    const [fields] = await db.query<RowDataPacket[]>(
      "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='feedback_attachments' AND COLUMN_NAME='dataBase64'"
    );
    if (fields[0]?.DATA_TYPE !== "mediumtext") {
      throw new Error("[Feedback migration] Invalid attachment column type");
    }
    const [settings] = await db.query<RowDataPacket[]>("SELECT releaseThreshold FROM feedback_settings LIMIT 2");
    if (settings.length !== 1 || Number(settings[0]?.releaseThreshold) !== 10) {
      throw new Error("[Feedback migration] Invalid initial feedback threshold");
    }
    const after = await snapshot(db);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("[Feedback migration] Historical counts/JSON/precision changed");
    }
    console.log("[Feedback migration] SUCCESS: 3 feedback tables created, threshold 10.");
    console.log("[Feedback migration] Historical rows, JSON digests and monetary precision unchanged.");
    console.log("[Feedback migration] Verified historic cycles:", before.cycles);
  } finally {
    await db.end();
  }
}
