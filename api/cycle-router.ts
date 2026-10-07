import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { cycles } from "@db/schema";

export const cycleRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const search = input.search?.trim();

      if (search) {
        const pattern = `%${search}%`;
        return db
          .select()
          .from(cycles)
          .where(
            and(
              eq(cycles.userId, userId),
              sql`${cycles.code} LIKE ${pattern} OR ${cycles.description} LIKE ${pattern} OR ${cycles.client} LIKE ${pattern}`
            )
          )
          .orderBy(desc(cycles.createdAt))
          .limit(input.limit);
      }

      return db
        .select()
        .from(cycles)
        .where(eq(cycles.userId, userId))
        .orderBy(desc(cycles.createdAt))
        .limit(input.limit);
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(cycles)
        .where(
          and(eq(cycles.id, input.id), eq(cycles.userId, ctx.user.id))
        )
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
        rootId: undefined, // will be set to id after insert
        rev: 1,
      });
      const id = Number(result[0].insertId);
      // Update rootId to self
      await db
        .update(cycles)
        .set({ rootId: id })
        .where(eq(cycles.id, id));
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
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db
        .update(cycles)
        .set(data)
        .where(and(eq(cycles.id, id), eq(cycles.userId, ctx.user.id)));
      return { ok: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(cycles)
        .where(
          and(eq(cycles.id, input.id), eq(cycles.userId, ctx.user.id))
        );
      return { ok: true };
    }),

  createRevision: authedQuery
    .input(z.object({ rootId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // Find latest revision
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

      const latest = rows[0];
      if (!latest) throw new Error("Cycle not found");

      const newRev = (latest.rev ?? 1) + 1;
      const result = await db.insert(cycles).values({
        userId: ctx.user.id,
        rootId: input.rootId,
        rev: newRev,
        code: latest.code,
        description: latest.description,
        client: latest.client,
        lot: latest.lot,
        standardCost: latest.standardCost,
        minimumPrice: latest.minimumPrice,
        dataJson: latest.dataJson,
      });

      return { id: Number(result[0].insertId), rev: newRev };
    }),
});
