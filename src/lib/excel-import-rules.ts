import type { DraftRow, ImportProblem } from "../types/excel-import";
const validTime = (n: number) => Number.isFinite(n) && n > 0 && Number.isFinite(1 / n);
const hbReset = (row: DraftRow): DraftRow => ({...row, problems: row.problems.filter(p => !["HB_TIME", "BOX_QUANTITY"].includes(p.code))});
function problem(code: string, message: string, row: DraftRow): ImportProblem {
  return {id: `${row.key}-${code}`, severity: "error", code, message, rowKey: row.key, resolved: false};
}
/** Applies only after identifying the confirmed 704 HB source / time basis. */
export function apply704Hb(minutesPerPiece: number, original: DraftRow): DraftRow {
  const row = hbReset(original);
  if (!validTime(minutesPerPiece)) return {...row, problems: [...row.problems, problem("HB_TIME", "Tempo per pezzo positivo e finito richiesto", row)]};
  return {...row, validationIds: [...new Set([...(row.validationIds ?? []), "VAL-001"])], row: {...row.row, categoria: "LAVORAZIONE INTERNA", confezionamento: false, colpi_min: 1 / minutesPerPiece, nr_componenti: 1, quantita_per_conf: 0, tempo_confezionamento_min: 0}};
}
export function apply704HbBox(minutesPerPiece: number, quantity: number, original: DraftRow): DraftRow {
  const row = hbReset(original);
  if (!validTime(minutesPerPiece) || !Number.isFinite(minutesPerPiece * quantity)) return {...row, problems: [...row.problems, problem("HB_TIME", "Tempo per pezzo positivo e finito richiesto", row)]};
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return {...row, problems: [...row.problems, problem("BOX_QUANTITY", "Quantità scatola: intero positivo richiesto", row)]};
  return {...row, validationIds: [...new Set([...(row.validationIds ?? []), "VAL-001"])], row: {...row.row, categoria: "LAVORAZIONE INTERNA", confezionamento: true, quantita_per_conf: quantity, tempo_confezionamento_min: minutesPerPiece * quantity, colpi_min: 0, nr_componenti: 1}};
}
/** Sample assertions, not recognizers: call only for the confirmed source block. */
export function assert704N96PRows(rows: DraftRow[]): ImportProblem[] {
  return [3,4,5,6,7,8].filter(n => rows.filter(r => r.excelRow === n && r.included && r.row.considera !== false).length !== 1)
    .map(n => ({id: `n96p-${n}`, severity: "error", code: "VAL002_ROW_MISSING", message: `VAL-002: includere una volta la riga Excel ${n}`, rowKey: String(n), resolved: false}));
}
export function assert469Setup(rows: DraftRow[]): ImportProblem[] {
  const expected = [60,60,20,20,20];
  const valid = expected.every((minutes, i) => {
    const matches = rows.filter(r => r.excelRow === 32 + i && r.included && r.row.considera !== false);
    return matches.length === 1 && matches[0].row.attrezzaggio_min === minutes;
  });
  return valid ? [] : [{id: "469-setup", severity: "error", code: "VAL003_SETUP", message: "VAL-003: includere D32:D36 una volta: 60 + 60 + 20 + 20 + 20 = 180 minuti", resolved: false}];
}
