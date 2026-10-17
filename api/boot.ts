import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import {
  createMicrosoftLoginHandler,
  createMicrosoftCallbackHandler,
} from "./ms-auth";
import { runDbDiagnostics } from "./db-check";
import { migrateStagingCycles } from "./staging-cycle-migration";
import { migrateStagingFeedback } from "./staging-feedback-migration";
import { migrateStagingFeedbackExports } from "./staging-feedback-export-migration";
import { migrateStagingProductGroups } from "./staging-product-group-migration";
import { migrateStagingCycleCapacity } from "./staging-cycle-capacity-migration";
import { downloadBackup } from "./backup";
import { previewLegacyImport, commitLegacyImport } from "./legacy-import";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Microsoft Entra ID OAuth routes
app.get("/api/auth/microsoft/login", createMicrosoftLoginHandler());
app.get("/api/auth/microsoft/callback", createMicrosoftCallbackHandler());

// Authenticated, read-only download of a complete DDCost logical backup.
app.get("/api/backup/download", downloadBackup);

// Admin-only historical SQLite migration (upload SHA-256 allowlisted).
app.post("/api/legacy-import/preview", previewLegacyImport);
app.post("/api/legacy-import/commit", commitLegacyImport);

// tRPC API
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  if (process.env.DDCOST_STAGING_MIGRATE_SOFT_DELETE === "1") {
    await migrateStagingCycles();
  }

  if (process.env.DDCOST_STAGING_MIGRATE_FEEDBACK === "1") {
    await migrateStagingFeedback();
  }

  if (process.env.DDCOST_STAGING_MIGRATE_FEEDBACK_EXPORTS === "1") {
    await migrateStagingFeedbackExports();
  }

  if (process.env.DDCOST_STAGING_MIGRATE_PRODUCT_GROUPS === "1") {
    await migrateStagingProductGroups();
  }

  if (process.env.DDCOST_STAGING_MIGRATE_CYCLE_CAPACITY === "1") {
    await migrateStagingCycleCapacity();
  }

  if (process.env.DB_DIAGNOSTICS === "1") {
    try {
      await runDbDiagnostics();
    } catch (diagErr: any) {
      console.log("[DDCost] Diagnostics error:", diagErr.code || "UNKNOWN");
    }
  }

  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
