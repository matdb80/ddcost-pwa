import { authRouter } from "./auth-router";
import { cycleRouter } from "./cycle-router";
import { quoteRouter } from "./quote-router";
import { simulationRouter } from "./simulation-router";
import { offerRouter } from "./offer-router";
import { feedbackRouter } from "./feedback-router";
import { productGroupRouter } from "./product-group-router";
import { bandellePriceRouter } from "./bandelle-price-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  cycle: cycleRouter,
  quote: quoteRouter,
  simulation: simulationRouter,
  offer: offerRouter,
  feedback: feedbackRouter,
  productGroup: productGroupRouter,
  bandellePrice: bandellePriceRouter,
});

export type AppRouter = typeof appRouter;
