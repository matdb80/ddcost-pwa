import { verifyXlsxContainer } from "./excel-container-guard";
import * as XLSX from "xlsx";
import type {
  CellEvidence,
  CellScalar,
  SheetEvidence,
  WorkbookEvidence,
} from "../types/excel-import";
export const WORKBOOK_LIMITS = {
  maxBytes: 20 * 1024 * 1024,
  maxSheets: 100,
  maxCellsPerSheet: 150_000,
  maxCellsTotal: 500_000,
  maxEffectiveRows: 20_000,
  maxEffectiveColumns: 256,
  maxMerges: 10_000,
  maxMergeChecks: 2_000_000,
} as const;
function scalar(v: unknown): CellScalar {
  return v instanceof Date
    ? v
    : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
      ? v
      : null;
}
async function hash(buffer: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(d)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}
/** Sparse parsing: never walk the declared rectangular range.
 * Counts below are not a decompression/CPU sandbox; invoke from a terminable worker.
 */
export async function readWorkbookEvidence(
  file: File
): Promise<WorkbookEvidence> {
  if (!/\.(xls|xlsx)$/i.test(file.name))
    throw new Error("Formato non ammesso: usare .xls o .xlsx");
  if (file.size > WORKBOOK_LIMITS.maxBytes) throw new Error("File oltre 20 MB");
  const buffer = await file.arrayBuffer(),
    bytes = new Uint8Array(buffer);
  const zip =
    bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
  const cfb = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
    (v, i) => bytes[i] === v
  );
  if (/\.xlsx$/i.test(file.name) ? !zip : !cfb)
    throw new Error(
      "Il contenuto non corrisponde a un contenitore XLS/XLSX supportato"
    );
  if (zip) await verifyXlsxContainer(bytes);
  const info = XLSX.read(buffer, { type: "array", bookSheets: true });
  if (
    !info.SheetNames?.length ||
    info.SheetNames.length > WORKBOOK_LIMITS.maxSheets
  )
    throw new Error("Numero fogli non ammesso");
  const wb = XLSX.read(buffer, {
    type: "array",
    cellFormula: true,
    cellDates: false,
    cellNF: true,
    cellText: true,
    cellStyles: true,
    sheetStubs: false,
    cellHTML: false,
    xlfn: true,
  });
  let evidenceChars = 0;
  let total = 0;
  const sheets: SheetEvidence[] = [];
  wb.SheetNames.forEach((name, index) => {
    const ws = wb.Sheets[name];
    const cells: Record<string, CellEvidence> = {};
    let maxR = -1,
      maxC = -1,
      count = 0;
    for (const address of Object.keys(ws)) {
      if (address.startsWith("!")) continue;
      if (!/^[A-Z]+[1-9]\d*$/.test(address)) continue;
      const c = ws[address] as XLSX.CellObject;
      // cellStyles exposes format-only stubs, including far outside the data.
      // They are not effective data cells; keep formulas even without a cache.
      if (c.v == null && !c.f) continue;
      if (
        ++count > WORKBOOK_LIMITS.maxCellsPerSheet ||
        ++total > WORKBOOK_LIMITS.maxCellsTotal
      )
        throw new Error("Workbook troppo esteso");
      const pos = XLSX.utils.decode_cell(address);
      if (
        pos.r >= WORKBOOK_LIMITS.maxEffectiveRows ||
        pos.c >= WORKBOOK_LIMITS.maxEffectiveColumns
      )
        throw new Error(`Foglio ${name}: area effettiva eccessiva`);
      maxR = Math.max(maxR, pos.r);
      maxC = Math.max(maxC, pos.c);
      evidenceChars +=
        String(c.v ?? "").length +
        String(c.w ?? "").length +
        String(c.f ?? "").length +
        String(c.z ?? "").length +
        120;
      if (evidenceChars > 16 * 1024 * 1024)
        throw new Error("Evidenze Excel oltre il limite di memoria");
      cells[address] = {
        address,
        row: pos.r + 1,
        column: pos.c + 1,
        cellType: c.t,
        raw: scalar(c.v),
        cached: scalar(c.v),
        displayText: c.w ?? String(c.v ?? ""),
        numberFormat: c.z,
        formula: c.f,
        error: c.t === "e" ? (c.w ?? String(c.v)) : undefined,
        hiddenRow: ws["!rows"]?.[pos.r]?.hidden === true,
        hiddenColumn: ws["!cols"]?.[pos.c]?.hidden === true,
      };
    }
    const ranges = ws["!merges"] ?? [];
    if (
      ranges.length > WORKBOOK_LIMITS.maxMerges ||
      ranges.length * count > WORKBOOK_LIMITS.maxMergeChecks
    )
      throw new Error("Troppe celle unite da analizzare");
    const merges = ranges.map(XLSX.utils.encode_range);
    for (const range of ranges)
      for (const cell of Object.values(cells))
        if (
          cell.row - 1 >= range.s.r &&
          cell.row - 1 <= range.e.r &&
          cell.column - 1 >= range.s.c &&
          cell.column - 1 <= range.e.c
        )
          cell.mergedRange = XLSX.utils.encode_range(range);
    sheets.push({
      name,
      hidden: (wb.Workbook?.Sheets?.[index]?.Hidden ?? 0) !== 0,
      declaredRange: ws["!ref"],
      cells,
      merges,
      effectiveRows: maxR + 1,
      effectiveColumns: maxC + 1,
    });
  });
  return {
    fileName: file.name,
    sha256: await hash(buffer),
    byteLength: file.size,
    parserVersion: `sheetjs-${XLSX.version}`,
    sheets,
  };
}
