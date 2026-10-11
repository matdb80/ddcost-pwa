import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, count, desc, eq, inArray, like, or, notInArray } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { feedbackTickets, feedbackAttachments, feedbackSettings } from "@db/schema";

const types = ["bug", "miglioramento", "nuova_funzione"] as const;
const statuses = [
  "nuova", "da_pianificare", "in_lavorazione", "risolta_collaudo",
  "rilasciata", "duplicata", "non_riproducibile",
] as const;
const mimeTypes = ["image/webp", "image/jpeg", "image/png"] as const;
const imageMax = 300 * 1024;
const pendingStatuses = ["rilasciata", "duplicata", "non_riproducibile"] as const;

function checkAttachment(shot: { mimeType: typeof mimeTypes[number]; dataBase64: string }) {
  const s = shot.dataBase64;
  if (!s || s.length > 410000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) {
    throw new Error("Formato screenshot non valido");
  }
  const buffer = Buffer.from(s, "base64");
  if (buffer.length === 0 || buffer.length > imageMax) {
    throw new Error("Screenshot oltre 300 KB o vuoto");
  }
  const webp = buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  const jpeg = buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const png = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!(shot.mimeType === "image/webp" && webp ||
        shot.mimeType === "image/jpeg" && jpeg ||
        shot.mimeType === "image/png" && png)) {
    throw new Error("Tipo di immagine non corrispondente al contenuto");
  }
  return buffer.length;
}

