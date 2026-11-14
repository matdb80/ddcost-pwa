/** Additive schema activation, restricted to the already-authorized staging service. */
import mysql, { type RowDataPacket } from "mysql2/promise";
import { readFileSync } from "node:fs";
import { collectLogicalBackup } from "./backup";
const newTables = ["quote_attachments", "temporary_product_sequence", "temporary_product_codes"];
export function assertNov09Staging(vars: NodeJS.ProcessEnv) {
  if (vars.RENDER_SERVICE_ID !== "srv-db5np90473hc73bq8c1g" || vars.VITE_APP_ID !== "ddcost-collaudo" ||
    vars.RENDER_GIT_BRANCH !== "feature/editor-cicli-v7-reviewed" || vars.RENDER_EXTERNAL_URL !== "https://ddcost-collaudo.onrender.com")
    throw new Error("[Nov09 release] Refused service identity");
  const url = new URL(vars.DATABASE_URL ?? "");
  if (url.protocol !== "mysql:" || url.hostname !== "gateway01.us-west-2.prod.aws.tidbcloud.com" ||
    decodeURIComponent(url.username) !== "9ovJ2FwEUzJE8ck.root" || url.pathname !== "/ddcost")
    throw new Error("[Nov09 release] Refused database identity");
}
export async function activateNov09Staging() {
  assertNov09Staging(process.env);
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, connectTimeout: 10000,
    supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false, dateStrings: true });
  try {
    const [inventory] = await db.query<RowDataPacket[]>("SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()");
    if (newTables.every(t => inventory.some(r => r.name === t))) return;
    const before = await collectLogicalBackup(db);
    // No existing table is altered. A complete read-only snapshot is compared after activation.
    for (const name of ["0007_quote_attachments.sql", "0008_temporary_product_codes.sql"]) {
      const sql = readFileSync(new URL(`../db/migrations/${name}`, import.meta.url), "utf8");
      for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await db.query(statement);
    }
    const after = await collectLogicalBackup(db);
    for (const table of before.tables) if (!newTables.includes(table) && (before.tableChecksums[table] !== after.tableChecksums[table] || before.tableDefinitions[table] !== after.tableDefinitions[table]))
      throw new Error("[Nov09 release] Existing table changed during activation");
    if (newTables.some(t => !after.tables.includes(t as typeof after.tables[number]))) throw new Error("[Nov09 release] Incomplete schema");
    // SQL round-trip with rollback, synthetic bytes only, no business records changed.
    await db.beginTransaction();
    try {
      await db.execute("INSERT INTO quote_attachments (rootId,userId,fileName,mimeType,sizeBytes,sha256,dataBase64) VALUES (0,0,'roundtrip.txt','text/plain',3,?,?)", ["a".repeat(64), "YWJj"]);
      const [read] = await db.execute<RowDataPacket[]>("SELECT dataBase64,sizeBytes FROM quote_attachments WHERE rootId=0 AND sha256=?", ["a".repeat(64)]);
      if (read.length !== 1 || read[0].dataBase64 !== "YWJj" || Number(read[0].sizeBytes) !== 3) throw new Error("[Nov09 release] Attachment round-trip failed");
    } finally { await db.rollback(); }
    console.log("[Nov09 release] PASS additive schema; previous table hashes unchanged; attachment SQL round-trip rolled back; optional tables included in backup");
  } finally { await db.end(); }
}
