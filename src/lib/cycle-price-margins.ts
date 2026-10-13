/** What-if selling price: percentages use SALES PRICE as denominator.
 * Gross here means before overhead; net means after overhead (full cost),
 * excluding taxes and financial charges. This is a margin, NOT a markup.
 */
export interface SaleMargins {
  grossEuro:number;
  netEuro:number;
  overheadEuro:number;
  grossPercent:number;
  netPercent:number;
}
export function calculateSaleMargins(price:number,directCost:number,fullCost:number):SaleMargins|null {
  if (![price,directCost,fullCost].every(Number.isFinite) || price<=0 || directCost<0 || fullCost<0) return null;
  return {
    grossEuro:price-directCost,
    netEuro:price-fullCost,
    overheadEuro:fullCost-directCost,
    grossPercent:(price-directCost)/price*100,
    netPercent:(price-fullCost)/price*100,
  };
}
/** Accept 12.50 and Italian 12,50; reject grouping separators/ambiguous inputs. */
export function parseMarketPrice(raw:string):number|null {
  const text=raw.trim();
  if(!/^\d+(?:[.,]\d{1,4})?$/.test(text))return null;
  const n=Number(text.replace(",","."));
  return Number.isFinite(n)&&n>0?n:null;
}
