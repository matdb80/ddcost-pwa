/**
 * Script di migrazione dati da SQLite (DDCost desktop) a MySQL (DDCost PWA)
 *
 * Uso:
 *   npx tsx scripts/import-sqlite.ts <percorso_cartella_ddcost>
 *
 * Il percorso deve contenere i file:
 *   - preventivi_unatantum.sqlite
 *   - costi_standard.sqlite
 *   - simulazioni_cicli.sqlite
 *   - offerte_commerciali.sqlite
 */

import Database from "better-sqlite3";
import { getDb } from "../api/queries/connection";
import { cycles, quotes, cycleSimulations, commercialOffers } from "@db/schema";

const args = process.argv.slice(2);
const sourceDir = args[0];

if (!sourceDir) {
  console.error("Uso: npx tsx scripts/import-sqlite.ts <percorso_cartella_ddcost>");
  process.exit(1);
}

function importPreventivi() {
  const db = new Database(`${sourceDir}/preventivi_unatantum.sqlite`);
  const rows = db.prepare("SELECT * FROM preventivi").all() as any[];
  const mysql = getDb();

  for (const row of rows) {
    mysql.insert(quotes).values({
      id: row.id,
      rootId: row.root_id,
      rev: row.rev,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      userId: 1, // assign to first admin
      client: row.cliente,
      reference: row.riferimento_preventivo,
      targetTotal: row.target_totale?.toString(),
      totalBeforeRebalance: row.totale_prima_quadratura?.toString(),
      totalFinal: row.totale_finale?.toString(),
      numProducts: row.num_prodotti,
      generalNotes: row.note_generali,
      clientNotes: row.note_cliente,
      supplierNotes: row.note_fornitori,
      summary: row.summary,
      dataJson: row.data_json,
    });
  }
  console.log(`Importati ${rows.length} preventivi`);
  db.close();
}

function importCicli() {
  const db = new Database(`${sourceDir}/costi_standard.sqlite`);
  const rows = db.prepare("SELECT * FROM costi_standard").all() as any[];
  const mysql = getDb();

  for (const row of rows) {
    mysql.insert(cycles).values({
      id: row.id,
      rootId: row.root_id,
      rev: row.rev,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      userId: 1,
      code: row.codice,
      description: row.descrizione,
      client: row.cliente,
      lot: row.lotto,
      standardCost: row.costo_standard?.toString(),
      minimumPrice: row.prezzo_minimo?.toString(),
      dataJson: row.data_json,
    });
  }
  console.log(`Importati ${rows.length} cicli standard`);
  db.close();
}

function importSimulazioni() {
  const db = new Database(`${sourceDir}/simulazioni_cicli.sqlite`);
  const rows = db.prepare("SELECT * FROM simulazioni_cicli").all() as any[];
  const mysql = getDb();

  for (const row of rows) {
    mysql.insert(cycleSimulations).values({
      id: row.id,
      createdAt: new Date(row.created_at),
      userId: 1,
      name: row.nome,
      code: row.codice,
      description: row.descrizione,
      client: row.cliente,
      sourceRootId: row.source_root_id,
      sourceRev: row.source_rev,
      standardCost: row.costo_standard?.toString(),
      minimumPrice: row.prezzo_minimo?.toString(),
      dataJson: row.data_json,
    });
  }
  console.log(`Importate ${rows.length} simulazioni`);
  db.close();
}

function importOfferte() {
  const db = new Database(`${sourceDir}/offerte_commerciali.sqlite`);
  const rows = db.prepare("SELECT * FROM offerte_commerciali").all() as any[];
  const mysql = getDb();

  for (const row of rows) {
    mysql.insert(commercialOffers).values({
      id: row.id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      userId: 1,
      name: row.nome,
      client: row.cliente,
      reference: row.riferimento,
      notes: row.note,
      numRows: row.num_righe,
      dataJson: row.data_json,
    });
  }
  console.log(`Importate ${rows.length} offerte`);
  db.close();
}

async function main() {
  console.log("Inizio importazione dati da SQLite a MySQL...\n");
  try {
    importPreventivi();
    importCicli();
    importSimulazioni();
    importOfferte();
    console.log("\nImportazione completata con successo!");
  } catch (e) {
    console.error("Errore durante l'importazione:", e);
    process.exit(1);
  }
}

main();
