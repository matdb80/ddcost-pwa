import { z } from "zod";
import { eq, desc, sql, count, and } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { cycles } from "@db/schema";
import { requireCurrentRevision } from "./cycle-version-guard";
import {groupCycleDirectory} from "../src/lib/cycle-directory-groups";

/**
 * No-op guard at the API boundary. Compare the selected original revision
 * with the proposed new business values, ignoring revision metadata and
 * formatting-only differences (50 vs "50.0", DECIMAL trailing zeroes).
 */
type CycleContent = {
  code?: string | null;
  description?: string | null;
  client?: string | null;
  lot?: string | null;
  standardCost?: string | null;
  minimumPrice?: string | null;
  dataJson?: string | null;
};

function canonicalNumber(raw: string | null | undefined): string {
  const str = (raw ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(str)) return str;
  const parts = str.split(".");
  const integer = parts[0].replace(/^(-?)0+(?=\d)/, "$1");
  const fraction = (parts[1] ?? "").replace(/0+$/, "");
  const whole = integer === "-0" ? "0" : integer;
  return fraction ? whole + "." + fraction : whole;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj).sort().map(k => [k, canonicalJson(obj[k])])
    );
  }
  return value;
}

function businessJson(row: CycleContent): string {
  if (!row.dataJson) return "";
  try {
    const parsed: unknown = JSON.parse(row.dataJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return row.dataJson;
    }
    const value = { ...(parsed as Record<string, unknown>) };
    // Revision metadata is added by the server and is not a business change.
    delete value.rev;
    delete value.rootId;
    delete value.root_id;
    // The columns, not legacy JSON, are authoritative for anagrafica.
    value.codice = row.code ?? "";
    value.descrizione = row.description ?? "";
    value.cliente = row.client ?? "";
    value.lotto = canonicalNumber(row.lot);
    return JSON.stringify(canonicalJson(value));
  } catch {
    return row.dataJson;
  }
}

function sameCycleContent(a: CycleContent, b: CycleContent): boolean {
  return (a.code ?? "") === (b.code ?? "") &&
    (a.description ?? "") === (b.description ?? "") &&
    (a.client ?? "") === (b.client ?? "") &&
    canonicalNumber(a.lot) === canonicalNumber(b.lot) &&
    canonicalNumber(a.standardCost) === canonicalNumber(b.standardCost) &&
    canonicalNumber(a.minimumPrice) === canonicalNumber(b.minimumPrice) &&
    businessJson(a) === businessJson(b);
}

