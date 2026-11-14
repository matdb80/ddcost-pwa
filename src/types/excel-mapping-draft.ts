import { z } from "zod";
import type {
  CellEvidence,
  ImportProblem,
  ImportTransform,
  SourceRef,
} from "./excel-import";
import { IMPORT_TRANSFORMS } from "./excel-import";
export interface MappingFieldDecision {
  id: string;
  rowKey: string;
  target: string;
  source: SourceRef;
  binding?: "automatic" | "cell" | "constant" | "sheet-name";
  selectedSource?: SourceRef;
  reusable?: boolean;
  sourceCells?: CellEvidence[];
  sourceUnit?: string;
  targetUnit?: string;
  transform: ImportTransform;
  proposed: unknown;
  override?: unknown;
  decision: "proposed" | "confirmed" | "overridden" | "rejected";
  validation: "pending" | "valid" | "invalid";
}
export interface MappingDraft {
  schemaVersion: 1;
  id: string;
  workbookSha256: string;
  productKey: string;
  template?: { rootId: number; version: number };
  fields: MappingFieldDecision[];
  problems: ImportProblem[];
  updatedAt: string;
}
const text = z.string().min(1).max(4000),
  scalar = z.union([
    z.string().max(100000),
    z.number().finite(),
    z.boolean(),
    z.date(),
    z.null(),
  ]);
const source = z.strictObject({
  sheet: text,
  addresses: z.array(text).max(100),
  original: z.array(scalar).max(100),
  formulas: z.array(z.string().max(100000)).max(100).optional(),
  productKey: text.optional(),
  rowKey: text.optional(),
  field: text.optional(),
  transform: z.enum(IMPORT_TRANSFORMS).optional(),
  unit: text.optional(),
});
const cell = z.strictObject({
  address: text,
  row: z.number().int().positive(),
  column: z.number().int().positive(),
  raw: scalar,
  displayText: z.string().max(100000),
  numberFormat: z.union([z.string(), z.number()]).optional(),
  cellType: z.string().optional(),
  formula: z.string().optional(),
  cached: scalar.optional(),
  error: z.string().optional(),
  hiddenRow: z.boolean(),
  hiddenColumn: z.boolean(),
  mergedRange: z.string().optional(),
});
const field = z.strictObject({
  id: text,
  rowKey: text,
  target: text,
  source,
  binding: z.enum(["automatic", "cell", "constant", "sheet-name"]).optional(),
  selectedSource: source.optional(),
  reusable: z.boolean().optional(),
  sourceCells: z.array(cell).max(100).optional(),
  sourceUnit: text.optional(),
  targetUnit: text.optional(),
  transform: z.enum(IMPORT_TRANSFORMS),
  proposed: scalar.optional(),
  override: scalar.optional(),
  decision: z.enum(["proposed", "confirmed", "overridden", "rejected"]),
  validation: z.enum(["pending", "valid", "invalid"]),
});
const problem = z.strictObject({
  id: text,
  severity: z.enum(["error", "warning", "info"]),
  code: text,
  message: text,
  sheet: text.optional(),
  address: text.optional(),
  productKey: text.optional(),
  rowKey: text.optional(),
  resolved: z.boolean(),
});
const schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: text,
    workbookSha256: text,
    productKey: text,
    template: z
      .strictObject({
        rootId: z.number().int().positive(),
        version: z.number().int().positive(),
      })
      .optional(),
    fields: z.array(field).max(100000),
    problems: z.array(problem).max(100000),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((d, ctx) => {
    if (new Set(d.fields.map(f => f.id)).size !== d.fields.length)
      ctx.addIssue({ code: "custom", message: "Decisioni duplicate" });
  });
export function parseMappingDraft(raw: string): MappingDraft {
  if (new TextEncoder().encode(raw).length > 8 * 1024 * 1024)
    throw new Error("MappingDraft oltre il limite");
  return schema.parse(
    JSON.parse(raw, (_key, value) =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      typeof value.$ddcostDate === "string"
        ? new Date(value.$ddcostDate)
        : value
    )
  ) as MappingDraft;
}
export function serializeMappingDraft(d: MappingDraft) {
  const raw = JSON.stringify(d, function (key, value) {
    const original = this[key];
    return original instanceof Date
      ? { $ddcostDate: original.toISOString() }
      : value;
  });
  parseMappingDraft(raw);
  return raw;
}
