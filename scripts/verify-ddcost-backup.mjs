#!/usr/bin/env node
// Offline verifier for files downloaded from DDCost's "Esporta backup" action.
// Run: node scripts/verify-ddcost-backup.mjs path/to/DDCost_backup_....json
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/verify-ddcost-backup.mjs <file.json>");
  process.exit(2);
}

const checksum = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const requiredTables = [
  "users",
  "cycles",
  "quotes",
  "cycle_simulations",
  "commercial_offers",
];

try {
  const file = JSON.parse(readFileSync(path, "utf8"));
  const { checksumSha256, ...payload } = file;

  if (payload.format !== "ddcost-tidb-logical-backup" || payload.formatVersion !== 1) {
    throw new Error("Unsupported backup format/version");
  }
  if (!checksumSha256 || checksum(JSON.stringify(payload)) !== checksumSha256) {
    throw new Error("Overall SHA-256 checksum mismatch");
  }

  for (const table of requiredTables) {
    const rows = payload.records?.[table];
    if (!Array.isArray(rows)) throw new Error("Missing table: " + table);
    if (rows.length !== payload.rowCounts?.[table]) {
      throw new Error("Row count mismatch: " + table);
    }
    if (checksum(JSON.stringify(rows)) !== payload.tableChecksums?.[table]) {
      throw new Error("Table SHA-256 checksum mismatch: " + table);
    }
    if (typeof payload.tableDefinitions?.[table] !== "string") {
      throw new Error("Missing CREATE TABLE for " + table);
    }
    console.log(table + ": " + rows.length + " rows - OK");
  }
  console.log("BACKUP INTEGRITY: OK");
} catch (err) {
  console.error("BACKUP INTEGRITY: FAILED - " + err.message);
  process.exit(1);
}
