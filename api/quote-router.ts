import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { quotes } from "@db/schema";

export const quoteRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const search = input.search?.trim();

      if (search) {
        const pattern = `%${search}%`;
        return db
          .select()
          .from(quotes)
          .where(
            sql`${quotes.client} LIKE ${pattern} OR ${quotes.reference} LIKE ${pattern}`
          )
          .orderBy(desc(quotes.createdAt))
          .limit(input.limit);
      }

      return db
        .select()
        .from(quotes)
        .orderBy(desc(quotes.createdAt))
        .limit(input.limit);
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(quotes)
        .where(eq(quotes.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),

  create: authedQuery
    .input(
      z.object({
        client: z.string().optional(),
        reference: z.string().optional(),
        targetTotal: z.string().optional(),
        totalBeforeRebalance: z.string().optional(),
        totalFinal: z.string().optional(),
        numProducts: z.number().optional(),
        generalNotes: z.string().optional(),
        clientNotes: z.string().optional(),
        supplierNotes: z.string().optional(),
        summary: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db.insert(quotes).values({
        userId: ctx.user.id,
        ...input,
        rootId: undefined,
        rev: 1,
      });
      const id = Number(result[0].insertId);
      await db
        .update(quotes)
        .set({ rootId: id })
        .where(eq(quotes.id, id));
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        client: z.string().optional(),
        reference: z.string().optional(),
        targetTotal: z.string().optional(),
        totalBeforeRebalance: z.string().optional(),
        totalFinal: z.string().optional(),
        numProducts: z.number().optional(),
        generalNotes: z.string().optional(),
        clientNotes: z.string().optional(),
        supplierNotes: z.string().optional(),
        summary: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db
        .update(quotes)
        .set(data)
        .where(and(eq(quotes.id, id), eq(quotes.userId, ctx.user.id)));
      return { ok: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(quotes)
        .where(
          and(eq(quotes.id, input.id), eq(quotes.userId, ctx.user.id))
        );
      return { ok: true };
    }),

  createRevision: authedQuery
    .input(z.object({ rootId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.rootId, input.rootId),
            eq(quotes.userId, ctx.user.id)
          )
        )
        .orderBy(desc(quotes.rev))
        .limit(1);

      const latest = rows[0];
      if (!latest) throw new Error("Quote not found");

      const newRev = (latest.rev ?? 1) + 1;
      const result = await db.insert(quotes).values({
        userId: ctx.user.id,
        rootId: input.rootId,
        rev: newRev,
        client: latest.client,
        reference: latest.reference,
        targetTotal: latest.targetTotal,
        totalBeforeRebalance: latest.totalBeforeRebalance,
        totalFinal: latest.totalFinal,
        numProducts: latest.numProducts,
        generalNotes: latest.generalNotes,
        clientNotes: latest.clientNotes,
        supplierNotes: latest.supplierNotes,
        summary: latest.summary,
        dataJson: latest.dataJson,
      });

      return { id: Number(result[0].insertId), rev: newRev };
    }),
});
