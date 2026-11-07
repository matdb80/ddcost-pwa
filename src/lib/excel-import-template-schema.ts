import { z } from "zod";
import { CATEGORIE_RIGA } from "../types/cycle";
import type { TemplateDefinition } from "../types/excel-import";
import { IMPORT_MAPPING_TARGETS } from "../types/excel-import";
import { normalizeTemplateLabel } from "./excel-template-text";
export const templateStatusSchema = z.enum(["draft", "tested", "approved"]);
const text = (max: number) => z.string().trim().min(1).max(max);
const rowNumber = z.number().int().min(1).max(20_000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);

const fieldMappingSchema = z
  .strictObject({
    target: z.enum(IMPORT_MAPPING_TARGETS),
    sourceColumn: z.number().int().min(1).max(256).optional(),
    constant: z
      .union([z.string().max(4000), z.number().finite(), z.boolean()])
      .optional(),
    transform: z.enum([
      "text",
      "number",
      "percent",
      "mm",
      "kg",
      "minutes_to_rate",
      "identity",
    ]),
    unit: text(30).optional(),
    required: z.boolean(),
  })
  .refine(
    v => (v.sourceColumn !== undefined) !== (v.constant !== undefined),
    "Specificare una sola fonte: colonna oppure costante"
  );
const rowRuleSchema = z
  .strictObject({
    fromRow: rowNumber,
    toRow: rowNumber,
    kind: z.enum(["cost", "setup", "title", "total", "note"]),
    mappings: z.array(fieldMappingSchema).max(80),
    category: z.enum(CATEGORIE_RIGA).optional(),
    parentSourceRow: rowNumber.optional(),
    assemblyAuto: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.toRow < v.fromRow)
      ctx.addIssue({ code: "custom", message: "Intervallo righe non valido" });
    if (new Set(v.mappings.map(m => m.target)).size !== v.mappings.length)
      ctx.addIssue({
        code: "custom",
        message: "Destinazioni duplicate nella regola",
      });
  });
const productSchema = z
  .strictObject({
    key: text(100),
    label: text(255),
    sheetPattern: text(255).optional(),
    startAnchor: z.array(text(100)).min(1).max(20),
    endAnchor: z.array(text(100)).max(20).optional(),
    variantGroup: text(100).optional(),
    optional: z.boolean(),
    rowRules: z.array(rowRuleSchema).min(1).max(200),
  })
  .superRefine((v, ctx) => {
    const ranges = [...v.rowRules].sort((a, b) => a.fromRow - b.fromRow);
    if (ranges.some((r, i) => i > 0 && r.fromRow <= ranges[i - 1].toRow))
      ctx.addIssue({
        code: "custom",
        message: "Regole di riga sovrapposte nello stesso prodotto",
      });
  });