export const feedbackRouter = createRouter({
  create: authedQuery.input(z.object({
    type: z.enum(types),
    severity: z.enum(["normale", "bloccante"]),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(16000),
    pageRoute: z.string().max(255).optional(),
    buildVersion: z.string().max(100).optional(),
    cycleId: z.number().int().positive().optional(),
    cycleRev: z.number().int().nonnegative().optional(),
    screenshot: z.object({
      mimeType: z.enum(mimeTypes),
      fileName: z.string().max(200).optional(),
      dataBase64: z.string().max(410000),
    }).optional(),
  })).mutation(async ({ ctx, input }) => {
    // Validate all user input before creating any record.
    const bytes = input.screenshot ? checkAttachment(input.screenshot) : 0;
    const db = getDb();
    return await db.transaction(async (tx) => {
      const inserted = await tx.insert(feedbackTickets).values({
        userId: ctx.user.id,
        userName: ctx.user.name,
        userEmail: ctx.user.email,
        ticketNumber: "TMP-" + randomUUID(),
        type: input.type,
        severity: input.severity,
        title: input.title,
        description: input.description,
        pageRoute: input.pageRoute ?? null,
        buildVersion: input.buildVersion ?? null,
        cycleId: input.cycleId ?? null,
        cycleRev: input.cycleRev ?? null,
      });
      const id = Number(inserted[0].insertId);
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const ticketNumber = "TKT-" + day + "-" + String(id).padStart(4, "0");
      await tx.update(feedbackTickets).set({ ticketNumber }).where(eq(feedbackTickets.id, id));
      if (input.screenshot) {
        await tx.insert(feedbackAttachments).values({
          ticketId: id,
          mimeType: input.screenshot.mimeType,
          fileName: input.screenshot.fileName ?? "screenshot",
          sizeBytes: bytes,
          dataBase64: input.screenshot.dataBase64,
        });
      }
      return { id, ticketNumber };
    });
  }),

  listAdmin: adminQuery.input(z.object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    status: z.enum(statuses).optional(),
    type: z.enum(types).optional(),
    severity: z.enum(["normale", "bloccante"]).optional(),
    search: z.string().max(150).optional(),
  })).query(async ({ input }) => {
    const db = getDb();
    const filters = [];
    if (input.status) filters.push(eq(feedbackTickets.status, input.status));
    if (input.type) filters.push(eq(feedbackTickets.type, input.type));
    if (input.severity) filters.push(eq(feedbackTickets.severity, input.severity));
    if (input.search?.trim()) {
      const query = "%" + input.search.trim() + "%";
      filters.push(or(
        like(feedbackTickets.title, query),
        like(feedbackTickets.description, query),
        like(feedbackTickets.ticketNumber, query),
      )!);
    }
    const where = filters.length ? and(...filters) : undefined;
    const [items, counted] = await Promise.all([
      db.select().from(feedbackTickets).where(where)
        .orderBy(desc(feedbackTickets.createdAt), desc(feedbackTickets.id))
        .limit(input.pageSize).offset((input.page-1)*input.pageSize),
      db.select({value:count()}).from(feedbackTickets).where(where),
    ]);
    const total = counted[0]?.value ?? 0;
    return { items, total, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(total/input.pageSize) };
  }),

  getById: adminQuery.input(z.object({id:z.number().int().positive()})).query(async ({input}) => {
    const db=getDb();
    const [rows,attachments] = await Promise.all([
      db.select().from(feedbackTickets).where(eq(feedbackTickets.id,input.id)).limit(1),
      db.select().from(feedbackAttachments).where(eq(feedbackAttachments.ticketId,input.id)),
    ]);
    return { ticket: rows[0] ?? null, attachments };
  }),

  updateStatus: adminQuery.input(z.object({
    id:z.number().int().positive(),
    status:z.enum(statuses),
    technicalNote:z.string().max(16000).optional(),
    includeInReleaseCount:z.boolean().optional(),
  })).mutation(async({input})=>{
    const db=getDb();
    const patch:Partial<typeof feedbackTickets.$inferInsert>={status:input.status};
    if(input.technicalNote!==undefined)patch.technicalNote=input.technicalNote;
    if(input.includeInReleaseCount!==undefined)patch.includeInReleaseCount=input.includeInReleaseCount?1:0;
    await db.update(feedbackTickets).set(patch).where(eq(feedbackTickets.id,input.id));
    return {ok:true};
  }),

  getSettings:adminQuery.query(async()=>{
    const rows=await getDb().select().from(feedbackSettings).limit(1);
    return rows[0]??{releaseThreshold:10};
  }),
  updateSettings:adminQuery.input(z.object({releaseThreshold:z.number().int().min(1).max(1000)}))
    .mutation(async({input})=>{
      const db=getDb();
      const rows=await db.select().from(feedbackSettings).limit(1);
      if(rows[0])await db.update(feedbackSettings).set({releaseThreshold:input.releaseThreshold}).where(eq(feedbackSettings.id,rows[0].id));
      else await db.insert(feedbackSettings).values({releaseThreshold:input.releaseThreshold});
      return {ok:true};
    }),

  getStats:adminQuery.query(async()=>{
    const db=getDb();
    const [total,pending,blocking,settings]=await Promise.all([
      db.select({value:count()}).from(feedbackTickets),
      db.select({value:count()}).from(feedbackTickets).where(and(
        eq(feedbackTickets.includeInReleaseCount,1),
        notInArray(feedbackTickets.status,[...pendingStatuses]),
      )),
      db.select({value:count()}).from(feedbackTickets).where(and(
        eq(feedbackTickets.severity,"bloccante"),
        notInArray(feedbackTickets.status,[...pendingStatuses]),
      )),
      db.select().from(feedbackSettings).limit(1),
    ]);
    const threshold=settings[0]?.releaseThreshold??10;
    const pendingForRelease=pending[0]?.value??0;
    return {total:total[0]?.value??0,pendingForRelease,blocking:blocking[0]?.value??0,threshold,thresholdReached:pendingForRelease>=threshold};
  }),

  export:adminQuery.input(z.object({
    ids:z.array(z.number().int().positive()).max(500).optional(),
    format:z.enum(["markdown","json"]),
  })).mutation(async({input})=>{
    const db=getDb();
    const conditions=input.ids?.length?inArray(feedbackTickets.id,input.ids):undefined;
    const tickets=await db.select().from(feedbackTickets).where(conditions)
      .orderBy(desc(feedbackTickets.createdAt)).limit(500);
    if(input.format==="json")return {format:"json" as const,content:JSON.stringify(tickets,null,2)};
    const lines=tickets.map(t=>[
      "## "+t.ticketNumber+" — "+t.title,
      "",
      "- **Tipo:** "+t.type,
      "- **Gravità:** "+t.severity,
      "- **Stato:** "+t.status,
      "- **Utente:** "+(t.userName??"N/D"),
      "- **Data:** "+t.createdAt.toISOString(),
      "- **Pagina:** "+(t.pageRoute??"N/D"),
      "- **Build:** "+(t.buildVersion??"N/D"),
      "- **Ciclo:** "+(t.cycleId??"N/D")+" (rev "+(t.cycleRev??"N/D")+")",
      "",
      "### Descrizione",
      t.description,
      "",
      "### Nota tecnica",
      t.technicalNote??"",
      "",
      "---",
    ].join("\n")).join("\n");
    return {format:"markdown" as const,content:lines};
  }),
});
