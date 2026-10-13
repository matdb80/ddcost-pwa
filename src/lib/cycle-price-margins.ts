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

/**
 * Converts a simulated sale price into plain Italian without confusing
 * percentage margin (denominator: selling price) with the share of
 * allocated general expenses covered (denominator: general expenses).
 *
 * "Spese generali" are allocated overhead, not automatically fixed costs.
 * All amounts are per piece; "net" means after allocated overhead but
 * before taxes, financing and other unmodelled charges.
 */
export type MarginScenario = "below-direct" | "direct-only" | "partial-overhead" |
  "breakeven" | "positive" | "inconsistent";

export interface MarginExplanation {
  scenario: MarginScenario;
  title: string;
  message: string;
  overheadCoveragePercent: number | null;
}

const eurForExplanation = (value: number): string =>
  Math.abs(value).toLocaleString("it-IT", {
    minimumFractionDigits: 2, maximumFractionDigits: 4,
  });
const pctForExplanation = (value: number): string =>
  value.toLocaleString("it-IT", {maximumFractionDigits: 1});

export function explainSalePrice(price: number, directCost: number, fullCost: number): MarginExplanation | null {
  const m=calculateSaleMargins(price,directCost,fullCost);
  if(!m)return null;
  const tolerance=1e-9*Math.max(1,price,directCost,fullCost);
  const overhead=fullCost-directCost;
  if(overhead < -tolerance) {
    return {
      scenario:"inconsistent",title:"Costi da verificare",
      message:"Il full cost è inferiore al costo industriale. Verifica l'attribuzione delle spese generali prima di valutare questo prezzo.",
      overheadCoveragePercent:null,
    };
  }
  if(price < directCost-tolerance) {
    return {
      scenario:"below-direct",title:"Prezzo insufficiente anche per produrre",
      message:"Questo prezzo non copre nemmeno i costi industriali: mancano € "+
        eurForExplanation(directCost-price)+" per pezzo sui costi diretti. "+
        "Considerando anche le spese generali, il margine è negativo di € "+
        eurForExplanation(fullCost-price)+" per pezzo.",
      overheadCoveragePercent:overhead>tolerance?0:null,
    };
  }
  if(Math.abs(price-directCost)<=tolerance) {
    return {
      scenario:"direct-only",title:"Copri solo il costo industriale",
      message:overhead>tolerance
        ?"Con questo prezzo copri esattamente i costi industriali, ma non contribuisci alle spese generali attribuite al prodotto. Mancano € "+
         eurForExplanation(overhead)+" per pezzo per raggiungere il pareggio."
        :"Con questo prezzo copri esattamente i costi industriali. Non risultano spese generali aggiuntive attribuite: il margine è zero.",
      overheadCoveragePercent:overhead>tolerance?0:null,
    };
  }
  if(price < fullCost-tolerance && overhead>tolerance) {
    const covered=100*(price-directCost)/overhead;
    return {
      scenario:"partial-overhead",title:"Copri solo parte delle spese generali",
      message:"Con questo prezzo copri tutti i costi industriali e il "+
        pctForExplanation(covered)+"% delle spese generali attribuite al prodotto. "+
        "Restano da coprire € "+eurForExplanation(fullCost-price)+
        " per pezzo: il margine netto industriale è ancora negativo.",
      overheadCoveragePercent:covered,
    };
  }
  if(Math.abs(price-fullCost)<=tolerance) {
    return {
      scenario:"breakeven",title:"Pareggio",
      message:"Con questo prezzo copri tutti i costi industriali e tutte le spese generali attribuite al prodotto. "+
        "Sei in pareggio: non rimane margine per ogni pezzo venduto.",
      overheadCoveragePercent:overhead>tolerance?100:null,
    };
  }
  return {
    scenario:"positive",title:"Tutti i costi coperti: margine positivo",
    message:"Con questo prezzo copri i costi industriali e tutte le spese generali attribuite al prodotto. "+
      "Ti restano € "+eurForExplanation(price-fullCost)+
      " per ogni pezzo venduto, prima delle imposte e degli oneri finanziari.",
    overheadCoveragePercent:overhead>tolerance?100:null,
  };
}
