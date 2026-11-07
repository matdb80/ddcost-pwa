import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, inArray } from "drizzle-orm";
import {
  cycleImportTemplates,
  cycleCreateReceipts,
  cycles,
  users,
} from "@db/schema";
import { adminQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import {
  readImportBackup,
  type RestoredTemplate,
  type RestoredReceipt,
} from "./cycle-import-backup-validation";
import {
  requireImportCapability,
  lockTemplateWrites,
} from "./cycle-import-db-capabilities";
import { stablePayloadHash } from "./cycle-idempotency";
const conflict = (message: string) =>
  new TRPCError({ code: "CONFLICT", message });
const equal = (old: object, incoming: object) =>
  stablePayloadHash(
    Object.fromEntries(
      Object.keys(incoming).map(k => [k, (old as Record<string, unknown>)[k]])
    )
  ) === stablePayloadHash(incoming);
export const cycleImportRestoreRouter = createRouter({
  restoreTemplates: adminQuery
    .input(
      z.strictObject({
        mode: z.enum(["merge", "replace"]),
        backup: z.unknown(),
        includeReceipts: z.boolean().default(true),
        dryRun: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      let data: ReturnType<typeof readImportBackup>;
      try {
        data = readImportBackup(input.backup);
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "Backup non valido",
        });
      }
      const receipts = input.includeReceipts ? data.receipts : undefined;
      // Absent optional tables in an old backup are never interpreted as empty.
      if (data.templates === undefined && receipts === undefined)
        return { restored: 0, receiptsRestored: 0, skipped: true };
      const db = getDb();
      if (data.templates !== undefined)
        await requireImportCapability(db, "templates");
      if (receipts !== undefined) await requireImportCapability(db, "receipts");
      return db.transaction(async tx => {
        await lockTemplateWrites(tx);
        const owners = await tx
          .select({ id: users.id })
          .from(users)
          .orderBy(asc(users.id))
          .for("update");
        const knownUsers = new Set(owners.map(u => Number(u.id)));
        if (
          data.templates?.some(
            r =>
              !knownUsers.has(r.createdBy) ||
              (r.validatedBy !== null && !knownUsers.has(r.validatedBy))
          ) ||
          receipts?.some(r => !knownUsers.has(r.userId))
        )
          throw conflict("Utenti del backup non presenti nella destinazione");
        let templatesToDelete = 0;
        const additions: RestoredTemplate[] = [];
        if (data.templates !== undefined) {
          const existing = await tx
            .select()
            .from(cycleImportTemplates)
            .for("update");
          if (input.mode === "replace") templatesToDelete = existing.length;
          for (const r of data.templates) {
            const old = existing.find(
              e =>
                e.id === r.id ||
                (e.rootId === r.rootId && e.version === r.version)
            );
            if (input.mode === "merge" && old) {
              if (!equal(old, r))
                throw conflict(
                  `Template ${r.id}: conflitto con la destinazione`
                );
            } else additions.push(r);
          }
        }
        const receiptAdditions: RestoredReceipt[] = [];
        if (receipts?.length) {
          const existing = await tx
            .select()
            .from(cycleCreateReceipts)
            .where(
              inArray(cycleCreateReceipts.userId, [
                ...new Set(receipts.map(r => r.userId)),
              ])
            )
            .for("update");
          const targetCycles = await tx
            .select({ id: cycles.id, userId: cycles.userId, code: cycles.code })
            .from(cycles)
            .where(
              inArray(
                cycles.id,
                receipts.map(r => r.cycleId)
              )
            )
            .for("update");
          for (const r of receipts) {
            const cycle = targetCycles.find(
              c => Number(c.id) === r.cycleId && Number(c.userId) === r.userId
            );
            if (!cycle)
              throw conflict(
                `Ricevuta ${r.id}: ciclo/utente di destinazione discordante`
              );
            // A receipt records the original create request; later cycle edits may change its code.
            const old = existing.find(
              e =>
                e.id === r.id ||
                (e.userId === r.userId &&
                  (e.idempotencyKey === r.idempotencyKey ||
                    (r.normalizedCode !== null &&
                      e.normalizedCode === r.normalizedCode)))
            );
            if (old) {
              if (!equal(old, r))
                throw conflict(
                  `Ricevuta ${r.id}: conflitto con la destinazione`
                );
            } else receiptAdditions.push(r);
          }
        }
        if (input.dryRun)
          return {
            restored: 0,
            receiptsRestored: 0,
            skipped: false,
            preview: {
              templatesToInsert: additions.length,
              templatesToDelete,
              receiptsToInsert: receiptAdditions.length,
            },
          };
        // All shape, integrity, references and collision checks precede mutations.
        if (data.templates !== undefined && input.mode === "replace")
          await tx.delete(cycleImportTemplates);
        for (const r of additions.sort(
          (a, b) => a.rootId - b.rootId || a.version - b.version
        ))
          await tx.insert(cycleImportTemplates).values(r);
        // Receipt history is append-only, even when template mode is replace.
        for (const r of receiptAdditions)
          await tx.insert(cycleCreateReceipts).values(r);
        return {
          restored: additions.length,
          receiptsRestored: receiptAdditions.length,
          skipped: false,
        };
      });
    }),
});
