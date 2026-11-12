import {seriesDiscount} from "./series-discount";
import {isForfait} from "./quote-forfait";
import {QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} from "./quote-product-description";
type Row = Record<string, any>;
export const isSeries = (product: Row | null | undefined): boolean => product?.prodotto_di_serie === true;
/** These lines have an explicit sale amount and never participate in costing. */
export const isFixedPrice = (product: Row | null | undefined): boolean => isForfait(product) || isSeries(product);
export function seriesPriceError(value: unknown): string | null {
  return (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim()) || !Number.isFinite(Number(value)) || Number(value) < 0
    ? "Inserisci il prezzo unitario del prodotto di serie, maggiore o uguale a zero." : null;
}
export function seriesProductError(product: Row): string | null {
  if (isForfait(product)) return "Prodotto di serie e A forfait sono alternativi.";
  if (!String(product.codice ?? "").trim()) return "Inserisci il codice articolo del prodotto di serie.";
  if (!String(product.descrizione ?? "").trim()) return "Inserisci la descrizione del prodotto di serie.";
  if (String(product.descrizione).length > QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH)
    return `La descrizione può contenere al massimo ${QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} caratteri, spazi inclusi.`;
  if ((typeof product.quantita !== "number" && typeof product.quantita !== "string") ||
      !Number.isFinite(Number(product.quantita)) || Number(product.quantita) <= 0)
    return "Inserisci una quantità maggiore di zero per il prodotto di serie.";
  const priceError = seriesPriceError(product.prezzo_serie);
  if (priceError) return priceError;
  try{seriesDiscount(product.sconto_serie);}catch(e){return (e as Error).message;}
  return Number.isFinite(Number(product.quantita) * Number(product.prezzo_serie)) ? null : "Totale del prodotto di serie non valido.";
}

export function seriesNetPrice(product:Row):number {
  const discount=seriesDiscount(product.sconto_serie);
  if(!discount.label)return Number(product.prezzo_serie); // Preserve exact historical inputs when no discount is entered.
  const net=Number(product.prezzo_serie)*discount.factor;
  return Math.round((net+Number.EPSILON)*10000)/10000;
}
