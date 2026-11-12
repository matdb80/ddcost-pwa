import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { productGroups, quotes } from "@db/schema";
import { quoteWriteToken } from "./quote-write-guard";
export const normalizeGroupName = (name: string) =>
  name.trim().replace(/\s+/g, " ");
/** Catalog lock is acquired before quote locks by both writers and renames. */
export async function lockGroupCatalog(
  tx: any
): Promise<Array<{ id: number; name: string }>> {
  return tx
    .select({ id: productGroups.id, name: productGroups.name })
    .from(productGroups)
    .for("update");
}
export function renameGroupReferences(
  raw: string | null,
  oldName: string,
  name: string,
  id: number
): string | null {
  if (!raw) return null;
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error(
      "Un preventivo contiene dati illeggibili: rinomina annullata."
    );
  }
  if (!doc || !Array.isArray(doc.prodotti)) return null;
  let changed = false;
  for (const p of doc.prodotti) {
    if (
      p &&
      (p.gruppo_merceologico_id != null
        ? p.gruppo_merceologico_id === id
        : normalizeGroupName(
            String(p.gruppo_merceologico ?? "")
          ).toLocaleLowerCase("it") === oldName.toLocaleLowerCase("it"))
    ) {
      p.gruppo_merceologico = name;
      p.gruppo_merceologico_id = id;
      changed = true;
    }
  }
  return changed ? JSON.stringify(doc) : null;
}
export async function renameProductGroup(
  tx: any,
  input: {
    id: number;
    expectedName: string;
    name: string;
    quoteId?: number;
    quoteToken?: string;
  }
) {
  const catalog = await lockGroupCatalog(tx),
    group = catalog.find(g => g.id === input.id),
    name = normalizeGroupName(input.name);
  if (!group)
    throw new TRPCError({ code: "NOT_FOUND", message: "Gruppo non trovato." });
  if (group.name !== input.expectedName)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Il gruppo è già stato modificato. Aggiorna l’elenco.",
    });
  if (name.length < 2 || name.length > 120)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Il nome deve contenere da 2 a 120 caratteri.",
    });
  if (
    catalog.some(
      g =>
        g.id !== input.id &&
        g.name.toLocaleLowerCase("it") === name.toLocaleLowerCase("it")
    )
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "Esiste già un gruppo con questo nome.",
    });
  const saved = await tx.select().from(quotes).for("update");
  let updatedQuotes = 0,
    editToken: string | undefined;
  for (const row of saved) {
    const dataJson = renameGroupReferences(
      row.dataJson,
      group.name,
      name,
      group.id
    );
    if (dataJson === null) continue;
    const tokenMatches =
      row.id === input.quoteId && quoteWriteToken(row) === input.quoteToken;
    await tx.update(quotes).set({ dataJson }).where(eq(quotes.id, row.id));
    updatedQuotes++;
    if (tokenMatches) {
      const [fresh] = await tx
        .select()
        .from(quotes)
        .where(eq(quotes.id, row.id))
        .limit(1);
      editToken = quoteWriteToken(fresh);
    }
  }
  await tx
    .update(productGroups)
    .set({ name })
    .where(eq(productGroups.id, group.id));
  return { id: group.id, oldName: group.name, name, updatedQuotes, editToken };
}
