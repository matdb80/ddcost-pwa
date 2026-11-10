import type {
  CellEvidence,
  DraftRow,
  ImportProblem,
  ProductDraft,
  SheetEvidence,
  SourceRef,
} from "../types/excel-import";
import { parseExcelNumber } from "./excel-import-values";
import { normalizeTemplateLabel as norm } from "./excel-template-text";

// This layout has no category letters. L is an amount (kg, minutes or pieces),
// M is its unit rate, N the historical row cost, and O a percentage only.
const labels: Record<string, string[]> = {
  kind: ["cod prodotto", "articolo"],
  operation: ["cod lavorazone", "cod lavorazione", "lav"],
  description: ["voce di costo"],
  dimensions: ["dimensioni materiali"],
  gross: ["peso"],
  quantity: ["quant", "q ta", "quantita"],
  supplier: ["fornitore"],
  speed: ["colpi min"],
  unit: ["um", "u m"],
  basis: ["c u kg min"],
  rate: ["costo un kg"],
  cost: ["costo"],
  incidence: ["incidenza"],
};
export function findLegacyKgMinHeader(sheet: SheetEvidence) {
  const rows = new Map<number, CellEvidence[]>();
  for (const c of Object.values(sheet.cells)) {
    const row = rows.get(c.row) ?? [];
    row.push(c);
    rows.set(c.row, row);
  }
  const matches: { row: number; columns: Record<string, number> }[] = [];
  for (const [row, cells] of rows) {
    const columns: Record<string, number> = {};
    for (const [key, aliases] of Object.entries(labels)) {
      const found = cells.filter(c => aliases.includes(norm(c.displayText)));
      if (found.length === 1) columns[key] = found[0].column;
    }
    if (
      Object.keys(columns).length === Object.keys(labels).length &&
      columns.gross === columns.dimensions + 3 &&
      cells.some(
        c => c.column === columns.rate && c.displayText.includes("€")
      ) &&
      cells.some(c => c.column === columns.cost && c.displayText.includes("€"))
    )
      matches.push({ row, columns });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

export function legacyKgMinProduct(
  sheet: SheetEvidence
): ProductDraft | undefined {
  const h = findLegacyKgMinHeader(sheet);
  if (!h) return;
  const col = h.columns;
  const index = new Map(
    Object.values(sheet.cells).map(c => [`${c.row}:${c.column}`, c])
  );
  const at = (r: number, c: number) => index.get(`${r}:${c}`);
  const text = (r: number, c: number) => at(r, c)?.displayText.trim() ?? "";
  const source = (
    r: number,
    c: number,
    transform: SourceRef["transform"] = "number",
    unit?: string
  ): SourceRef => {
    const cell = at(r, c);
    return {
      sheet: sheet.name,
      addresses: cell ? [cell.address] : [],
      original: cell ? [cell.raw] : [],
      formulas: cell?.formula ? [cell.formula] : [],
      transform,
      unit,
    };
  };
  const problem = (
    code: string,
    message: string,
    r?: number,
    severity: ImportProblem["severity"] = "error"
  ): ImportProblem => ({
    id: `KGMIN_${code}_${r ?? sheet.name}`,
    code: `KGMIN_${code}_${r ?? sheet.name}`,
    sheet: sheet.name,
    rowKey: r ? `${sheet.name}:${r}` : undefined,
    message,
    severity,
    resolved: false,
  });
  const value = (r: number, c: number) => {
    const cell = at(r, c),
      parsed = parseExcelNumber(cell?.raw);
    return cell &&
      !cell.error &&
      !(cell.formula && cell.cached == null) &&
      parsed.ok
      ? parsed.value
      : undefined;
  };
  const rows: DraftRow[] = [],
    problems: ImportProblem[] = [];
  const historical: (number | undefined)[] = [];
  let totalRow: number | undefined;
  const codeCells: CellEvidence[] = [];
  for (let r = h.row + 1; r <= sheet.effectiveRows; r++) {
    if (
      [col.operation, col.description, col.rate].some(c =>
        /^(totale|costo primo|full cost)$/.test(norm(text(r, c)))
      )
    ) {
      totalRow = r;
      break;
    }
    // Do not turn dimensional subheaders or notes into operations. Keep damaged
    // cost rows even when their description/unit/quantity is absent.
    if (
      ![col.quantity, col.unit, col.rate, col.cost, col.speed, col.basis].some(
        c => text(r, c)
      )
    )
      continue;
    const p: ImportProblem[] = [];
    const num = (column: number, field: string, required = true) => {
      const v = value(r, column);
      if (v === undefined && (required || text(r, column)))
        p.push(
          problem(
            field,
            `${at(r, column)?.address ?? `riga ${r}`}: valore mancante o non valido`,
            r
          )
        );
      return v;
    };
    const description = text(r, col.description),
      unit = norm(text(r, col.unit));
    const quantity = num(col.quantity, "QUANTITY"),
      basis = value(r, col.basis);
    const rate = value(r, col.rate);
    const row: DraftRow = {
      key: `${sheet.name}:${r}`,
      excelRow: r,
      included: true,
      kind: "cost",
      row: {
        descrizione: description,
        nr_componenti: quantity,
        fornitore: text(r, col.supplier),
      },
      sources: {
        categoria: source(r, col.unit, "text"),
        descrizione: source(r, col.description, "text"),
        nr_componenti: source(r, col.quantity, "number", "pz"),
        fornitore: source(r, col.supplier, "text"),
        costo_storico: source(r, col.cost, "number", "EUR"),
        incidenza_storica: source(r, col.incidence, "identity", "frazione"),
      },
      problems: p,
      validationIds: ["VAL-003"],
    };
    if (!description)
      p.push(
        problem("DESCRIPTION", "Descrizione della voce da specificare", r)
      );
    if (/attrezzagg|setup|stampi/i.test(description)) {
      p.push(
        problem(
          "CATEGORY",
          "Possibile attrezzaggio: confermare la categoria e i minuti prima di proseguire",
          r
        )
      );
    } else if (unit === "min") {
      row.row.categoria = "LAVORAZIONE INTERNA";
      const speed = value(r, col.speed);
      row.row.colpi_min = text(r, col.speed)
        ? speed
        : basis && basis > 0
          ? 1 / basis
          : undefined;
      row.sources.colpi_min = source(
        r,
        text(r, col.speed) ? col.speed : col.basis,
        text(r, col.speed) ? "number" : "minutes_to_rate",
        text(r, col.speed) ? "pz/min" : "min/pz"
      );
      row.sources.tariffa_storica = source(r, col.rate, "number", "EUR/min");
      row.sources.tempo_storico = source(r, col.basis, "number", "min/pz");
      if (
        !row.row.colpi_min ||
        row.row.colpi_min <= 0 ||
        (speed && basis !== undefined && Math.abs(1 / speed - basis) > 1e-8)
      )
        p.push(
          problem(
            "SPEED",
            "Velocità mancante o incoerente con i minuti per pezzo: correggere esplicitamente",
            r
          )
        );
    } else if (unit === "kg") {
      const raw =
        /^materiale\b/i.test(description) ||
        [col.dimensions, col.dimensions + 1, col.dimensions + 2].every(
          c => (value(r, c) ?? 0) > 0
        );
      row.row.categoria = raw
        ? "MATERIA PRIMA DA TRASFORMARE"
        : "LAVORAZIONE TERZISTA A PESO";
      // Use the weight actually multiplied by the rate, preserving deductions
      // for finishing instead of substituting the gross G weight or new density.
      row.row.peso_kg = num(col.basis, "WEIGHT");
      row.sources.peso_kg = source(r, col.basis, "kg", "kg");
      if (raw) {
        for (const [field, c, issue] of [
          ["lunghezza", col.dimensions, "LENGTH"],
          ["larghezza", col.dimensions + 1, "WIDTH"],
          ["spessore", col.dimensions + 2, "THICKNESS"],
        ] as const) {
          const v = num(c, issue, false);
          if (v !== undefined) row.row[field] = v;
          if (at(r, c)) row.sources[field] = source(r, c, "mm", "mm");
        }
      }
    } else if (["pz", "cad"].includes(unit)) {
      row.row.categoria = /zinc|vernici|trattament|catafores/i.test(description)
        ? "LAVORAZIONE TERZISTA A PEZZO"
        : "COMPONENTE";
      const pieces = num(col.basis, "QUANTITY");
      row.row.nr_componenti =
        quantity !== undefined && pieces !== undefined
          ? quantity * pieces
          : undefined;
      const ref = source(r, col.basis, "number", "pz");
      row.sources.nr_componenti = {
        ...row.sources.nr_componenti,
        addresses: [...row.sources.nr_componenti.addresses, ...ref.addresses],
        original: [...row.sources.nr_componenti.original, ...ref.original],
        formulas: [
          ...(row.sources.nr_componenti.formulas ?? []),
          ...(ref.formulas ?? []),
        ],
      };
    } else
      p.push(
        problem(
          "CATEGORY",
          `Unità '${text(r, col.unit) || "mancante"}': categoria DDCost da confermare`,
          r
        )
      );
    if (row.row.categoria !== "LAVORAZIONE INTERNA") {
      row.row.costo_unitario = num(col.rate, "RATE");
      row.sources.costo_unitario = source(
        r,
        col.rate,
        "number",
        unit === "kg" ? "EUR/kg" : "EUR/pz"
      );
    }
    const cost = value(r, col.cost);
    historical.push(cost !== undefined && cost >= 0 ? cost : undefined);
    if (
      cost !== undefined &&
      quantity !== undefined &&
      basis !== undefined &&
      rate !== undefined &&
      Math.abs(cost - quantity * basis * rate) > 1e-8
    )
      problems.push(
        problem(
          "HISTORICAL_MISMATCH",
          `Riga ${r}: il costo storico non coincide con quantità × base × tariffa; resta evidenza originale`,
          r,
          "warning"
        )
      );
    const code = at(r, col.kind);
    if (code && String(code.raw ?? "").trim()) codeCells.push(code);
    rows.push(row);
  }
  if (!rows.length) return;
  if (
    totalRow &&
    Object.values(sheet.cells).some(
      c =>
        c.row > totalRow! &&
        [col.quantity, col.unit, col.basis, col.speed].includes(c.column) &&
        c.displayText.trim()
    )
  )
    problems.push(
      problem(
        "EXTRA_ROWS",
        "Altre voci dopo il totale: separare i blocchi prima di importare questo foglio"
      )
    );
  if (!totalRow)
    problems.push(
      problem(
        "TOTAL",
        "Chiusura della tabella costi non riconosciuta: verificare il foglio"
      )
    );
  const codes = [
    ...new Set(codeCells.flatMap(c => c.displayText.trim().split(/\s+/))),
  ];
  const code =
    codes.length === 1 && /^[A-Z0-9_-]+$/i.test(codes[0])
      ? codes[0]
      : undefined;
  if (!code)
    problems.push(
      problem(
        "CODE",
        codes.length > 1
          ? `Più codici nel foglio: ${codes.join(", ")}. Scegliere il codice da importare.`
          : "Codice articolo assente: indicarlo oppure scegliere esplicitamente il nome del foglio."
      )
    );
  const historicalDirectCostEur = historical.every(
    (v): v is number => v !== undefined
  )
    ? historical.reduce((a, b) => a + b, 0)
    : undefined;
  if (historicalDirectCostEur === undefined)
    problems.push(
      problem(
        "HISTORICAL",
        "Confronto storico incompleto: manca almeno un costo valido",
        undefined,
        "warning"
      )
    );
  const total = totalRow ? value(totalRow, col.cost) : undefined;
  if (
    total !== undefined &&
    historicalDirectCostEur !== undefined &&
    Math.abs(total - historicalDirectCostEur) > 1e-8
  )
    problems.push(
      problem(
        "TOTAL_MISMATCH",
        "Il totale storico differisce dalla somma delle voci: non viene sommato una seconda volta",
        undefined,
        "warning"
      )
    );
  return {
    key: `${sheet.name}:${h.row}`,
    code,
    label: sheet.name.trim(),
    selected: false,
    layout: "LEGACY-KG-MIN",
    identitySources: {
      code: {
        sheet: sheet.name,
        addresses: codeCells.map(c => c.address),
        original: codeCells.map(c => c.raw),
        transform: "text",
      },
    },
    variantGroup: sheet.name,
    rows,
    problems: [...problems, ...rows.flatMap(r => r.problems)],
    historicalDirectCostEur,
    setupState: { status: "missing", sources: [] },
    options: [],
  };
}
