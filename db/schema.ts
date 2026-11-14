import {
  mysqlTable,
  uniqueIndex,
  index,
  mysqlEnum,
  serial,
  varchar,
  text,
  mediumtext,
  timestamp,
  bigint,
  decimal,
  tinyint,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// DDCost - Cicli Standard
// ============================================================
export const cycles = mysqlTable("cycles", {
  id: serial("id").primaryKey(),
  rootId: bigint("rootId", { mode: "number", unsigned: true }),
  rev: bigint("rev", { mode: "number", unsigned: true }).default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  code: varchar("code", { length: 255 }),
  description: varchar("description", { length: 500 }),
  client: varchar("client", { length: 255 }),
  lot: varchar("lot", { length: 100 }),
  standardCost: decimal("standardCost", { precision: 30, scale: 18 }),
  minimumPrice: decimal("minimumPrice", { precision: 30, scale: 18 }),
  // Supports complex cycles with 40+ detailed rows; preserve all original JSON fields.
  dataJson: mediumtext("dataJson"),
  deleted: tinyint("deleted", { unsigned: true }).default(0),
  deletedAt: timestamp("deletedAt"),
});

export type Cycle = typeof cycles.$inferSelect;
export type InsertCycle = typeof cycles.$inferInsert;

// ============================================================
// DDCost - Simulazioni Cicli
// ============================================================
export const cycleSimulations = mysqlTable("cycle_simulations", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 255 }),
  description: varchar("description", { length: 500 }),
  client: varchar("client", { length: 255 }),
  sourceRootId: bigint("sourceRootId", { mode: "number", unsigned: true }),
  sourceRev: bigint("sourceRev", { mode: "number", unsigned: true }),
  standardCost: decimal("standardCost", { precision: 30, scale: 18 }),
  minimumPrice: decimal("minimumPrice", { precision: 30, scale: 18 }),
  dataJson: text("dataJson"),
});

export type CycleSimulation = typeof cycleSimulations.$inferSelect;
export type InsertCycleSimulation = typeof cycleSimulations.$inferInsert;

// Shared company product groups (new catalog, no changes to imported quotes).
export const productGroups = mysqlTable("product_groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ProductGroup = typeof productGroups.$inferSelect;

// Append-only shared Giotto Plus price snapshots; id is a consecutive revision.
export const bandellePriceRevisions = mysqlTable("bandelle_price_revisions", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey(),
  dataJson: mediumtext("dataJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: bigint("createdBy", { mode: "number", unsigned: true }),
  createdByName: varchar("createdByName", { length: 320 }).notNull(),
  description: text("description").notNull(),
  operationsJson: mediumtext("operationsJson").notNull(),
});

// Smeralda prices use integer thousandths of euro in their independent snapshots.
export const bandelleTPriceRevisions = mysqlTable("bandelle_t_price_revisions", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey(),
  dataJson: mediumtext("dataJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: bigint("createdBy", { mode: "number", unsigned: true }),
  createdByName: varchar("createdByName", { length: 320 }).notNull(),
  description: text("description").notNull(),
  operationsJson: mediumtext("operationsJson").notNull(),
});

// ============================================================
// DDCost - Preventivi Unatantum
// ============================================================
export const quotes = mysqlTable("quotes", {
  id: serial("id").primaryKey(),
  rootId: bigint("rootId", { mode: "number", unsigned: true }),
  rev: bigint("rev", { mode: "number", unsigned: true }).default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  client: varchar("client", { length: 255 }),
  reference: varchar("reference", { length: 255 }),
  targetTotal: decimal("targetTotal", { precision: 30, scale: 18 }),
  totalBeforeRebalance: decimal("totalBeforeRebalance", { precision: 30, scale: 18 }),
  totalFinal: decimal("totalFinal", { precision: 30, scale: 18 }),
  numProducts: bigint("numProducts", { mode: "number", unsigned: true }).default(0),
  generalNotes: text("generalNotes"),
  clientNotes: text("clientNotes"),
  supplierNotes: text("supplierNotes"),
  summary: text("summary"),
  dataJson: text("dataJson"),
});

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;

// ============================================================
// DDCost - Offerte Commerciali
// ============================================================
export const commercialOffers = mysqlTable("commercial_offers", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }),
  client: varchar("client", { length: 255 }),
  reference: varchar("reference", { length: 255 }),
  notes: text("notes"),
  numRows: bigint("numRows", { mode: "number", unsigned: true }).default(0),
  dataJson: text("dataJson"),
});

