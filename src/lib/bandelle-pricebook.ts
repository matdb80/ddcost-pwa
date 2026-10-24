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
const knownCells = new Set(Object.keys(initialBandellePrices()));
export function validateBandellePrices(value: unknown): BandellePriceBook {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Listino non valido.");
  const entries = Object.entries(value);
  if (entries.length !== knownCells.size || entries.some(([key, cents]) => !knownCells.has(key)
    || typeof cents !== "number" || !Number.isSafeInteger(cents) || cents < 1 || cents > 100_000_000)) {
    throw new Error("Listino incompleto o prezzi non validi.");
  }
  return Object.fromEntries(entries);
}
export function applyBandellePriceOperations(source: BandellePriceBook, operations: BandellePriceOperation[]): BandellePriceBook {
  const result = { ...validateBandellePrices(source) };
  if (operations.length < 1 || operations.length > 50) throw new Error("Prepara da 1 a 50 variazioni per salvataggio.");
  for (const op of operations) {
    if (!Number.isInteger(op.basisPoints) || op.basisPoints === 0 || op.basisPoints < -9999 || op.basisPoints > 100000) {
      throw new Error("Inserisci una percentuale diversa da zero, tra −99,99% e +1.000%, con al massimo due decimali.");
    }
    if (!op.cellIds.length || op.cellIds.length > knownCells.size || op.cellIds.some(id => !knownCells.has(id))) {
      throw new Error("Seleziona almeno una cella valida.");
    }
    for (const id of new Set(op.cellIds)) {
      // Integer arithmetic, half a cent rounds up; round after each operation.
      const cents = Math.floor((result[id] * (10000 + op.basisPoints) + 5000) / 10000);
      if (cents < 1 || cents > 100_000_000) throw new Error("La variazione genera prezzi fuori limite (0,01–1.000.000,00 €).");
      result[id] = cents;
    }
  }
  return result;
}
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
