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
  if (isForfait(product)) return "Prodotto di serie e Preventiva a forfait sono alternativi.";
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

/** Show the effective sale price of legacy discounted rows without rewriting
 * their stored inputs. A subsequent explicit price edit replaces the discount. */
export function seriesPriceForInput(product:Row):number|null {
  if(seriesPriceError(product.prezzo_serie))return null;
  try{
    const price=seriesNetPrice(product);
    return Number.isFinite(price)?price:null;
  }catch{return null;}
}

/**
 * Maggiorazione per sconfezionamento, dalle condizioni di vendita allegate
 * (sezione CONFEZIONI/PACKAGES, sale-conditions-text.ts): «Sulle confezioni
 * non conformi ai quantitativi espressi nella colonna "pack" verrà applicato
 * un aumento del 20%». Si applica SOLO alle righe con flag "Di Serie" attivo
 * e con il flag di riga "Applica supplemento per sconfezionamento" spuntato.
 */
export const UNPACKING_SURCHARGE_PERCENT = 20;
export const UNPACKING_SURCHARGE_FACTOR = 1 + UNPACKING_SURCHARGE_PERCENT / 100;

/** Il supplemento è attivo solo su righe di serie con il flag spuntato: altrove è inerte. */
export const isUnpackingSurchargeActive = (product: Row | null | undefined): boolean =>
  isSeries(product) && product?.supplemento_sconfezionamento === true;

/** Netto di serie con l'eventuale supplemento per sconfezionamento (+20%). */
export function seriesNetPriceWithSurcharge(product:Row):number {
  const net=seriesNetPrice(product);
  if(!isUnpackingSurchargeActive(product))return net;
  return Math.round((net*UNPACKING_SURCHARGE_FACTOR+Number.EPSILON)*10000)/10000;
}
