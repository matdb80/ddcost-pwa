import { authedQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import { getImportCapabilities } from "./cycle-import-db-capabilities";
export const cycleImportCapabilityRouter = createRouter({
  get: authedQuery.query(() => getImportCapabilities(getDb())),
});
