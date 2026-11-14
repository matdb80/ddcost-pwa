import { createHash } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, desc } from "drizzle-orm";
import { quoteAttachments, quotes } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { MAX_QUOTE_FILE_BYTES, MAX_QUOTE_FILE_BASE64, MAX_QUOTE_ATTACHMENTS,
  MAX_QUOTE_ATTACHMENT_TOTAL, quoteFileName, quoteFileMime } from "../src/lib/quote-attachments";

const quoteIdInput = z.object({ quoteId: z.number().int().positive() });
const metadata = { id: quoteAttachments.id, rootId: quoteAttachments.rootId,
  fileName: quoteAttachments.fileName, mimeType: quoteAttachments.mimeType,
  sizeBytes: quoteAttachments.sizeBytes, sha256: quoteAttachments.sha256, createdAt: quoteAttachments.createdAt };
type Db = Pick<ReturnType<typeof getDb>, "select">;
async function quoteRoot(db: Db, quoteId: number) {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Preventivo non trovato" });
  return { quote, rootId: quote.rootId ?? quote.id };
}
function tableError(error: unknown): never {
  const e = error as { code?: string; cause?: { code?: string } };
  if (e.code === "ER_NO_SUCH_TABLE" || e.cause?.code === "ER_NO_SUCH_TABLE")
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Archivio allegati non ancora attivato su questo ambiente." });
  throw error;
}
export function decodeQuoteFile(fileName: string, dataBase64: string) {
  const name = quoteFileName(fileName);
  if (!name || !dataBase64 || dataBase64.length > MAX_QUOTE_FILE_BASE64 ||
    dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64))
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nome o contenuto del file non valido" });
  const bytes = Buffer.from(dataBase64, "base64");
  if (!bytes.length || bytes.length > MAX_QUOTE_FILE_BYTES || bytes.toString("base64") !== dataBase64)
    throw new TRPCError({ code: "BAD_REQUEST", message: "File vuoto, non valido o superiore a 10 MB" });
  return { fileName: name, dataBase64, sizeBytes: bytes.length,
    mimeType: quoteFileMime(bytes, name), sha256: createHash("sha256").update(bytes).digest("hex") };
}

export const quoteAttachmentRouter = createRouter({
  // Same read access as quote.get: authenticated editors, never sales-only users.
  list: authedQuery.input(quoteIdInput).query(async ({ input }) => {
    const db = getDb();
    const { rootId } = await quoteRoot(db, input.quoteId);
    try { return await db.select(metadata).from(quoteAttachments).where(eq(quoteAttachments.rootId, rootId)).orderBy(desc(quoteAttachments.id)); }
    catch (error) { return tableError(error); }
  }),
  get: authedQuery.input(quoteIdInput.extend({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = getDb();
    const { rootId } = await quoteRoot(db, input.quoteId);
    try {
      const [file] = await db.select().from(quoteAttachments).where(and(eq(quoteAttachments.id, input.id), eq(quoteAttachments.rootId, rootId))).limit(1);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Allegato non trovato per questo preventivo" });
      const decoded = decodeQuoteFile(file.fileName, file.dataBase64);
      if (decoded.sha256 !== file.sha256 || decoded.sizeBytes !== file.sizeBytes)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Verifica integrità dell’allegato fallita" });
      return { id: file.id, ...decoded };
    } catch (error) { return tableError(error); }
  }),
  upload: authedQuery.input(quoteIdInput.extend({
    fileName: z.string().min(1).max(255), dataBase64: z.string().min(4).max(MAX_QUOTE_FILE_BASE64),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const { quote, rootId } = await quoteRoot(db, input.quoteId);
    if (quote.userId !== ctx.user.id && ctx.user.role !== "admin")
      throw new TRPCError({ code: "FORBIDDEN", message: "Solo l’autore o un amministratore può aggiungere allegati" });
    const file = decodeQuoteFile(input.fileName, input.dataBase64);
    try {
      return await db.transaction(async tx => {
        // Serialize uploads for all revisions of this quote: quotas and deduplication are atomic.
        const [root] = await tx.select({ id: quotes.id }).from(quotes).where(eq(quotes.id, rootId)).limit(1).for("update");
        if (!root) throw new TRPCError({ code: "CONFLICT", message: "Preventivo originale non disponibile" });
        const existing = await tx.select(metadata).from(quoteAttachments).where(eq(quoteAttachments.rootId, rootId)).for("update");
        const same = existing.find(f => f.sha256 === file.sha256);
        if (same) return { id: same.id, duplicate: true };
        if (existing.length >= MAX_QUOTE_ATTACHMENTS || existing.reduce((n, f) => n + f.sizeBytes, 0) + file.sizeBytes > MAX_QUOTE_ATTACHMENT_TOTAL)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Limite allegati: 20 file e 50 MB complessivi per preventivo" });
        const inserted = await tx.insert(quoteAttachments).values({ ...file, rootId, userId: ctx.user.id });
        return { id: Number(inserted[0].insertId), duplicate: false };
      });
    } catch (error) { return tableError(error); }
  }),
});
