import {QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} from "./quote-product-description";

/** A forfait is a fixed line amount; retained standard inputs are inactive. */
export function isForfait(product: Record<string, any> | null | undefined): boolean {
  return product?.a_forfait === true;
}
export function forfaitAmountError(value: unknown): string | null {
  return (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim()) || !Number.isFinite(Number(value)) || Number(value) < 0
    ? "Inserisci il valore di vendita a forfait, maggiore o uguale a zero."
    : null;
}
export function forfaitProductError(product: Record<string, any>): string | null {
  if (product.prodotto_di_serie === true) return "Prodotto di serie e A forfait sono alternativi.";
  if (!String(product.descrizione ?? "").trim()) return "Inserisci la descrizione del prodotto a forfait.";
  if (String(product.descrizione).length > QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH)
    return `La descrizione può contenere al massimo ${QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} caratteri, spazi inclusi.`;
  return forfaitAmountError(product.valore_forfait);
}
