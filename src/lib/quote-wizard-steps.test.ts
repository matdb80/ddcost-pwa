import {describe,expect,it} from "vitest";
import {blankProduct,blankQuote,calculateQuote} from "./quote-calculation";
import {buildQuoteWizardSteps,quoteWizardStepError} from "./quote-wizard-steps";

describe("Una Tantum mobile wizard step sequencing",()=>{
  it("has one main field per step and short phone path by default",()=>{
    const steps=buildQuoteWizardSteps(blankQuote());
    expect(steps[0].id).toBe("cliente");
    expect(steps.at(-1)?.id).toBe("riepilogo");
    expect(steps.filter(x=>x.kind==="number").every(x=>typeof x.field==="string")).toBe(true);
    expect(steps.filter(x=>x.index===0).map(x=>x.field))
      .toContain("quantita");
    expect(steps.some(x=>x.field==="target_totale")).toBe(false);
    expect(steps.some(x=>x.field==="ricarico_spese")).toBe(false);
    expect(steps.some(x=>x.field==="progettazione_ore")).toBe(true);
    expect(steps.some(x=>x.field==="costo_progettazione_ora")).toBe(true);
  });
  it("lets the user access optional complete-editor values without losing basic fields",()=>{
    const basic=buildQuoteWizardSteps(blankQuote());
    const full=buildQuoteWizardSteps(blankQuote(),true);
    expect(full.length).toBeGreaterThan(basic.length);
    for(const s of basic)expect(full.some(x=>x.id===s.id)).toBe(true);
    for(const id of ["target_totale","listino_prodotto","listino_sconto","note_cliente",
      "note_generali","note_fornitori","p:0:margine","p:0:prezzo_manuale",
      "p:0:quadrabile","p:0:attrezzaggi_h","p:0:costo_lavoro"])
      expect(full.some(s=>s.id===id)).toBe(true);
  });
  it("supports three products, each with its own group, material and amount",()=>{
    const quote={...blankQuote(),prodotti:[blankProduct(),blankProduct(),blankProduct()]};
    const steps=buildQuoteWizardSteps(quote);
    expect(steps.filter(x=>x.field==="quantita")).toHaveLength(3);
    expect(steps.filter(x=>x.field==="gruppo_merceologico")).toHaveLength(3);
    expect(steps.filter(x=>x.field==="materiale_prodotto")).toHaveLength(3);
    expect(steps.filter(x=>x.id.endsWith(":done"))).toHaveLength(3);
    expect(steps.some(x=>x.id==="p:2:descrizione")).toBe(true);
  });
  it("treatments branch changes and never requires duplicate global and line treatment inputs",()=>{
    const q=blankQuote();
    const per=buildQuoteWizardSteps(q);
    expect(per.some(x=>x.id==="p:0:trattamenti_cad")).toBe(true);
    expect(per.some(x=>x.id==="trattamenti_totale_euro")).toBe(false);
    q.trattamenti_modalita="globale";
    const all=buildQuoteWizardSteps(q);
    expect(all.some(x=>x.id==="p:0:trattamenti_cad")).toBe(false);
    expect(all.some(x=>x.id==="trattamenti_totale_euro")).toBe(true);
    q.prodotti[0].quantita=5;
    q.progettazione_ore=2;
    q.costo_progettazione_ora=50;
    q.trattamenti_totale_euro=40;
    const calc=calculateQuote(q);
    expect(calc.prodotti[0].progettazione_tot).toBe(100);
    expect(calc.prodotti[0].trattamenti_tot).toBe(40);
  });
  it("asks for treatment allocation only once, before ANY product treatment question",()=>{
    const q={...blankQuote(),prodotti:[blankProduct(),blankProduct(),blankProduct()]};
    const steps=buildQuoteWizardSteps(q);
    const mode=steps.filter(x=>x.field==="trattamenti_modalita");
    expect(mode).toHaveLength(1);
    expect(mode[0].index).toBeUndefined();
    expect(steps.indexOf(mode[0])).toBeLessThan(steps.findIndex(x=>x.id==="p:0:descrizione"));
    const local=steps.filter(x=>x.field==="trattamenti_cad");
    expect(local).toHaveLength(3);
    expect(local.map(x=>x.index)).toEqual([0,1,2]);
    expect(local.every(x=>x.hint.includes("questo articolo"))).toBe(true);
    expect(steps.filter(x=>x.field==="trattamenti_totale_euro")).toHaveLength(0);

    const globalSteps=buildQuoteWizardSteps({...q,trattamenti_modalita:"globale"});
    expect(globalSteps.filter(x=>x.field==="trattamenti_modalita")).toHaveLength(1);
    expect(globalSteps.filter(x=>x.field==="trattamenti_totale_euro")).toHaveLength(1);
    expect(globalSteps.filter(x=>x.field==="trattamenti_cad")).toHaveLength(0);
    expect(globalSteps.findIndex(x=>x.id==="trattamenti_modalita"))
      .toBeLessThan(globalSteps.findIndex(x=>x.id==="p:0:descrizione"));
    expect(globalSteps.findIndex(x=>x.id==="trattamenti_totale_euro"))
      .toBeLessThan(globalSteps.findIndex(x=>x.id==="p:0:descrizione"));
  });
  it("allocates exactly one global amount, including when hidden product costs were previously filled",()=>{
    const q={...blankQuote(),trattamenti_modalita:"globale",trattamenti_totale_euro:120,
      prodotti:[
        {...blankProduct(),quantita:10,trattamenti_cad:9},
        {...blankProduct(),quantita:20,trattamenti_cad:8},
        {...blankProduct(),quantita:30,trattamenti_cad:7},
      ],
    };
    const result=calculateQuote(q);
    expect(result.costi_comuni_riepilogo.trattamenti_globali_cad).toBeCloseTo(2);
    expect(result.prodotti.map((p:Record<string,number>)=>p.trattamenti_tot)).toEqual([20,40,60]);
    expect(result.prodotti.reduce((t:number,p:Record<string,number>)=>t+p.trattamenti_tot,0))
      .toBeCloseTo(120);
    const per=calculateQuote({...q,trattamenti_modalita:"per_prodotto"});
    expect(per.prodotti.reduce((t:number,p:Record<string,number>)=>t+p.trattamenti_tot,0))
      .toBeCloseTo(9*10+8*20+7*30);
    const back=calculateQuote(q);
    expect(back.full_cost_totale).toBeCloseTo(result.full_cost_totale);
  });
  it("asks the treatment policy ONCE before all products and never after their data",()=>{
    const q={...blankQuote(),prodotti:[blankProduct(),blankProduct(),blankProduct()]};
    const path=buildQuoteWizardSteps(q);
    const policy=path.filter(x=>x.field==="trattamenti_modalita");
    expect(policy).toHaveLength(1);
    expect(path.findIndex(x=>x.id==="trattamenti_modalita")).toBeLessThan(
      path.findIndex(x=>x.id==="p:0:descrizione"));
    expect(path.filter(x=>x.field==="trattamenti_cad").map(x=>x.index)).toEqual([0,1,2]);
    expect(path.some(x=>x.id==="trattamenti_totale_euro")).toBe(false);
    expect(path.filter(x=>x.field==="trattamenti_cad").map(x=>x.title)).toEqual([
      "Trattamenti del prodotto 1 (€/pz)",
      "Trattamenti del prodotto 2 (€/pz)",
      "Trattamenti del prodotto 3 (€/pz)",
    ]);
    const pathAdvanced=buildQuoteWizardSteps(q,true);
    expect(pathAdvanced.filter(x=>x.id==="trattamenti_modalita")).toHaveLength(1);
    expect(pathAdvanced.findIndex(x=>x.id==="trattamenti_modalita")).toBeLessThan(
      pathAdvanced.findIndex(x=>x.id==="p:0:descrizione"));
  });
  it("global treatment for 3 products is entered exactly once before products, ignores inactive line costs",()=>{
    const q={...blankQuote(),trattamenti_modalita:"globale",trattamenti_totale_euro:90,
      prodotti:[
        {...blankProduct(),quantita:10,trattamenti_cad:5},
        {...blankProduct(),quantita:20,trattamenti_cad:10},
        {...blankProduct(),quantita:30,trattamenti_cad:20},
      ]};
    const path=buildQuoteWizardSteps(q);
    expect(path.filter(x=>x.id==="trattamenti_modalita")).toHaveLength(1);
    expect(path.filter(x=>x.id==="trattamenti_totale_euro")).toHaveLength(1);
    expect(path.some(x=>x.field==="trattamenti_cad")).toBe(false);
    expect(path.findIndex(x=>x.id==="trattamenti_modalita")).toBeLessThan(path.findIndex(x=>x.id==="trattamenti_totale_euro"));
    expect(path.findIndex(x=>x.id==="trattamenti_totale_euro")).toBeLessThan(path.findIndex(x=>x.id==="p:0:descrizione"));
    const totals=calculateQuote(q).prodotti.map((p:Record<string,number>)=>p.trattamenti_tot);
    expect(totals).toEqual([15,30,45]);
    const alternative={...q,trattamenti_modalita:"per_prodotto"};
    const split=buildQuoteWizardSteps(alternative);
    expect(split.filter(x=>x.field==="trattamenti_cad")).toHaveLength(3);
    expect(split.some(x=>x.id==="trattamenti_totale_euro")).toBe(false);
    expect(calculateQuote(alternative).prodotti.map((p:Record<string,number>)=>p.trattamenti_tot)).toEqual([50,200,600]);
    // Back to global uses the saved global number only.
    expect(calculateQuote(q).prodotti.map((p:Record<string,number>)=>p.trattamenti_tot)).toEqual([15,30,45]);
  });
  it("weight costing is a separate guided path; a hidden known €/piece value cannot mislead",()=>{
    const q=blankQuote();
    q.prodotti[0].costo_materiale_noto=false;
    q.prodotti[0].materiale_prodotto="ferro";
    const steps=buildQuoteWizardSteps(q);
    expect(steps.some(s=>s.id==="p:0:materiale_cad")).toBe(false);
    const fields=steps.filter(s=>s.index===0).map(s=>s.field);
    for(const key of ["costo_materiale_noto","lunghezza_mm","larghezza_mm","spessore_mm","costo_materiale_kg"])
      expect(fields).toContain(key);
    const lengthStep=steps.find(s=>s.id==="p:0:lunghezza_mm")!;
    expect(quoteWizardStepError(lengthStep,q)).toMatch(/maggiore di zero/);
    q.prodotti[0].lunghezza_mm=100;
    q.prodotti[0].larghezza_mm=50;
    q.prodotti[0].spessore_mm=2;
    q.prodotti[0].costo_materiale_kg=2;
    expect(quoteWizardStepError(lengthStep,q)).toBe(null);
    const costStep=steps.find(s=>s.id==="p:0:costo_materiale_kg")!;
    expect(quoteWizardStepError(costStep,q)).toBe(null);
    const result=calculateQuote(q);
    expect(result.prodotti[0].materiale_calcolato_cad).toBeCloseTo(0.157);
    q.prodotti[0].costo_materiale_noto=true;
    const known=buildQuoteWizardSteps(q);
    expect(known.some(s=>s.id==="p:0:materiale_cad")).toBe(true);
    expect(known.some(s=>s.id==="p:0:lunghezza_mm")).toBe(false);
  });
  it("historical quotes keep their own editable costing fields until explicit upgrade",()=>{
    const q={...blankQuote(),costi_comuni_versione:undefined};
    const legacy=buildQuoteWizardSteps(q);
    expect(legacy.some(x=>x.id==="p:0:progettazione_h")).toBe(true);
    expect(legacy.some(x=>x.id==="p:0:costo_progettazione")).toBe(true);
    expect(legacy.some(x=>x.id==="progettazione_ore")).toBe(false);
    const v2=buildQuoteWizardSteps({...q,costi_comuni_versione:2});
    expect(v2.some(x=>x.id==="progettazione_totale_euro")).toBe(true);
    expect(v2.some(x=>x.id==="p:0:progettazione_h")).toBe(false);
  });
  it("prevents moving beyond required values but lets the user save incomplete drafts",()=>{
    const q=blankQuote();
    const required=buildQuoteWizardSteps(q).filter(x=>x.required);
    expect(required.map(x=>x.field)).toEqual(expect.arrayContaining(["cliente","descrizione","gruppo_merceologico","materiale_prodotto","quantita"]));
    expect(quoteWizardStepError(required[0],q)).toMatch(/obbligatorio/);
    q.cliente="Cliente Test";
    expect(quoteWizardStepError(required[0],q)).toBe(null);
    const qty=required.find(x=>x.field==="quantita")!;
    q.prodotti[0].quantita=0;
    expect(quoteWizardStepError(qty,q)).toMatch(/maggiore di zero/);
    q.prodotti[0].quantita=20;
    expect(quoteWizardStepError(qty,q)).toBe(null);
  });
});
