export type PriceBook = Record<string, number>; // integer smallest currency units
export type PriceOperation = { cellIds: string[]; basisPoints: number };

export function createPercentagePriceBook(initial: PriceBook, decimals: 2 | 3) {
  const knownCells = new Set(Object.keys(initial));
  const maxUnits = 1_000_000 * 10 ** decimals;
  function validate(value: unknown): PriceBook {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Listino non valido.");
    const entries = Object.entries(value);
    if (entries.length !== knownCells.size || entries.some(([key, units]) => !knownCells.has(key)
      || typeof units !== "number" || !Number.isSafeInteger(units) || units < 1 || units > maxUnits)) {
      throw new Error("Listino incompleto o prezzi non validi.");
    }
    return Object.fromEntries(entries);
  }
  function apply(source: PriceBook, operations: PriceOperation[]): PriceBook {
    const result = { ...validate(source) };
    if (operations.length < 1 || operations.length > 50) throw new Error("Prepara da 1 a 50 variazioni per salvataggio.");
    for (const op of operations) {
      if (!Number.isInteger(op.basisPoints) || op.basisPoints === 0 || op.basisPoints < -9999 || op.basisPoints > 100000) {
        throw new Error("Inserisci una percentuale diversa da zero, tra −99,99% e +1.000%, con al massimo due decimali.");
      }
      if (!op.cellIds.length || op.cellIds.length > knownCells.size || op.cellIds.some(id => !knownCells.has(id))) throw new Error("Seleziona almeno una cella valida.");
      for (const id of new Set(op.cellIds)) {
        const units = Math.floor((result[id] * (10000 + op.basisPoints) + 5000) / 10000);
        if (units < 1 || units > maxUnits) throw new Error(`La variazione genera prezzi fuori limite (${decimals === 3 ? "0,001" : "0,01"}–1.000.000,00 €).`);
        result[id] = units;
      }
    }
    return result;
  }
  return { validate, apply };
}