export const templateDefinitionSchema = z
  .strictObject({
    f3Profile: z
      .strictObject({
        engineRevision: z.literal(1),
        structure: z.string().min(1).max(100000),
        bindings: z
          .array(
            z
              .strictObject({
                rowOffset: z.number().int().min(-19999).max(19999).nullable(),
                target: z.enum(IMPORT_MAPPING_TARGETS),
                kind: z.enum(["cell", "constant", "sheet-name"]),
                sourceRow: z.number().int().min(-19999).max(19999).optional(),
                sourceColumn: z.number().int().min(-255).max(255).optional(),
                value: z
                  .union([z.string().max(4000), z.number().finite()])
                  .optional(),
                transform: z.enum([
                  "text",
                  "number",
                  "percent",
                  "mm",
                  "kg",
                  "minutes_to_rate",
                  "identity",
                ]),
                unit: z.string().max(30).optional(),
              })
              .superRefine((b, ctx) => {
                if (
                  (b.kind === "cell" &&
                    (b.sourceRow === undefined ||
                      b.sourceColumn === undefined)) ||
                  (b.kind === "constant" && b.value === undefined) ||
                  (b.kind === "sheet-name" && b.target !== "cycle.code")
                )
                  ctx.addIssue({
                    code: "custom",
                    message: "Fonte F3 incompleta",
                  });
                if (b.kind === "constant" && b.target.startsWith("cycle."))
                  ctx.addIssue({
                    code: "custom",
                    message:
                      "Identità del prodotto non riutilizzabile come costante",
                  });
              })
          )
          .max(1000),
      })
      .optional(),
    schemaVersion: z.literal(2),
    family: z.enum([
      "F1-704",
      "F2-LAV",
      "F2-NO-LAV",
      "F3-LETTERS",
      "F3-EXTENDED",
      "F4-A-M",
      "F4-C-O",
    ]),
    name: text(255),
    signature: z
      .array(
        z.strictObject({
          normalized: text(100)
            .transform(normalizeTemplateLabel)
            .pipe(text(100)),
          relativeRow: z.number().int().min(-19_999).max(19_999),
          relativeColumn: z.number().int().min(-255).max(255),
        })
      )
      .min(2)
      .max(100),
    products: z.array(productSchema).min(1).max(100),
    exclusionLabels: z.array(text(100)).max(100),
    verifiedCaseHashes: z.array(hash).max(100),
  })
  .superRefine((v, ctx) => {
    if (v.f3Profile) {
      if (v.family !== "F3-LETTERS")
        ctx.addIssue({
          code: "custom",
          message: "Profilo F3 su famiglia diversa",
        });
      if (
        new Set(v.f3Profile.bindings.map(b => `${b.rowOffset}:${b.target}`))
          .size !== v.f3Profile.bindings.length
      )
        ctx.addIssue({ code: "custom", message: "Regole F3 duplicate" });
    }
    if (
      new Set(v.signature.map(s => `${s.relativeRow}:${s.relativeColumn}`))
        .size !== v.signature.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Posizioni duplicate nella firma",
      });
    if (new Set(v.products.map(p => p.key)).size !== v.products.length)
      ctx.addIssue({ code: "custom", message: "Chiavi prodotto duplicate" });
    if (new Set(v.verifiedCaseHashes).size !== v.verifiedCaseHashes.length)
      ctx.addIssue({ code: "custom", message: "Casi verificati duplicati" });
    if (new TextEncoder().encode(JSON.stringify(v)).length > 262_144)
      ctx.addIssue({ code: "custom", message: "Template oltre 256 KiB" });
  }) satisfies z.ZodType<TemplateDefinition>;
export const saveTemplateSchema = z
  .strictObject({
    rootId: z.number().int().positive().optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
    name: text(255),
    status: templateStatusSchema,
    definition: templateDefinitionSchema,
    verifiedCases: z.array(hash).max(100),
  })
  .superRefine((v, ctx) => {
    if (v.rootId !== undefined && v.expectedVersion === undefined)
      ctx.addIssue({
        code: "custom",
        message: "expectedVersion obbligatoria per una nuova versione",
      });
    if (v.rootId === undefined && v.expectedVersion !== undefined)
      ctx.addIssue({
        code: "custom",
        message: "expectedVersion richiede rootId",
      });
    if (v.status !== "draft" && !v.verifiedCases.length)
      ctx.addIssue({
        code: "custom",
        message: "tested/approved richiedono casi verificati",
      });
    if (new Set(v.verifiedCases).size !== v.verifiedCases.length)
      ctx.addIssue({ code: "custom", message: "Casi verificati duplicati" });
    if (v.name !== v.definition.name)
      ctx.addIssue({
        code: "custom",
        message: "Nome template discordante dalla definizione",
      });
    if (
      JSON.stringify([...v.verifiedCases].sort()) !==
      JSON.stringify([...v.definition.verifiedCaseHashes].sort())
    )
      ctx.addIssue({
        code: "custom",
        message: "Casi verificati discordanti dalla definizione",
      });
  });
export type TemplateDefinitionInput = z.infer<typeof templateDefinitionSchema>;
