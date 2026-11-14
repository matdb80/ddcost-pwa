import { currentSetupState } from "./excel-f3-letters";
import { ricalcolaCiclo } from "./cycle-calculator";
import { emptyCicloEditorModel } from "../types/cycle";
import type {
  ImportPreview,
  ImportProvenance,
  SourceRef,
  ValidatedImportDraft,
} from "../types/excel-import";
import { asValidatedDraft } from "./excel-import-validation";
import { materializeImportRows } from "./excel-import-hierarchy";
export function buildValidatedPreview(
  input: ValidatedImportDraft
): ImportPreview {
  // A TypeScript tag cannot prevent mutation or untrusted storage data.
  const draft = asValidatedDraft(input);
  const product = draft.products.find(p => p.selected)!;
  const model = emptyCicloEditorModel();
  model.cliente = draft.economicPolicy.client ?? "";
  model.codice = product.code!;
  model.descrizione = product.label;
  model.lotto = String(draft.economicPolicy.lot);
  model.costo_lavoro_min = draft.economicPolicy.labourEurPerMinute!;
  model.ricarico_spese = draft.economicPolicy.overheadFraction!;
  model.margine_minimo = draft.economicPolicy.marginFraction!;
  const rows = product.rows.map(r =>
    r.kind === "setup" && draft.economicPolicy.setupLotPolicy
      ? {
          ...r,
          row: {
            ...r.row,
            lotto_voce:
              draft.economicPolicy.setupLotPolicy === "historic-minimum"
                ? (product.setupState?.lot ?? 0)
                : 0,
          },
        }
      : r
  );
  if (
    draft.economicPolicy.setupLotPolicy === "historic-minimum" &&
    !product.setupState?.lot
  )
    throw Error("Lotto storico setup non disponibile");
  model.righe = materializeImportRows(rows);
  const sourceRefs: SourceRef[] = product.rows.flatMap(item =>
    Object.entries(item.sources).map(([field, ref]) => ({
      ...ref,
      productKey: product.key,
      rowKey: item.key,
      field,
    }))
  );
  const provenance: ImportProvenance = {
    mapping: structuredClone(
      draft.mappings?.find(m => m.productKey === product.key)
    ),
    schemaVersion: 2,
    fileName: draft.workbook.fileName,
    sha256: draft.workbook.sha256,
    sheetNames: [...new Set(sourceRefs.map(ref => ref.sheet))],
    template: draft.templateMatch
      ? {
          rootId: draft.templateMatch.rootId,
          version: draft.templateMatch.version,
        }
      : undefined,
    selectedProducts: [product.key],
    setupState: structuredClone(currentSetupState(product)),
    options: structuredClone(product.options),
    sourceRefs,
    economicPolicy: { ...draft.economicPolicy },
    decisions: [
      ...new Set([
        ...(draft.decisions ?? []),
        ...product.rows
          .filter(r => r.included)
          .flatMap(r => r.validationIds ?? []),
      ]),
    ],
  };
  model._extra = {
    ...model._extra,
    origine_import_excel: true,
    foglio_importato: provenance.sheetNames.join(", "),
    template_importazione: provenance.template
      ? `${provenance.template.rootId}@${provenance.template.version}`
      : "mapping-locale",
    provenienza_import_excel: structuredClone(provenance),
  };
  const calculated = ricalcolaCiclo(model);
  const historicalDirectCost = product.historicalDirectCostEur;
  if (
    !Number.isFinite(calculated.costo_standard) ||
    !Number.isFinite(calculated.full_cost) ||
    !Number.isFinite(calculated.prezzo_minimo)
  )
    throw new Error("Risultato economico non finito");
  return {
    model: calculated,
    historicalDirectCost,
    pwaDirectCost: calculated.costo_standard,
    difference:
      historicalDirectCost === undefined
        ? undefined
        : calculated.costo_standard - historicalDirectCost,
    provenance,
  };
}
