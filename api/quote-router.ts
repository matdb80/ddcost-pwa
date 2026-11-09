import {isForfait,forfaitProductError} from "../src/lib/quote-forfait";
import {validateTemporaryProductDocument} from "./temporary-code-validation";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { reserveCommercialDocumentNumber } from "./commercial-document-number";
import { preserveQuoteNumber, quoteWriteToken } from "./quote-write-guard";
import { eq, and, desc, sql, inArray, or } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { quotes, productGroups } from "@db/schema";
import {parseIncompleteQuote,quoteIsDraft} from "../src/lib/quote-draft-state";
import {latestCompletedQuotePerRoot,readQuoteOutcome,summarizeQuoteOutcomes} from "../src/lib/quote-outcomes";
import {modificationObjectError} from "../src/lib/quote-modification-validation";
import {quoteMaterialError} from "../src/lib/quote-material-weight";
import {quoteProductDescriptionError} from "../src/lib/quote-product-description";

const ALLOWED_MATERIALS = new Set(["ferro","ottone","inox","alluminio"]);

async function validateQuoteClassifications(dataJson: string | undefined): Promise<void> {
  await validateTemporaryProductDocument(dataJson,"prodotti");
  if (!dataJson) throw new Error("Il preventivo deve contenere i prodotti");
  let document: unknown;
  try { document = JSON.parse(dataJson); }
  catch { throw new Error("JSON preventivo non valido"); }
  const rows = (document as { prodotti?: unknown } | null)?.prodotti;
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("Inserire almeno un prodotto");
  const usedGroups = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const product = rows[i] as Record<string, unknown> | null;
    if (!product || typeof product !== "object") throw new Error("Prodotto " + (i+1) + " non valido");
    if(isForfait(product)) {
      const error=forfaitProductError(product);
      if(error)throw new TRPCError({code:"BAD_REQUEST",message:`Prodotto ${i+1}: ${error}`});
      continue;
    }
    const group = String(product.gruppo_merceologico ?? "").trim();
    const material = String(product.materiale_prodotto ?? "").trim().toLocaleLowerCase("it-IT");
    if (!group) throw new Error("Selezionare il gruppo merceologico del prodotto " + (i+1));
    if (!ALLOWED_MATERIALS.has(material))
      throw new Error("Selezionare ferro, ottone, inox o alluminio per il prodotto " + (i+1));
    const missingModification=modificationObjectError(product.oggetto_modifica);
    if(missingModification)throw new TRPCError({code:"BAD_REQUEST",message:`Prodotto ${i+1}: ${missingModification}`});
    usedGroups.add(group);
  }
  const descriptionError=quoteProductDescriptionError(rows);
  if(descriptionError)throw new TRPCError({code:"BAD_REQUEST",message:descriptionError});
  const materialError=quoteMaterialError(rows);
  if(materialError)throw new TRPCError({code:"BAD_REQUEST",message:materialError});
  if(!usedGroups.size)return;
  const db = getDb();
  const exists = await db.select({ name: productGroups.name })
    .from(productGroups).where(inArray(productGroups.name, Array.from(usedGroups)));
  const recognized = new Set(exists.map(g=>g.name.toLocaleLowerCase("it-IT")));
  for (const name of usedGroups)
    if (!recognized.has(name.toLocaleLowerCase("it-IT")))
      throw new Error("Gruppo merceologico non registrato: " + name);
}

