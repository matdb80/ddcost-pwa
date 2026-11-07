import {salesRouter} from "./sales-router";
import { authRouter } from "./auth-router";
import { cycleRouter } from "./cycle-router";
import { cycleImportTemplateRouter } from "./cycle-import-template-router";
import { cycleImportCapabilityRouter } from "./cycle-import-capability-router";
import { cycleImportRestoreRouter } from "./cycle-import-restore-router";
import { quoteRouter } from "./quote-router";
import { simulationRouter } from "./simulation-router";
import { offerRouter } from "./offer-router";
import { feedbackRouter } from "./feedback-router";
import { productGroupRouter } from "./product-group-router";
import { bandellePriceRouter } from "./bandelle-price-router";
import { bandelleTPriceRouter } from "./bandelle-t-price-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  sales: salesRouter,
  cycle: cycleRouter,
  cycleImportTemplate: cycleImportTemplateRouter,
  cycleImportCapability: cycleImportCapabilityRouter,
  cycleImportRestore: cycleImportRestoreRouter,
  quote: quoteRouter,
  simulation: simulationRouter,
  offer: offerRouter,
  feedback: feedbackRouter,
  productGroup: productGroupRouter,
  bandellePrice: bandellePriceRouter,
  bandelleTPrice: bandelleTPriceRouter,
});

export type AppRouter = typeof appRouter;
