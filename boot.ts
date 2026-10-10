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

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Microsoft Entra ID OAuth routes
app.get("/api/auth/microsoft/login", createMicrosoftLoginHandler());
app.get("/api/auth/microsoft/callback", createMicrosoftCallbackHandler());

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
