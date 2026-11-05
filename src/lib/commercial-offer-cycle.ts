import { parseCycleRow } from "@/types/cycle";
import { calcolaSimulazioni } from "./cycle-calculator";
import { cycleSimulationLots } from "./commercial-offer-pricing";

export type StandardCycleRecord = {
  id: number;
  rootId?: number | null;
  rev?: number | null;
  code?: string | null;
  description?: string | null;
  client?: string | null;
  lot?: string | null;
  standardCost?: string | number | null;
  minimumPrice?: string | number | null;
  dataJson?: string | null;
};

export type CommercialOfferRow = Record<string, unknown>;

export function nextTemporaryCode(rows: CommercialOfferRow[], random = Math.random): string {
  const numbers=rows.map(row=>String(row.codice??"")).filter(code=>/^TMP\d{4}$/.test(code)).map(code=>Number(code.slice(3)));
  const next=numbers.length?Math.max(...numbers)+1:1+Math.floor(random()*9000);
  if(next>9999)throw new Error("Codici TMP a quattro cifre esauriti in questa offerta");
  return `TMP${String(next).padStart(4,"0")}`;
}

/** Copy a cycle snapshot into an offer row without changing its sales terms. */
export function applyStandardCycleToOfferRow(
  row: CommercialOfferRow,
  cycle: StandardCycleRecord,
  offerRows: CommercialOfferRow[] = [row],
  useShortCodes = true,
): CommercialOfferRow {
  const product = parseCycleRow(cycle);
  const articleCode = product.codice.trim() || (/^TMP\d+$/.test(String(row.codice??"")) ? String(row.codice) : useShortCodes ? nextTemporaryCode(offerRows) : `TMP${product.id ?? cycle.id}`);
  const simulations = calcolaSimulazioni({ ...product, lotti_personalizzati: cycleSimulationLots(product) });
  const configuredLots = simulations.map((simulation) => simulation.lotto).filter((lot) => lot > 0);
  const cycleLot = Number(product.lotto);
  const defaultLot = configuredLots.length
    ? configuredLots.includes(cycleLot) ? cycleLot : configuredLots[0]
    : cycleLot > 0 ? cycleLot : 1;
  const currentLot = Number(row.lotto);
  const initialLot = Number.isInteger(currentLot) && currentLot > 0 ? currentLot : defaultLot;
  const existingSelectedLots = Array.isArray(row.lotti_selezionati)
    ? row.lotti_selezionati.map(Number).filter((lot) => Number.isInteger(lot) && lot > 0)
    : [];
  const selectedLots = existingSelectedLots.length ? [...new Set(existingSelectedLots)] : [initialLot];

  return {
    ...row,
    // A temporary, stable code lets the offer and both PDFs identify cycles
    // that do not yet have an article code assigned in the standard cycle.
    codice: articleCode,
    descrizione: product.descrizione,
    record_id: product.id,
    root_id: product.rootId ?? product.id,
    rev: product.rev ?? 1,
    standard_cost: product.costo_standard,
    full_cost: product.full_cost,
    prezzo_minimo: product.prezzo_minimo,
    cycle_lot: product.lotto,
    // A new offer starts from the cycle's reference lot and price assumptions.
    // Existing commercial terms are retained when a product is replaced.
    lotto: initialLot,
    lotti_selezionati: selectedLots,
    lotti_aggiuntivi: Array.isArray(row.lotti_aggiuntivi) ? row.lotti_aggiuntivi : [],
    ricarico_costi_fissi_pct: row.ricarico_costi_fissi_pct ?? product.ricarico_spese * 100,
    margine_netto_desiderato_pct: row.margine_netto_desiderato_pct ?? product.margine_minimo * 100,
    data: {
      record_id: product.id,
      root_id: product.rootId ?? product.id,
      rev: product.rev ?? 1,
      codice: product.codice,
      descrizione: product.descrizione,
      cliente: product.cliente,
      lotto: product.lotto,
      ricarico_spese: product.ricarico_spese,
      margine_minimo: product.margine_minimo,
      costo_lavoro_min: product.costo_lavoro_min,
      costo_standard: product.costo_standard,
      full_cost: product.full_cost,
      prezzo_minimo: product.prezzo_minimo,
      simulazioni: simulations,
      dataJson: cycle.dataJson ?? null,
    },
  };
}
