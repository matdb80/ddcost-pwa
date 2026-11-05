import { z } from "zod";
import { rawMaterialCalculation } from "../src/lib/cycle-raw-material";
import type { RigaCiclo } from "../src/types/cycle";

/** Validate only explicitly versioned new material rows; do not migrate archives. */
export const cycleMaterialDataJson = z.string().superRefine((text, ctx) => {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return; }
  if (!value || typeof value !== "object" || !Array.isArray((value as { righe?: unknown }).righe)) return;
  for (const [index, row] of (value as { righe: unknown[] }).righe.entries()) {
    if (!row || typeof row !== "object") continue;
    const r = row as RigaCiclo;
    if (r.categoria !== "MATERIA PRIMA DA TRASFORMARE" || r.materia_prima_versione !== 2) continue;
    const errors = rawMaterialCalculation(r).errors;
    if (errors.length) ctx.addIssue({ code: "custom", message: `Materia prima, riga ${index + 1}: ${errors.join(" ")}` });
  }
});
