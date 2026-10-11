import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
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
