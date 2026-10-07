import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { commercialOffers } from "@db/schema";

export const offerRouter = createRouter({
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
          .from(commercialOffers)
          .where(
            and(
              eq(commercialOffers.userId, userId),
              sql`${commercialOffers.name} LIKE ${pattern} OR ${commercialOffers.client} LIKE ${pattern} OR ${commercialOffers.reference} LIKE ${pattern}`
            )
          )
          .orderBy(desc(commercialOffers.createdAt))
          .limit(input.limit);
      }

      return db
        .select()
        .from(commercialOffers)
        .where(eq(commercialOffers.userId, userId))
        .orderBy(desc(commercialOffers.createdAt))
        .limit(input.limit);
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(commercialOffers)
        .where(
          and(
            eq(commercialOffers.id, input.id),
            eq(commercialOffers.userId, ctx.user.id)
          )
        )
        .limit(1);
      return rows[0] ?? null;
    }),

  create: authedQuery
    .input(
      z.object({
        name: z.string().optional(),
        client: z.string().optional(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        numRows: z.number().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db.insert(commercialOffers).values({
        userId: ctx.user.id,
        ...input,
      });
      return { id: Number(result[0].insertId) };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        client: z.string().optional(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        numRows: z.number().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db
        .update(commercialOffers)
        .set(data)
        .where(
          and(
            eq(commercialOffers.id, id),
            eq(commercialOffers.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(commercialOffers)
        .where(
          and(
            eq(commercialOffers.id, input.id),
            eq(commercialOffers.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),
});
