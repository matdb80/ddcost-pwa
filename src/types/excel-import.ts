import type { MappingDraft } from "./excel-mapping-draft";
import type { CicloEditorModel, RigaCategoria, RigaCiclo } from "./cycle";

export const IMPORT_TEMPLATE_STATUSES = [
  "draft",
  "tested",
  "approved",
] as const;
export type ImportTemplateStatus = (typeof IMPORT_TEMPLATE_STATUSES)[number];
export const IMPORT_TRANSFORMS = [
  "text",
  "number",
  "percent",
  "mm",
  "kg",
  "minutes_to_rate",
  "identity",
] as const;
export type ImportTransform = (typeof IMPORT_TRANSFORMS)[number];
export type ImportSeverity = "error" | "warning" | "info";
export type CellScalar = string | number | boolean | Date | null;

export interface CellEvidence {
  address: string;
  row: number;
  column: number;
  raw: CellScalar;
  displayText: string;
  numberFormat?: string | number;
  cellType?: string;
  formula?: string;
  cached?: CellScalar;
  error?: string;
  hiddenRow: boolean;
  hiddenColumn: boolean;
  mergedRange?: string;
}
export interface SheetEvidence {
  name: string;
  hidden: boolean;
  declaredRange?: string;
  cells: Record<string, CellEvidence>;
  merges: string[];
  effectiveRows: number;
  effectiveColumns: number;
}
export interface WorkbookEvidence {
  fileName: string;
  sha256: string;
  byteLength: number;
  parserVersion: string;
  sheets: SheetEvidence[];
}
export interface ImportProblem {
  id: string;
  severity: ImportSeverity;
  code: string;
  message: string;
  sheet?: string;
  address?: string;
  productKey?: string;
  rowKey?: string;
  resolved: boolean;
}
export interface SourceRef {
  sheet: string;
  addresses: string[];
  original: CellScalar[];
  formulas?: string[];
  productKey?: string;
  rowKey?: string;
  field?: string;
  transform?: ImportTransform;
  unit?: string;
}
export const IMPORT_MAPPING_TARGETS = [
  "categoria",
  "codice_articolo",
  "descrizione",
  "tipo_materiale",
  "tipo_materia_prima",
  "lunghezza",
  "larghezza",
  "spessore",
  "diametro",
  "peso_kg",
  "nr_componenti",
  "colpi_min",
  "confezionamento",
  "quantita_per_conf",
  "tempo_confezionamento_min",
  "lotto_voce",
  "attrezzaggio_min",
  "fornitore",
  "costo_unitario",
  "sfrido",
  "costo_min",
  "note",
  "parent_idx",
  "assembly_auto",
  "considera",
  "cycle.code",
  "cycle.description",
  "cycle.client",
  "cycle.lot",
] as const;
export interface FieldMapping {
  target: (typeof IMPORT_MAPPING_TARGETS)[number];
  sourceColumn?: number;
  constant?: string | number | boolean;
  transform: ImportTransform;
  unit?: string;
  required: boolean;
}
export interface RowRule {
  fromRow: number;
  toRow: number;
  kind: "cost" | "setup" | "title" | "total" | "note";
  mappings: FieldMapping[];
  category?: RigaCategoria;
  parentSourceRow?: number;
  assemblyAuto?: boolean;
}
export interface ProductBlockDefinition {
  key: string;
  label: string;
  sheetPattern?: string;
  startAnchor: string[];
  endAnchor?: string[];
  variantGroup?: string;
  optional: boolean;
  rowRules: RowRule[];
}
export interface TemplateDefinition {
  f3Profile?: { engineRevision: 1; structure: string; bindings: F3Binding[] };
  schemaVersion: 2;
  family:
    | "F1-704"
    | "F2-LAV"
    | "F2-NO-LAV"
    | "F3-LETTERS"
    | "F3-EXTENDED"
    | "F4-A-M"
    | "F4-C-O"
    | "LEGACY-KG-MIN";
  name: string;
  signature: Array<{
    normalized: string;
    relativeRow: number;
    relativeColumn: number;
  }>;
  products: ProductBlockDefinition[];
  exclusionLabels: string[];
  verifiedCaseHashes: string[];
}
export interface TemplateMatch {
  templateId: number;
  rootId: number;
  version: number;
  definition: TemplateDefinition;
  score: number;
  conflicts: ImportProblem[];
  anchor?: { row: number; column: number };
}
export interface DraftRow {
  key: string;
  excelRow: number;
  included: boolean;
  exclusionReason?: string;
  kind?: RowRule["kind"];
  /** Absolute source Excel row within this product block. Preferred to legacy row.parent_idx. */
  parentSourceRow?: number;
  /** In V2 drafts only, row.parent_idx is a legacy source Excel row, never an editor index. */
  row: Partial<RigaCiclo>;
  sources: Record<string, SourceRef>;
  problems: ImportProblem[];
  validationIds?: string[];
}
export interface ProductDraft {
  layout?: "F3-LETTERS" | "LEGACY-KG-MIN";
  identitySources?: Partial<Record<"code" | "description", SourceRef>>;
  key: string;
  code?: string;
  label: string;
  selected: boolean;
  variantGroup?: string;
  rows: DraftRow[];
  problems: ImportProblem[];
  historicalDirectCostEur?: number;
  setupState?: {
    status: "missing" | "explicit-zero" | "known";
    minutes?: number;
    lot?: number;
    sources: SourceRef[];
  };
  options?: Array<{
    key: string;
    label: string;
    rowKeys: string[];
    historicalSelected: boolean;
    selected: boolean;
    required?: boolean;
    sources: SourceRef[];
  }>;
}
export interface EconomicPolicy {
  name?: "historical-purchases-current-labour";
  setupLotPolicy?: "simulation" | "historic-minimum";
  client?: string;
  currency: "EUR" | "ITL" | "UNKNOWN";
  labourEurPerMinute?: number;
  lot?: number;
  overheadFraction?: number;
  marginFraction?: number;
}
export interface ImportProvenance {
  mapping?: MappingDraft;
  schemaVersion: 2;
  fileName: string;
  sha256: string;
  sheetNames: string[];
  template?: { rootId: number; version: number };
  selectedProducts: string[];
  setupState?: ProductDraft["setupState"];
  options?: ProductDraft["options"];
  sourceRefs: SourceRef[];
  economicPolicy: EconomicPolicy;
  decisions: string[];
}
export interface ImportDraft {
  mappings?: MappingDraft[];
  id: string;
  workbook: WorkbookEvidence;
  products: ProductDraft[];
  economicPolicy: EconomicPolicy;
  problems: ImportProblem[];
  templateMatch?: TemplateMatch;
  decisions?: string[];
}
export interface ValidatedImportDraft extends ImportDraft {
  validated: true;
  problems: ImportProblem[];
}
export interface ImportPreview {
  model: CicloEditorModel;
  historicalDirectCost?: number;
  pwaDirectCost: number;
  difference?: number;
  provenance: ImportProvenance;
}

export interface F3Binding {
  rowOffset: number | null;
  target: (typeof IMPORT_MAPPING_TARGETS)[number];
  kind: "cell" | "constant" | "sheet-name";
  sourceRow?: number;
  sourceColumn?: number;
  value?: string | number;
  transform: ImportTransform;
  unit?: string;
}
