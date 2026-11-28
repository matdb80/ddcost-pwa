import type { ImportDraft, ProductDraft } from "../types/excel-import";
import type { MappingDraft } from "../types/excel-mapping-draft";
import { CATEGORIE_RIGA } from "../types/cycle";
const targetUnits: Record<string, string> = {
  nr_componenti: "pz",
  colpi_min: "pz/min",
  peso_kg: "kg",
  attrezzaggio_min: "min",
  lunghezza: "mm",
  larghezza: "mm",
  spessore: "mm",
  diametro: "mm",
};
export function mappingFromProduct(
  draft: ImportDraft,
  product: ProductDraft
): MappingDraft {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    workbookSha256: draft.workbook.sha256,
    productKey: product.key,
    template: draft.templateMatch
      ? {
          rootId: draft.templateMatch.rootId,
          version: draft.templateMatch.version,
        }
      : undefined,
    fields: product.rows.flatMap(r =>
      Object.entries(r.sources).map(([target, source]) => ({
        id: `${r.key}:${target}`,
        rowKey: r.key,
        target,
        source: structuredClone(source),
        sourceCells: source.addresses.flatMap(address => {
          const c = draft.workbook.sheets.find(s => s.name === source.sheet)
            ?.cells[address];
          return c ? [structuredClone(c)] : [];
        }),
        sourceUnit: source.unit,
        targetUnit: targetUnits[target] ?? source.unit,
        transform: source.transform ?? "identity",
        proposed: (r.row as Record<string, unknown>)[target],
        decision: "proposed" as const,
        validation: "pending" as const,
      }))
    ),
    problems: structuredClone([...draft.problems, ...product.problems]),
    updatedAt: new Date().toISOString(),
  };
}
export function applyMappingDecision(
  mapping: MappingDraft,
  id: string,
  override: unknown
): MappingDraft {
  if (!mapping.fields.some(f => f.id === id))
    throw new Error("Decisione mapping inesistente");
  return {
    ...mapping,
    fields: mapping.fields.map(f => {
      if (f.id !== id) return f;
      let valid = false;
      if (
        [
          "nr_componenti",
          "colpi_min",
          "peso_kg",
          "lunghezza",
          "larghezza",
          "spessore",
          "diametro",
          "quantita_per_conf",
          "tempo_confezionamento_min",
          "lotto_voce",
        ].includes(f.target)
      )
        valid =
          typeof override === "number" &&
          Number.isFinite(override) &&
          override > 0;
      else if (
        ["costo_unitario", "attrezzaggio_min", "sfrido"].includes(f.target)
      )
        valid =
          typeof override === "number" &&
          Number.isFinite(override) &&
          override >= 0;
      else if (f.target === "categoria")
        valid =
          typeof override === "string" &&
          CATEGORIE_RIGA.some(c => c === override);
      else if (
        [
          "descrizione",
          "codice_articolo",
          "cycle.code",
          "cycle.description",
          "cycle.client",
        ].includes(f.target)
      )
        valid = typeof override === "string" && override.trim().length > 0;
      return {
        ...f,
        override,
        decision: "overridden",
        validation: valid ? "valid" : "invalid",
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}
