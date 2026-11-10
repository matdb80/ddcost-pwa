import type { SheetEvidence, WorkbookEvidence } from "../types/excel-import";
import { extractF3Letters, findF3Header } from "./excel-f3-letters";
import {
  findLegacyKgMinHeader,
  legacyKgMinProduct,
} from "./excel-legacy-kg-min";

export function findCycleImportHeader(s: SheetEvidence) {
  const f3 = findF3Header(s);
  if (f3) return { ...f3, layout: "F3-LETTERS" as const };
  const legacy = findLegacyKgMinHeader(s);
  return legacy ? { ...legacy, layout: "LEGACY-KG-MIN" as const } : undefined;
}
export function extractCycleWorkbook(w: WorkbookEvidence) {
  const draft = extractF3Letters(w);
  const recognized = new Set(
    draft.products.flatMap(p =>
      p.rows.flatMap(r => Object.values(r.sources).map(s => s.sheet))
    )
  );
  const legacy = w.sheets
    .filter(s => !s.hidden && !recognized.has(s.name))
    .flatMap(s => {
      const product = legacyKgMinProduct(s);
      return product ? [product] : [];
    });
  if (legacy.length) {
    draft.products.push(...legacy);
    draft.problems = draft.problems.filter(p => p.code !== "F3_NONE");
    draft.decisions = [
      ...(recognized.size ? ["F3-LETTERE"] : []),
      "LEGACY-KG-MIN",
      "VAL-003",
    ];
  }
  return draft;
}
