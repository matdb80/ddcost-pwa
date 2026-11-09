import {describe,it,expect} from "vitest";
import {blankQuote,blankProduct,calculateQuote,changeQuoteLaborMode,quoteLaborHours,migrateQuoteToSharedCosts} from "./quote-calculation";
import {forfaitProductError,isForfait} from "./quote-forfait";
import {quoteModificationError} from "./quote-modification-validation";
import {quoteMaterialError} from "./quote-material-weight";
import {buildQuoteWizardSteps,quoteWizardStepError} from "./quote-wizard-steps";
import {buildOneTimeQuotePrintHtml} from "./quote-pdf";
import {formatQuoteForCopy} from "./quote-copy";
import {salesDocument,salesText} from "./commercial-handoff";
const fixed=(amount:unknown=125.5)=>({...blankProduct(),a_forfait:true,descrizione:"Lavorazione da definire",valore_forfait:amount,
  quantita:"",codice:"CODICE-INATTIVO",codice_temporaneo:{color:"3000",code:"CODICE-INATTIVO"},
  costo_materiale_noto:false,geometria_materiale:"",materiale_cad:1000,lavoro_h:100,attrezzaggi_h:100,margine:1});
const standard=(q:number)=>({...blankProduct(),descrizione:"Bandella",codice:"TFP0000010In",quantita:q,materiale_cad:1,ricarico_spese:0,margine:0});
describe("forfait fixed line pricing",()=>{
  it("requires only description and an explicit total, ignoring stale standard fields and global costs",()=>{
    const doc={...blankQuote(),prodotti:[fixed()],progettazione_ore:-10,costo_progettazione_ora:NaN,lavoro_modalita:"invalid",
      lavoro_ore_totali:-3,trattamenti_modalita:"globale",trattamenti_totale_euro:-10,target_totale:999,verniciatura_ral:{color:"invalid"}};
    const result=calculateQuote(doc);
    expect(result.totale_finale).toBe(125.5);expect(result.quantita).toBe(0);
    expect(result.lavoro_ore_calcolate).toBe(0);expect(result.quadratura_applicata).toBe(false);
    expect(result.ral_riepilogo).toBeUndefined();expect(result.full_cost_totale).toBeNull();
    expect(result.margine_netto_complessivo_perc).toBeNull();expect(result.prezzo_netto_unitario).toBeNull();
    expect(result.costi_comuni_riepilogo.progettazione_cad).toBe(0);
    expect(result.prodotti[0]).toMatchObject({quantita:"",lavoro_h:100,materiale_cad:1000,margine:1});
    expect(result.prodotti[0].full_cost).toBeUndefined();expect(result.prodotti[0].prezzo_netto_unitario_finale).toBeUndefined();
    expect(quoteModificationError(result.prodotti)).toBeNull();expect(quoteMaterialError(result.prodotti)).toBeNull();
    expect(doc.prodotti[0]).not.toHaveProperty("totale_finale");
  });
  it.each([null,undefined,"","  ",-1,NaN,Infinity,"bad",true])("rejects an absent or invalid sale amount: %s",value=>{
    expect(()=>calculateQuote({...blankQuote(),prodotti:[{...fixed(),valore_forfait:value}]})).toThrow("valore di vendita");
  });
  it("accepts an explicitly entered zero but requires a description within 60 characters",()=>{
    expect(calculateQuote({...blankQuote(),prodotti:[fixed(0)]}).totale_finale).toBe(0);
    expect(forfaitProductError({...fixed(),descrizione:" "})).toContain("descrizione");
    expect(forfaitProductError({...fixed(),descrizione:"A ".repeat(30)})).toBeNull();
    expect(forfaitProductError({...fixed(),descrizione:"A ".repeat(30)+" "})).toContain("60");
    expect(isForfait({...fixed(),a_forfait:"true"})).toBe(false);
  });
  it("allocates all common hours, engineering and treatments only among standard pieces",()=>{
    const result=calculateQuote({...blankQuote(),lavoro_ore_totali:20,progettazione_ore:2,costo_progettazione_ora:50,
      trattamenti_modalita:"globale",trattamenti_totale_euro:50,prodotti:[standard(10),fixed(200),standard(30)]});
    expect(result.quantita).toBe(40);expect(result.lavoro_ore_calcolate).toBe(20);
    expect(result.prodotti.map((p:any)=>p.lavoro_ore_totali??0)).toEqual([5,0,15]);
    expect(result.prodotti.map((p:any)=>p.progettazione_tot??0)).toEqual([25,0,75]);
    expect(result.prodotti.map((p:any)=>p.trattamenti_tot??0)).toEqual([12.5,0,37.5]);
    expect(result.totale_finale).toBe(40+480+100+50+200);
  });
  it("preserves inactive hours when switching labor allocation modes",()=>{
    const d={...blankQuote(),lavoro_ore_totali:20,prodotti:[standard(10),fixed(),standard(30)]};
    const perProduct=changeQuoteLaborMode(d,"per_prodotto");
    expect(perProduct.prodotti.map((p:any)=>p.lavoro_h)).toEqual([5,100,15]);
    expect(quoteLaborHours(perProduct)).toEqual([5,0,15]);
    const overall=changeQuoteLaborMode(perProduct,"complessivo");
    expect(overall.lavoro_ore_totali).toBe(20);
  });
  it("changes standard prices for a desired total while keeping forfait amounts fixed",()=>{
    const d={...blankQuote(),target_totale:300,prodotti:[standard(10),fixed(100)]};
    const result=calculateQuote(d);
    expect(result.prodotti.map((p:any)=>p.totale_finale)).toEqual([200,100]);
    expect(result.totale_finale).toBe(300);
    expect(()=>calculateQuote({...d,target_totale:99})).toThrow("forfait");
  });
  it("applies RAL once to standard products only, preserving the row association",()=>{
    const base={...blankQuote(),verniciatura_ral:{color:"3000",textured:false},prodotti:[standard(10),standard(20)]};
    const expected=calculateQuote(base);
    const result=calculateQuote({...base,prodotti:[fixed(10),standard(10),fixed(20),standard(20)]});
    expect(result.totale_finale).toBe(expected.totale_finale+30);
    expect(result.prodotti[1]).toEqual(expected.prodotti[0]);expect(result.prodotti[3]).toEqual(expected.prodotti[1]);
    expect(result.prodotti[0].totale_finale).toBe(10);expect(result.prodotti[2].totale_finale).toBe(20);
    expect(result.ral_riepilogo.fixed).toBe(expected.ral_riepilogo.fixed);
  });
  it("restores standard economics when a saved forfait is unchecked",()=>{
    const s={...standard(10),lavoro_h:2};
    const doc={...blankQuote(),lavoro_modalita:"per_prodotto",prodotti:[s]};
    const expected=calculateQuote(doc);
    const forfait=calculateQuote({...doc,prodotti:[{...s,a_forfait:true,valore_forfait:123}]});
    const reopened=JSON.parse(JSON.stringify(forfait));reopened.prodotti[0].a_forfait=false;
    expect(calculateQuote(reopened).totale_finale).toBe(expected.totale_finale);
  });
  it("prints only description, fixed amount and bold wording for the forfait position",()=>{
    const d=calculateQuote({...blankQuote(),prodotti:[fixed(),standard(10)]});
    const html=buildOneTimeQuotePrintHtml(d);
    const row=html.split("<tbody>")[1].split("</tr>")[0];
    expect(row).toContain("<strong>a forfait/da definire</strong>");expect(row).toContain("125,50");
    expect(row).toContain("Lavorazione da definire");expect(row).not.toMatch(/CODICE-INATTIVO|pz|Colore|1000/);
    expect(html).toContain("TFP0000010In");expect(html).toContain("NERO RAL 9005");
    const alone=buildOneTimeQuotePrintHtml(calculateQuote({...blankQuote(),prodotti:[fixed()]}));
    expect(alone).not.toContain("NERO RAL 9005");
    expect(buildOneTimeQuotePrintHtml(d,undefined,undefined,{hideDocumentTotal:true})).toContain("125,50");
  });
  it("copies and prepares the commercial handoff without code, unit price or quantity",()=>{
    const d=calculateQuote({...blankQuote(),prodotti:[fixed()]});
    const copy=formatQuoteForCopy(d);
    expect(copy).toContain("a forfait/da definire");expect(copy).toContain("125,50");
    expect(copy).not.toMatch(/CODICE-INATTIVO|Quantità:|Prezzo netto unitario:/);
    const sales=salesDocument("quote",JSON.stringify(d));
    expect(sales.rows[0]).toMatchObject({code:"",quantity:"",netPrice:"125,50",forfait:true});
    expect(salesText(sales)).toContain("a forfait/da definire");expect(salesText(sales)).not.toContain("Codice:");
  });
  it("asks only description and sale value in both wizard modes, keeping standard requirements on mixed quotes",()=>{
    for(const advanced of [false,true]){
      const d={...blankQuote(),prodotti:[fixed(null)]};
      const steps=buildQuoteWizardSteps(d,advanced);
      expect(steps.filter(s=>s.index===0).map(s=>s.field)).toEqual(["descrizione","valore_forfait"]);
      expect(steps.some(s=>["lavoro_ore_totali","progettazione_ore","target_totale"].includes(s.field??""))).toBe(false);
      expect(quoteWizardStepError(steps.find(s=>s.field==="valore_forfait")!,d)).toContain("valore di vendita");
      const mixed=buildQuoteWizardSteps({...d,prodotti:[fixed(),standard(1)]},advanced);
      expect(mixed.some(s=>s.index===1 && s.field==="oggetto_modifica")).toBe(true);
      expect(mixed.some(s=>s.index===0 && s.field==="margine")).toBe(false);
    }
  });
});

it("excludes retained forfait costs when explicitly converting a historical quote to shared costs",()=>{
  const d={prodotti:[{...standard(10),progettazione_h:2,costo_progettazione:50},
    {...fixed(),progettazione_h:100,costo_progettazione:99,trattamenti_cad:999,quantita:999}]};
  const upgraded=migrateQuoteToSharedCosts(d);
  expect(upgraded.progettazione_totale_euro).toBe(100);
  expect(upgraded.trattamenti_totale_euro).toBe(0);
  expect(upgraded.prodotti[1].progettazione_h).toBe(100);
  expect(calculateQuote(upgraded).prodotti[0].progettazione_tot).toBe(100);
});
