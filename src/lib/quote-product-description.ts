export const QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH = 60;

/** Count spaces too; never trim or truncate a stored description. */
export function quoteProductDescriptionError(products: readonly Record<string, unknown>[]): string | null {
  const index = products.findIndex(product =>
    String(product.descrizione ?? "").length > QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH);
  return index < 0 ? null : `Prodotto ${index + 1}: la descrizione può contenere al massimo ${QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} caratteri, spazi inclusi.`;
}
