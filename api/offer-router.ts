import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { commercialOffers } from "@db/schema";
import { withOfferNumberInJson } from "../src/lib/commercial-offer-number";
import { previewCommercialDocumentNumber, reserveCommercialDocumentNumber } from "./commercial-document-number";

export const offerRouter = createRouter({
  nextNumber: authedQuery.query(async () => {
    const db = getDb();
    return { number: await previewCommercialDocumentNumber(db) };
  }),

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
          .from(commercialOffers)
          .where(
            sql`${commercialOffers.name} LIKE ${pattern} OR ${commercialOffers.client} LIKE ${pattern} OR ${commercialOffers.reference} LIKE ${pattern}`
          )
          .orderBy(desc(commercialOffers.createdAt))
          .limit(input.limit);
      }

      return db
        .select()
        .from(commercialOffers)
        .orderBy(desc(commercialOffers.createdAt))
        .limit(input.limit);
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(commercialOffers)
        .where(eq(commercialOffers.id, input.id))
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
        /** false means name is the untouched preview and should use the assigned DB sequence. */
        numberEdited: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { numberEdited: _numberEdited, ...offer } = input;

      return db.transaction(async (tx) => {
        const name = await reserveCommercialDocumentNumber(tx);
        const result = await tx.insert(commercialOffers).values({
          userId: ctx.user.id,
          ...offer,
          // The locked shared counter assigns the document number independently of the row ID.
          name,
        });
        const id = Number(result[0].insertId);

        const dataJson = withOfferNumberInJson(offer.dataJson, name);
        await tx.update(commercialOffers).set({
          name,
          ...(dataJson === undefined ? {} : { dataJson }),
        }).where(eq(commercialOffers.id, id));
        return { id, name };
      });
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
