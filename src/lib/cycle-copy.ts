import { parseCycleRow, type CicloEditorModel } from "@/types/cycle";

/**
 * Prepare the latest saved cycle as the starting point for a new, independent cycle.
 * Business fields and unknown legacy JSON fields are retained; source identity is not.
 */
export function copyCycleAsNewDraft(
  source: Parameters<typeof parseCycleRow>[0],
): CicloEditorModel {
  const parsed = parseCycleRow(source);
  const extra = { ...parsed._extra };
  for (const key of ["id", "rootId", "root_id", "rev", "created_at"]) delete extra[key];

  return {
    ...parsed,
    id: undefined,
    rootId: undefined,
    rev: undefined,
    codice: "",
    righe: parsed.righe.map((row) => ({ ...row })),
    _extra: extra,
  };
}

/** Prepare an independent copy with its new visible identity already set. */
export function copyCycleAsNamedDraft(
  source: Parameters<typeof parseCycleRow>[0],
  code: string,
  description: string,
): CicloEditorModel {
  const nextCode=code.trim();
  const nextDescription=description.trim();
  if(!nextCode || !nextDescription)
    throw new Error("Inserire un nuovo codice e una nuova descrizione.");
  return {
    ...copyCycleAsNewDraft(source),
    codice:nextCode,
    descrizione:nextDescription,
  };
}
