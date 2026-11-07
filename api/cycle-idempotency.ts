import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { cycleCreateReceipts, cycles, users } from "@db/schema";
import type { getDb } from "./queries/connection";
import { requireImportCapability } from "./cycle-import-db-capabilities";
function canonical(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, canonical(v)])
  );
}
export const stablePayloadHash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)), "utf8")
    .digest("hex");
type Payload = Pick<
  typeof cycles.$inferInsert,
  | "code"
  | "description"
  | "client"
  | "lot"
  | "standardCost"
  | "minimumPrice"
  | "dataJson"
>;
export async function createCycleIdempotent(
  db: ReturnType<typeof getDb>,
  userId: number,
  key: string,
  payload: Payload
) {
  await requireImportCapability(db, "receipts");
  const code = payload.code?.trim() || undefined,
    hash = stablePayloadHash({ ...payload, code }),
    normalizedCode = code?.toUpperCase() || null;
  return db.transaction(async tx => {
    // Serialize create attempts for one account before reading either old
    // cycles or receipts. Covers codes created before migration 0006 as well.
    const owner = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
    if (!owner[0])
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Utente non disponibile",
      });
    const old = (
      await tx
        .select()
        .from(cycleCreateReceipts)
        .where(
          and(
            eq(cycleCreateReceipts.userId, userId),
            eq(cycleCreateReceipts.idempotencyKey, key)
          )
        )
        .limit(1)
        .for("update")
    )[0];
    if (old) {
      // Receipts written by COMPLETE used insertion-order JSON hashing.
      const legacyHash = createHash("sha256")
        .update(JSON.stringify(payload), "utf8")
        .digest("hex");
      if (old.payloadHash !== hash && old.payloadHash !== legacyHash)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Chiave già utilizzata con dati diversi. Riprovare il tentativo originale.",
        });
      if (
        old.status !== "completed" ||
        !Number.isSafeInteger(Number(old.cycleId)) ||
        Number(old.cycleId) <= 0
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ricevuta incompleta: verificare il salvataggio precedente.",
        });
      return { id: Number(old.cycleId) };
    }
    if (normalizedCode) {
      const existing = await tx
        .select({ id: cycles.id })
        .from(cycles)
        .where(
          and(
            eq(cycles.userId, userId),
            sql`UPPER(TRIM(${cycles.code})) = ${normalizedCode}`
          )
        )
        .limit(1)
        .for("update");
      if (existing[0])
        throw new TRPCError({
          code: "CONFLICT",
          message: "Codice già utilizzato. Inserire un codice diverso.",
        });
      const reservation = await tx
        .select({ id: cycleCreateReceipts.id })
        .from(cycleCreateReceipts)
        .where(and(
          eq(cycleCreateReceipts.userId, userId),
          eq(cycleCreateReceipts.normalizedCode, normalizedCode)
        ))
        .limit(1)
        .for("update");
      if (reservation[0])
        throw new TRPCError({
          code: "CONFLICT",
          message: "Codice già riservato da una creazione precedente.",
        });
    }
    await tx
      .insert(cycleCreateReceipts)
      .values({
        userId,
        idempotencyKey: key,
        payloadHash: hash,
        normalizedCode,
        status: "claimed",
      });
    const result = await tx
      .insert(cycles)
      .values({ ...payload, userId, code, rootId: undefined, rev: 1 });
    const id = Number(result[0].insertId);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Identificatore ciclo non valido",
      });
    const updated = await tx
      .update(cycles)
      .set({ rootId: id })
      .where(eq(cycles.id, id));
    if (updated[0].affectedRows !== 1)
      throw new Error("Inizializzazione radice fallita");
    const receipt = await tx
      .update(cycleCreateReceipts)
      .set({ cycleId: id, status: "completed" })
      .where(
        and(
          eq(cycleCreateReceipts.userId, userId),
          eq(cycleCreateReceipts.idempotencyKey, key)
        )
      );
    if (receipt[0].affectedRows !== 1)
      throw new Error("Completamento ricevuta fallito");
    return { id };
  });
}
