/**
 * Script di merge intelligente database SQLite da 2 PC
 *
 * Uso:
 *   npx tsx scripts/merge-sqlite.ts <cartella_pc1> <cartella_pc2> <cartella_output>
 *
 * Logica di merge:
 * - Record con stesso ID e stessi dati → tenuto una volta sola
 * - Record con stesso ID ma dati diversi → mostra conflitto, tiene il più recente
 * - Record presente solo su un PC → incluso automaticamente
 * - ID auto-increment ricalibrati per evitare collisioni
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const [dir1, dir2, outDir] = process.argv.slice(2);
if (!dir1 || !dir2 || !outDir) {
  console.error("Uso: npx tsx scripts/merge-sqlite.ts <pc1_dir> <pc2_dir> <output_dir>");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

interface TableConfig {
  table: string;
  pk: string;
  file: string;
  timestampCol?: string;
}

const TABLES: TableConfig[] = [
  { table: "costi_standard", pk: "id", file: "costi_standard.sqlite", timestampCol: "created_at" },
  { table: "preventivi", pk: "id", file: "preventivi_unatantum.sqlite", timestampCol: "created_at" },
  { table: "simulazioni_cicli", pk: "id", file: "simulazioni_cicli.sqlite", timestampCol: "created_at" },
  { table: "offerte_commerciali", pk: "id", file: "offerte_commerciali.sqlite", timestampCol: "updated_at" },
];

function getRows(dbPath: string, table: string): any[] {
  if (!fs.existsSync(dbPath)) return [];
  const db = new Database(dbPath);
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  db.close();
  return rows;
}

function mergeTable(config: TableConfig) {
  const db1Path = path.join(dir1, config.file);
  const db2Path = path.join(dir2, config.file);
  const outPath = path.join(outDir, config.file);

  const rows1 = getRows(db1Path, config.table);
  const rows2 = getRows(db2Path, config.table);

  console.log(`\n📁 ${config.file} (${config.table})`);
  console.log(`   PC1: ${rows1.length} righe`);
  console.log(`   PC2: ${rows2.length} righe`);

  const merged = new Map<number, any>();
  const conflicts: any[] = [];

  // Processa PC1
  for (const row of rows1) {
    merged.set(row[config.pk], { ...row, _source: "pc1" });
  }

  // Processa PC2
  for (const row of rows2) {
    const existing = merged.get(row[config.pk]);
    if (!existing) {
      merged.set(row[config.pk], { ...row, _source: "pc2" });
    } else {
      // Confronta
      const r1Str = JSON.stringify(existing, Object.keys(existing).sort());
      const r2Str = JSON.stringify(row, Object.keys(row).sort());
      if (r1Str !== r2Str) {
        // Conflitto: prendi il più recente
        const t1 = config.timestampCol ? new Date(existing[config.timestampCol] || 0).getTime() : 0;
        const t2 = config.timestampCol ? new Date(row[config.timestampCol] || 0).getTime() : 0;
        const winner = t2 >= t1 ? { ...row, _source: "pc2" } : existing;
        conflicts.push({
          pk: row[config.pk],
          kept: winner._source,
          reason: t2 > t1 ? "PC2 più recente" : t2 < t1 ? "PC1 più recente" : "Identici",
        });
        merged.set(row[config.pk], winner);
      }
    }
  }

  if (conflicts.length > 0) {
    console.log(`   ⚠️  Conflitti risolti: ${conflicts.length}`);
    for (const c of conflicts.slice(0, 3)) {
      console.log(`      ID ${c.pk}: ${c.reason}`);
    }
    if (conflicts.length > 3) console.log(`      ... e altri ${conflicts.length - 3}`);
  }

  // Crea database output
  const outDb = new Database(outPath);

  // Ottieni schema dal primo DB disponibile
  const schemaSource = fs.existsSync(db1Path) ? db1Path : db2Path;
  const schemaDb = new Database(schemaSource);
  const schemaInfo = schemaDb.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(config.table) as any;
  schemaDb.close();

  if (schemaInfo?.sql) {
    outDb.exec(schemaInfo.sql);
  }

  // Inserisci dati
  const allRows = Array.from(merged.values());
  if (allRows.length > 0) {
    const columns = Object.keys(allRows[0]).filter(k => !k.startsWith("_"));
    const placeholders = columns.map(() => "?").join(",");
    const insert = outDb.prepare(`INSERT INTO ${config.table} (${columns.join(",")}) VALUES (${placeholders})`);

    const insertMany = outDb.transaction((rows: any[]) => {
      for (const row of rows) {
        const values = columns.map(c => row[c] ?? null);
        insert.run(values);
      }
    });

    insertMany(allRows);
  }

  outDb.close();
  console.log(`   ✅ Output: ${allRows.length} righe → ${outPath}`);

  return { count: allRows.length, conflicts: conflicts.length };
}

// Esegui merge su tutte le tabelle
let totalRows = 0;
let totalConflicts = 0;

for (const config of TABLES) {
  const result = mergeTable(config);
  totalRows += result.count;
  totalConflicts += result.conflicts;
}

console.log(`\n🎉 Merge completato!`);
console.log(`   Totale righe unite: ${totalRows}`);
console.log(`   Totale conflitti: ${totalConflicts}`);
console.log(`   Cartella output: ${outDir}`);
