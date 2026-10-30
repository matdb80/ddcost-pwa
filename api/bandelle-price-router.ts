import { z } from "zod";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { readBandellePrices, listBandellePriceHistory, saveBandellePrices } from "./bandelle-price-store";
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);
export const bandellePriceRouter = createRouter({
  get: authedQuery.query(() => readBandellePrices()),
  history: adminQuery.query(() => listBandellePriceHistory()),
  save: adminQuery.input(z.object({
    expectedRevision: revision,
    operations: z.array(z.object({ cellIds: z.array(z.string().max(100)).min(1).max(2000), basisPoints: z.number().int().min(-9999).max(100000) })).min(1).max(50),
  })).mutation(({ input, ctx }) => saveBandellePrices(input, { id: ctx.user.id, name: ctx.user.name ?? ctx.user.email ?? "Amministratore" })),
  restore: adminQuery.input(z.object({ expectedRevision: revision, restoreRevision: revision }))
    .mutation(({ input, ctx }) => saveBandellePrices(input, { id: ctx.user.id, name: ctx.user.name ?? ctx.user.email ?? "Amministratore" })),
});
