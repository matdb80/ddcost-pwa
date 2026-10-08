/**
 * Script di importazione dati da SQLite (unito) a MySQL (DDCost PWA)
 * Usa bulk insert per massima velocita'
 */

import Database from "better-sqlite3";
import { getDb } from "../api/queries/connection";
import { cycles, quotes, cycleSimulations, commercialOffers } from "@db/schema";

const args = process.argv.slice(2);
const sourceDir = args[0];

if (!sourceDir) {
  console.error("Uso: npx tsx scripts/import-merged-sqlite.ts <cartella_merge>");
  process.exit(1);
}

async function importCicli() {
  const dbPath = `${sourceDir}/costi_standard.sqlite`;
  const db = new Database(dbPath);
  const rows = db.prepare("SELECT * FROM costi_standard").all() as any[];
  const mysql = getDb();

  console.log(`\n📥 Importazione cicli standard: ${rows.length} record`);

  if (rows.length === 0) { db.close(); return; }

  const values = rows.map((row: any) => ({
    id: row.id,
    rootId: row.root_id || row.id,
    rev: row.rev || 1,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.created_at ? new Date(row.created_at) : new Date(),
    userId: 1,
    code: row.codice || "",
    description: row.descrizione || "",
    client: row.cliente || null,
    lot: row.lotto || null,
    standardCost: row.costo_standard?.toString() || null,
    minimumPrice: row.prezzo_minimo?.toString() || null,
    dataJson: row.data_json || "{}",
  }));

  try {
    await mysql.insert(cycles).values(values as any);
    console.log(`   ✅ Cicli standard importati`);
  } catch (e: any) {
    console.error(`   ❌ Errore bulk insert cicli:`, e.message || e);
  }
  db.close();
}

async function importPreventivi() {
  const dbPath = `${sourceDir}/preventivi_unatantum.sqlite`;
  const db = new Database(dbPath);
  const rows = db.prepare("SELECT * FROM preventivi").all() as any[];
  const mysql = getDb();

  console.log(`\n📥 Importazione preventivi: ${rows.length} record`);

  if (rows.length === 0) { db.close(); return; }

  const values = rows.map((row: any) => ({
    id: row.id,
    rootId: row.root_id,
    rev: row.rev || 1,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    userId: 1,
    client: row.cliente || "",
    reference: row.riferimento_preventivo || null,
    targetTotal: row.target_totale?.toString() || null,
    totalBeforeRebalance: row.totale_pre_quadratura?.toString() || null,
    totalFinal: row.totale_finale?.toString() || null,
    numProducts: row.num_prodotti || 0,
    generalNotes: row.note_generali || null,
    clientNotes: row.note_cliente || null,
    supplierNotes: row.note_fornitori || null,
    summary: row.summary || null,
    dataJson: row.data_json || "{}",
  }));

  try {
    await mysql.insert(quotes).values(values as any);
    console.log(`   ✅ Preventivi importati`);
  } catch (e: any) {
    console.error(`   ❌ Errore bulk insert preventivi:`, e.message || e);
  }
  db.close();
}

async function importSimulazioni() {
  const dbPath = `${sourceDir}/simulazioni_cicli.sqlite`;
  const db = new Database(dbPath);
  const rows = db.prepare("SELECT * FROM simulazioni_cicli").all() as any[];
  const mysql = getDb();

  console.log(`\n📥 Importazione simulazioni: ${rows.length} record`);

  if (rows.length === 0) { db.close(); return; }

  const values = rows.map((row: any) => ({
    id: row.id,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    userId: 1,
    name: row.nome || "",
    code: row.codice || "",
    description: row.descrizione || "",
    client: row.cliente || null,
    sourceRootId: row.source_root_id || null,
    sourceRev: row.source_rev || null,
    standardCost: row.costo_standard?.toString() || null,
    minimumPrice: row.prezzo_minimo?.toString() || null,
    dataJson: row.data_json || "{}",
  }));

  try {
    await mysql.insert(cycleSimulations).values(values as any);
    console.log(`   ✅ Simulazioni importate`);
  } catch (e: any) {
    console.error(`   ❌ Errore bulk insert simulazioni:`, e.message || e);
  }
  db.close();
}

async function importOfferte() {
  const dbPath = `${sourceDir}/offerte_commerciali.sqlite`;
  const db = new Database(dbPath);
  const rows = db.prepare("SELECT * FROM offerte_commerciali").all() as any[];
  const mysql = getDb();

  console.log(`\n📥 Importazione offerte: ${rows.length} record`);

  if (rows.length === 0) { db.close(); return; }

  const values = rows.map((row: any) => ({
    id: row.id,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    userId: 1,
    name: row.nome || "",
    client: row.cliente || null,
    reference: row.riferimento || null,
    notes: row.note || null,
    numRows: row.num_righe || 0,
    dataJson: row.data_json || "{}",
  }));

  try {
    await mysql.insert(commercialOffers).values(values as any);
    console.log(`   ✅ Offerte importate`);
  } catch (e: any) {
    console.error(`   ❌ Errore bulk insert offerte:`, e.message || e);
  }
  db.close();
}

async function main() {
  console.log("🚀 Inizio importazione dati da SQLite a MySQL...");
  console.log(`   Fonte: ${sourceDir}`);

  await importCicli();
  await importPreventivi();
  await importSimulazioni();
  await importOfferte();

  console.log("\n🎉 Importazione completata!");
}

main().catch(e => {
  console.error("\n❌ Errore:", e);
  process.exit(1);
});
