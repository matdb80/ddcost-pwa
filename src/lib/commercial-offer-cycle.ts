import { parseCycleRow } from "@/types/cycle";

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

/** Copy a cycle snapshot into an offer row without changing its sales terms. */
export function applyStandardCycleToOfferRow(
  row: CommercialOfferRow,
  cycle: StandardCycleRecord,
): CommercialOfferRow {
  const product = parseCycleRow(cycle);

  return {
    ...row,
    codice: product.codice,
    descrizione: product.descrizione,
    record_id: product.id,
    root_id: product.rootId ?? product.id,
    rev: product.rev ?? 1,
    standard_cost: product.costo_standard,
    full_cost: product.full_cost,
    prezzo_minimo: product.prezzo_minimo,
    cycle_lot: product.lotto,
    data: {
      record_id: product.id,
      root_id: product.rootId ?? product.id,
      rev: product.rev ?? 1,
      codice: product.codice,
      descrizione: product.descrizione,
      cliente: product.cliente,
      lotto: product.lotto,
      costo_standard: product.costo_standard,
      full_cost: product.full_cost,
      prezzo_minimo: product.prezzo_minimo,
      dataJson: cycle.dataJson ?? null,
    },
  };
}