export type CommercialOffer = typeof commercialOffers.$inferSelect;
export type InsertCommercialOffer = typeof commercialOffers.$inferInsert;

// ============================================================
// DDCost - Registro Segnalazioni (Feedback System)
// ============================================================
export const feedbackTickets = mysqlTable("feedback_tickets", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  userName: varchar("userName", { length: 255 }),
  userEmail: varchar("userEmail", { length: 320 }),
  ticketNumber: varchar("ticketNumber", { length: 50 }).notNull().unique(),
  type: mysqlEnum("type", ["bug", "miglioramento", "nuova_funzione"]).notNull(),
  severity: mysqlEnum("severity", ["normale", "bloccante"]).notNull().default("normale"),
  status: mysqlEnum("status", [
    "nuova",
    "da_pianificare",
    "in_lavorazione",
    "risolta_collaudo",
    "rilasciata",
    "duplicata",
    "non_riproducibile",
  ]).notNull().default("nuova"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  pageRoute: varchar("pageRoute", { length: 255 }),
  buildVersion: varchar("buildVersion", { length: 100 }),
  cycleId: bigint("cycleId", { mode: "number", unsigned: true }),
  cycleRev: bigint("cycleRev", { mode: "number", unsigned: true }),
  technicalNote: text("technicalNote"),
  includeInReleaseCount: tinyint("includeInReleaseCount", { unsigned: true }).default(1),
});

export type FeedbackTicket = typeof feedbackTickets.$inferSelect;
export type InsertFeedbackTicket = typeof feedbackTickets.$inferInsert;

export const feedbackAttachments = mysqlTable("feedback_attachments", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  ticketId: bigint("ticketId", { mode: "number", unsigned: true }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  fileName: varchar("fileName", { length: 255 }),
  sizeBytes: bigint("sizeBytes", { mode: "number", unsigned: true }),
  dataBase64: mediumtext("dataBase64").notNull(),
});

// Append-only export receipts; separate from ticket resolution status.
export const feedbackExports = mysqlTable("feedback_exports", {
  id: serial("id").primaryKey(),
  ticketId: bigint("ticketId", { mode: "number", unsigned: true }).notNull(),
  exportedAt: timestamp("exportedAt").defaultNow().notNull(),
  batchId: varchar("batchId", { length: 64 }).notNull(),
  format: mysqlEnum("format", ["json", "markdown"]).notNull(),
  source: mysqlEnum("source", ["ui", "legacy"]).notNull().default("ui"),
});
export type FeedbackExport = typeof feedbackExports.$inferSelect;

export type FeedbackAttachment = typeof feedbackAttachments.$inferSelect;
export type InsertFeedbackAttachment = typeof feedbackAttachments.$inferInsert;

