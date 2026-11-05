import { PRICES, type TKind, type TPriceRow } from "./bandelle-t-listino";
import { createPercentagePriceBook, type PriceBook } from "./percentage-pricebook";
export const T_PRICE_TYPES: { value: TKind; label: string }[] = [
  { value: "standard", label: "Occhio standard" },
  { value: "misura", label: "Occhio decentrato a misura" },
  { value: "zanca", label: "Zanca a filo" },
];
export const bandellaTCellId = (kind: TKind, collar: number, tier: number) => `t-${kind}:${collar}:${tier}`;
export function initialBandelleTPrices(): PriceBook {
  return Object.fromEntries(T_PRICE_TYPES.flatMap(({ value }) => PRICES[value].flatMap(row =>
    row.prices.flatMap((price, tier) => price === null ? [] : [[bandellaTCellId(value, row.collo, tier), Math.round(price * 1000)]]))));
}
const engine = createPercentagePriceBook(initialBandelleTPrices(), 3);
export const validateBandelleTPrices = engine.validate;
export const applyBandelleTPriceOperations = engine.apply;
export function bandelleTRowsWithPrices(kind: TKind, book: PriceBook): TPriceRow[] {
  return PRICES[kind].map(row => ({ ...row, prices: row.prices.map((price, tier) => {
    if (price === null) return null;
    const units = book[bandellaTCellId(kind, row.collo, tier)];
    if (!Number.isSafeInteger(units) || units < 1) throw new Error("Prezzo mancante nel listino salvato.");
    return units / 1000;
  }) }));
}
