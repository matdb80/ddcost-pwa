import { emptyRiga, type RigaCiclo } from "../types/cycle";
import type { DraftRow } from "../types/excel-import";
import { MAX_ASSEMBLY_LEVELS, rowDepth } from "./cycle-hierarchy";
/** Convert source references in two passes; no orphan can become a top-level cost. */
export function materializeImportRows(items: DraftRow[]): RigaCiclo[] {
  const selected = items.filter(r => r.included);
  const indices = new Map<number, number>();
  for (const [index, item] of selected.entries()) {
    if (!Number.isSafeInteger(item.excelRow) || item.excelRow <= 0 || indices.has(item.excelRow)) throw new Error("Riga sorgente non valida o duplicata nel blocco");
    indices.set(item.excelRow, index);
  }
  const rows = selected.map(item => {
    const sourceParent = item.parentSourceRow ?? item.row.parent_idx;
    if (sourceParent != null && !indices.has(sourceParent)) throw new Error("Padre assieme mancante o escluso");
    return {...emptyRiga(), ...item.row, considera: true, parent_idx: sourceParent == null ? null : indices.get(sourceParent)!};
  });
  rows.forEach((row, index) => {
    if (rowDepth(rows, index) > MAX_ASSEMBLY_LEVELS) throw new Error("Assieme oltre quattro livelli");
    if (row.parent_idx != null && rows[row.parent_idx].assembly_auto !== true) throw new Error("Padre senza somma automatica dei componenti");
    if (row.assembly_auto && (row.categoria !== "COMPONENTE/ASSIEME" || !rows.some(r => r.parent_idx === index))) throw new Error("Assieme automatico senza figli o categoria errata");
  });
  return rows;
}