export const feedbackSettings = mysqlTable("feedback_settings", {
  id: serial("id").primaryKey(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  releaseThreshold: bigint("releaseThreshold", { mode: "number", unsigned: true }).notNull().default(10),
});

export type FeedbackSetting = typeof feedbackSettings.$inferSelect;
export type InsertFeedbackSetting = typeof feedbackSettings.$inferInsert;

// Dedicated Microsoft colleagues and per-document commercial assignments.
export const colleagueAccess = mysqlTable("colleague_access", {
  oid: varchar("oid", {length:36}).primaryKey(),
  name: varchar("name", {length:255}).notNull(),
  email: varchar("email", {length:320}).notNull(),
  permission: mysqlEnum("permission", ["commercial", "editor"]).notNull(),
  enabled: tinyint("enabled").notNull().default(1),
});
export const salesAssignments = mysqlTable("sales_assignments", {
  id: serial("id").primaryKey(),
  kind: mysqlEnum("kind", ["quote", "offer"]).notNull(),
  sourceId: bigint("sourceId", {mode:"number",unsigned:true}).notNull(),
  recipientOid: varchar("recipientOid", {length:36}).notNull(),
  senderId: bigint("senderId", {mode:"number",unsigned:true}).notNull(),
  seenHash: varchar("seenHash", {length:64}),
  statusHash: varchar("statusHash", {length:64}),
  status: mysqlEnum("status", ["ready","transferred","sent"]).notNull().default("ready"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, t=>[uniqueIndex("assignment_unique").on(t.kind,t.sourceId,t.recipientOid)]);


// Excel templates are shared with the existing editor scope. Versions are append-only.
export const cycleImportTemplates = mysqlTable("cycle_import_templates", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  rootId: bigint("rootId", { mode: "number", unsigned: true }),
  version: bigint("version", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  family: varchar("family", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["draft", "tested", "approved"]).default("draft").notNull(),
  definitionJson: mediumtext("definitionJson").notNull(),
  verifiedCasesJson: mediumtext("verifiedCasesJson").notNull(),
  createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
  validatedBy: bigint("validatedBy", { mode: "number", unsigned: true }),
  validatedAt: timestamp("validatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().onUpdateNow(),
}, table => [
  uniqueIndex("cycle_import_templates_root_version_uq").on(table.rootId, table.version),
  index("cycle_import_templates_family_status_idx").on(table.family, table.status),
  index("cycle_import_templates_createdBy_idx").on(table.createdBy),
]);

export const cycleCreateReceipts = mysqlTable("cycle_create_receipts", {
 id: bigint("id",{mode:"number",unsigned:true}).autoincrement().primaryKey(), userId: bigint("userId",{mode:"number",unsigned:true}).notNull(), idempotencyKey:varchar("idempotencyKey",{length:64}).notNull(), payloadHash:varchar("payloadHash",{length:64}).notNull(), cycleId:bigint("cycleId",{mode:"number",unsigned:true}), normalizedCode:varchar("normalizedCode",{length:255}), status:mysqlEnum("status",["claimed","completed"]).default("claimed").notNull(), createdAt:timestamp("createdAt").defaultNow().notNull(), updatedAt:timestamp("updatedAt").defaultNow().notNull().onUpdateNow(),
},t=>[uniqueIndex("cycle_create_receipts_user_key_uq").on(t.userId,t.idempotencyKey),uniqueIndex("cycle_create_receipts_user_code_uq").on(t.userId,t.normalizedCode)]);

// Attachments are shared by quote revisions; original Windows references stay in dataJson.
export const quoteAttachments = mysqlTable("quote_attachments", {
  id: serial("id").primaryKey(),
  rootId: bigint("rootId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  fileName: varchar("fileName", { length: 180 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  sizeBytes: bigint("sizeBytes", { mode: "number", unsigned: true }).notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  dataBase64: mediumtext("dataBase64").notNull(),
}, table => [uniqueIndex("quote_attachment_content").on(table.rootId, table.sha256)]);

export const temporaryProductSequence = mysqlTable("temporary_product_sequence", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey(),
  lastNumber: bigint("lastNumber", { mode: "number", unsigned: true }).notNull().default(0),
});
export const temporaryProductCodes = mysqlTable("temporary_product_codes", {
  id: serial("id").primaryKey(),
  sequence: bigint("sequence", { mode: "number", unsigned: true }).notNull(),
  requestKey: varchar("requestKey", { length: 36 }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  family: varchar("family", { length: 2 }).notNull(),
  material: varchar("material", { length: 1 }),
  color: varchar("color", { length: 4 }),
  code: varchar("code", { length: 16 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("temporary_sequence").on(table.sequence), uniqueIndex("temporary_request").on(table.requestKey), uniqueIndex("temporary_code").on(table.code)]);
