/**
 * One-off feedback schema migration on isolated DDCost collaudo only.
 * The migration will refuse to run unless every staging identity check passes.
 * It never updates rows or columns in historical/economic tables.
 */
import mysql, { type RowDataPacket } from "mysql2/promise";

const tables = [
  "users", "cycles", "quotes", "cycle_simulations",
  "commercial_offers", "legacy_source_archives"
] as const;

const ddl = [
  [
    "CREATE TABLE IF NOT EXISTS feedback_tickets (",
    "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,",
    "createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,",
    "updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,",
    "userId BIGINT UNSIGNED NOT NULL, userName VARCHAR(255), userEmail VARCHAR(320),",
    "ticketNumber VARCHAR(50) NOT NULL UNIQUE,",
    "type ENUM('bug','miglioramento','nuova_funzione') NOT NULL,",
    "severity ENUM('normale','bloccante') NOT NULL DEFAULT 'normale',",
    "status ENUM('nuova','da_pianificare','in_lavorazione','risolta_collaudo','rilasciata','duplicata','non_riproducibile') NOT NULL DEFAULT 'nuova',",
    "title VARCHAR(255) NOT NULL, description TEXT NOT NULL,",
    "pageRoute VARCHAR(255), buildVersion VARCHAR(100),",
    "cycleId BIGINT UNSIGNED, cycleRev BIGINT UNSIGNED,",
    "technicalNote TEXT, includeInReleaseCount TINYINT UNSIGNED NOT NULL DEFAULT 1,",
    "KEY idx_feedback_status(status), KEY idx_feedback_createdAt(createdAt)",
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
  ].join(" "),
  [
    "CREATE TABLE IF NOT EXISTS feedback_attachments (",
    "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,",
    "createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,",
    "ticketId BIGINT UNSIGNED NOT NULL, mimeType VARCHAR(100) NOT NULL,",
    "fileName VARCHAR(255), sizeBytes BIGINT UNSIGNED NOT NULL,",
    "dataBase64 MEDIUMTEXT NOT NULL, KEY idx_feedback_ticketId(ticketId)",
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
  ].join(" "),
  [
    "CREATE TABLE IF NOT EXISTS feedback_settings (",
    "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,",
    "updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,",
    "releaseThreshold BIGINT UNSIGNED NOT NULL DEFAULT 10",
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
  ].join(" "),
] as const;

export async function migrateFeedbackOnlyOnStaging(): Promise<void> {
  const redirect=process.env.MICROSOFT_REDIRECT_URI??"";
  const url=process.env.DATABASE_URL??"";
  const expectedUser=process.env.DDCOST_EXPECTED_TIDB_BRANCH_USERNAME??"";
  if (!redirect || !url || !expectedUser ||
      new URL(redirect).origin!=="https://ddcost-collaudo.onrender.com" ||
      process.env.VITE_APP_ID!=="ddcost-collaudo") {
    throw new Error("[Feedback migration] REFUSED: staging identity mismatch");
  }
  const parts=new URL(url);
  if (parts.protocol!=="mysql:" ||
      parts.hostname!=="gateway01.us-west-2.prod.aws.tidbcloud.com" ||
      decodeURIComponent(parts.username)!==expectedUser ||
      !expectedUser.endsWith(".root") ||
      decodeURIComponent(parts.pathname)!=="/ddcost") {
    throw new Error("[Feedback migration] REFUSED: isolated TiDB branch mismatch");
  }

  const db=await mysql.createConnection({
    uri:url,ssl:{rejectUnauthorized:true},connectTimeout:10000,
  });
  try {
    const [name]=await db.query<RowDataPacket[]>("SELECT DATABASE() AS db");
    if (name[0]?.db!=="ddcost") {
      throw new Error("[Feedback migration] REFUSED: unexpected DB name");
    }
    const counts=new Map<string,string>();
    for(const table of tables) {
      const [r]=await db.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM "+mysql.escapeId(table)
      );
      counts.set(table,String(r[0]?.cnt));
    }
    if(Number(counts.get("cycles"))<175 || counts.get("legacy_source_archives")!=="1") {
      throw new Error("[Feedback migration] REFUSED: incomplete historical archive");
    }
    const oldFingerprint="SELECT COUNT(*) AS cnt, " +
      "COALESCE(SUM(CRC32(COALESCE(dataJson,''))),0) AS digest FROM cycles";
    const [before]=await db.query<RowDataPacket[]>(oldFingerprint);
    const [columns]=await db.query<RowDataPacket[]>(
      "SELECT COLUMN_NAME,NUMERIC_PRECISION,NUMERIC_SCALE FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cycles' " +
      "AND COLUMN_NAME IN ('standardCost','minimumPrice')"
    );
    if(columns.length!==2 || columns.some(c =>
      Number(c.NUMERIC_PRECISION)!==30 || Number(c.NUMERIC_SCALE)!==18)) {
      throw new Error("[Feedback migration] REFUSED: economic precision mismatch");
    }

    // No ALTER, DROP, UPDATE or DELETE on historical tables.
    for(const statement of ddl) await db.query(statement);
    await db.query(
      "INSERT INTO feedback_settings (releaseThreshold) " +
      "SELECT 10 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM feedback_settings LIMIT 1)"
    );

    const [newTables]=await db.query<RowDataPacket[]>(
      "SELECT table_name AS name FROM information_schema.tables " +
      "WHERE table_schema=DATABASE() AND table_name IN " +
      "('feedback_tickets','feedback_attachments','feedback_settings')"
    );
    if(newTables.length!==3)throw new Error("[Feedback migration] Feedback tables incomplete");

    const [shotCol]=await db.query<RowDataPacket[]>(
      "SELECT DATA_TYPE AS kind FROM information_schema.columns " +
      "WHERE table_schema=DATABASE() AND table_name='feedback_attachments' " +
      "AND column_name='dataBase64'"
    );
    if(shotCol[0]?.kind!=="mediumtext") {
      throw new Error("[Feedback migration] Invalid screenshot storage column");
    }
    for(const table of tables) {
      const [r]=await db.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM "+mysql.escapeId(table)
      );
      if(String(r[0]?.cnt)!==counts.get(table)) {
        throw new Error("[Feedback migration] Historical row count changed");
      }
    }
    const [after]=await db.query<RowDataPacket[]>(oldFingerprint);
    if(String(before[0]?.cnt)!==String(after[0]?.cnt) ||
       String(before[0]?.digest)!==String(after[0]?.digest)) {
      throw new Error("[Feedback migration] Historical JSON integrity mismatch");
    }
    console.log("[Feedback migration] SUCCESS: 3 tables verified, historical data untouched");
  } finally {
    await db.end();
  }
}
