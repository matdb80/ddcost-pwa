import { createPercentagePriceBook } from "./percentage-pricebook";
import { BANDELLE_VENETA_TYPES, BANDELLE_VENETA_CONFIGURATIONS, type BandellaVenetaType, type BandellaVenetaPriceRow } from "./bandelle-veneta";

// Stable cell identities: family / exact hole configuration / quantity tier.
export type BandellePriceBook = Record<string, number>; // integer euro cents
export type BandellePriceOperation = { cellIds: string[]; basisPoints: number };
export function bandellaRowKey(row: BandellaVenetaPriceRow): string {
  return row.shoulderHoles !== undefined ? `${row.shoulderHoles}+${row.tipHoles}` : String(row.screwHoles);
}
export const bandellaCellId = (kind: BandellaVenetaType, row: BandellaVenetaPriceRow, tier: number) => `${kind}:${bandellaRowKey(row)}:${tier}`;

export function initialBandellePrices(): BandellePriceBook {
  return Object.fromEntries(BANDELLE_VENETA_TYPES.flatMap(({ value }) =>
    (BANDELLE_VENETA_CONFIGURATIONS[value]?.prices ?? []).flatMap(row => row.prices.map((price, tier) =>
      [bandellaCellId(value, row, tier), Math.round(price * 100)]))));
}
const engine = createPercentagePriceBook(initialBandellePrices(), 2);
export const validateBandellePrices = engine.validate;
export const applyBandellePriceOperations = engine.apply;
export function bandelleRowsWithPrices(kind: BandellaVenetaType, book: BandellePriceBook): BandellaVenetaPriceRow[] {
  return (BANDELLE_VENETA_CONFIGURATIONS[kind]?.prices ?? []).map(row => ({
    ...row,
    prices: row.prices.map((_, tier) => {
      const cents = book[bandellaCellId(kind, row, tier)];
      if (!Number.isSafeInteger(cents) || cents < 1) throw new Error("Prezzo mancante nel listino salvato.");
      return cents / 100;
    }) as unknown as BandellaVenetaPriceRow["prices"],
  }));
}
