import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { cycleSimulations } from "@db/schema";

export const simulationRouter = createRouter({
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
          .from(cycleSimulations)
          .where(
            and(
              eq(cycleSimulations.userId, userId),
              sql`${cycleSimulations.name} LIKE ${pattern} OR ${cycleSimulations.code} LIKE ${pattern} OR ${cycleSimulations.description} LIKE ${pattern} OR ${cycleSimulations.client} LIKE ${pattern}`
            )
          )
          .orderBy(desc(cycleSimulations.createdAt))
          .limit(input.limit);
      }

      return db
        .select()
        .from(cycleSimulations)
        .where(eq(cycleSimulations.userId, userId))
        .orderBy(desc(cycleSimulations.createdAt))
        .limit(input.limit);
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(cycleSimulations)
        .where(
          and(
            eq(cycleSimulations.id, input.id),
            eq(cycleSimulations.userId, ctx.user.id)
          )
        )
        .limit(1);
      return rows[0] ?? null;
    }),

  create: authedQuery
    .input(
      z.object({
        name: z.string(),
        code: z.string().optional(),
        description: z.string().optional(),
        client: z.string().optional(),
        sourceRootId: z.number().optional(),
        sourceRev: z.number().optional(),
        standardCost: z.string().optional(),
        minimumPrice: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db.insert(cycleSimulations).values({
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
        code: z.string().optional(),
        description: z.string().optional(),
        client: z.string().optional(),
        sourceRootId: z.number().optional(),
        sourceRev: z.number().optional(),
        standardCost: z.string().optional(),
        minimumPrice: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db
        .update(cycleSimulations)
        .set(data)
        .where(
          and(
            eq(cycleSimulations.id, id),
            eq(cycleSimulations.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(cycleSimulations)
        .where(
          and(
            eq(cycleSimulations.id, input.id),
            eq(cycleSimulations.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),
});
