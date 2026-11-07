import { createHash } from "node:crypto";
import { z } from "zod";
import {
  saveTemplateSchema,
  templateDefinitionSchema,
} from "../src/lib/excel-import-template-schema";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const id = z
  .union([z.number(), z.string().regex(/^[1-9][0-9]*$/)])
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const date = z
  .union([z.date(), z.string()])
  .transform(v =>
    typeof v === "string"
      ? new Date(v.includes("T") ? v : v.replace(" ", "T") + "Z")
      : v
  )
  .pipe(z.date());
const templateRow = z.strictObject({
  id,
  rootId: id,
  version: id,
  name: z.string().min(1).max(255),
  family: z.string().max(64),
  status: z.enum(["draft", "tested", "approved"]),
  definitionJson: z.string().max(262144),
  verifiedCasesJson: z.string().max(10000),
  createdBy: id,
  validatedBy: id.nullable(),
  validatedAt: date.nullable(),
  createdAt: date,
  updatedAt: date.optional(),
});
const receiptRow = z.strictObject({
  id,
  userId: id,
  idempotencyKey: z.string().min(16).max(64),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  cycleId: id,
  normalizedCode: z.string().min(1).max(255).nullable(),
  status: z.literal("completed"),
  createdAt: date,
  updatedAt: date,
});
export type RestoredTemplate = z.infer<typeof templateRow>;
export type RestoredReceipt = z.infer<typeof receiptRow>;
export function readImportBackup(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Backup non valido");
  const { checksumSha256, ...payload } = value as Record<string, unknown>;
  if (JSON.stringify(value).length > 50 * 1024 * 1024)
    throw new Error("Backup oltre il limite");
  if (
    payload.format !== "ddcost-tidb-logical-backup" ||
    payload.formatVersion !== 1
  )
    throw new Error("Formato/versione backup non supportati");
  if (typeof checksumSha256 !== "string" || digest(payload) !== checksumSha256)
    throw new Error("Checksum globale non valido");
  const tables = payload.tables;
  if (
    !Array.isArray(tables) ||
    tables.some(t => typeof t !== "string") ||
    new Set(tables).size !== tables.length
  )
    throw new Error("Inventario tabelle non valido");
  const records = payload.records as Record<string, unknown>,
    counts = payload.rowCounts as Record<string, unknown>,
    checksums = payload.tableChecksums as Record<string, unknown>,
    ddl = payload.tableDefinitions as Record<string, unknown>;
  if (!records || !counts || !checksums || !ddl)
    throw new Error("Metadati backup mancanti");
  for (const table of tables) {
    if (
      !Array.isArray(records[table]) ||
      records[table].length !== counts[table]
    )
      throw new Error(`Conteggio non valido: ${table}`);
    if (digest(records[table]) !== checksums[table])
      throw new Error(`Checksum tabella non valido: ${table}`);
    if (typeof ddl[table] !== "string" || !ddl[table])
      throw new Error(`DDL mancante: ${table}`);
  }
  const templates = tables.includes("cycle_import_templates")
    ? z
        .array(templateRow)
        .max(5000)
        .parse(records.cycle_import_templates)
        .map(r => ({ ...r, updatedAt: r.updatedAt ?? r.createdAt }))
    : undefined;
  if (templates) {
    if (
      new Set(templates.map(r => r.id)).size !== templates.length ||
      new Set(templates.map(r => `${r.rootId}:${r.version}`)).size !==
        templates.length
    )
      throw new Error("Identità/versioni template duplicate");
    const roots = new Map(
      templates
        .filter(r => r.version === 1 && r.id === r.rootId)
        .map(r => [r.id, r])
    );
    for (const r of templates) {
      const root = roots.get(r.rootId);
      if (!root || (r.version === 1 && r.id !== r.rootId))
        throw new Error("Radice template non canonica");
      const definition = templateDefinitionSchema.parse(
        JSON.parse(r.definitionJson)
      );
      saveTemplateSchema.parse({
        name: r.name,
        status: r.status,
        definition,
        verifiedCases: JSON.parse(r.verifiedCasesJson),
      });
      if (r.family !== definition.family || r.family !== root.family)
        throw new Error("Famiglia template discordante");
      if (r.status !== "draft" && (!r.validatedBy || !r.validatedAt))
        throw new Error("Template senza validatore/data");
    }
  }
  const receipts = tables.includes("cycle_create_receipts")
    ? z.array(receiptRow).max(5000).parse(records.cycle_create_receipts)
    : undefined;
  if (receipts) {
    const keys = receipts.map(r => `${r.userId}:${r.idempotencyKey}`),
      codes = receipts
        .filter(r => r.normalizedCode !== null)
        .map(r => `${r.userId}:${r.normalizedCode}`);
    if (
      new Set(receipts.map(r => r.id)).size !== receipts.length ||
      new Set(keys).size !== keys.length ||
      new Set(codes).size !== codes.length
    )
      throw new Error("Ricevute duplicate");
    if (
      receipts.some(
        r =>
          r.normalizedCode !== null &&
          r.normalizedCode !== r.normalizedCode.trim().toUpperCase()
      )
    )
      throw new Error("Codice ricevuta non normalizzato");
  }
  return { templates, receipts };
}
