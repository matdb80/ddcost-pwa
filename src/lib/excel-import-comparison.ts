import { currentSetupState } from "./excel-f3-letters";
import type { ImportDraft, ImportPreview } from "../types/excel-import";
import { ricalcolaCiclo } from "./cycle-calculator";
import { parseExcelNumber } from "./excel-import-values";
export function compareImportCosts(draft: ImportDraft, preview: ImportPreview) {
  const product = draft.products.find(p => p.selected);
  if (!product) throw Error("Prodotto non selezionato");
  const selectedHistorical = product.rows
    .filter(r => r.included && r.kind !== "setup")
    .map(r => {
      const ref = r.sources.costo_storico,
        c =
          ref?.addresses.length === 1
            ? draft.workbook.sheets.find(s => s.name === ref.sheet)?.cells[
                ref.addresses[0]
              ]
            : undefined;
      const n = parseExcelNumber(c?.raw);
      return c &&
        !c.error &&
        !(c.formula && c.cached == null) &&
        n.ok &&
        n.value >= 0
        ? n.value
        : undefined;
    });
  const historicalCurrentRows =
    selectedHistorical.length &&
    selectedHistorical.every((v): v is number => v !== undefined)
      ? selectedHistorical.reduce((a, b) => a + b, 0)
      : undefined;
  const noSetup = structuredClone(preview.model);
  noSetup.righe = noSetup.righe.map(r => ({ ...r, attrezzaggio_min: 0 }));
  const pwaWithoutSetup = ricalcolaCiclo(noSetup).costo_standard;
  const setupMissing = currentSetupState(product)?.status === "missing";
  return {
    setupMissing,
    historicalOriginal: preview.historicalDirectCost,
    historicalCurrentRows,
    pwaWithoutSetup,
    pwaSetup: setupMissing
      ? undefined
      : preview.pwaDirectCost - pwaWithoutSetup,
    pwaWithSetup: preview.pwaDirectCost,
    likeForLikeDifference:
      historicalCurrentRows === undefined
        ? undefined
        : pwaWithoutSetup - historicalCurrentRows,
  };
}
