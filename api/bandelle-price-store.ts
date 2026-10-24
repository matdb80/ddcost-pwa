import mysql, { type RowDataPacket } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import { env } from "./lib/env";
import { applyBandellePriceOperations, validateBandellePrices, type BandellePriceOperation, type BandellePriceBook } from "../src/lib/bandelle-pricebook";

type RevisionRow = RowDataPacket & { id: number; dataJson: string; createdAt: string; createdByName: string; description: string };
const connect = () => mysql.createConnection({ uri: env.databaseUrl, ssl: { rejectUnauthorized: true }, connectTimeout: 10000, dateStrings: true });
const unpack = (row: RevisionRow | undefined) => {
  if (!row) throw new Error("Listino non disponibile. Riprova tra poco.");
  return { revision: Number(row.id), prices: validateBandellePrices(JSON.parse(row.dataJson)), createdAt: String(row.createdAt), author: row.createdByName, description: row.description };
};
export async function readBandellePrices() {
  const db = await connect();
  try {
    const [rows] = await db.query<RevisionRow[]>("SELECT * FROM bandelle_price_revisions ORDER BY id DESC LIMIT 1");
    return unpack(rows[0]);
  } finally { await db.end(); }
}
export async function listBandellePriceHistory() {
  const db = await connect();
  try {
    const [rows] = await db.query<RevisionRow[]>("SELECT id, createdAt, createdByName, description FROM bandelle_price_revisions ORDER BY id DESC LIMIT 30");
    return rows.map(row => ({ revision: Number(row.id), createdAt: String(row.createdAt), author: row.createdByName, description: row.description }));
  } finally { await db.end(); }
}
export async function saveBandellePrices(input: { expectedRevision: number; operations?: BandellePriceOperation[]; restoreRevision?: number }, user: { id: number; name: string }) {
  const db = await connect();
  try {
    const [rows] = await db.query<RevisionRow[]>("SELECT * FROM bandelle_price_revisions ORDER BY id DESC LIMIT 1");
    const current = unpack(rows[0]);
    if (current.revision !== input.expectedRevision) throw new TRPCError({ code: "CONFLICT", message: "Il listino è stato aggiornato da un altro utente. Ricarica i prezzi prima di riprovare." });
    let prices: BandellePriceBook;
    let description: string;
    if (input.restoreRevision !== undefined) {
      const [old] = await db.query<RevisionRow[]>("SELECT * FROM bandelle_price_revisions WHERE id = ?", [input.restoreRevision]);
      if (!old[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Revisione da ripristinare non trovata." });
      prices = unpack(old[0]).prices;
      description = `Ripristino della revisione ${input.restoreRevision}`;
    } else {
      try { prices = applyBandellePriceOperations(current.prices, input.operations ?? []); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Variazione non valida." }); }
      description = (input.operations ?? []).map(op => `${op.basisPoints > 0 ? "+" : ""}${(op.basisPoints / 100).toLocaleString("it-IT")}% su ${new Set(op.cellIds).size} celle`).join("; ");
    }
    if (!Object.keys(prices).some(id => prices[id] !== current.prices[id])) throw new TRPCError({ code: "BAD_REQUEST", message: "Nessun prezzo è cambiato dopo l'arrotondamento al centesimo." });
    // Append-only snapshot: the unique next revision is also the optimistic lock.
    // Two writers starting from the same revision cannot both succeed.
    try {
      await db.execute("INSERT INTO bandelle_price_revisions (id,dataJson,createdBy,createdByName,description,operationsJson) VALUES (?,?,?,?,?,?)",
        [current.revision + 1, JSON.stringify(prices), user.id, user.name, description, JSON.stringify(input)]);
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw new TRPCError({ code: "CONFLICT", message: "Un altro utente ha appena salvato il listino. Ricarica prima di riprovare." });
      throw error;
    }
    return { revision: current.revision + 1 };
  } finally { await db.end(); }
}
