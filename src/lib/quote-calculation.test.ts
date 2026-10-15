import { describe, expect, it } from "vitest";
import {
  blankProduct, blankQuote, calculateQuote, migrateQuoteToSharedCosts, migrateQuoteToEngineeringHours,
} from "./quote-calculation";

const product=(quantity:number,materialPerPiece:number,extras:Record<string,unknown>={})=>({
  ...blankProduct(), quantita:quantity, materiale_cad:materialPerPiece, ...extras,
});

describe("TKT-20261015-14060001: design cost by hours and hourly rate",()=>{
  it("calculates engineering once from shared hours × rate / all pieces",()=>{
    const d={...blankQuote(),progettazione_ore:3,costo_progettazione_ora:45,
      prodotti:[product(10,1),product(20,1),product(30,1)]};
    const x=calculateQuote(d);
    expect(x.costi_comuni_versione).toBe(3);
    expect(x.costi_comuni_riepilogo.progettazione_ore).toBe(3);
    expect(x.costi_comuni_riepilogo.costo_progettazione_ora).toBe(45);
    expect(x.costi_comuni_riepilogo.progettazione_totale).toBe(135);
    expect(x.costi_comuni_riepilogo.progettazione_cad).toBeCloseTo(2.25);
    expect(x.prodotti.map((p:Record<string,number>)=>p.progettazione_tot)).toEqual([22.5,45,67.5]);
    expect(x.prodotti.reduce((tot:number,p:Record<string,number>)=>tot+p.progettazione_tot,0)).toBeCloseTo(135);
    expect(x.prodotti.map((p:Record<string,number>)=>p.costo_primo_cad)).toEqual([3.25,3.25,3.25]);
    expect(d.progettazione_totale_euro).toBe(0); // original draft retains zero, only clone gets 135
  });
  it("reallocates across changing quantities without multiplying common cost",()=>{
    const d={...blankQuote(),progettazione_ore:2,costo_progettazione_ora:80,
      trattamenti_modalita:"globale",trattamenti_totale_euro:90,
      prodotti:[product(10,1),product(30,1)]};
    const a=calculateQuote(d);
    expect(a.costi_comuni_riepilogo.progettazione_cad).toBe(4);
    expect(a.costi_comuni_riepilogo.trattamenti_globali_cad).toBe(2.25);
    d.prodotti[1].quantita=70;
    const b=calculateQuote(d);
    expect(b.costi_comuni_riepilogo.progettazione_cad).toBe(2);
    expect(b.costi_comuni_riepilogo.trattamenti_globali_cad).toBe(1.125);
    expect(b.prodotti.reduce((n:number,p:Record<string,number>)=>n+p.progettazione_tot,0)).toBeCloseTo(160);
    expect(b.prodotti.reduce((n:number,p:Record<string,number>)=>n+p.trattamenti_tot,0)).toBeCloseTo(90);
  });
  it("treats version 2 total engineering as historical, never silently recalc it from hours",()=>{
    const old={...blankQuote(),costi_comuni_versione:2,
      progettazione_totale_euro:123.45,progettazione_ore:999,costo_progettazione_ora:900,
      prodotti:[product(10,1),product(20,1)]};
    const before=JSON.stringify(old);
    const historic=calculateQuote(old);
    expect(historic.costi_comuni_riepilogo.progettazione_totale).toBe(123.45);
    const next=migrateQuoteToEngineeringHours(old);
    expect(next.costi_comuni_versione).toBe(3);
    expect(next.progettazione_ore).toBe(1);
    expect(next.costo_progettazione_ora).toBe(123.45);
    expect(calculateQuote(next).costi_comuni_riepilogo.progettazione_totale).toBe(123.45);
    expect(JSON.stringify(old)).toBe(before);
  });
  it("can convert version 1 cost to hours×rate without touching the original revision",()=>{
    const legacy={...blankQuote(),costi_comuni_versione:undefined,
      prodotti:[product(10,1,{progettazione_h:2,costo_progettazione:50}),
        product(20,1,{progettazione_h:1,costo_progettazione:60})]};
    const next=migrateQuoteToEngineeringHours(legacy);
    expect(next.progettazione_ore).toBe(1);
    expect(next.costo_progettazione_ora).toBe(160);
    expect(next.trattamenti_modalita).toBe("per_prodotto");
    expect(calculateQuote(next).costi_comuni_riepilogo.progettazione_totale).toBe(160);
    expect((legacy.prodotti[0] as Record<string,unknown>).progettazione_h).toBe(2);
  });
  it("rejects negative and non-finite engineering hours or rates without altering the source",()=>{
    expect(()=>calculateQuote({...blankQuote(),progettazione_ore:-1})).toThrow("non negativi");
    expect(()=>calculateQuote({...blankQuote(),costo_progettazione_ora:-1})).toThrow("non negativi");
    expect(()=>calculateQuote({...blankQuote(),progettazione_ore:Infinity})).toThrow("non negativi");
  });
});