export const quoteRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const search = input.search?.trim();

      if (search) {
        const pattern = `%${search.toLocaleLowerCase("it-IT")}%`;
        return db
          .select()
          .from(quotes)
          .where(
            sql`LOWER(${quotes.client}) LIKE ${pattern} OR LOWER(${quotes.reference}) LIKE ${pattern}
              OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(${quotes.dataJson}),${quotes.dataJson},'{}'),'$.numero_preventivo'))) LIKE ${pattern}`
          )
          .orderBy(desc(quotes.createdAt))
          .limit(input.limit);
      }

      return db
        .select()
        .from(quotes)
        .orderBy(desc(quotes.createdAt))
        .limit(input.limit);
    }),

  /** Commercial statuses are stored in JSON metadata. No cost-model or DB
   * schema changes. Sum only the latest FINALIZED revision of each root, even
   * when the standard quote list's 100-record limit is exceeded. */
  outcomeSummary: authedQuery.query(async()=>{
    const db=getDb();
    const rows=await db.select({
      id:quotes.id,rootId:quotes.rootId,rev:quotes.rev,
      dataJson:quotes.dataJson,totalFinal:quotes.totalFinal,
    }).from(quotes);
    const records=rows.map(x=>({...x,totalFinal:x.totalFinal===null?null:String(x.totalFinal)}));
    const latest=latestCompletedQuotePerRoot(records);
    return {latest,summary:summarizeQuoteOutcomes(records)};
  }),

  setOutcome: authedQuery
    .input(z.object({quoteId:z.number().int().positive(),outcome:z.enum(["in_attesa","vinto","perso"])}))
    .mutation(async({ctx,input})=>{
      const db=getDb();
      return db.transaction(async tx=>{
        const selected=(await tx.select().from(quotes)
          .where(eq(quotes.id,input.quoteId)).limit(1))[0];
        if(!selected)throw new Error("Preventivo non trovato");
        if(selected.userId!==ctx.user.id && ctx.user.role!=="admin")
          throw new Error("Non autorizzato a cambiare l'esito di questo preventivo");
        const root=selected.rootId??selected.id;
        const all=await tx.select().from(quotes).where(
          or(eq(quotes.rootId,root),eq(quotes.id,root))
        );
        const finalized=latestCompletedQuotePerRoot(all.map(q=>({
          id:q.id,rootId:q.rootId,rev:q.rev,dataJson:q.dataJson,
          totalFinal:q.totalFinal===null?null:String(q.totalFinal),
        })));
        const current=finalized.find(q=>q.root===root);
        if(!current)throw new Error("Non è possibile assegnare l'esito a una bozza incompleta");
        if(current.outcome===input.outcome)return {id:current.id,outcome:input.outcome,unchanged:true};
        const row=all.find(q=>q.id===current.id)!;
        let data:Record<string,unknown>;
        try{data=JSON.parse(row.dataJson??"{}");}
        catch{throw new Error("Dati del preventivo non leggibili");}
        // Update commercial metadata in-place, never alter industrial inputs,
        // selling amounts, historical revision numbering or document columns.
        await tx.update(quotes).set({dataJson:JSON.stringify({
          ...data,esito_commerciale:input.outcome,
        })}).where(eq(quotes.id,current.id));
        return {id:current.id,outcome:input.outcome,unchanged:false};
      });
    }),

  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(quotes)
        .where(eq(quotes.id, input.id))
        .limit(1);
      return rows[0] ? { ...rows[0], editToken: quoteWriteToken(rows[0]) } : null;
    }),

  create: authedQuery
    .input(
      z.object({
        client: z.string().optional(),
        reference: z.string().optional(),
        targetTotal: z.string().optional(),
        totalBeforeRebalance: z.string().optional(),
        totalFinal: z.string().optional(),
        numProducts: z.number().optional(),
        generalNotes: z.string().optional(),
        clientNotes: z.string().optional(),
        supplierNotes: z.string().optional(),
        summary: z.string().optional(),
        dataJson: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await validateQuoteClassifications(input.dataJson);
      const db = getDb();
      return db.transaction(async tx => {
        const number = await reserveCommercialDocumentNumber(tx);
        const document = { ...JSON.parse(input.dataJson!), numero_preventivo: number, rev: 1, stato_preventivo: "completo" };
        const result = await tx.insert(quotes).values({
          userId: ctx.user.id, ...input, dataJson: JSON.stringify(document), rootId: null, rev: 1,
        });
        const id = Number(result[0].insertId);
        await tx.update(quotes).set({ rootId: id, dataJson: JSON.stringify({ ...document, root_id: id }) })
          .where(eq(quotes.id, id));
        return { id, number };
      });
    }),

  /**
   * Drafts are real DB records, not invalid finished quotes. Only this
   * dedicated authenticated endpoint bypasses mandatory commercial fields.
   * Existing completed revisions remain immutable; draft revisions may be
   * updated in place until finalized.
   */
  saveDraft: authedQuery
    .input(z.object({
      sourceId: z.number().int().positive().optional(),
      client: z.string().max(255).default(""),
      reference: z.string().max(255).default(""),
      dataJson: z.string().min(2).max(62000),
    }))
    .mutation(async ({ctx,input})=>{
      const document=parseIncompleteQuote(input.dataJson);
      const descriptionError=quoteProductDescriptionError(document.prodotti as Record<string,unknown>[]);
      if(descriptionError)throw new TRPCError({code:"BAD_REQUEST",message:descriptionError});
      await validateTemporaryProductDocument(input.dataJson,"prodotti",true);
      const db=getDb();
      return db.transaction(async tx=>{
        const source=input.sourceId
          ? (await tx.select().from(quotes).where(and(
              eq(quotes.id,input.sourceId),eq(quotes.userId,ctx.user.id)
            )).limit(1))[0]
          : null;
        if(input.sourceId && !source)throw new Error("Preventivo originale non trovato o non autorizzato");
        const rootId=source?.rootId ?? source?.id;
        const latest=source ? (await tx.select({rev:quotes.rev}).from(quotes)
          .where(and(eq(quotes.rootId,rootId!),eq(quotes.userId,ctx.user.id)))
          .orderBy(desc(quotes.rev),desc(quotes.id)).limit(1))[0] : null;
        const currentDraft=Boolean(source && quoteIsDraft(source.dataJson));
        const revision=currentDraft
          ? Number(source?.rev??1)
          : source ? Math.max(Number(latest?.rev??1),Number(source.rev??1))+1 : 1;
        const numberedDocument = source
          ? preserveQuoteNumber(document, source.dataJson)
          : { ...document, numero_preventivo: await reserveCommercialDocumentNumber(tx) };
        const json=JSON.stringify({
          ...numberedDocument,stato_preventivo:"bozza",
          ...(rootId ? {root_id:rootId} : {}),
          rev:revision,
        });
        const common={
          client:input.client,
          reference:input.reference,
          numProducts:(document.prodotti as unknown[]).length,
          generalNotes:String(document.note_generali??""),
          clientNotes:String(document.note_cliente??""),
          supplierNotes:String(document.note_fornitori??""),
          // A draft has no reliable totals until it is finalized.
          totalBeforeRebalance:null,
          totalFinal:null,
          targetTotal:null,
          summary:null,
          dataJson:json,
        };
        if(currentDraft && source){
          await tx.update(quotes).set(common).where(and(
            eq(quotes.id,source.id),eq(quotes.userId,ctx.user.id)
          ));
          return {id:source.id,rev:revision,rootId:rootId!,isDraft:true};
        }
        const result=await tx.insert(quotes).values({
          ...common,userId:ctx.user.id,rootId:rootId??null,rev:revision,
        });
        const id=Number(result[0].insertId);
        if(!rootId){
          await tx.update(quotes).set({rootId:id,dataJson:JSON.stringify({
            ...numberedDocument,stato_preventivo:"bozza",root_id:id,rev:revision,
          })}).where(eq(quotes.id,id));
        }
        return {id,rev:revision,rootId:rootId??id,isDraft:true};
      });
    }),

  /** On successful validation a draft becomes a real quote IN PLACE.
   *  Historic completed revisions are never overwritten by this endpoint.
   */
  finalizeDraft: authedQuery
    .input(z.object({
      draftId:z.number().int().positive(),
      client:z.string().min(1).max(255),
      reference:z.string().max(255).optional(),
      targetTotal:z.string().nullable().optional(),
      totalBeforeRebalance:z.string().optional(),
      totalFinal:z.string().optional(),
      numProducts:z.number().int().positive().optional(),
      generalNotes:z.string().optional(),
      clientNotes:z.string().optional(),
      supplierNotes:z.string().optional(),
      summary:z.string().optional(),
      dataJson:z.string().min(2).max(62000),
    }))
    .mutation(async({ctx,input})=>{
      await validateQuoteClassifications(input.dataJson);
      const db=getDb();
      return db.transaction(async tx=>{
        const source=(await tx.select().from(quotes).where(and(
          eq(quotes.id,input.draftId),eq(quotes.userId,ctx.user.id)
        )).limit(1))[0];
        if(!source)throw new Error("Bozza non trovata");
        let prior:Record<string,unknown>;
        try{prior=JSON.parse(source.dataJson??"{}");}
        catch{throw new Error("Bozza originale non leggibile");}
        if(prior.stato_preventivo!=="bozza")
          throw new Error("Il preventivo non è una bozza: utilizzare il salvataggio di revisione");
        const doc=JSON.parse(input.dataJson) as Record<string,unknown>;
        const rootId=source.rootId??source.id;
        const previous=await tx.select({
          id:quotes.id,rev:quotes.rev,rootId:quotes.rootId,
          totalFinal:quotes.totalFinal,dataJson:quotes.dataJson,
        }).from(quotes).where(or(eq(quotes.rootId,rootId),eq(quotes.id,rootId)));
        const lastFinal=latestCompletedQuotePerRoot(previous.map(q=>({
          ...q,totalFinal:q.totalFinal===null?null:String(q.totalFinal),
        })))[0];
        const {draftId,...changes}=input;
        await tx.update(quotes).set({
          ...changes,
          dataJson:JSON.stringify({...preserveQuoteNumber(doc, source.dataJson),stato_preventivo:"completo",
            esito_commerciale:lastFinal?.outcome??readQuoteOutcome(source.dataJson),
            root_id:rootId,rev:source.rev??1}),
        }).where(and(eq(quotes.id,draftId),eq(quotes.userId,ctx.user.id)));
        return {id:draftId,rev:source.rev??1,rootId:source.rootId??source.id};
      });
    }),

  /** Explicit overwrite of the displayed revision: other revisions remain untouched. */
  update: authedQuery
    .input(z.object({
      id: z.number().int().positive(),
      expectedToken: z.string().regex(/^[a-f0-9]{64}$/),
      client: z.string().min(1).max(255),
      reference: z.string().max(255).optional(),
      targetTotal: z.string().nullable().optional(),
      totalBeforeRebalance: z.string().optional(),
      totalFinal: z.string().optional(),
      numProducts: z.number().int().positive().optional(),
      generalNotes: z.string().optional(), clientNotes: z.string().optional(),
      supplierNotes: z.string().optional(), summary: z.string().optional(),
      dataJson: z.string().min(2).max(62000),
    }))
    .mutation(async ({ ctx, input }) => {
      await validateQuoteClassifications(input.dataJson);
      return getDb().transaction(async tx => {
        const source = (await tx.select().from(quotes).where(and(
          eq(quotes.id, input.id), eq(quotes.userId, ctx.user.id)
        )).limit(1).for("update"))[0];
        if (!source) throw new TRPCError({code:"NOT_FOUND", message:"Preventivo non trovato o non autorizzato"});
        if (quoteIsDraft(source.dataJson)) throw new Error("Per una bozza usare Completa preventivo");
        if (quoteWriteToken(source) !== input.expectedToken)
          throw new TRPCError({code:"CONFLICT", message:"Il preventivo è stato modificato nel frattempo. Riaprilo prima di sovrascriverlo."});
        const { id, expectedToken: _token, ...changes } = input;
        const document = preserveQuoteNumber(JSON.parse(input.dataJson), source.dataJson);
        const dataJson = JSON.stringify({ ...document, stato_preventivo:"completo",
          root_id:source.rootId??source.id, rev:source.rev??1,
          esito_commerciale:readQuoteOutcome(source.dataJson),
        });
        await tx.update(quotes).set({...changes, dataJson}).where(and(
          eq(quotes.id,id),eq(quotes.userId,ctx.user.id)
        ));
        return {id,rootId:source.rootId??source.id,rev:source.rev??1,dataJson};
      });
    }),

  /**
   * Save edited quote as an append-only revision, never overwriting historical data.
   * In particular, the two imported records sharing rootId 20 / rev 2 remain untouched.
   */
  saveRevision: authedQuery
    .input(z.object({
      sourceId: z.number().int().positive(),
      client: z.string().max(255).optional(),
      reference: z.string().max(255).optional(),
      targetTotal: z.string().nullable().optional(),
      totalBeforeRebalance: z.string().optional(),
      totalFinal: z.string().optional(),
      numProducts: z.number().int().min(0).optional(),
      generalNotes: z.string().optional(),
      clientNotes: z.string().optional(),
      supplierNotes: z.string().optional(),
      summary: z.string().optional(),
      dataJson: z.string().min(2),
    }))
    .mutation(async ({ ctx, input }) => {
      await validateQuoteClassifications(input.dataJson);
      const db = getDb();
      return db.transaction(async (tx) => {
        const sourceRows = await tx.select().from(quotes).where(and(
          eq(quotes.id, input.sourceId), eq(quotes.userId, ctx.user.id)
        )).limit(1);
        const source = sourceRows[0];
        if (!source) throw new Error("Preventivo di origine non trovato");
        const { sourceId, ...changes } = input;
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(changes.dataJson);
          if (!json || typeof json !== "object" || !Array.isArray(json.prodotti)) throw new Error();
        } catch {
          throw new Error("Contenuto preventivo non valido");
        }
        const compare = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
        // Reject revisions that only change the sequence metadata.
        const original = (() => { try { return JSON.parse(source.dataJson ?? "{}"); } catch { return {}; } })();
        const clean = (v: Record<string, unknown>) => {
          const { rev: _rev, root_id: _root, ...rest } = v;
          return JSON.stringify(rest);
        };
        if (clean(json) === clean(original)
          && compare(changes.client, source.client)
          && compare(changes.reference, source.reference)
          && compare(changes.targetTotal, source.targetTotal)
          && compare(changes.totalBeforeRebalance, source.totalBeforeRebalance)
          && compare(changes.totalFinal, source.totalFinal)
          && compare(changes.numProducts, source.numProducts)
          && compare(changes.generalNotes, source.generalNotes)
          && compare(changes.clientNotes, source.clientNotes)
          && compare(changes.supplierNotes, source.supplierNotes)) {
          throw new Error("Nessuna modifica rilevata: revisione non creata");
        }
        const rootId = source.rootId ?? source.id;
        const latestRows = await tx.select({
          id:quotes.id,rev:quotes.rev,rootId:quotes.rootId,
          dataJson:quotes.dataJson,totalFinal:quotes.totalFinal,
        }).from(quotes)
          .where(and(eq(quotes.rootId, rootId), eq(quotes.userId, ctx.user.id)))
          .orderBy(desc(quotes.rev), desc(quotes.id));
        const nextRev = Math.max(Number(latestRows[0]?.rev ?? source.rev ?? 1), Number(source.rev ?? 1)) + 1;
        const lastFinal=latestCompletedQuotePerRoot(latestRows.map(q=>({
          ...q,totalFinal:q.totalFinal===null?null:String(q.totalFinal),
        })))[0];
        const currentOutcome=lastFinal?.outcome??"in_attesa";
        const patchedJson = JSON.stringify({ ...preserveQuoteNumber(json, source.dataJson), esito_commerciale:currentOutcome, root_id: rootId, rev: nextRev });
        const result = await tx.insert(quotes).values({
          userId: ctx.user.id,
          rootId, rev: nextRev,
          client: changes.client ?? source.client,
          reference: changes.reference ?? source.reference,
          targetTotal: changes.targetTotal === null ? null : changes.targetTotal ?? source.targetTotal,
          totalBeforeRebalance: changes.totalBeforeRebalance ?? source.totalBeforeRebalance,
          totalFinal: changes.totalFinal ?? source.totalFinal,
          numProducts: changes.numProducts ?? source.numProducts,
          generalNotes: changes.generalNotes ?? source.generalNotes,
          clientNotes: changes.clientNotes ?? source.clientNotes,
          supplierNotes: changes.supplierNotes ?? source.supplierNotes,
          summary: changes.summary ?? source.summary,
          dataJson: patchedJson,
        });
        return { id: Number(result[0].insertId), rev: nextRev, rootId };
      });
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(quotes)
        .where(
          and(eq(quotes.id, input.id), eq(quotes.userId, ctx.user.id))
        );
      return { ok: true };
    }),

  createRevision: authedQuery
    .input(z.object({ rootId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.rootId, input.rootId),
            eq(quotes.userId, ctx.user.id)
          )
        )
        .orderBy(desc(quotes.rev))
        .limit(1);

      const latest = rows[0];
      if (!latest) throw new Error("Quote not found");
      if (!quoteIsDraft(latest.dataJson)) await validateQuoteClassifications(latest.dataJson ?? undefined);
      else {
        const draft=parseIncompleteQuote(latest.dataJson??"");
        const descriptionError=quoteProductDescriptionError(draft.prodotti as Record<string,unknown>[]);
        if(descriptionError)throw new TRPCError({code:"BAD_REQUEST",message:descriptionError});
      }

      const newRev = (latest.rev ?? 1) + 1;
      const result = await db.insert(quotes).values({
        userId: ctx.user.id,
        rootId: input.rootId,
        rev: newRev,
        client: latest.client,
        reference: latest.reference,
        targetTotal: latest.targetTotal,
        totalBeforeRebalance: latest.totalBeforeRebalance,
        totalFinal: latest.totalFinal,
        numProducts: latest.numProducts,
        generalNotes: latest.generalNotes,
        clientNotes: latest.clientNotes,
        supplierNotes: latest.supplierNotes,
        summary: latest.summary,
        dataJson: latest.dataJson,
      });

      return { id: Number(result[0].insertId), rev: newRev };
    }),
});
