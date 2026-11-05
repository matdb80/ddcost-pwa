import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eq, desc, sql, and, count, inArray } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { feedbackTickets, feedbackAttachments, feedbackSettings, feedbackExports } from "@db/schema";

function generateTicketNumber(id: number): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `TKT-${date}-${String(id).padStart(4, "0")}`;
}

export const feedbackRouter = createRouter({
  create: authedQuery
    .input(
      z.object({
        type: z.enum(["bug", "miglioramento", "nuova_funzione"]),
        severity: z.enum(["normale", "bloccante"]),
        title: z.string().trim().min(1).max(255),
        description: z.string().trim().min(1).max(16000),
        pageRoute: z.string().max(255).optional(),
        buildVersion: z.string().max(100).optional(),
        cycleId: z.number().int().positive().optional(),
        cycleRev: z.number().int().nonnegative().optional(),
        screenshot: z
          .object({
            mimeType: z.enum(["image/webp", "image/jpeg", "image/png"]),
            fileName: z.string().max(200).optional(),
            dataBase64: z.string().max(420000),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const user = ctx.user;

      // Reject invalid attachments before touching business tables.
      let screenshotBytes: number | undefined;
      if (input.screenshot) {
        const encoded = input.screenshot.dataBase64;
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
          throw new Error("Formato screenshot non valido");
        }
        screenshotBytes = Buffer.byteLength(encoded, "base64");
        if (!screenshotBytes || screenshotBytes > 300 * 1024) {
          throw new Error("Screenshot non valido oppure superiore a 300 KB");
        }
        const binary = Buffer.from(encoded, "base64");
        const webp = binary.subarray(0, 4).toString() === "RIFF" && binary.subarray(8, 12).toString() === "WEBP";
        const jpeg = binary.length >= 3 && binary[0] === 0xff && binary[1] === 0xd8 && binary[2] === 0xff;
        const png = binary.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        if (!((input.screenshot.mimeType === "image/webp" && webp) ||
              (input.screenshot.mimeType === "image/jpeg" && jpeg) ||
              (input.screenshot.mimeType === "image/png" && png))) {
          throw new Error("Contenuto screenshot non corrispondente al tipo immagine");
        }
      }

      // One atomic transaction: no ticket without its screenshot, even on errors.
      return db.transaction(async (tx) => {
        // Unique provisional number prevents collisions between concurrent inserts.
        const result = await tx.insert(feedbackTickets).values({
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          ticketNumber: `TMP-${randomUUID()}`,
          type: input.type,
          severity: input.severity,
          title: input.title,
          description: input.description,
          pageRoute: input.pageRoute ?? null,
          buildVersion: input.buildVersion ?? null,
          cycleId: input.cycleId ?? null,
          cycleRev: input.cycleRev ?? null,
        });

        const ticketId = Number(result[0].insertId);
        const ticketNumber = generateTicketNumber(ticketId);
        await tx.update(feedbackTickets)
          .set({ ticketNumber })
          .where(eq(feedbackTickets.id, ticketId));

        if (input.screenshot) {
          await tx.insert(feedbackAttachments).values({
            ticketId,
            mimeType: input.screenshot.mimeType,
            fileName: input.screenshot.fileName ?? "screenshot",
            sizeBytes: screenshotBytes!,
            dataBase64: input.screenshot.dataBase64,
          });
        }
        return { id: ticketId, ticketNumber };
      });
    }),

  listAdmin: adminQuery
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(25),
        status: z.enum(["nuova", "da_pianificare", "in_lavorazione", "risolta_collaudo", "rilasciata", "duplicata", "non_riproducibile"]).optional(),
        type: z.enum(["bug", "miglioramento", "nuova_funzione"]).optional(),
        severity: z.enum(["normale", "bloccante"]).optional(),
        exported: z.enum(["yes","no"]).optional(),
        search: z.string().max(200).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.status) {
        conditions.push(eq(feedbackTickets.status, input.status));
      }
      if (input.type) {
        conditions.push(eq(feedbackTickets.type, input.type));
      }
      if (input.severity) {
        conditions.push(eq(feedbackTickets.severity, input.severity));
      }
      if (input.exported === "no") conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM feedback_exports e WHERE e.ticketId = ${feedbackTickets.id})`
      );
      if (input.exported === "yes") conditions.push(
        sql`EXISTS (SELECT 1 FROM feedback_exports e WHERE e.ticketId = ${feedbackTickets.id})`
      );
      if (input.search?.trim()) {
        const pattern = `%${input.search.trim()}%`;
        conditions.push(
          sql`(${feedbackTickets.title} LIKE ${pattern} OR ${feedbackTickets.description} LIKE ${pattern} OR ${feedbackTickets.ticketNumber} LIKE ${pattern})`
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(feedbackTickets)
        .where(whereClause)
        .orderBy(
          sql`CASE WHEN EXISTS (SELECT 1 FROM feedback_exports e WHERE e.ticketId = ${feedbackTickets.id}) THEN 1 ELSE 0 END`,
          desc(feedbackTickets.createdAt)
        )
        .limit(input.pageSize)
        .offset(offset);

      const countResult = await db
        .select({ value: count() })
        .from(feedbackTickets)
        .where(whereClause);

      const total = countResult[0]?.value ?? 0;

      const receipts = rows.length
        ? await db.select({ ticketId: feedbackExports.ticketId, exportedAt: feedbackExports.exportedAt })
          .from(feedbackExports).where(inArray(feedbackExports.ticketId, rows.map(r => r.id)))
          .orderBy(desc(feedbackExports.exportedAt))
        : [];
      const firstReceipt = new Map<number, Date>();
      for (const item of receipts) if (!firstReceipt.has(item.ticketId)) firstReceipt.set(item.ticketId, item.exportedAt);
      const items = rows.map(r => ({ ...r, exportedAt: firstReceipt.get(r.id) ?? null }));
      return { items, total, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(total / input.pageSize) };
    }),

  getById: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(feedbackTickets)
        .where(eq(feedbackTickets.id, input.id))
        .limit(1);

      const attachments = await db
        .select({ id: feedbackAttachments.id, mimeType: feedbackAttachments.mimeType, fileName: feedbackAttachments.fileName, sizeBytes: feedbackAttachments.sizeBytes, dataBase64: feedbackAttachments.dataBase64 })
        .from(feedbackAttachments)
        .where(eq(feedbackAttachments.ticketId, input.id));

      const receipts = await db.select({ exportedAt: feedbackExports.exportedAt, source: feedbackExports.source })
        .from(feedbackExports).where(eq(feedbackExports.ticketId, input.id))
        .orderBy(desc(feedbackExports.exportedAt)).limit(1);
      return { ticket: rows[0] ? { ...rows[0], exportedAt: receipts[0]?.exportedAt ?? null, exportSource: receipts[0]?.source ?? null } : null, attachments };
    }),

  updateStatus: adminQuery
    .input(
      z.object({
        id: z.number(),
        status: z.enum([
          "nuova",
          "da_pianificare",
          "in_lavorazione",
          "risolta_collaudo",
          "rilasciata",
          "duplicata",
          "non_riproducibile",
        ]),
        technicalNote: z.string().optional(),
        includeInReleaseCount: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const updates: any = { status: input.status };
      if (input.technicalNote !== undefined) {
        updates.technicalNote = input.technicalNote;
      }
      if (input.includeInReleaseCount !== undefined) {
        updates.includeInReleaseCount = input.includeInReleaseCount ? 1 : 0;
      }

      await db
        .update(feedbackTickets)
        .set(updates)
        .where(eq(feedbackTickets.id, input.id));

      return { ok: true };
    }),

  getAttachment: adminQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(feedbackAttachments)
        .where(eq(feedbackAttachments.id, input.id))
        .limit(1);

      return rows[0] ?? null;
    }),

  getSettings: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(feedbackSettings).limit(1);
    return rows[0] ?? { releaseThreshold: 10 };
  }),

  updateSettings: adminQuery
    .input(z.object({ releaseThreshold: z.number().int().min(1).max(1000) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(feedbackSettings).limit(1);
      if (rows[0]) {
        await db
          .update(feedbackSettings)
          .set({ releaseThreshold: input.releaseThreshold })
          .where(eq(feedbackSettings.id, rows[0].id));
      } else {
        await db.insert(feedbackSettings).values({ releaseThreshold: input.releaseThreshold });
      }
      return { ok: true };
    }),

  getStats: authedQuery.query(async () => {
    const db = getDb();
    const [totalResult, pendingResult, blockingResult, thresholdResult, unexportedResult] = await Promise.all([
      db.select({ value: count() }).from(feedbackTickets),
      db
        .select({ value: count() })
        .from(feedbackTickets)
        .where(
          and(
            eq(feedbackTickets.includeInReleaseCount, 1),
            sql`${feedbackTickets.status} NOT IN ('rilasciata', 'duplicata', 'non_riproducibile')`
          )
        ),
      db
        .select({ value: count() })
        .from(feedbackTickets)
        .where(eq(feedbackTickets.severity, "bloccante")),
      db.select().from(feedbackSettings).limit(1),
      db.select({ value: count() }).from(feedbackTickets)
        .where(sql`NOT EXISTS (SELECT 1 FROM feedback_exports e WHERE e.ticketId = ${feedbackTickets.id})`),
    ]);

    const total = totalResult[0]?.value ?? 0;
    const pendingForRelease = pendingResult[0]?.value ?? 0;
    const blocking = blockingResult[0]?.value ?? 0;
    const threshold = thresholdResult[0]?.releaseThreshold ?? 10;

    return {
      total,
      neverExported: unexportedResult[0]?.value ?? 0,
      pendingForRelease,
      blocking,
      threshold,
      thresholdReached: pendingForRelease >= threshold,
    };
  }),

  export: adminQuery
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).max(500).optional(),
        format: z.enum(["markdown", "json"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(feedbackTickets)
        .where(input.ids?.length
          ? inArray(feedbackTickets.id, input.ids)
          : sql`NOT EXISTS (SELECT 1 FROM feedback_exports e WHERE e.ticketId = ${feedbackTickets.id})`)
        .orderBy(desc(feedbackTickets.createdAt))
        .limit(500);

      const filtered = input.ids && input.ids.length > 0
        ? rows.filter((r) => input.ids!.includes(r.id))
        : rows;

      if (filtered.length === 0) throw new Error("Nessuna nuova segnalazione da esportare. Selezionare i ticket per riesportarli.");
      const ids = filtered.map(r => r.id);
      if (input.format === "json") {
        return { format: "json", ids, content: JSON.stringify(filtered, null, 2) };
      }

      // Markdown format
      const md = filtered
        .map(
          (t) =>
            `## ${t.ticketNumber} — ${t.title}\n\n` +
            `- **Tipo:** ${t.type}\n` +
            `- **Gravità:** ${t.severity}\n` +
            `- **Stato:** ${t.status}\n` +
            `- **Utente:** ${t.userName ?? "N/D"} (${t.userEmail ?? "N/D"})\n` +
            `- **Data:** ${t.createdAt?.toISOString() ?? "N/D"}\n` +
            `- **Pagina:** ${t.pageRoute ?? "N/D"}\n` +
            `- **Build:** ${t.buildVersion ?? "N/D"}\n` +
            `- **Ciclo:** ${t.cycleId ?? "N/D"}${t.cycleRev ? ` (rev ${t.cycleRev})` : ""}\n\n` +
            `### Descrizione\n${t.description}\n\n` +
            `${t.technicalNote ? `### Nota tecnica\n${t.technicalNote}\n\n` : ""}` +
            `---\n`
        )
        .join("\n");

      return { format: "markdown", ids, content: md };
    }),

  /** Called by the UI only after triggering the browser download. Export receipt
   *  is not proof the file was subsequently sent to ChatGPT. */
  recordExport: adminQuery
    .input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(500),
      batchId: z.string().uuid(),
      format: z.enum(["json", "markdown"]),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      return db.transaction(async tx => {
        const valid = await tx.select({ id: feedbackTickets.id }).from(feedbackTickets)
          .where(inArray(feedbackTickets.id, input.ids));
        if (valid.length !== new Set(input.ids).size)
          throw new Error("Impossibile tracciare export: elenco ticket incompleto");
        for (const id of new Set(input.ids)) {
          await tx.execute(sql`INSERT IGNORE INTO feedback_exports (ticketId, batchId, format, source)
            VALUES (${id}, ${input.batchId}, ${input.format}, 'ui')`);
        }
        return { ok: true, count: valid.length };
      });
    }),
});
