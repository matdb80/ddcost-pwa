import { z } from "zod";
import { eq, desc, sql, count, and } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { cycles } from "@db/schema";

export const cycleRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(25),
        includeDeleted: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const search = input.search?.trim();
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (!input.includeDeleted) {
        conditions.push(eq(cycles.deleted, 0));
      }
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          sql`(${cycles.code} LIKE ${pattern} OR ${cycles.description} LIKE ${pattern} OR ${cycles.client} LIKE ${pattern})`
        );
      }

      const whereClause = conditions.length ? and(...conditions) : undefined;

      const totalRows = await db
        .select({ value: count() })
        .from(cycles)
        .where(whereClause);
      const total = totalRows[0]?.value ?? 0;

      const items = await db
        .select()
        .from(cycles)
        .where(whereClause)
        .orderBy(desc(cycles.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      return { items, total, page: input.page, pageSize: input.pageSize };
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(cycles)
        .where(eq(cycles.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),

  create: authedQuery
    .input(
      z.object({
        code: z.string().optional(),
        description: z.string().optional(),
        client: z.string().optional(),
        lot: z.string().optional(),
        standardCost: z.string().optional(),
        minimumPrice: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db.insert(cycles).values({
        userId: ctx.user.id,
        code: input.code,
        description: input.description,
        client: input.client,
        lot: input.lot,
        standardCost: input.standardCost,
        minimumPrice: input.minimumPrice,
        dataJson: input.dataJson,
        rootId: undefined,
        rev: 1,
      });
      const id = Number(result[0].insertId);
      await db.update(cycles).set({ rootId: id }).where(eq(cycles.id, id));
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        code: z.string().optional(),
        description: z.string().optional(),
        client: z.string().optional(),
        lot: z.string().optional(),
        standardCost: z.string().optional(),
        minimumPrice: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db
        .update(cycles)
        .set(data)
        .where(eq(cycles.id, id));
      return { ok: true };
    }),

  /** Soft-delete: mark with dedicated columns (never touch dataJson) */
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(cycles)
        .set({ deleted: 1, deletedAt: new Date() })
        .where(
          and(eq(cycles.id, input.id), eq(cycles.userId, ctx.user.id))
        );
      return { ok: true };
    }),

  /** Restore soft-deleted cycle */
  restore: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(cycles)
        .set({ deleted: 0, deletedAt: null })
        .where(
          and(eq(cycles.id, input.id), eq(cycles.userId, ctx.user.id))
        );
      return { ok: true };
    }),

  createRevision: authedQuery
    .input(
      z.object({
        rootId: z.number(),
        code: z.string().optional(),
        description: z.string().optional(),
        client: z.string().optional(),
        lot: z.string().optional(),
        standardCost: z.string().optional(),
        minimumPrice: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Find latest revision by rootId
      const rows = await db
        .select()
        .from(cycles)
        .where(
          and(
            eq(cycles.rootId, input.rootId),
            eq(cycles.userId, ctx.user.id)
          )
        )
        .orderBy(desc(cycles.rev))
        .limit(1);

      let latest = rows[0];

      // Handle orphaned cycles (rootId points to non-existent row)
      if (!latest) {
        const selfRows = await db
          .select()
          .from(cycles)
          .where(
            and(
              eq(cycles.id, input.rootId),
              eq(cycles.userId, ctx.user.id)
            )
          )
          .limit(1);
        if (selfRows[0]) {
          latest = selfRows[0];
        } else {
          throw new Error("Cycle not found");
        }
      }

      const newRev = (latest.rev ?? 1) + 1;

      // Merge new data over latest; ensure rootId and rev are consistent
      let mergedDataJson = latest.dataJson;
      if (input.dataJson) {
        try {
          const base = latest.dataJson ? JSON.parse(latest.dataJson) : {};
          const override = JSON.parse(input.dataJson);
          mergedDataJson = JSON.stringify({
            ...base,
            ...override,
            rootId: input.rootId,
            root_id: input.rootId,
            rev: newRev,
          });
        } catch {
          mergedDataJson = input.dataJson;
        }
      } else if (latest.dataJson) {
        try {
          const base = JSON.parse(latest.dataJson);
          mergedDataJson = JSON.stringify({
            ...base,
            rootId: input.rootId,
            root_id: input.rootId,
            rev: newRev,
          });
        } catch {
          mergedDataJson = latest.dataJson;
        }
      }

      const result = await db.insert(cycles).values({
        userId: ctx.user.id,
        rootId: input.rootId,
        rev: newRev,
        code: input.code ?? latest.code,
        description: input.description ?? latest.description,
        client: input.client ?? latest.client,
        lot: input.lot ?? latest.lot,
        standardCost: input.standardCost ?? latest.standardCost,
        minimumPrice: input.minimumPrice ?? latest.minimumPrice,
        dataJson: mergedDataJson,
      });

      return { id: Number(result[0].insertId), rev: newRev, rootId: input.rootId };
    }),
});
