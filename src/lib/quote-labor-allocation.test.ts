import { describe, expect, it } from "vitest";
import { blankProduct, blankQuote, calculateQuote, changeQuoteLaborMode } from "./quote-calculation";
import { parseIncompleteQuote } from "./quote-draft-state";
import { buildQuoteWizardSteps } from "./quote-wizard-steps";

const quote = () => ({ ...blankQuote(), lavoro_ore_totali:100, progettazione_ore:2, costo_progettazione_ora:50,
  prodotti:[50,25,30].map(quantita=>({...blankProduct(),quantita,lavoro_h:999,attrezzaggi_h:2,costo_lavoro:24})) });
describe("TKT-20261108-68150001: quote-wide or per-product labor",()=>{
  it("assigns 16 hours to ten pieces and four hours to twenty pieces in quote A",()=>{
    const input={...blankQuote(),lavoro_modalita:"per_prodotto",lavoro_ore_totali:999,
      prodotti:[[10,16],[20,4]].map(([quantita,lavoro_h])=>({...blankProduct(),quantita,lavoro_h,materiale_cad:1,trattamenti_cad:1}))};
    const result=calculateQuote(input);
    expect(result.prodotti.map((p:Record<string,number>)=>p.lavoro_ore_totali)).toEqual([16,4]);
    expect(result.prodotti.map((p:Record<string,number>)=>p.lavoro_tot)).toEqual([384,96]);
    expect(result.prodotti.map((p:Record<string,number>)=>p.lavoro_ore_totali/p.quantita)).toEqual([1.6,0.2]);
    expect(result.prodotti[0].prezzo_netto_unitario_finale).toBeCloseTo(88.375,10);
    expect(result.prodotti[1].prezzo_netto_unitario_finale).toBeCloseTo(14.875,10);
    expect(result.totale_finale).toBeCloseTo(1181.25,10);
    expect(result.lavoro_ore_calcolate).toBe(20);
    input.prodotti[0].quantita=20;
    const larger=calculateQuote(input);
    expect(larger.prodotti[0].lavoro_ore_totali).toBe(16);
    expect(larger.prodotti[1].lavoro_ore_totali).toBe(4);
    expect(larger.prodotti[0].lavoro_tot/larger.prodotti[0].quantita).toBe(19.2);
  });
  it("distributes the 16 header hours over eight and twelve pieces in quote B",()=>{
    const result=calculateQuote({...blankQuote(),lavoro_ore_totali:16,
      prodotti:[8,12].map(quantita=>({...blankProduct(),quantita,lavoro_h:999,materiale_cad:1,trattamenti_cad:1}))});
    expect(result.prodotti.map((p:Record<string,number>)=>p.lavoro_ore_totali)).toEqual([6.4,9.6]);
    expect(result.lavoro_ore_calcolate).toBe(16);
    result.prodotti.forEach((p:Record<string,number>)=>{
      expect(p.lavoro_ore_totali/p.quantita).toBeCloseTo(0.8,10);
      expect(p.prezzo_netto_unitario_finale).toBeCloseTo(46.375,10);
    });
    expect(result.totale_finale).toBeCloseTo(927.5,10);
  });
  it("produces the same price for one product with ten pieces and 16 hours in either mode",()=>{
    for(const lavoro_modalita of ["per_prodotto","complessivo"]){
      const result=calculateQuote({...blankQuote(),lavoro_modalita,lavoro_ore_totali:16,
        prodotti:[{...blankProduct(),quantita:10,lavoro_h:16,materiale_cad:1,trattamenti_cad:1}]});
      expect(result.lavoro_ore_calcolate).toBe(16);
      expect(result.totale_finale).toBeCloseTo(883.75,10);
    }
  });
  it("distributes 100 hours across 50/25/30 pieces without creating five extra hours",()=>{
    const input=quote(), original=JSON.stringify(input), result=calculateQuote(input);
    const expected=[100*50/105,100*25/105,100*30/105];
    result.prodotti.forEach((p:Record<string,number>,i:number)=>{
      expect(p.lavoro_ore_totali).toBeCloseTo(expected[i],10);
      expect(p.lavoro_ore_totali/p.quantita).toBeCloseTo(100/105,10);
      expect(p.lavoro_tot).toBeCloseTo(expected[i]*24,10);
      expect(p.attrezzaggi_tot).toBe(48);
    });
    expect(result.lavoro_ore_calcolate).toBeCloseTo(100,10);
    expect(result.prodotti.reduce((n:number,p:Record<string,number>)=>n+p.lavoro_tot,0)).toBeCloseTo(2400,10);
    expect(result.costi_comuni_riepilogo.progettazione_totale).toBe(100);
    expect(result.costi_comuni_riepilogo.progettazione_cad).toBeCloseTo(100/105,10);
    expect(JSON.stringify(input)).toBe(original);
  });
  it("assigns one hour per piece for 100 hours over four rows of 25 pieces",()=>{
    const result=calculateQuote({...quote(),prodotti:[25,25,25,25].map(quantita=>({...blankProduct(),quantita}))});
    expect(result.prodotti.map((p:Record<string,number>)=>p.lavoro_ore_totali)).toEqual([25,25,25,25]);
  });
  it("reallocates a fixed quote-wide pool when quantities change",()=>{
    const input=quote(); input.prodotti[2].quantita=125;
    const result=calculateQuote(input);
    expect(result.prodotti.map((p:Record<string,number>)=>p.lavoro_ore_totali)).toEqual([25,12.5,62.5]);
    expect(result.lavoro_ore_calcolate).toBe(100);
  });
  it("preserves the old per-piece mode for quotes already saved by the previous release",()=>{
    const result=calculateQuote({...quote(),lavoro_modalita:"per_pezzo",prodotti:[
      {...blankProduct(),quantita:10,lavoro_h:2,costo_lavoro:24,attrezzaggi_h:1},
      {...blankProduct(),quantita:5,lavoro_h:3,costo_lavoro:30},
    ]});
    expect(result.prodotti.map((p:Record<string,number>)=>p.lavoro_ore_totali)).toEqual([20,15]);
    expect(result.prodotti.map((p:Record<string,number>)=>p.lavoro_tot)).toEqual([480,450]);
    expect(result.prodotti[0].attrezzaggi_tot).toBe(24);
    expect(result.costi_comuni_riepilogo.progettazione_totale).toBe(100);
  });
  it("preserves legacy per-line labor when the saved quote has no mode",()=>{
    const input={...quote(),lavoro_modalita:undefined,prodotti:[
      {...blankProduct(),quantita:10,lavoro_h:2}, {...blankProduct(),quantita:30,lavoro_h:3},
    ]};
    const old=calculateQuote(input);
    expect(old.prodotti.map((p:Record<string,number>)=>p.lavoro_tot)).toEqual([48,72]);
    const perProduct=changeQuoteLaborMode(input,"per_prodotto");
    expect(perProduct.prodotti.map((p:Record<string,number>)=>p.lavoro_h)).toEqual([2,3]);
    expect(calculateQuote(perProduct).totale_finale).toBeCloseTo(old.totale_finale,10);
    const unit=changeQuoteLaborMode(input,"per_pezzo");
    expect(unit.prodotti.map((p:Record<string,number>)=>p.lavoro_h)).toEqual([0.2,0.1]);
    expect(calculateQuote(unit).full_cost_totale).toBeCloseTo(old.full_cost_totale,10);
    const common=changeQuoteLaborMode(input,"complessivo");
    expect(common.lavoro_ore_totali).toBe(5);
    expect(calculateQuote(common).prodotti.map((p:Record<string,number>)=>p.lavoro_ore_totali)).toEqual([1.25,3.75]);
    expect(input.lavoro_modalita).toBeUndefined();
  });
  it("conserves hours through mode changes, draft save/reopen and repeated recalculation",()=>{
    const input=quote(), unit=changeQuoteLaborMode(input,"per_prodotto");
    expect(calculateQuote(unit).lavoro_ore_calcolate).toBeCloseTo(100,10);
    unit.prodotti.forEach((p:Record<string,number>,i:number)=>expect(p.lavoro_h).toBeCloseTo(100*input.prodotti[i].quantita/105,10));
    const common=changeQuoteLaborMode(unit,"complessivo");
    const reopened=parseIncompleteQuote(JSON.stringify({...common,stato_preventivo:"bozza"}));
    const result=calculateQuote(reopened);
    expect(result.lavoro_ore_calcolate).toBeCloseTo(100,10);
    expect(calculateQuote(result).totale_finale).toBeCloseTo(result.totale_finale,10);
  });
  it("includes treatment time once and leaves setup and design outside the labor pool",()=>{
    const result=calculateQuote({...quote(),trattamenti_modalita:"ore_lavoro",trattamenti_totale_euro:900});
    expect(result.prodotti.every((p:Record<string,number>)=>p.trattamenti_tot===0)).toBe(true);
    expect(result.lavoro_ore_calcolate).toBeCloseTo(100,10);
    expect(result.costi_comuni_riepilogo.progettazione_totale).toBe(100);
  });
  it("rejects invalid hours and unknown modes",()=>{
    for(const value of [-1,Infinity,NaN])expect(()=>calculateQuote({...quote(),lavoro_ore_totali:value})).toThrow("ore di lavorazione");
    for(const lavoro_h of [-1,Infinity,NaN])expect(()=>calculateQuote({...quote(),lavoro_modalita:"per_prodotto",prodotti:[{...blankProduct(),lavoro_h}]})).toThrow("ore di lavorazione");
    expect(()=>calculateQuote({...quote(),lavoro_modalita:"unknown"})).toThrow("Modalità");
  });
  it("converts previously saved per-piece hours only when explicitly requested",()=>{
    const original={...blankQuote(),lavoro_modalita:"per_pezzo",prodotti:[{...blankProduct(),quantita:10,lavoro_h:16}]};
    const before=calculateQuote(original);
    const converted=changeQuoteLaborMode(original,"per_prodotto");
    expect(converted.prodotti[0].lavoro_h).toBe(160);
    expect(calculateQuote(converted).totale_finale).toBeCloseTo(before.totale_finale,10);
    expect(original.prodotti[0].lavoro_h).toBe(16);
    expect(original.lavoro_modalita).toBe("per_pezzo");
  });
  it("asks the common hours once or the total hours for each product",()=>{
    const common=buildQuoteWizardSteps(quote());
    expect(common.filter(s=>s.field==="lavoro_ore_totali")).toHaveLength(1);
    expect(common.filter(s=>s.field==="lavoro_h")).toHaveLength(0);
    const unit=buildQuoteWizardSteps(changeQuoteLaborMode(quote(),"per_prodotto"));
    expect(unit.filter(s=>s.field==="lavoro_ore_totali")).toHaveLength(0);
    expect(unit.filter(s=>s.field==="lavoro_h")).toHaveLength(3);
    expect(unit.filter(s=>s.field==="lavoro_h").every(s=>s.title==="Ore di lavorazione di questo prodotto")).toBe(true);
  });
});