describe("Una Tantum: quote-wide engineering and dual treatment allocation",()=>{
  it("allocates a single engineering amount over the total of 3 product quantities (not three times)",()=>{
    const quote={...blankQuote(),progettazione_ore:2,costo_progettazione_ora:60,prodotti:[
      product(10,2),product(20,3),product(30,4),
    ]};
    const result=calculateQuote(quote);
    expect(result.quantita).toBe(60);
    expect(result.costi_comuni_riepilogo.progettazione_cad).toBeCloseTo(2);
    expect(result.prodotti.map((p:Record<string,number>)=>p.progettazione_tot))
      .toEqual([20,40,60]);
    expect(result.prodotti.reduce((sum:number,p:Record<string,number>)=>sum+p.progettazione_tot,0))
      .toBeCloseTo(120);
    expect(result.prodotti.map((p:Record<string,number>)=>p.costo_primo_cad))
      .toEqual([4,5,6]);
    expect(result.full_cost_totale).toBeCloseTo((10*4+20*5+30*6)*1.75);
    expect(result.totale_finale).toBeCloseTo(result.full_cost_totale/0.8);
    expect(Object.prototype.hasOwnProperty.call(quote.prodotti[0],"progettazione_tot")).toBe(false); // source untouched
  });
  it("treatment in global mode is quote total / total pieces; inactive product costs are ignored",()=>{
    const quote={...blankQuote(), progettazione_ore:2,costo_progettazione_ora:60,
      trattamenti_modalita:"globale",trattamenti_totale_euro:90,
      prodotti:[
        product(10,2,{trattamenti_cad:10}),
        product(20,3,{trattamenti_cad:20}),
        product(30,4,{trattamenti_cad:30}),
      ]};
    const result=calculateQuote(quote);
    expect(result.costi_comuni_riepilogo.trattamenti_globali_cad).toBeCloseTo(1.5);
    expect(result.prodotti.map((p:Record<string,number>)=>p.trattamenti_tot)).toEqual([15,30,45]);
    expect(result.prodotti.reduce((sum:number,p:Record<string,number>)=>sum+p.trattamenti_tot,0))
      .toBeCloseTo(90);
    expect(result.prodotti.map((p:Record<string,number>)=>p.costo_primo_cad)).toEqual([5.5,6.5,7.5]);
  });
  it("per-product mode takes only each product €/piece treatment and ignores inactive global amount",()=>{
    const quote={...blankQuote(), progettazione_ore:2,costo_progettazione_ora:60,
      trattamenti_modalita:"per_prodotto",trattamenti_totale_euro:900,
      prodotti:[
        product(10,2,{trattamenti_cad:2}),
        product(20,3,{trattamenti_cad:1}),
        product(30,4,{trattamenti_cad:0}),
      ]};
    const result=calculateQuote(quote);
    expect(result.costi_comuni_riepilogo.trattamenti_globali_totale).toBe(0);
    expect(result.prodotti.map((p:Record<string,number>)=>p.trattamenti_tot)).toEqual([20,20,0]);
    expect(result.prodotti.map((p:Record<string,number>)=>p.costo_primo_cad)).toEqual([6,6,6]);
  });
  it("changing the number of pieces reallocates shared amounts without changing their totals",()=>{
    const quote={...blankQuote(), progettazione_ore:2,costo_progettazione_ora:60,
      trattamenti_modalita:"globale",trattamenti_totale_euro:90,
      prodotti:[product(10,1),product(20,1),product(30,1)]};
    const first=calculateQuote(quote);
    quote.prodotti[2].quantita=90;
    const second=calculateQuote(quote);
    expect(first.costi_comuni_riepilogo.progettazione_cad).toBeCloseTo(2);
    expect(second.costi_comuni_riepilogo.progettazione_cad).toBeCloseTo(1);
    expect(first.costi_comuni_riepilogo.trattamenti_globali_cad).toBeCloseTo(1.5);
    expect(second.costi_comuni_riepilogo.trattamenti_globali_cad).toBeCloseTo(0.75);
    for(const result of [first,second]){
      expect(result.prodotti.reduce((n:number,p:Record<string,number>)=>n+p.progettazione_tot,0)).toBeCloseTo(120);
      expect(result.prodotti.reduce((n:number,p:Record<string,number>)=>n+p.trattamenti_tot,0)).toBeCloseTo(90);
    }
  });
  it("uses allocated common costs within full cost and margin even with different overheads",()=>{
    const quote={...blankQuote(), progettazione_ore:1,costo_progettazione_ora:60,trattamenti_modalita:"globale",trattamenti_totale_euro:60,
      prodotti:[product(10,2,{ricarico_spese:0.5,margine:0.1}),product(20,3,{ricarico_spese:1,margine:0.2})]};
    const result=calculateQuote(quote);
    expect(result.prodotti[0].costo_primo_cad).toBeCloseTo(6);
    expect(result.prodotti[1].costo_primo_cad).toBeCloseTo(7);
    expect(result.full_cost_totale).toBeCloseTo(6*10*1.5 + 7*20*2);
    expect(result.totale_finale).toBeCloseTo(6*1.5/0.9*10+7*2/0.8*20);
    expect(result.margine_netto_complessivo_valore).toBeCloseTo(result.totale_finale-result.full_cost_totale);
  });
  it("honors manual selling prices and global target quadratura after allocation",()=>{
    const quote={...blankQuote(), progettazione_ore:0.5,costo_progettazione_ora:60,trattamenti_modalita:"globale",trattamenti_totale_euro:10,
      target_totale:200,
      prodotti:[product(10,1,{prezzo_manuale:5,quadrabile:false}),product(10,1,{quadrabile:true})]};
    const result=calculateQuote(quote);
    expect(result.prodotti[0].prezzo_netto_unitario_finale).toBeCloseTo(5);
    expect(result.prodotti[0].totale_finale).toBeCloseTo(50);
    expect(result.prodotti[1].prezzo_netto_unitario_finale).toBeCloseTo(15);
    expect(result.totale_finale).toBeCloseTo(200);
    expect(result.margine_netto_complessivo_valore).toBeCloseTo(200-result.full_cost_totale);
  });
  it("historical quotes continue to use the original per-product design and treatment costs",()=>{
    const legacy={...blankQuote(),costi_comuni_versione:undefined,
      prodotti:[
        product(10,2,{progettazione_h:2,costo_progettazione:50,trattamenti_cad:1}),
        product(20,2,{progettazione_h:1,costo_progettazione:60,trattamenti_cad:2}),
      ]};
    const original=JSON.stringify(legacy);
    const old=calculateQuote(legacy);
    expect(old.prodotti.map((p:Record<string,number>)=>p.progettazione_tot)).toEqual([100,60]);
    expect(old.prodotti.map((p:Record<string,number>)=>p.trattamenti_tot)).toEqual([10,40]);
    expect(old.prodotti.map((p:Record<string,number>)=>p.costo_primo_cad)).toEqual([13,7]);
    expect(JSON.stringify(legacy)).toBe(original);
    const converted=migrateQuoteToSharedCosts(legacy);
    expect(converted.costi_comuni_versione).toBe(2);
    expect(converted.progettazione_totale_euro).toBe(160);
    expect(converted.trattamenti_modalita).toBe("per_prodotto");
    expect(converted.trattamenti_totale_euro).toBe(50);
    expect(converted.prodotti[0].progettazione_h).toBeUndefined();
    expect(converted.prodotti[1].costo_progettazione).toBeUndefined();
    const migrated=calculateQuote(converted);
    expect(migrated.prodotti.reduce((n:number,p:Record<string,number>)=>n+p.progettazione_tot,0)).toBeCloseTo(160);
    expect(migrated.prodotti.reduce((n:number,p:Record<string,number>)=>n+p.trattamenti_tot,0)).toBeCloseTo(50);
    // Identical overheads preserve overall full cost; item prices can change.
    expect(migrated.full_cost_totale).toBeCloseTo(old.full_cost_totale);
    expect(JSON.stringify(legacy)).toBe(original);
  });
  it("changing treatment mode back and forth never adds both active and inactive amounts",()=>{
    const quote={...blankQuote(), trattamenti_totale_euro:90,
      prodotti:[product(10,0,{trattamenti_cad:4}),product(20,0,{trattamenti_cad:5})]};
    const original=calculateQuote(quote);
    const global=calculateQuote({...quote,trattamenti_modalita:"globale"});
    const back=calculateQuote({...quote,trattamenti_modalita:"per_prodotto"});
    expect(original.prodotti.reduce((n:number,p:Record<string,number>)=>n+p.trattamenti_tot,0)).toBeCloseTo(140);
    expect(global.prodotti.reduce((n:number,p:Record<string,number>)=>n+p.trattamenti_tot,0)).toBeCloseTo(90);
    expect(back.prodotti.reduce((n:number,p:Record<string,number>)=>n+p.trattamenti_tot,0)).toBeCloseTo(140);
  });
  it("does not accept absent or invalid quantities or negative global costs",()=>{
    expect(()=>calculateQuote({...blankQuote(),prodotti:[]})).toThrow("almeno un prodotto");
    expect(()=>calculateQuote({...blankQuote(),prodotti:[product(0,1)]})).toThrow("maggiore di zero");
    expect(()=>calculateQuote({...blankQuote(),progettazione_ore:-1})).toThrow("numeri non negativi");
    expect(()=>calculateQuote({...blankQuote(),trattamenti_modalita:"globale",trattamenti_totale_euro:-1})).toThrow("numeri non negativi");
  });
  it("quotes converted to the new model are not mutated by another conversion",()=>{
    const original=blankQuote();
    const converted=migrateQuoteToSharedCosts(original);
    expect(converted).toEqual(original);
    expect(converted).not.toBe(original);
  });
});
