import { TRPCError } from "@trpc/server";
import { asc, sql } from "drizzle-orm";
import { users } from "@db/schema";
import type { getDb } from "./queries/connection";
type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const columns = {
  cycle_import_templates: [
    "id",
    "rootId",
    "version",
    "name",
    "family",
    "status",
    "definitionJson",
    "verifiedCasesJson",
    "createdBy",
    "validatedBy",
    "validatedAt",
    "createdAt",
    "updatedAt",
  ],
  cycle_create_receipts: [
    "id",
    "userId",
    "idempotencyKey",
    "payloadHash",
    "cycleId",
    "normalizedCode",
    "status",
    "createdAt",
    "updatedAt",
  ],
};
async function inspect(db: Database, table: keyof typeof columns) {
  const [rows] = await db.execute(
    sql`SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ${table}`
  );
  const found = new Set(
    (rows as unknown as Array<{ name: string }>).map(row => row.name)
  );
  return {
    present: found.size > 0,
    ready: columns[table].every(name => found.has(name)),
    missing: columns[table].filter(name => !found.has(name)),
  };
}
export async function getImportCapabilities(db: Database) {
  try {
    const templates = await inspect(db, "cycle_import_templates"),
      receipts = await inspect(db, "cycle_create_receipts");
    return {
      templatesTable: templates.present,
      idempotencyReceipts: receipts.present,
      templatesReady: templates.ready,
      idempotencyReady: receipts.ready,
      missingTemplateColumns: templates.missing,
      missingReceiptColumns: receipts.missing,
      inspectionFailed: false,
    };
  } catch {
    return {
      templatesTable: false,
      idempotencyReceipts: false,
      templatesReady: false,
      idempotencyReady: false,
      missingTemplateColumns: [] as string[],
      missingReceiptColumns: [] as string[],
      inspectionFailed: true,
    };
  }
}
export async function requireImportCapability(
  db: Database,
  kind: "templates" | "receipts"
) {
  const capability = await getImportCapabilities(db);
  if (capability.inspectionFailed)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Impossibile verificare lo schema importazione. Riprovare.",
    });
  if (
    !(kind === "templates"
      ? capability.templatesReady
      : capability.idempotencyReady)
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        kind === "templates"
          ? "Template non disponibili: completare le migrazioni 0004 e 0005."
          : "Salvataggio non disponibile: completare la migrazione 0006 delle ricevute.",
    });
}
// Shared lock for template save/restore. The first existing account is only
// locked, never modified. All template writers acquire this lock first.
export async function lockTemplateWrites(tx: Transaction) {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.id))
    .limit(1)
    .for("update");
  if (!rows[0])
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Archivio utenti non disponibile",
    });
}
