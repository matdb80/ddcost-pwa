import { calcolaCostoFissoPerPezzo, calcolaSimulazioni } from "./cycle-calculator";
import type { SimulazioneLotto } from "@/types/cycle";
import { parseCycleRow, type CicloEditorModel } from "@/types/cycle";

export type CommercialOfferRow = Record<string, unknown>;

export type OfferLotPrice = {
  lot: number;
  simulation: SimulazioneLotto;
  markupPercent: number;
  targetMarginPercent: number;
  fixedCostPerPiece: number;
  variableCostPerPiece: number;
  fullCost: number;
  netPrice: number;
  actualMarginPercent: number;
};

export function discountFactor(discount: string): number {
  const parts = discount.replace(/\s/g, "").replace(/%/g, "").split("+");
  if (!parts.length || parts.some((part) => !/^\d+(?:[.,]\d+)?$/.test(part)))
    throw new Error("Sconto non valido: usare ad esempio 40+10%");
  let factor = 1;
  for (const part of parts) {
    const percent = Number(part.replace(",", "."));
    if (percent < 0 || percent >= 100) throw new Error("Ogni percentuale di sconto deve essere tra 0 e 99,99");
    factor *= 1 - percent / 100;
  }
  return factor;
}

export function generateListinoFromNet(netPrice: number, discount: string): { listino: number; netAfterDiscount: number } {
  if (!Number.isFinite(netPrice) || netPrice <= 0) throw new Error("Il prezzo netto deve essere maggiore di zero");
  const factor = discountFactor(discount);
  if (!(factor > 0)) throw new Error("Lo sconto non lascia un prezzo netto positivo");
  const theoretical = netPrice / factor;
  // Round up so applying the stated discount never undercuts the target net.
  const listino = Math.ceil((theoretical - 1e-10) * 100) / 100;
  return { listino, netAfterDiscount: listino * factor };
}

export function cycleForOfferRow(row: CommercialOfferRow): CicloEditorModel | null {
  const snapshot = row.data;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const data = snapshot as Record<string, unknown>;
  const dataJson = typeof data.dataJson === "string" ? data.dataJson : null;
  if (!dataJson) return null;

  return parseCycleRow({
    id: numberOrNull(data.record_id),
    rootId: numberOrNull(data.root_id),
    rev: numberOrNull(data.rev),
    code: String(data.codice ?? row.codice ?? ""),
    description: String(data.descrizione ?? row.descrizione ?? ""),
    client: String(data.cliente ?? ""),
    lot: String(data.lotto ?? row.cycle_lot ?? ""),
    standardCost: typeof data.costo_standard === "number" || typeof data.costo_standard === "string"
      ? data.costo_standard : null,
    minimumPrice: typeof data.prezzo_minimo === "number" || typeof data.prezzo_minimo === "string"
      ? data.prezzo_minimo : null,
    dataJson,
  });
}

export function simulationsForOfferRow(row: CommercialOfferRow): SimulazioneLotto[] {
  const cycle = cycleForOfferRow(row);
  if (!cycle) return [];
  const saved = cycle.simulazioni.filter((item) => Number(item.lotto) > 0);
  if (saved.length) return saved;
  return calcolaSimulazioni(cycle);
}

export function calculateOfferLotPrice(row: CommercialOfferRow, lot: number): OfferLotPrice {
  const cycle = cycleForOfferRow(row);
  if (!cycle) throw new Error("Selezionare un prodotto dai Cicli Standard");
  if (!Number.isFinite(lot) || lot <= 0) throw new Error("Il lotto di riferimento deve essere maggiore di zero");

  const savedSimulation = simulationsForOfferRow(row).find((item) => Number(item.lotto) === lot);
  const simulation = savedSimulation ?? calcolaSimulazioni({ ...cycle, lotti_personalizzati: [lot] })[0];
  if (!simulation || !Number.isFinite(simulation.costo_standard) || simulation.costo_standard < 0)
    throw new Error("Il ciclo non contiene un costo valido per il lotto selezionato");

  const markupPercent = row.ricarico_costi_fissi_pct == null
    ? cycle.ricarico_spese * 100
    : Number(row.ricarico_costi_fissi_pct);
  const targetMarginPercent = row.margine_netto_desiderato_pct == null
    ? cycle.margine_minimo * 100
    : Number(row.margine_netto_desiderato_pct);
  if (!Number.isFinite(markupPercent) || markupPercent < 0)
    throw new Error("Il ricarico dei costi deve essere una percentuale non negativa");
  if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent >= 100)
    throw new Error("Il margine netto desiderato deve essere tra 0% e 99,99%");

  // Tooling and setup are the lot-dependent fixed share inside standard cost.
  // Apply the offer's fixed-cost loading only to that share, then target the
  // requested net margin over the resulting full cost.
  const fixedCostPerPiece = Math.min(
    simulation.costo_standard,
    Math.max(0, calcolaCostoFissoPerPezzo(cycle, lot)),
  );
  const variableCostPerPiece = Math.max(0, simulation.costo_standard - fixedCostPerPiece);
  const fullCost = variableCostPerPiece + fixedCostPerPiece * (1 + markupPercent / 100);
  const theoreticalNet = fullCost / (1 - targetMarginPercent / 100);
  // The required margin is a floor; round the offer price up to cents so the
  // displayed value never erodes that margin.
  const netPrice = Math.ceil((theoreticalNet - 1e-10) * 100) / 100;
  return {
    lot,
    simulation,
    markupPercent,
    targetMarginPercent,
    fixedCostPerPiece,
    variableCostPerPiece,
    fullCost,
    netPrice,
    actualMarginPercent: netPrice > 0 ? (netPrice - fullCost) / netPrice * 100 : 0,
  };
}

export function withCalculatedOfferRow(row: CommercialOfferRow): CommercialOfferRow {
  const lot = Number(row.lotto);
  const price = calculateOfferLotPrice(row, lot);
  return {
    ...row,
    costo_standard_lotto: price.simulation.costo_standard,
    full_cost: price.fullCost,
    prezzo_minimo: price.netPrice,
    prezzo_netto_proposto: price.netPrice,
    margine_pct: price.actualMarginPercent,
    breakdown_lotto: price.simulation.breakdown,
    attrezzaggio_pz: price.simulation.attrezzaggio_pz,
  };
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number) ? null : number;
}