export const cycleRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(25),
        includeDeleted: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const search = input.search?.trim();
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (!input.includeDeleted) {
        conditions.push(eq(cycles.deleted, 0));
      }
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          sql`(${cycles.code} LIKE ${pattern} OR ${cycles.description} LIKE ${pattern} OR ${cycles.client} LIKE ${pattern})`
        );
      }

      const whereClause = conditions.length ? and(...conditions) : undefined;

      const totalRows = await db
        .select({ value: count() })
        .from(cycles)
        .where(whereClause);
      const total = totalRows[0]?.value ?? 0;

      const items = await db
        .select()
        .from(cycles)
        .where(whereClause)
        .orderBy(desc(cycles.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      return { items, total, page: input.page, pageSize: input.pageSize };
    }),

  /** Paginate by product CODE rather than individual revision. Each expanded
   *  group returns every available revision, not just revisions on this page. */
  // Read light listing fields and group deterministically in application
  // code. This avoids errors from complex MySQL DISTINCT/GROUP BY expressions
  // and keeps full revision histories together on a single paginated page.
  listGrouped: authedQuery
    .input(z.object({
      search:z.string().optional(),
      page:z.number().int().min(1).default(1),
      pageSize:z.number().int().min(1).max(100).default(25),
      includeDeleted:z.boolean().optional(),
    }))
    .query(async({input})=>{
      const db=getDb();
      const rows=await db.select({
        id:cycles.id,code:cycles.code,description:cycles.description,
        client:cycles.client,lot:cycles.lot,rev:cycles.rev,
        updatedAt:cycles.updatedAt,deleted:cycles.deleted,
        standardCost:cycles.standardCost,minimumPrice:cycles.minimumPrice,
      }).from(cycles)
        .where(input.includeDeleted?undefined:eq(cycles.deleted,0))
        .orderBy(desc(cycles.updatedAt),desc(cycles.id));
      return groupCycleDirectory(rows,input.search??"",input.page,input.pageSize);
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(cycles)
        .where(eq(cycles.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),

  /** Return the latest live revision for an opened cycle; editors must not
   * accidentally start changes from a historical root or earlier revision. */
  latestForSource: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const source = await db.select({
        id: cycles.id, rootId: cycles.rootId, rev: cycles.rev,
      }).from(cycles).where(and(
        eq(cycles.id, input.id),
        eq(cycles.userId, ctx.user.id),
        eq(cycles.deleted, 0)
      )).limit(1);
      if (!source[0]) return null;
      const rootId = source[0].rootId ?? source[0].id;
      const rows = await db.select({
        id: cycles.id, rev: cycles.rev,
      }).from(cycles).where(and(
        eq(cycles.rootId, rootId),
        eq(cycles.userId, ctx.user.id),
        eq(cycles.deleted, 0),
      )).orderBy(desc(cycles.rev),desc(cycles.id)).limit(1);
      return rows[0] ?? { id: source[0].id, rev: source[0].rev };
    }),

  create: authedQuery
    .input(
      z.object({
        code: z.string().optional(),
        description: z.string().optional(),
        client: z.string().optional(),
        lot: z.string().optional(),
        standardCost: z.string().optional(),
        minimumPrice: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const code=input.code?.trim()||undefined;
      if(code){
        const existing=await db.select({id:cycles.id}).from(cycles).where(and(
          eq(cycles.userId,ctx.user.id),
          sql`UPPER(TRIM(${cycles.code})) = ${code.toUpperCase()}`,
        )).limit(1);
        if(existing[0])
          throw new Error("Codice già utilizzato. Inserire un codice diverso per creare un nuovo ciclo.");
      }
      const result = await db.insert(cycles).values({
        userId: ctx.user.id,
        code,
        description: input.description,
        client: input.client,
        lot: input.lot,
        standardCost: input.standardCost,
        minimumPrice: input.minimumPrice,
        dataJson: input.dataJson,
        rootId: undefined,
        rev: 1,
      });
      const id = Number(result[0].insertId);
      await db.update(cycles).set({ rootId: id }).where(eq(cycles.id, id));
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        code: z.string().optional(),
        description: z.string().optional(),
        client: z.string().optional(),
        lot: z.string().optional(),
        standardCost: z.string().optional(),
        minimumPrice: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...data } = input;
      await db
        .update(cycles)
        .set(data)
        .where(eq(cycles.id, id));
      return { ok: true };
    }),

  /** Explicit destructive overwrite after a second user confirmation.
   * Only for the latest, owned, non-deleted revision.
   * Compare-and-swap blocks replacement of data changed since the editor opened.
   * No new revision is created and no older revision is modified.
   */
  overwriteLatest: authedQuery
    .input(z.object({
      sourceId:z.number().int().positive(),
      rootId:z.number().int().positive(),
      expectedDataJson:z.string().nullable(),
      confirmation:z.literal("SOVRASCRIVI DEFINITIVAMENTE"),
      code:z.string().optional(),
      description:z.string().optional(),
      client:z.string().optional(),
      lot:z.string().optional(),
      standardCost:z.string().optional(),
      minimumPrice:z.string().optional(),
      dataJson:z.string(),
    }))
    .mutation(async ({ ctx,input }) => {
      let parsed: unknown;
      try { parsed=JSON.parse(input.dataJson); }
      catch { throw new Error("Impossibile salvare: JSON del ciclo non valido"); }
      if (!parsed || typeof parsed!=="object" || Array.isArray(parsed) ||
          !Array.isArray((parsed as {righe?:unknown}).righe)) {
        throw new Error("Impossibile salvare: righe del ciclo mancanti");
      }
      const db=getDb();
      return db.transaction(async tx=>{
        const found=await tx.select().from(cycles).where(and(
          eq(cycles.id,input.sourceId),
          eq(cycles.userId,ctx.user.id),
          eq(cycles.deleted,0)
        )).limit(1);
        const source=found[0];
        if (!source || (source.rootId ?? source.id)!==input.rootId)
          throw new Error("Ciclo inesistente o non autorizzato: sovrascrittura annullata");
        const newest=await tx.select({id:cycles.id,rev:cycles.rev})
          .from(cycles).where(and(
            eq(cycles.rootId,input.rootId),
            eq(cycles.userId,ctx.user.id),
            eq(cycles.deleted,0)
          )).orderBy(desc(cycles.rev),desc(cycles.id)).limit(1);
        const latest=newest[0] ?? {id:source.id,rev:source.rev};
        requireCurrentRevision(source.id,latest.id,latest.rev??1);
        if(source.dataJson!==input.expectedDataJson)
          throw new Error("Questo ciclo è cambiato dopo l'apertura. Aggiorna la pagina: nessuna sovrascrittura eseguita.");

        const proposed:CycleContent={
          code:input.code??source.code,
          description:input.description??source.description,
          client:input.client??source.client,
          lot:input.lot??source.lot,
          standardCost:input.standardCost??source.standardCost,
          minimumPrice:input.minimumPrice??source.minimumPrice,
          dataJson:input.dataJson,
        };
        if(sameCycleContent(source,proposed))
          throw new Error("Nessuna modifica da sovrascrivere.");
        // CAS in SQL: even simultaneous saves cannot silently clobber
        // an intervening update. SHA2 is case/byte sensitive unlike
        // collated MEDIUMTEXT equality.
        const digest=await import("node:crypto").then(c=>c.createHash("sha256")
          .update(input.expectedDataJson??"","utf8").digest("hex"));
        const unchanged=input.expectedDataJson===null
          ? sql`${cycles.dataJson} IS NULL`
          : sql`SHA2(${cycles.dataJson},256) = ${digest}`;
        const result=await tx.update(cycles).set({
          code:proposed.code,description:proposed.description,
          client:proposed.client,lot:proposed.lot,
          standardCost:proposed.standardCost,minimumPrice:proposed.minimumPrice,
          dataJson:proposed.dataJson,
        }).where(and(
          eq(cycles.id,source.id),eq(cycles.userId,ctx.user.id),
          eq(cycles.deleted,0),unchanged,
          sql`${cycles.code} <=> ${source.code}`,
        ));
        if(result[0].affectedRows!==1)
          throw new Error("Un altro aggiornamento è intervenuto. Nessun dato sovrascritto.");
        return {id:source.id,rev:source.rev??1,overwritten:true};
      });
    }),

  /** Soft-delete: mark with dedicated columns (never touch dataJson) */
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(cycles)
        .set({ deleted: 1, deletedAt: new Date() })
        .where(
          and(eq(cycles.id, input.id), eq(cycles.userId, ctx.user.id))
        );
      return { ok: true };
    }),

  /** Restore soft-deleted cycle */
  restore: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(cycles)
        .set({ deleted: 0, deletedAt: null })
        .where(
          and(eq(cycles.id, input.id), eq(cycles.userId, ctx.user.id))
        );
      return { ok: true };
    }),

  createRevision: authedQuery
    .input(
      z.object({
        sourceId: z.number().int().positive(),
        rootId: z.number(),
        code: z.string().optional(),
        description: z.string().optional(),
        client: z.string().optional(),
        lot: z.string().optional(),
        standardCost: z.string().optional(),
        minimumPrice: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Refuse missing, deleted or unowned sources; never overwrite history.
      const sourceRows = await db.select().from(cycles).where(and(
        eq(cycles.id, input.sourceId),
        eq(cycles.userId, ctx.user.id),
        eq(cycles.deleted, 0)
      )).limit(1);
      const source = sourceRows[0];
      if (!source || (source.rootId ?? source.id) !== input.rootId) {
        throw new Error("Ciclo di origine non disponibile.");
      }
      const proposed: CycleContent = {
        code: input.code ?? source.code,
        description: input.description ?? source.description,
        client: input.client ?? source.client,
        lot: input.lot ?? source.lot,
        standardCost: input.standardCost ?? source.standardCost,
        minimumPrice: input.minimumPrice ?? source.minimumPrice,
        dataJson: input.dataJson ?? source.dataJson,
      };
      if (sameCycleContent(source, proposed)) {
        throw new Error("Nessuna modifica rilevata: revisione non creata.");
      }

      // Find latest revision by rootId
      const rows = await db
        .select()
        .from(cycles)
        .where(
          and(
            eq(cycles.rootId, input.rootId),
            eq(cycles.userId, ctx.user.id)
          )
        )
        .orderBy(desc(cycles.rev))
        .limit(1);

      let latest = rows[0];

      // Handle orphaned cycles (rootId points to non-existent row)
      if (!latest) {
        const selfRows = await db
          .select()
          .from(cycles)
          .where(
            and(
              eq(cycles.id, input.rootId),
              eq(cycles.userId, ctx.user.id)
            )
          )
          .limit(1);
        if (selfRows[0]) {
          latest = selfRows[0];
        } else {
          throw new Error("Cycle not found");
        }
      }

      // CRITICAL: never merge an older revision's rows over newer assembly
      // children. This was the regression when users reopened the root after
      // creating an assieme and then added an unrelated line.
      requireCurrentRevision(source.id, latest.id, latest.rev ?? 1);

      const newRev = (latest.rev ?? 1) + 1;

      // Merge new data over latest; ensure rootId and rev are consistent
      let mergedDataJson = latest.dataJson;
      if (input.dataJson) {
        try {
          const base = latest.dataJson ? JSON.parse(latest.dataJson) : {};
          const override = JSON.parse(input.dataJson);
          mergedDataJson = JSON.stringify({
            ...base,
            ...override,
            rootId: input.rootId,
            root_id: input.rootId,
            rev: newRev,
          });
        } catch {
          mergedDataJson = input.dataJson;
        }
      } else if (latest.dataJson) {
        try {
          const base = JSON.parse(latest.dataJson);
          mergedDataJson = JSON.stringify({
            ...base,
            rootId: input.rootId,
            root_id: input.rootId,
            rev: newRev,
          });
        } catch {
          mergedDataJson = latest.dataJson;
        }
      }

      const result = await db.insert(cycles).values({
        userId: ctx.user.id,
        rootId: input.rootId,
        rev: newRev,
        code: input.code ?? latest.code,
        description: input.description ?? latest.description,
        client: input.client ?? latest.client,
        lot: input.lot ?? latest.lot,
        standardCost: input.standardCost ?? latest.standardCost,
        minimumPrice: input.minimumPrice ?? latest.minimumPrice,
        dataJson: mergedDataJson,
      });

      return { id: Number(result[0].insertId), rev: newRev, rootId: input.rootId };
    }),
});
