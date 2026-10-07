import { authRouter } from "./auth-router";
import { cycleRouter } from "./cycle-router";
import { quoteRouter } from "./quote-router";
import { simulationRouter } from "./simulation-router";
import { offerRouter } from "./offer-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  cycle: cycleRouter,
  quote: quoteRouter,
  simulation: simulationRouter,
  offer: offerRouter,
});

export type AppRouter = typeof appRouter;
