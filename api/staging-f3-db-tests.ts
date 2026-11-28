/** Real database probes, invoked only by the guarded pre-listen staging release task.
 * Uses synthetic records, actual tRPC procedures and the application DB pool.
 * This is not an HTTP, OAuth, workbook or browser end-to-end test.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Connection } from "mysql2/promise";
import { eq } from "drizzle-orm";
import { users } from "@db/schema";
import type { TemplateDefinition } from "../src/types/excel-import";
import { getDb } from "./queries/connection";
import { cycleRouter } from "./cycle-router";
import { cycleImportTemplateRouter } from "./cycle-import-template-router";
import { cycleImportRestoreRouter } from "./cycle-import-restore-router";
import { collectLogicalBackup } from "./backup";
import { readImportBackup } from "./cycle-import-backup-validation";
import { assertF3StagingTarget } from "./staging-f3-release";

const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
function ensure(value: unknown, name: string): asserts value {
  if (!value) throw new Error(`[F3 release] FAIL ${name}`);
}
async function rejects(call: () => Promise<unknown>, code: string, name: string) {
  try { await call(); }
  catch (error) {
    ensure((error as { code?: string }).code === code, `${name}: expected rejection code`);
    return;
  }
  throw new Error(`[F3 release] FAIL ${name}: accepted unexpectedly`);
}

export async function runStagingF3DbTests(connection: Connection) {
  assertF3StagingTarget(process.env);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  ensure(user, "existing admin required");
  const ctx = { req: new Request("https://ddcost-collaudo.onrender.com/internal-release-test"), resHeaders: new Headers(), user };
  const cycle = cycleRouter.createCaller(ctx);
  const template = cycleImportTemplateRouter.createCaller(ctx);
  const restore = cycleImportRestoreRouter.createCaller(ctx);
  const tag = `__F3_RELEASE_${randomUUID()}`;
  const key = randomUUID(), otherKey = randomUUID(), noCodeKey = randomUUID();
  const payload = { code: tag, description: "Temporary synthetic F3 database test", lot: "200",
    standardCost: "0.299948789833887", minimumPrice: "0.4", dataJson: JSON.stringify({ righe: [], test: tag }), idempotencyKey: key };
  const testHash = digest({ synthetic: tag });
  const definition: TemplateDefinition = {
    schemaVersion: 2, family: "F3-LETTERS", name: tag,
    signature: [{ normalized: "codice", relativeRow: 0, relativeColumn: 0 }, { normalized: "descrizione", relativeRow: 0, relativeColumn: 1 }],
    products: [{ key: "synthetic", label: "Synthetic DB test", startAnchor: ["codice"], optional: false,
      rowRules: [{ fromRow: 4, toRow: 4, kind: "cost", mappings: [{ target: "descrizione", sourceColumn: 2, transform: "text", required: true }] }] }],
    exclusionLabels: [], verifiedCaseHashes: [testHash],
    f3Profile: { engineRevision: 1, structure: "synthetic-db-test", bindings: [] },
  };
  const templateInput = { name: tag, definition, verifiedCases: [testHash] };
  const pass = (name: string) => console.log(`[F3 release] PASS ${name}`);
  const start = (name: string) => console.log(`[F3 release] RUN ${name}`);
  try {
    start("simultaneous create and reopen");
    const results = await Promise.allSettled([cycle.create(payload), cycle.create(payload)]);
    ensure(results.every(r => r.status === "fulfilled"), "concurrent create");
    const ids = results.map(r => r.status === "fulfilled" ? r.value.id : -1);
    ensure(ids[0] === ids[1], "same request returns one cycle id");
    const opened = await cycle.get({ id: ids[0] });
    ensure(opened?.code === tag && opened.dataJson === payload.dataJson && Number(opened.rootId) === ids[0]
      && Number(opened.standardCost) === Number(payload.standardCost), "cycle round trip");
    await rejects(() => cycle.create({ ...payload, description: "changed" }), "CONFLICT", "changed payload");
    await rejects(() => cycle.create({ ...payload, code: ` ${tag.toLowerCase()} `, idempotencyKey: otherKey }), "CONFLICT", "duplicate normalized code");
    // Empty-code cycles have a distinct idempotency key and no unique code reservation.
    const noCode = await cycle.create({ ...payload, code: undefined, idempotencyKey: noCodeKey });
    ensure(noCode.id !== ids[0], "independent code-free request");
    pass("server idempotency, concurrent duplicate, changed payload, code conflict, save/reopen");

    start("template lifecycle and competing versions");
    const draft = await template.save({ ...templateInput, status: "draft" });
    await rejects(() => template.save({ ...templateInput, status: "approved", rootId: draft.rootId, expectedVersion: 1 }), "PRECONDITION_FAILED", "draft cannot skip tested");
    const tested = await template.save({ ...templateInput, status: "tested", rootId: draft.rootId, expectedVersion: 1 });
    await rejects(() => template.save({ ...templateInput, definition: { ...definition, exclusionLabels: ["changed"] },
      status: "approved", rootId: draft.rootId, expectedVersion: tested.version }), "PRECONDITION_FAILED", "changed tested definition");
    const approved = await template.save({ ...templateInput, status: "approved", rootId: draft.rootId, expectedVersion: tested.version });
    const race = await Promise.allSettled([0, 1].map(() => template.save({ ...templateInput,
      status: "draft", rootId: draft.rootId, expectedVersion: approved.version })));
    ensure(race.filter(r => r.status === "fulfilled").length === 1
      && race.filter(r => r.status === "rejected" && r.reason?.code === "CONFLICT").length === 1, "optimistic version conflict");
    const approvedRows = await template.listApproved();
    ensure(approvedRows.some(r => r.id === approved.id && r.version === 3 && r.definition.f3Profile?.structure === definition.f3Profile?.structure),
      "approved revision remains available beside newer draft");
    pass("draft/tested/approved, changed-definition rejection, concurrent version conflict, approved read");

    start("actual backup collector and scoped restore");
    const backup = await collectLogicalBackup(connection);
    const validated = readImportBackup(backup);
    ensure(validated.templates?.length === 4 && validated.receipts?.length === 2, "backup includes F3 rows");
    ensure(validated.templates.every(r => r.name === tag) && validated.receipts.every(r => r.userId === user.id && (r.idempotencyKey === key || r.idempotencyKey === noCodeKey)), "synthetic ownership");
    const preview = await restore.restoreTemplates({ mode: "merge", backup, dryRun: true });
    ensure("preview" in preview && preview.preview.templatesToInsert === 0 && preview.preview.receiptsToInsert === 0, "restore dry-run existing");
    // Delete only this run's rows; cycles stay present as receipt referents.
    await connection.execute("DELETE FROM cycle_import_templates WHERE name=? AND createdBy=?", [tag, user.id]);
    await connection.execute("DELETE FROM cycle_create_receipts WHERE userId=? AND idempotencyKey IN (?,?)", [user.id, key, noCodeKey]);
    const missingPreview = await restore.restoreTemplates({ mode: "merge", backup, dryRun: true });
    ensure("preview" in missingPreview && missingPreview.preview.templatesToInsert === 4 && missingPreview.preview.receiptsToInsert === 2, "restore dry-run missing");
    await rejects(() => cycle.create({ ...payload, idempotencyKey: otherKey }), "CONFLICT", "legacy cycle without receipt still protects code");
    const restored = await restore.restoreTemplates({ mode: "merge", backup });
    ensure(restored.restored === 4 && restored.receiptsRestored === 2, "restore inserted exact rows");
    const after = await collectLogicalBackup(connection);
    ensure(backup.tableChecksums.cycle_import_templates === after.tableChecksums.cycle_import_templates
      && backup.tableChecksums.cycle_create_receipts === after.tableChecksums.cycle_create_receipts, "restored table hashes");
    const replay = await cycle.create(payload);
    ensure(replay.id === ids[0], "restored receipt prevents duplicate");
    const again = await restore.restoreTemplates({ mode: "merge", backup });
    ensure(again.restored === 0 && again.receiptsRestored === 0, "repeat restore is idempotent");
    const { checksumSha256: _oldChecksum, ...conflicting } = structuredClone(backup);
    conflicting.records.cycle_create_receipts[0].payloadHash = "a".repeat(64);
    conflicting.tableChecksums.cycle_create_receipts = digest(conflicting.records.cycle_create_receipts);
    await rejects(() => restore.restoreTemplates({ mode: "merge", backup: { ...conflicting, checksumSha256: digest(conflicting) } }), "CONFLICT", "receipt collision aborts restore");
    await rejects(() => restore.restoreTemplates({ mode: "merge", backup: { ...backup, checksumSha256: "0".repeat(64) } }), "BAD_REQUEST", "tampered backup");
    const { checksumSha256: _checksum, ...old } = structuredClone(backup);
    old.tables = old.tables.filter(t => t !== "cycle_import_templates" && t !== "cycle_create_receipts");
    for (const tableName of ["cycle_import_templates", "cycle_create_receipts"] as const) {
      delete (old.records as Partial<typeof old.records>)[tableName];
      delete (old.rowCounts as Partial<typeof old.rowCounts>)[tableName];
      delete (old.tableChecksums as Partial<typeof old.tableChecksums>)[tableName];
      delete (old.tableDefinitions as Partial<typeof old.tableDefinitions>)[tableName];
    }
    const skipped = await restore.restoreTemplates({ mode: "replace", backup: { ...old, checksumSha256: digest(old) } });
    ensure(skipped.skipped, "old backup leaves optional tables unchanged");
    const final = await collectLogicalBackup(connection);
    ensure(final.tableChecksums.cycle_import_templates === after.tableChecksums.cycle_import_templates
      && final.tableChecksums.cycle_create_receipts === after.tableChecksums.cycle_create_receipts, "rejected/old restore preserved tables");
    const denied = cycleImportRestoreRouter.createCaller({ ...ctx, user: { ...user, role: "user" } });
    await rejects(() => denied.restoreTemplates({ mode: "merge", backup }), "FORBIDDEN", "non-admin restore");
    pass("backup hashes, dry-run, actual merge restore, restored idempotency, legacy code guard, restore collision, tamper/non-admin rejection, old-backup skip");
  } finally {
    // No unscoped DELETE, TRUNCATE, replacement of business rows or reset of sequences.
    await connection.execute("DELETE FROM cycle_import_templates WHERE name=? AND createdBy=?", [tag, user.id]);
    await connection.execute("DELETE FROM cycle_create_receipts WHERE userId=? AND idempotencyKey IN (?,?,?)", [user.id, key, otherKey, noCodeKey]);
    await connection.execute("DELETE FROM cycles WHERE userId=? AND description=? AND dataJson=?", [user.id, payload.description, payload.dataJson]);
  }
}
