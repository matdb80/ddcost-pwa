import { isDeepStrictEqual } from "node:util";
import {
  requireImportCapability,
  lockTemplateWrites,
} from "./cycle-import-db-capabilities";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { cycleImportTemplates } from "@db/schema";
import { authedQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import {
  saveTemplateSchema,
  templateDefinitionSchema,
} from "../src/lib/excel-import-template-schema";

function duplicateKey(error: unknown): boolean {
  let current = error;
  for (
    let depth = 0;
    depth < 4 && current && typeof current === "object";
    depth++
  ) {
    const e = current as { code?: unknown; errno?: unknown; cause?: unknown };
    if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) return true;
    current = e.cause;
  }
  return false;
}
function insertedId(result: { insertId: number }): number {
  const id = Number(result.insertId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Identificatore template non valido",
    });
  return id;
}
export const cycleImportTemplateRouter = createRouter({
  listApproved: authedQuery.query(async () => {
    const db = getDb();
    await requireImportCapability(db, "templates");
    // Pick the newest approved revision of each root, while allowing a later draft to coexist.
    const rows = await db
      .select()
      .from(cycleImportTemplates)
      .where(eq(cycleImportTemplates.status, "approved"))
      .orderBy(
        desc(cycleImportTemplates.version),
        desc(cycleImportTemplates.id)
      );
    const seen = new Set<number>();
    return rows
      .filter(row => {
        if (row.rootId === null || seen.has(row.rootId)) return false;
        seen.add(row.rootId);
        return true;
      })
      .map(row => {
        try {
          const definition = templateDefinitionSchema.parse(
            JSON.parse(row.definitionJson)
          );
          const verifiedCases = JSON.parse(row.verifiedCasesJson);
          saveTemplateSchema.parse({
            name: row.name,
            status: row.status,
            definition,
            verifiedCases,
          });
          if (!row.validatedBy || !row.validatedAt)
            throw new Error("Convalida assente");
          return { ...row, definition };
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Template ${row.id}: dati di convalida non validi`,
          });
        }
      });
  }),
  list: authedQuery.query(async () => {
    const db = getDb();
    await requireImportCapability(db, "templates");
    return db
      .select()
      .from(cycleImportTemplates)
      .orderBy(desc(cycleImportTemplates.updatedAt));
  }),
  save: authedQuery
    .input(saveTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await requireImportCapability(db, "templates");
      try {
        return await db.transaction(async tx => {
          await lockTemplateWrites(tx);
          const values = {
            name: input.name,
            family: input.definition.family,
            status: input.status,
            definitionJson: JSON.stringify(input.definition),
            verifiedCasesJson: JSON.stringify(input.verifiedCases),
            createdBy: ctx.user.id,
            validatedBy: input.status !== "draft" ? ctx.user.id : null,
            validatedAt: input.status !== "draft" ? new Date() : null,
          };
          if (
            input.definition.f3Profile &&
            input.rootId === undefined &&
            input.status !== "draft"
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Salvare prima la bozza del template F3",
            });
          if (input.rootId === undefined) {
            const r = await tx
              .insert(cycleImportTemplates)
              .values({ ...values, rootId: null, version: 1 });
            const id = insertedId(r[0]);
            const update = await tx
              .update(cycleImportTemplates)
              .set({ rootId: id })
              .where(
                and(
                  eq(cycleImportTemplates.id, id),
                  sql`${cycleImportTemplates.rootId} is null`
                )
              );
            if (update[0].affectedRows !== 1)
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Radice template non inizializzata",
              });
            return { id, rootId: id, version: 1 };
          }
          const roots = await tx
            .select()
            .from(cycleImportTemplates)
            .where(eq(cycleImportTemplates.id, input.rootId))
            .limit(1)
            .for("update");
          if (
            !roots[0] ||
            roots[0].rootId !== input.rootId ||
            Number(roots[0].version) !== 1
          )
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Radice template inesistente o non canonica",
            });
          const latest = await tx
            .select()
            .from(cycleImportTemplates)
            .where(eq(cycleImportTemplates.rootId, input.rootId))
            .orderBy(desc(cycleImportTemplates.version))
            .limit(1);
          if (!latest[0] || Number(latest[0].version) !== input.expectedVersion)
            throw new TRPCError({
              code: "CONFLICT",
              message: "Il template è stato aggiornato da un altro utente",
            });
          if (input.definition.f3Profile && input.status === "approved") {
            if (
              latest[0].status !== "tested" ||
              !isDeepStrictEqual(
                JSON.parse(latest[0].definitionJson),
                input.definition
              ) ||
              !isDeepStrictEqual(
                JSON.parse(latest[0].verifiedCasesJson),
                input.verifiedCases
              )
            )
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message:
                  "Approvazione richiede la stessa definizione/casi della versione tested corrente",
              });
          }
          const version = input.expectedVersion! + 1;
          if (!Number.isSafeInteger(version))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Versione template non valida",
            });
          const r = await tx
            .insert(cycleImportTemplates)
            .values({ ...values, rootId: input.rootId, version });
          return { id: insertedId(r[0]), rootId: input.rootId, version };
        });
      } catch (error) {
        if (duplicateKey(error))
          throw new TRPCError({
            code: "CONFLICT",
            message: "Conflitto di versione template",
          });
        throw error;
      }
    }),
});
