import { CATEGORIE_RIGA } from "../types/cycle";
import type {
  F3Binding,
  ImportDraft,
  ProductDraft,
  TemplateDefinition,
  ImportTransform,
} from "../types/excel-import";
import type {
  MappingDraft,
  MappingFieldDecision,
} from "../types/excel-mapping-draft";
import {
  parseMappingDraft,
  serializeMappingDraft,
} from "../types/excel-mapping-draft";
import {
  mappingFromProduct,
  applyMappingDecision,
} from "./excel-mapping-draft";
import { applyF3FieldOverride } from "./excel-import-field-override";
import {
  extractCycleWorkbook,
  findCycleImportHeader,
} from "./excel-cycle-extractor";
import { asValidatedDraft } from "./excel-import-validation";
import { buildValidatedPreview } from "./excel-import-to-cycle";
import { parseExcelNumber } from "./excel-import-values";
import { normalizeTemplateLabel as norm } from "./excel-template-text";
import { matchTemplate } from "./excel-template-matcher";
import { templateDefinitionSchema } from "./excel-import-template-schema";

export const MAPPING_FIELDS = [
  "categoria",
  "descrizione",
  "nr_componenti",
  "colpi_min",
  "costo_unitario",
  "peso_kg",
  "lunghezza",
  "larghezza",
  "spessore",
  "diametro",
  "attrezzaggio_min",
  "lotto_voce",
  "sfrido",
] as const;
const textFields = new Set([
  "categoria",
  "descrizione",
  "cycle.code",
  "cycle.description",
  "cycle.client",
]);
export function selectedProduct(d: ImportDraft) {
  const p = d.products.find(x => x.selected);
  if (!p) throw Error("Selezionare il prodotto");
  return p;
}
export function productSheet(d: ImportDraft, p: ProductDraft) {
  const name = p.rows.flatMap(r => Object.values(r.sources))[0]?.sheet;
  const s = d.workbook.sheets.find(x => x.name === name);
  if (!s) throw Error("Foglio sorgente mancante");
  return s;
}
export function canMap(target: string): target is F3Binding["target"] {
  return (
    (MAPPING_FIELDS as readonly string[]).includes(target) ||
    ["cycle.code", "cycle.description", "cycle.client"].includes(target)
  );
}
function fieldValue(
  p: ProductDraft,
  rowKey: string,
  target: string,
  d: ImportDraft
): unknown {
  return target === "cycle.code"
    ? p.code
    : target === "cycle.description"
      ? p.label
      : target === "cycle.client"
        ? d.economicPolicy.client
        : p.rows.find(r => r.key === rowKey)?.row[
            target as keyof (typeof p.rows)[number]["row"]
          ];
}
export function createProductMapping(
  d: ImportDraft,
  p: ProductDraft
): MappingDraft {
  const m = mappingFromProduct(d, p),
    s = productSheet(d, p);
  m.fields = m.fields.filter(f => canMap(f.target));
  for (const r of p.rows) {
    const targets =
      r.kind === "setup"
        ? ["descrizione", "attrezzaggio_min"]
        : [
            "categoria",
            "descrizione",
            "nr_componenti",
            ...(r.row.categoria === "LAVORAZIONE INTERNA"
              ? ["colpi_min"]
              : ["costo_unitario"]),
            ...(r.row.peso_kg !== undefined ||
            r.row.categoria?.includes("PESO") ||
            r.row.categoria === "MATERIA PRIMA DA TRASFORMARE"
              ? ["peso_kg"]
              : []),
          ];
    for (const target of new Set([
      ...targets,
      ...Object.keys(r.row).filter(k =>
        (MAPPING_FIELDS as readonly string[]).includes(k)
      ),
    ])) {
      if (m.fields.some(f => f.rowKey === r.key && f.target === target))
        continue;
      let source = r.sources[target];
      if (target === "peso_kg")
        source =
          r.row.categoria === "MATERIA PRIMA DA TRASFORMARE"
            ? r.sources.peso_lordo
            : r.sources.peso_netto?.addresses.length
              ? r.sources.peso_netto
              : r.sources.peso_lordo;
      source ??= {
        sheet: s.name,
        addresses: [],
        original: [],
        transform: textFields.has(target) ? "text" : "number",
      };
      m.fields.push({
        id: `${r.key}:${target}`,
        rowKey: r.key,
        target,
        source: structuredClone(source),
        sourceCells: source.addresses.flatMap(a =>
          s.cells[a] ? [structuredClone(s.cells[a])] : []
        ),
        proposed: fieldValue(p, r.key, target, d),
        transform: source.transform ?? "number",
        decision: "proposed",
        validation: "pending",
        targetUnit: target === "peso_kg" ? "kg" : source.unit,
      });
    }
  }
  for (const target of ["cycle.code", "cycle.description", "cycle.client"])
    m.fields.unshift({
      id: `$product:${target}`,
      rowKey: "$product",
      target,
      source: structuredClone(
        (target === "cycle.code"
          ? p.identitySources?.code
          : target === "cycle.description"
            ? p.identitySources?.description
            : undefined) ?? { sheet: s.name, addresses: [], original: [] }
      ),
      proposed: fieldValue(p, "$product", target, d),
      transform: "text",
      decision: "proposed",
      validation: "pending",
    });
  return {
    ...m,
    fields: m.fields.map(f => ({
      ...f,
      binding: "automatic",
      reusable: false,
    })),
  };
}
export function mappingFor(d: ImportDraft, p: ProductDraft) {
  return (
    d.mappings?.find(m => m.productKey === p.key) ?? createProductMapping(d, p)
  );
}
export function parseMappedValue(
  value: unknown,
  transform: ImportTransform
): string | number {
  if (
    transform === "text" ||
    (transform === "identity" && typeof value === "string")
  )
    return String(value ?? "").trim();
  const result = parseExcelNumber(value);
  if (!result.ok)
    throw Error("Numero ambiguo o mancante: inserire un valore esplicito");
  if (transform === "minutes_to_rate") {
    if (result.value <= 0)
      throw Error("Minuti per pezzo devono essere positivi");
    return 1 / result.value;
  }
  return transform === "percent" ? result.value / 100 : result.value;
}
export function mappingValue(f: MappingFieldDecision) {
  return f.decision === "overridden" || f.decision === "confirmed"
    ? (f.override ?? f.proposed)
    : f.proposed;
}
export function editMapping(
  d: ImportDraft,
  fieldId: string,
  input: {
    value?: unknown;
    address?: string;
    sheetName?: boolean;
    confirm?: boolean;
    transform?: ImportTransform;
    unit?: string;
    reusable?: boolean;
  }
): ImportDraft {
  const p = selectedProduct(d),
    m = mappingFor(d, p),
    f = m.fields.find(x => x.id === fieldId);
  if (!f || !canMap(f.target)) throw Error("Campo non modificabile");
  const s = productSheet(d, p);
  let source = f.selectedSource,
    binding = f.binding ?? "automatic",
    value = input.value,
    transform = input.transform ?? f.transform;
  if (input.address !== undefined) {
    const address = input.address.trim().toUpperCase(),
      cell = s.cells[address];
    if (!cell) throw Error("Cella non presente nel foglio");
    const historic = p.rows.flatMap(r => [
      ...(r.sources.costo_storico?.addresses ?? []),
      ...(r.sources.incidenza_storica?.addresses ?? []),
    ]);
    const header = findCycleImportHeader(s);
    if (
      f.target === "costo_unitario" &&
      (historic.includes(address) ||
        (header?.layout === "LEGACY-KG-MIN" &&
          [header.columns.cost, header.columns.incidence].includes(
            cell.column
          )))
    )
      throw Error(
        "La colonna dei costi storici o delle incidenze non è una tariffa unitaria"
      );
    if (cell.error || (cell.formula && cell.cached == null))
      throw Error(
        "La cella contiene un errore o una formula senza risultato: usare una correzione esplicita"
      );
    value = parseMappedValue(
      transform === "text" ? cell.displayText : cell.raw,
      transform
    );
    binding = "cell";
    source = {
      sheet: s.name,
      addresses: [address],
      original: [cell.raw],
      formulas: cell.formula ? [cell.formula] : [],
      transform,
      unit: input.unit ?? f.targetUnit,
    };
  } else if (input.sheetName) {
    if (f.target !== "cycle.code")
      throw Error("Nome foglio disponibile solo per il codice");
    value = s.name;
    binding = "sheet-name";
    source = {
      sheet: s.name,
      addresses: [],
      original: [s.name],
      transform: "text",
    };
  } else if (input.confirm) {
    value = mappingValue(f);
  } else if (input.value !== undefined) {
    binding = "constant";
    if (!textFields.has(f.target))
      value = parseMappedValue(input.value, "number");
  }
  if (value === undefined) throw Error("Valore mancante");
  if (
    p.layout === "LEGACY-KG-MIN" &&
    f.target === "cycle.code" &&
    /\s/.test(String(value).trim())
  )
    throw Error(
      "Scegliere un solo codice articolo, senza spazi, oppure usare il nome del foglio"
    );
  if (f.target === "categoria" && !CATEGORIE_RIGA.includes(value as never))
    throw Error("Categoria non valida");
  let updated = applyMappingDecision(m, f.id, value);
  // Empty client is a deliberate valid choice. Product identity must remain nonempty.
  if (f.target === "cycle.client" && value === "")
    updated = {
      ...updated,
      fields: updated.fields.map(x =>
        x.id === f.id ? { ...x, validation: "valid" } : x
      ),
    };
  const result = updated.fields.find(x => x.id === f.id)!;
  if (result.validation !== "valid")
    throw Error(`Valore non valido per ${f.target}`);
  updated = {
    ...updated,
    fields: updated.fields.map(x =>
      x.id === f.id
        ? {
            ...x,
            decision: input.confirm ? "confirmed" : "overridden",
            binding,
            selectedSource: source,
            transform,
            targetUnit: input.unit ?? x.targetUnit,
            reusable: input.reusable ?? x.reusable ?? false,
          }
        : x
    ),
  };
  let next = p;
  if (f.rowKey !== "$product") {
    next = applyF3FieldOverride(p, f.rowKey, f.target, value);
    if (f.target === "peso_kg") {
      const row = p.rows.find(r => r.key === f.rowKey)!;
      const ids = new Set(
        row.problems
          .filter(x =>
            [`F3_GROSS_${row.excelRow}`, `F3_NET_${row.excelRow}`].includes(
              x.code
            )
          )
          .map(x => x.id)
      );
      next = {
        ...next,
        problems: next.problems.map(x =>
          ids.has(x.id) ? { ...x, resolved: true } : x
        ),
        rows: next.rows.map(r =>
          r.key === f.rowKey
            ? {
                ...r,
                problems: r.problems.map(x =>
                  ids.has(x.id) ? { ...x, resolved: true } : x
                ),
              }
            : r
        ),
      };
    }
  } else if (f.target === "cycle.code")
    next = {
      ...p,
      code: String(value),
      problems: p.problems.map(x =>
        /^(F3|KGMIN)_CODE_/.test(x.code) ? { ...x, resolved: true } : x
      ),
    };
  else if (f.target === "cycle.description")
    next = { ...p, label: String(value) };
  const economicPolicy =
    f.target === "cycle.client"
      ? { ...d.economicPolicy, client: String(value) }
      : d.economicPolicy;
  return {
    ...d,
    economicPolicy,
    products: d.products.map(x => (x.key === p.key ? next : x)),
    mappings: [
      ...(d.mappings ?? []).filter(x => x.productKey !== p.key),
      updated,
    ],
  };
}
export function setReusable(d: ImportDraft, id: string, reusable: boolean) {
  const p = selectedProduct(d),
    m = mappingFor(d, p);
  return {
    ...d,
    mappings: [
      ...(d.mappings ?? []).filter(x => x.productKey !== p.key),
      {
        ...m,
        fields: m.fields.map(f => (f.id === id ? { ...f, reusable } : f)),
      },
    ],
  };
}
function structure(d: ImportDraft, p: ProductDraft) {
  const s = productSheet(d, p),
    h = findCycleImportHeader(s);
  if (!h) throw Error("Layout Excel non riconosciuto");
  const at = new Map(
    Object.values(s.cells).map(c => [`${c.row}:${c.column}`, c])
  );
  return JSON.stringify({
    ...(h.layout === "LEGACY-KG-MIN" ? { layout: h.layout } : {}),
    columns: Object.fromEntries(
      Object.entries(h.columns)
        .sort()
        .map(([k, v]) => [k, v - h.columns.kind])
    ),
    variant: p.key.includes(":variant:") ? norm(p.variantGroup ?? "") : "",
    rows: p.rows.map(r => ({
      offset: r.excelRow - h.row,
      kind: r.kind,
      category:
        h.layout === "LEGACY-KG-MIN"
          ? norm(at.get(`${r.excelRow}:${h.columns.unit}`)?.displayText ?? "")
          : norm(at.get(`${r.excelRow}:${h.columns.kind}`)?.displayText ?? ""),
      unit: norm(at.get(`${r.excelRow}:${h.columns.unit}`)?.displayText ?? ""),
      ...(h.layout === "LEGACY-KG-MIN"
        ? {
            description: norm(
              at.get(`${r.excelRow}:${h.columns.description}`)?.displayText ??
                ""
            ),
          }
        : {}),
      option: p.options?.find(o => o.rowKeys.includes(r.key))?.label ?? null,
    })),
  });
}
export function buildF3Template(
  d: ImportDraft,
  name: string
): TemplateDefinition {
  const p = selectedProduct(d),
    s = productSheet(d, p),
    h = findCycleImportHeader(s)!;
  const m = mappingFor(d, p);
  const bindings: F3Binding[] = [];
  for (const f of m.fields.filter(x => x.reusable)) {
    if (!canMap(f.target)) throw Error("Campo non riutilizzabile");
    if (f.validation !== "valid")
      throw Error(`Confermare la regola ${f.target}`);
    const row = p.rows.find(r => r.key === f.rowKey),
      rowOffset = f.rowKey === "$product" ? null : row!.excelRow - h.row;
    if (f.binding === "sheet-name") {
      bindings.push({
        rowOffset,
        target: f.target,
        kind: "sheet-name",
        transform: "text",
      });
      continue;
    }
    const source = f.selectedSource ?? f.source;
    if (f.binding === "constant") {
      if (f.target.startsWith("cycle."))
        throw Error(
          "Codice/descrizione/cliente non possono essere costanti condivise"
        );
      const v = mappingValue(f);
      if (typeof v !== "string" && typeof v !== "number")
        throw Error("Costante non valida");
      bindings.push({
        rowOffset,
        target: f.target,
        kind: "constant",
        value: v,
        transform: typeof v === "number" ? "number" : "text",
        unit: f.targetUnit,
      });
    } else {
      const cell = s.cells[source.addresses[0]];
      if (source.addresses.length !== 1 || !cell)
        throw Error(`Scegliere una cella per ${f.target}`);
      // Letter categories use the F3 extractor; a plain text identity is not a category conversion.
      if (f.target === "categoria" && f.binding === "automatic") continue;
      bindings.push({
        rowOffset,
        target: f.target,
        kind: "cell",
        sourceRow: cell.row - h.row,
        sourceColumn: cell.column - h.columns.kind,
        transform: f.transform,
        unit: f.targetUnit,
      });
    }
  }
  const signature = Object.values(h.columns).flatMap(col => {
    const c = Object.values(s.cells).find(
      x => x.row === h.row && x.column === col
    );
    const label = norm(c?.displayText ?? "");
    return label && label.length <= 100
      ? [
          {
            normalized: label,
            relativeRow: 0,
            relativeColumn: col - h.columns.kind,
          },
        ]
      : [];
  });
  return templateDefinitionSchema.parse({
    schemaVersion: 2,
    family: h.layout,
    name: name.trim(),
    signature,
    products: [
      {
        key: "selected",
        label:
          h.layout === "LEGACY-KG-MIN"
            ? "Prodotto storico kg/min"
            : "Prodotto F3",
        startAnchor: signature.map(x => x.normalized).slice(0, 2),
        optional: false,
        rowRules: p.rows.map(r => ({
          fromRow: r.excelRow - h.row,
          toRow: r.excelRow - h.row,
          kind: r.kind ?? "cost",
          mappings: [],
        })),
      },
    ],
    exclusionLabels: [],
    verifiedCaseHashes: [],
    f3Profile: { engineRevision: 1, structure: structure(d, p), bindings },
  });
}
export interface ApprovedF3Template {
  id: number;
  rootId: number;
  version: number;
  status: string;
  definition: TemplateDefinition;
}
export function compatibleF3(
  d: ImportDraft,
  p: ProductDraft,
  t: ApprovedF3Template
): { compatible: boolean; reason: string } {
  try {
    const def = templateDefinitionSchema.parse(t.definition);
    if (t.status !== "approved")
      return { compatible: false, reason: "Template non approvato" };
    if (!def.f3Profile)
      return {
        compatible: false,
        reason: "Template privo di regole F3 eseguibili",
      };
    if (def.family !== findCycleImportHeader(productSheet(d, p))?.layout)
      return {
        compatible: false,
        reason: "Il template appartiene a un layout diverso",
      };
    const match = matchTemplate(productSheet(d, p), { ...t, definition: def });
    if (match.conflicts.length)
      return {
        compatible: false,
        reason: match.conflicts.map(x => x.message).join("; "),
      };
    if (def.f3Profile.structure !== structure(d, p))
      return {
        compatible: false,
        reason: "Righe, unità o finiture diverse: verificare la mappatura",
      };
    return { compatible: true, reason: "Firma e struttura complete" };
  } catch (e) {
    return {
      compatible: false,
      reason: e instanceof Error ? e.message : "Template non valido",
    };
  }
}
function applyDefinition(
  d: ImportDraft,
  p: ProductDraft,
  definition: TemplateDefinition
): ImportDraft {
  const s = productSheet(d, p),
    h = findCycleImportHeader(s)!;
  let next = {
    ...d,
    products: d.products.map(x => ({ ...x, selected: x.key === p.key })),
  };
  for (const b of definition.f3Profile!.bindings) {
    if (!canMap(b.target)) throw Error("Destinazione non scrivibile");
    const row =
      b.rowOffset === null
        ? undefined
        : p.rows.find(r => r.excelRow === h.row + b.rowOffset!);
    if (b.rowOffset !== null && !row) throw Error("Riga regola mancante");
    const id = `${row?.key ?? "$product"}:${b.target}`;
    if (b.kind === "cell") {
      const c = Object.values(s.cells).find(
        c =>
          c.row === h.row + b.sourceRow! &&
          c.column === h.columns.kind + b.sourceColumn!
      );
      if (!c) throw Error("Fonte della regola assente nel nuovo file");
      next = editMapping(next, id, {
        address: c.address,
        transform: b.transform,
        unit: b.unit,
        reusable: true,
      });
    } else
      next = editMapping(
        next,
        id,
        b.kind === "sheet-name"
          ? { sheetName: true, reusable: true }
          : {
              value: b.value,
              transform: b.transform,
              unit: b.unit,
              reusable: true,
            }
      );
  }
  return next;
}
export function applyApprovedF3(
  d: ImportDraft,
  p: ProductDraft,
  t: ApprovedF3Template
): ImportDraft {
  const match = compatibleF3(d, p, t);
  if (!match.compatible) throw Error(match.reason);
  const next = applyDefinition(d, p, t.definition);
  const templateMatch = matchTemplate(productSheet(d, p), t);
  const mapped = mappingFor(next, selectedProduct(next));
  return {
    ...next,
    templateMatch,
    mappings: [
      ...(next.mappings ?? []).filter(x => x.productKey !== p.key),
      { ...mapped, template: { rootId: t.rootId, version: t.version } },
    ],
  };
}
export function testF3Definition(
  d: ImportDraft,
  definition: TemplateDefinition
) {
  buildValidatedPreview(asValidatedDraft(d));
  const p = selectedProduct(d),
    source = extractCycleWorkbook(d.workbook),
    original = source.products.find(x => x.key === p.key);
  if (!original) throw Error("Prodotto non riproducibile");
  if (definition.f3Profile?.structure !== structure(source, original))
    throw Error("Struttura discordante");
  const replay = applyDefinition(source, original, definition),
    actual = selectedProduct(replay);
  const equal = p.rows.every(r => {
    const other = actual.rows.find(x => x.key === r.key);
    return (
      other && MAPPING_FIELDS.every(k => Object.is(r.row[k], other.row[k]))
    );
  });
  if (!equal)
    throw Error(
      "Il template non riproduce le correzioni delle righe: rendere riutilizzabili le regole necessarie oppure usare solo questo file"
    );
  return {
    workbookSha256: d.workbook.sha256,
    definition: JSON.stringify({ ...definition, verifiedCaseHashes: [] }),
    rowCount: actual.rows.length,
  };
}
const SESSION_KEY = "ddcost:f3-wizard:v1";
export interface F3Session {
  schemaVersion: 1;
  updatedAt: string;
  step: number;
  draft: ImportDraft;
  name: string;
  scope: "file" | "template";
  rootId?: number;
  version?: number;
}
export function saveF3Session(session: F3Session) {
  const raw = JSON.stringify(session);
  if (new TextEncoder().encode(raw).length > 8 * 1024 * 1024)
    throw Error(
      "Bozza troppo grande per conservare il lavoro: non ricaricare la pagina"
    );
  sessionStorage.setItem(SESSION_KEY, raw);
}
export function clearF3Session() {
  sessionStorage.removeItem(SESSION_KEY);
}
export function loadF3Session(): F3Session | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  if (raw.length > 8 * 1024 * 1024) throw Error("Bozza non valida");
  const s = JSON.parse(raw) as F3Session;
  if (
    s.schemaVersion !== 1 ||
    !Number.isInteger(s.step) ||
    s.step < 0 ||
    s.step > 6 ||
    !["file", "template"].includes(s.scope) ||
    typeof s.name !== "string" ||
    !Number.isFinite(Date.parse(s.updatedAt)) ||
    Date.now() - Date.parse(s.updatedAt) > 86400000 ||
    Date.parse(s.updatedAt) > Date.now() + 1000
  )
    throw Error("Bozza scaduta o non valida");
  if (
    !Array.isArray(s.draft?.products) ||
    !Array.isArray(s.draft.workbook?.sheets) ||
    !Array.isArray(s.draft.problems) ||
    !s.draft.economicPolicy ||
    !s.draft.workbook.sha256 ||
    s.draft.products.some(
      p =>
        !Array.isArray(p.rows) ||
        !Array.isArray(p.problems) ||
        p.rows.some(r => !r.row || !r.sources || !Array.isArray(r.problems))
    )
  )
    throw Error("Struttura bozza non valida");
  for (const m of s.draft.mappings ?? [])
    parseMappingDraft(serializeMappingDraft(m));
  return s;
}
