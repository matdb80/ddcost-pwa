import type {
  SheetEvidence,
  TemplateDefinition,
  TemplateMatch,
} from "../types/excel-import";
import { normalizeTemplateLabel as norm } from "./excel-template-text";
const MAX_CHECKS = 2_000_000;
export function matchTemplate(
  sheet: SheetEvidence,
  candidate: {
    id: number;
    rootId: number;
    version: number;
    definition: TemplateDefinition;
  }
): TemplateMatch {
  const result: TemplateMatch = {
    templateId: candidate.id,
    rootId: candidate.rootId,
    version: candidate.version,
    definition: candidate.definition,
    score: 0,
    conflicts: [],
  };
  const conflict = (code: string, message: string) => {
    result.conflicts.push({
      id: `match-${candidate.id}`,
      severity: "error",
      code,
      message,
      sheet: sheet.name,
      resolved: false,
    });
    return result;
  };
  const sigs = candidate.definition.signature.map(s => ({
    ...s,
    normalized: norm(s.normalized),
  }));
  if (
    sigs.length < 2 ||
    sigs.length > 100 ||
    sigs.some(
      s =>
        !s.normalized ||
        !Number.isSafeInteger(s.relativeRow) ||
        Math.abs(s.relativeRow) > 19_999 ||
        !Number.isSafeInteger(s.relativeColumn) ||
        Math.abs(s.relativeColumn) > 255
    ) ||
    new Set(sigs.map(s => `${s.relativeRow}:${s.relativeColumn}`)).size !==
      sigs.length
  )
    return conflict(
      "TEMPLATE_SIGNATURE_INVALID",
      "Firma strutturale non valida"
    );
  const cells = Object.values(sheet.cells);
  if (cells.length > 150_000)
    return conflict(
      "TEMPLATE_MATCH_LIMIT",
      "Troppe celle per il riconoscimento"
    );
  const at = new Map<string, string>();
  const labels = new Map<string, Array<{ row: number; column: number }>>();
  for (const cell of cells) {
    const n = norm(cell.displayText);
    if (!n) continue;
    at.set(`${cell.row}:${cell.column}`, n);
    const positions = labels.get(n) ?? [];
    positions.push(cell);
    labels.set(n, positions);
  }
  // The matching origin may itself be empty. Derive it from each matching label.
  const origins = new Set<string>();
  let work = 0;
  for (const sig of sigs)
    for (const cell of labels.get(sig.normalized) ?? []) {
      if (++work > MAX_CHECKS)
        return conflict(
          "TEMPLATE_MATCH_LIMIT",
          "Riconoscimento troppo esteso: restringere il foglio o la firma"
        );
      const row = cell.row - sig.relativeRow,
        column = cell.column - sig.relativeColumn;
      if (row >= 1 && row <= 20_000 && column >= 1 && column <= 256)
        origins.add(`${row}:${column}`);
    }
  const exact: Array<{ row: number; column: number }> = [];
  for (const origin of origins) {
    if ((work += sigs.length) > MAX_CHECKS)
      return conflict(
        "TEMPLATE_MATCH_LIMIT",
        "Riconoscimento troppo esteso: restringere il foglio o la firma"
      );
    const [row, column] = origin.split(":").map(Number);
    const hits = sigs.filter(
      s =>
        at.get(`${row + s.relativeRow}:${column + s.relativeColumn}`) ===
        s.normalized
    ).length;
    result.score = Math.max(result.score, hits / sigs.length);
    if (hits === sigs.length) exact.push({ row, column });
  }
  if (exact.length > 1)
    return conflict(
      "TEMPLATE_SIGNATURE_AMBIGUOUS",
      "Più blocchi compatibili: scegliere il blocco da mappare"
    );
  if (exact.length === 0)
    return conflict(
      "TEMPLATE_SIGNATURE_CONFLICT",
      `Compatibilità strutturale ${(result.score * 100).toFixed(0)}%: verificare la mappatura`
    );
  result.anchor = exact[0];
  // Matching is evidence, not authorization; automatic reuse also requires approved status from the server.
  return result;
}
