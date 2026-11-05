import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { productGroups } from "@db/schema";

export const productGroupRouter = createRouter({
  list: authedQuery.query(async () => {
    const db = getDb();
    return db.select({ id: productGroups.id, name: productGroups.name })
      .from(productGroups).orderBy(asc(productGroups.name));
  }),
  create: authedQuery.input(z.object({ name: z.string().min(2).max(120) }))
    .mutation(async ({ctx,input}) => {
      const name = input.name.trim().replace(/\s+/g, " ");
      if (name.length < 2) throw new Error("Nome troppo breve");
      const db = getDb();
      const existing = await db.select({ id: productGroups.id, name: productGroups.name })
        .from(productGroups).where(eq(productGroups.name,name)).limit(1);
      if (existing[0]) return existing[0];
      try {
        const result = await db.insert(productGroups).values({ name, createdBy: ctx.user.id });
        return { id:Number(result[0].insertId), name };
      } catch (error) {
        const again = await db.select({ id: productGroups.id, name: productGroups.name })
          .from(productGroups).where(eq(productGroups.name,name)).limit(1);
        if (again[0]) return again[0];
        throw error;
      }
    }),
});
