import type {
  CellEvidence,
  DraftRow,
  ImportDraft,
  ImportProblem,
  ProductDraft,
  SheetEvidence,
  SourceRef,
  WorkbookEvidence,
} from "../types/excel-import";
import { parseExcelNumber } from "./excel-import-values";
const LABELS = {
  kind: ["tipo costo"],
  description: ["voce di costo", "descrizione"],
  gross: ["peso lordo", "peso compreso sfrido"],
  net: ["peso netto", "peso senza sfrido"],
  quantity: ["nr componenti", "nr. componenti", "quantita"],
  speed: ["colpi min", "colpi/min"],
  unit: ["u.m", "um"],
  rate: ["tariffa fornitura", "fornitura"],
  labour: ["c.u. orario", "tariffa lavoro", "lavoro/min"],
  cost: ["tot.voce di costo", "totale", "costo riga"],
};
const CATEGORY = {
  c: "COMPONENTE",
  m: "MATERIA PRIMA DA TRASFORMARE",
  w: "LAVORAZIONE INTERNA",
  t: "LAVORAZIONE TERZISTA A PESO",
  s: "LAVORAZIONE TERZISTA A PEZZO",
} as const;
type Index = Map<string, CellEvidence>;
const indexes = new WeakMap<SheetEvidence, Index>();
const idx = (s: SheetEvidence) => {
  let i = indexes.get(s);
  if (!i) {
    i = new Map(Object.values(s.cells).map(c => [`${c.row}:${c.column}`, c]));
    indexes.set(s, i);
  }
  return i;
};
const at = (s: SheetEvidence, r: number, c: number) => idx(s).get(`${r}:${c}`);
const text = (c?: CellEvidence) => (c?.displayText ?? "").trim();
const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const src = (
  s: SheetEvidence,
  c?: CellEvidence,
  transform: "text" | "number" | "mm" | "kg" | "identity" = "identity",
  unit?: string
): SourceRef => ({
  sheet: s.name,
  addresses: c ? [c.address] : [],
  original: c ? [c.raw] : [],
  formulas: c?.formula ? [c.formula] : [],
  transform,
  unit,
});
const prob = (
  id: string,
  message: string,
  row?: number,
  severity: "error" | "warning" = "error"
): ImportProblem => ({
  id,
  severity,
  code: id,
  message,
  rowKey: row ? String(row) : undefined,
  resolved: false,
});
function n(
  s: SheetEvidence,
  r: number,
  c: number | undefined,
  p: ImportProblem[],
  name: string,
  required = false
) {
  if (!c) return undefined;
  const cell = at(s, r, c);
  const raw = cell?.raw ?? cell?.displayText;
  if (raw == null || raw === "" || text(cell) === "---") {
    if (required)
      p.push(prob(`F3_${name}_${r}`, `${name}: valore mancante`, r));
    return undefined;
  }
  if (cell?.error) {
    p.push(prob(`F3_${name}_${r}`, `${name}: errore Excel ${cell.address}`, r));
    return undefined;
  }
  const x = parseExcelNumber(raw);
  if (!x.ok) {
    p.push(
      prob(`F3_${name}_${r}`, `${name}: valore ambiguo '${text(cell)}'`, r)
    );
    return undefined;
  }
  return x.value;
}
export function findF3Header(s: SheetEvidence) {
  const rows = new Map<number, Array<{ cell: CellEvidence; label: string }>>();
  for (const cell of Object.values(s.cells)) {
    const row = rows.get(cell.row) ?? [];
    row.push({ cell, label: norm(cell.displayText) });
    rows.set(cell.row, row);
  }
  let best:
    { row: number; columns: Record<string, number>; hits: number } | undefined;
  for (const [row, cells] of rows) {
    const columns: Record<string, number> = {};
    let hits = 0;
    for (const [key, labels] of Object.entries(LABELS)) {
      const starts = cells.filter(c =>
        labels.some(l => c.label.startsWith(norm(l)))
      );
      const matches = starts.length
        ? starts
        : cells.filter(c => labels.some(l => c.label.includes(norm(l))));
      if (matches.length === 1) {
        columns[key] = matches[0].cell.column;
        hits++;
      }
    }
    if (!best || hits > best.hits) best = { row, columns, hits };
  }
  return best &&
    ["kind", "description", "quantity", "speed", "unit", "rate", "cost"].every(
      k => best!.columns[k] !== undefined
    )
    ? best
    : undefined;
}
function inferCategory(unit: string, hasSpeed: boolean, hasWeight: boolean) {
  const u = norm(unit);
  if (hasSpeed) return "LAVORAZIONE INTERNA" as const;
  if (hasWeight || u.includes("kg"))
    return "LAVORAZIONE TERZISTA A PESO" as const;
  if (u.includes("pz") || u.includes("cad"))
    return "LAVORAZIONE TERZISTA A PEZZO" as const;
  return undefined;
}
function baseRow(
  s: SheetEvidence,
  r: number,
  col: Record<string, number>,
  forcedCategory?: string
): DraftRow {
  const p: ImportProblem[] = [];
  const letter = text(
    at(s, r, col.kind)
  ).toLowerCase() as keyof typeof CATEGORY;
  const speed = n(s, r, col.speed, p, "SPEED");
  const gross = n(s, r, col.gross, p, "GROSS");
  const net = n(s, r, col.net, p, "NET");
  const category = (CATEGORY[letter] ??
    forcedCategory ??
    inferCategory(
      text(at(s, r, col.unit)),
      !!speed,
      gross != null || net != null
    )) as any;
  const quantity = n(s, r, col.quantity, p, "QUANTITY", true);
  const rate = n(s, r, col.rate, p, "RATE");
  const hist = n(s, r, col.cost, p, "HISTORICAL");
  const d = text(at(s, r, col.description));
  if (!category)
    p.push(
      prob(
        `F3_CATEGORY_${r}`,
        `Categoria da confermare per '${d || `riga ${r}`}'`,
        r
      )
    );
  const row: DraftRow = {
    key: `${s.name}:${r}`,
    excelRow: r,
    included: true,
    kind: "cost",
    row: { categoria: category, descrizione: d, nr_componenti: quantity },
    sources: {
      categoria: src(s, at(s, r, col.kind), "text"),
      descrizione: src(s, at(s, r, col.description), "text"),
      nr_componenti: src(s, at(s, r, col.quantity), "number", "pz"),
      unita: src(s, at(s, r, col.unit), "text"),
      costo_storico: src(s, at(s, r, col.cost), "number", "EUR"),
    },
    problems: p,
    validationIds: ["VAL-003"],
  };
  row.sources.peso_lordo = src(s, at(s, r, col.gross), "kg", "kg");
  row.sources.peso_netto = src(s, at(s, r, col.net), "kg", "kg");
  row.sources.colpi_min = src(s, at(s, r, col.speed), "number", "pz/min");
  row.sources.costo_unitario = src(s, at(s, r, col.rate), "number");
  row.sources.tariffa_storica = src(
    s,
    at(s, r, col.labour),
    "number",
    "EUR/min"
  );
  if (category === "LAVORAZIONE INTERNA") row.row.colpi_min = speed;
  else if (category === "LAVORAZIONE TERZISTA A PESO") {
    row.row.peso_kg = net ?? gross;
    row.row.costo_unitario = rate;
  } else if (
    category === "COMPONENTE" ||
    category === "LAVORAZIONE TERZISTA A PEZZO"
  )
    row.row.costo_unitario = rate;
  else if (category === "MATERIA PRIMA DA TRASFORMARE") {
    row.row.peso_kg = gross;
    row.row.costo_unitario = rate;
    row.row.tipo_materiale = text(at(s, r, col.kind + 1));
    row.row.lunghezza = n(s, r, col.kind + 3, p, "LENGTH");
    row.row.larghezza = n(s, r, col.kind + 4, p, "WIDTH");
    row.row.spessore = n(s, r, col.kind + 5, p, "THICKNESS");
  }
  if (
    rate === undefined &&
    hist !== undefined &&
    (category === "COMPONENTE" ||
      category === "LAVORAZIONE TERZISTA A PEZZO" ||
      category === "LAVORAZIONE TERZISTA A PESO")
  )
    p.push(
      prob(
        `F3_RATE_${r}`,
        "Tariffa unitaria mancante: O resta sola evidenza",
        r
      )
    );
  return row;
}
function meaningful(s: SheetEvidence, r: number, col: Record<string, number>) {
  return (
    !!text(at(s, r, col.description)) &&
    (at(s, r, col.cost)?.raw != null ||
      at(s, r, col.rate)?.raw != null ||
      at(s, r, col.speed)?.raw != null)
  );
}
function setupTitle(s: SheetEvidence, col: Record<string, number>) {
  return Object.values(s.cells).find(
    c =>
      c.column === col.description &&
      /^(attrezzaggi|tempo complessivo stampi)$/.test(norm(c.displayText))
  );
}
function setupSection(s: SheetEvidence, col: Record<string, number>) {
  const all = Object.values(s.cells),
    title = setupTitle(s, col);
  if (!title)
    return {
      rows: [] as DraftRow[],
      status: "missing" as const,
      sources: [] as SourceRef[],
    };
  const rows: DraftRow[] = [],
    refs: SourceRef[] = [src(s, title, "text")],
    minutesColumn = col.kind + 3;
  const start =
    norm(title.displayText) === "tempo complessivo stampi"
      ? title.row
      : title.row + 1;
  for (let r = start; r <= Math.min(s.effectiveRows, title.row + 12); r++) {
    const d = text(at(s, r, col.description)),
      cell = at(s, r, minutesColumn);
    if (!cell) continue;
    if (norm(text(cell)) === "min") continue;
    refs.push(src(s, cell, "number", "min"));
    if (at(s, r, minutesColumn + 1))
      refs.push(src(s, at(s, r, minutesColumn + 1), "number", "EUR"));
    // Unnamed totals and explicit totals remain evidence. They are never setup details.
    if (!d || /totale|riepilogo/i.test(d)) continue;
    const problems: ImportProblem[] = [],
      minutes = n(s, r, minutesColumn, problems, "SETUP", true);
    rows.push({
      key: `${s.name}:setup:${r}`,
      excelRow: r,
      included: true,
      kind: "setup",
      row: {
        categoria: "LAVORAZIONE INTERNA",
        descrizione: d,
        attrezzaggio_min: minutes,
        nr_componenti: 1,
      },
      sources: {
        attrezzaggio_min: src(s, cell, "number", "min"),
        descrizione: src(s, at(s, r, col.description), "text"),
      },
      problems,
      validationIds: ["VAL-003"],
    });
  }
  const lotValues: number[] = [];
  for (const label of all.filter(
    c =>
      c.row >= title.row &&
      c.row <= title.row + 15 &&
      norm(c.displayText).includes("lotto")
  )) {
    const candidates = [
      at(s, label.row + 1, label.column),
      at(s, label.row, label.column + 1),
    ];
    for (const cell of candidates) {
      if (!cell) continue;
      const value = parseExcelNumber(cell.raw);
      if (value.ok && value.value > 0) {
        lotValues.push(value.value);
        refs.push(src(s, cell, "number", "pz"));
      }
    }
  }
  const uniqueLots = [...new Set(lotValues)],
    lot = uniqueLots.length === 1 ? uniqueLots[0] : undefined;
  const complete =
    rows.length > 0 &&
    rows.every(
      r =>
        typeof r.row.attrezzaggio_min === "number" &&
        Number.isFinite(r.row.attrezzaggio_min) &&
        r.row.attrezzaggio_min >= 0
    );
  const minutes = complete
    ? rows.reduce((sum, r) => sum + r.row.attrezzaggio_min!, 0)
    : undefined;
  return {
    rows,
    status:
      minutes === undefined
        ? ("missing" as const)
        : minutes === 0
          ? ("explicit-zero" as const)
          : ("known" as const),
    minutes,
    lot,
    sources: refs,
  };
}
function product(s: SheetEvidence): ProductDraft | undefined {
  const h = findF3Header(s);
  if (!h) return;
  const col = h.columns;
  const base: DraftRow[] = [];
  for (let r = h.row + 1; r <= s.effectiveRows; r++) {
    const letter = text(at(s, r, col.kind));
    if (/^[cmwts]$/i.test(letter)) base.push(baseRow(s, r, col));
  }
  if (!base.length) return;
  const baseEnd = Math.max(...base.map(r => r.excelRow));
  const optionRows: DraftRow[] = [];
  const finishEnd = (setupTitle(s, col)?.row ?? s.effectiveRows + 1) - 1;
  for (let r = baseEnd + 1; r <= finishEnd; r++) {
    if (!meaningful(s, r, col)) continue;
    const desc = text(at(s, r, col.description));
    if (/totale|subtotale|riepilogo|attrezzagg|tempo complessivo/i.test(desc))
      continue;
    optionRows.push(baseRow(s, r, col));
  }
  const choice = Object.values(s.cells).find(
    c =>
      c.row > baseEnd && c.row <= finishEnd && norm(c.displayText) === "scelta"
  );
  const options = optionRows.map(r => {
    const selected = choice
      ? /^x$/i.test(text(at(s, r.excelRow, choice.column)))
      : true;
    return {
      key: `opt:${r.key}`,
      label: r.row.descrizione || `Opzione riga ${r.excelRow}`,
      rowKeys: [r.key],
      required: !choice,
      historicalSelected: selected,
      selected,
      sources: [
        src(s, at(s, r.excelRow, col.description), "text"),
        ...(choice ? [src(s, at(s, r.excelRow, choice.column), "text")] : []),
      ],
    };
  });
  for (const r of optionRows)
    r.included =
      options.find(o => o.rowKeys.includes(r.key))?.selected ?? false;
  const setup = setupSection(s, col);
  const selected = [...base, ...optionRows.filter(r => r.included)];
  const historicalValues = selected.map(r => {
    const cell = at(s, r.excelRow, col.cost),
      value = parseExcelNumber(cell?.raw ?? cell?.displayText);
    return cell &&
      !cell.error &&
      !(cell.formula && cell.cached == null) &&
      value.ok &&
      Number.isFinite(value.value) &&
      value.value >= 0
      ? value.value
      : undefined;
  });
  let historical: number | undefined = historicalValues.every(
    (value): value is number => value !== undefined
  )
    ? historicalValues.reduce((sum, value) => sum + value, 0)
    : undefined;
  const codeCandidates = Object.values(s.cells).filter(
    c =>
      c.row <= h.row &&
      c.column <= col.description &&
      text(c) &&
      !/tipo costo|voce di costo/i.test(text(c))
  );
  const code = codeCandidates
    .map(c => text(c))
    .find(v => /^[A-Z0-9_-]{4,}$/i.test(v) && v !== "---");
  const problems = [...base, ...optionRows, ...setup.rows].flatMap(
    r => r.problems
  );
  if (historical === undefined)
    problems.push(
      prob(
        "F3_HISTORICAL_INCOMPLETE",
        "Confronto storico non disponibile: manca almeno un costo sorgente valido",
        undefined,
        "warning"
      )
    );
  const finishHeadings = Object.values(s.cells).filter(
    c =>
      c.column === col.description &&
      c.row > baseEnd &&
      c.row <= finishEnd &&
      text(c) &&
      !meaningful(s, c.row, col) &&
      !/costi complessivi|totale|riepilogo|aggiornamento/i.test(text(c))
  );
  if (!choice && finishHeadings.length > 1) {
    historical = undefined;
    problems.push(
      prob(
        "F3_VARIANTS_REQUIRED",
        "Più finiture alternative: separare i prodotti prima dell'anteprima"
      )
    );
  }
  if (!code)
    problems.push(prob(`F3_CODE_${s.name}`, "Codice prodotto da confermare"));
  return {
    key: `${s.name}:${h.row}`,
    code,
    label: text(codeCandidates[0]) || s.name,
    selected: false,
    variantGroup: s.name,
    rows: [...base, ...optionRows, ...setup.rows],
    problems,
    historicalDirectCostEur: historical,
    setupState: {
      status: setup.status,
      minutes: setup.minutes,
      lot: setup.lot,
      sources: setup.sources,
    },
    options,
  };
}
function productsFromSheet(s: SheetEvidence): ProductDraft[] {
  const initial = product(s);
  if (!initial) return [];
  if (!initial.problems.some(p => p.code === "F3_VARIANTS_REQUIRED"))
    return [initial];
  const h = findF3Header(s);
  if (!h) return [initial];
  const col = h.columns;
  const optionKeys = new Set((initial.options ?? []).flatMap(o => o.rowKeys));
  const baseRows = initial.rows.filter(
    r => r.kind === "cost" && !optionKeys.has(r.key)
  );
  const optionRows = initial.rows.filter(r => optionKeys.has(r.key));
  const setupRows = initial.rows.filter(r => r.kind === "setup");
  const baseEnd = Math.max(...baseRows.map(r => r.excelRow));
  const finishEnd = (setupTitle(s, col)?.row ?? s.effectiveRows + 1) - 1;
  const headings = Object.values(s.cells)
    .filter(
      c =>
        c.column === col.description &&
        c.row > baseEnd &&
        c.row <= finishEnd &&
        text(c) &&
        !meaningful(s, c.row, col) &&
        !/costi complessivi|totale|riepilogo|aggiornamento/i.test(text(c))
    )
    .sort((a, b) => a.row - b.row);
  if (headings.length < 2) return [initial];
  const groups = headings.map((heading, index) => ({
    heading,
    chosen: optionRows.filter(
      r =>
        r.excelRow > heading.row &&
        r.excelRow < (headings[index + 1]?.row ?? finishEnd + 1)
    ),
  }));
  // An unassigned heading or operation requires explicit mapping; never invent
  // a base-only finish or silently discard a cost outside the recognized groups.
  const assigned = new Set(groups.flatMap(g => g.chosen.map(r => r.key)));
  if (groups.some(g => !g.chosen.length) || assigned.size !== optionRows.length)
    return [initial];
  const rowProblemIds = new Set(
    initial.rows.flatMap(r => r.problems.map(p => p.id))
  );
  const globalProblems = initial.problems.filter(
    p =>
      p.code !== "F3_VARIANTS_REQUIRED" &&
      p.code !== "F3_HISTORICAL_INCOMPLETE" &&
      !rowProblemIds.has(p.id)
  );
  return groups.map(({ heading, chosen }, index) => {
    const variantLabel = text(heading);
    const rows = [...baseRows, ...chosen, ...setupRows].map(r => ({
      ...structuredClone(r),
      included: true,
    }));
    const options = chosen.map(r => ({
      key: `opt:${r.key}`,
      label: r.row.descrizione || variantLabel,
      rowKeys: [r.key],
      required: true,
      historicalSelected: true,
      selected: true,
      sources: [src(s, at(s, r.excelRow, col.description), "text")],
    }));
    const historicalValues = rows
      .filter(r => r.kind === "cost")
      .map(r => {
        const cell = at(s, r.excelRow, col.cost),
          value = parseExcelNumber(cell?.raw ?? cell?.displayText);
        return cell &&
          !cell.error &&
          !(cell.formula && cell.cached == null) &&
          value.ok &&
          Number.isFinite(value.value) &&
          value.value >= 0
          ? value.value
          : undefined;
      });
    const historical = historicalValues.every(
      (v): v is number => v !== undefined
    )
      ? historicalValues.reduce((a, b) => a + b, 0)
      : undefined;
    const problems = [
      ...structuredClone(globalProblems),
      ...rows.flatMap(r => r.problems),
    ];
    if (historical === undefined)
      problems.push(
        prob(
          "F3_HISTORICAL_INCOMPLETE",
          "Confronto storico non disponibile: manca almeno un costo sorgente valido",
          undefined,
          "warning"
        )
      );
    return {
      ...structuredClone(initial),
      key: `${initial.key}:variant:${index + 1}`,
      label: `${initial.label} · ${variantLabel}`,
      variantGroup: variantLabel,
      rows,
      options,
      historicalDirectCostEur: historical,
      problems,
    };
  });
}
export function extractF3Letters(w: WorkbookEvidence): ImportDraft {
  const products = w.sheets.filter(s => !s.hidden).flatMap(productsFromSheet);
  return {
    id: crypto.randomUUID(),
    workbook: w,
    products,
    economicPolicy: { currency: "EUR" },
    problems: products.length
      ? []
      : [prob("F3_NONE", "Nessun layout F3 strutturalmente riconosciuto")],
    decisions: ["F3-LETTERE", "VAL-003"],
  };
}
export function currentSetupState(
  p: ProductDraft | undefined
): ProductDraft["setupState"] {
  if (!p?.setupState) return undefined;
  const rows = p.rows.filter(r => r.kind === "setup" && r.included);
  if (!rows.length)
    return {
      ...p.setupState,
      minutes: p.setupState.status === "explicit-zero" ? 0 : undefined,
    };
  if (
    rows.some(
      r =>
        typeof r.row.attrezzaggio_min !== "number" ||
        !Number.isFinite(r.row.attrezzaggio_min) ||
        r.row.attrezzaggio_min < 0
    )
  )
    return { ...p.setupState, status: "missing", minutes: undefined };
  const minutes = rows.reduce((sum, r) => sum + r.row.attrezzaggio_min!, 0);
  return {
    ...p.setupState,
    status: minutes === 0 ? "explicit-zero" : "known",
    minutes,
  };
}
export const setupMinutes = (p: ProductDraft) => currentSetupState(p)?.minutes;
export function applyOptionSelection(
  product: ProductDraft,
  key: string,
  selected: boolean
) {
  const options = (product.options ?? []).map(o =>
    o.key === key ? { ...o, selected: o.required ? true : selected } : o
  );
  const selectedRows = new Set(
    options.filter(o => o.selected).flatMap(o => o.rowKeys)
  );
  return {
    ...product,
    options,
    rows: product.rows.map(r =>
      (product.options ?? []).some(o => o.rowKeys.includes(r.key))
        ? { ...r, included: selectedRows.has(r.key) }
        : r
    ),
  };
}

export function setF3RowIncluded(
  product: ProductDraft,
  rowKey: string,
  included: boolean
): ProductDraft {
  const option = product.options?.find(o => o.rowKeys.includes(rowKey));
  if (option) return applyOptionSelection(product, option.key, included);
  return {
    ...product,
    rows: product.rows.map(row =>
      row.key === rowKey ? { ...row, included } : row
    ),
  };
}
