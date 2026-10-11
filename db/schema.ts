import {
  mysqlTable,
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
  dataJson: text("dataJson"),
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

export type FeedbackAttachment = typeof feedbackAttachments.$inferSelect;
export type InsertFeedbackAttachment = typeof feedbackAttachments.$inferInsert;

export const feedbackSettings = mysqlTable("feedback_settings", {
  id: serial("id").primaryKey(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  releaseThreshold: bigint("releaseThreshold", { mode: "number", unsigned: true }).notNull().default(10),
});

export type FeedbackSetting = typeof feedbackSettings.$inferSelect;
export type InsertFeedbackSetting = typeof feedbackSettings.$inferInsert;
