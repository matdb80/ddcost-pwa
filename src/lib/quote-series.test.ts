import {describe,it,expect} from "vitest";
import {blankQuote,blankProduct,calculateQuote,quoteLaborHours,changeQuoteLaborMode,migrateQuoteToSharedCosts} from "./quote-calculation";
import {isSeries,seriesProductError} from "./quote-series";
import {quoteModificationError} from "./quote-modification-validation";
import {quoteMaterialError} from "./quote-material-weight";
import {buildQuoteWizardSteps,quoteWizardStepError} from "./quote-wizard-steps";
import {buildOneTimeQuotePrintHtml} from "./quote-pdf";
import {formatQuoteForCopy} from "./quote-copy";
import {salesDocument} from "./commercial-handoff";
const series=()=>({...blankProduct(),prodotto_di_serie:true,codice:"ART-123",descrizione:"Articolo di serie",quantita:10,prezzo_serie:12.5,
  materiale_prodotto:"ferro",materiale_cad:1000,costo_materiale_noto:false,geometria_materiale:"",lavoro_h:200,trattamenti_cad:100,
  attrezzaggi_h:99,margine:1,ricarico_spese:100,prezzo_manuale:999,full_cost:99,nero_standard_goffrato:true,codice_temporaneo:{code:"unused",color:"3000"}});
const costed=(q:number)=>({...blankProduct(),descrizione:"Speciale",codice:"TFP0000010In",quantita:q,materiale_cad:1,margine:0,ricarico_spese:0});
describe("series products",()=>{
 it("uses only quantity times the explicit price, ignoring all retained row and common costs",()=>{
  const d={...blankQuote(),prodotti:[series()],lavoro_modalita:"invalid",lavoro_ore_totali:-10,progettazione_ore:-2,costo_progettazione_ora:NaN,
   trattamenti_modalita:"globale",trattamenti_totale_euro:-20,verniciatura_ral:null,target_totale:900};
  const r=calculateQuote(d);
  expect(r.totale_finale).toBe(125);expect(r.quantita).toBe(10);expect(r.lavoro_ore_calcolate).toBe(0);
  expect(r.prodotti[0].prezzo_netto_unitario_finale).toBe(12.5);expect(r.prodotti[0].full_cost).toBeUndefined();
  expect(r.ral_riepilogo).toBeUndefined();expect(r.quadratura_applicata).toBe(false);expect(r.full_cost_totale).toBeNull();
  expect(r.margine_netto_complessivo_perc).toBeNull();expect(r.ha_righe_serie).toBe(true);
  expect(quoteModificationError(r.prodotti)).toBeNull();expect(quoteMaterialError(r.prodotti)).toBeNull();
  expect(r.prodotti[0].materiale_cad).toBe(1000);expect(d.prodotti[0].full_cost).toBe(99);
 });
 it.each([null,undefined,""," ",-1,NaN,Infinity,"invalid",true])("requires an explicit valid price: %s",prezzo_serie=>{
  expect(()=>calculateQuote({...blankQuote(),prodotti:[{...series(),prezzo_serie}]})).toThrow("prezzo unitario");
 });
 it.each([null,undefined,"",0,-1,Infinity,true])("rejects invalid quantity: %s",quantita=>{
  expect(()=>calculateQuote({...blankQuote(),prodotti:[{...series(),quantita}]})).toThrow("quantità");
 });
 it("requires code and description, accepts explicit zero, rejects contradictory modes",()=>{
  expect(seriesProductError({...series(),codice:" "})).toContain("codice articolo");
  expect(seriesProductError({...series(),descrizione:" "})).toContain("descrizione");
  expect(seriesProductError({...series(),descrizione:"A".repeat(61)})).toContain("60");
  expect(seriesProductError({...series(),a_forfait:true})).toContain("alternativi");
  expect(calculateQuote({...blankQuote(),prodotti:[{...series(),prezzo_serie:0}]}).totale_finale).toBe(0);
  expect(isSeries({...series(),prodotto_di_serie:"true"})).toBe(false);
 });
 it("allocates costs only to costed rows and applies RAL also to series",()=>{
  const base={...blankQuote(),lavoro_ore_totali:20,progettazione_ore:2,costo_progettazione_ora:50,trattamenti_modalita:"globale",trattamenti_totale_euro:50,
   verniciatura_ral:null,prodotti:[costed(10),costed(30)]};
  const d={...base,verniciatura_ral:{color:"3000",textured:false}};
  const expected=calculateQuote(d);
  const r=calculateQuote({...d,prodotti:[series(),costed(10),{...blankProduct(),a_forfait:true,descrizione:"Forfait",valore_forfait:75},costed(30)]});
  expect(r.totale_finale).toBe(expected.totale_finale+262.5);expect(r.quantita).toBe(50);
  expect(r.prodotti[1]).toEqual(expected.prodotti[0]);expect(r.prodotti[3]).toEqual(expected.prodotti[1]);
  expect(r.prodotti[0].totale_finale).toBe(187.5);expect(r.costi_comuni_riepilogo.quantita_totale).toBe(40);
  const switched=changeQuoteLaborMode(r,"per_prodotto");expect(quoteLaborHours(switched)).toEqual([0,5,0,15]);
 });
 it("holds series prices fixed in rebalance and restores saved costing when unchecked",()=>{
  const r=calculateQuote({...blankQuote(),prodotti:[series(),costed(10)],target_totale:200});
  expect(r.prodotti.map((p:any)=>p.totale_finale)).toEqual([125,75]);
  expect(()=>calculateQuote({...blankQuote(),prodotti:[series(),costed(10)],target_totale:100})).toThrow("di serie");
  const p=costed(10);const expected=calculateQuote({...blankQuote(),prodotti:[p]});
  const saved=calculateQuote({...blankQuote(),prodotti:[{...p,prodotto_di_serie:true,prezzo_serie:12.5}]});
  const opened=JSON.parse(JSON.stringify(saved));opened.prodotti[0].prodotto_di_serie=false;
  expect(calculateQuote(opened).totale_finale).toBe(expected.totale_finale);
 });
 it("asks exactly four required fields in either wizard mode",()=>{
  for(const advanced of [false,true]){
   const d={...blankQuote(),prodotti:[series()]},steps=buildQuoteWizardSteps(d,advanced);
   expect(steps.filter(s=>s.index===0).map(s=>s.field)).toEqual(["descrizione","codice","quantita","prezzo_serie"]);
   expect(steps.filter(s=>s.index===0).every(s=>s.required)).toBe(true);
   expect(steps.some(s=>["lavoro_ore_totali","progettazione_ore","target_totale"].includes(s.field??""))).toBe(false);
   expect(quoteWizardStepError(steps.find(s=>s.field==="prezzo_serie")!,{...d,prodotti:[{...series(),prezzo_serie:null}]})).toContain("prezzo unitario");
  }
 });
 it("prints and copies the four sale fields without retained material, finish or listino",()=>{
  const r=calculateQuote({...blankQuote(),prodotti:[series()],listino:{product_index_riferimento:0,prezzo_listino_generato:999,sconto_riferimento:"40%"}});
  const html=buildOneTimeQuotePrintHtml(r),row=html.split("<tbody>")[1].split("</tr>")[0];
  for(const text of ["ART-123","Articolo di serie","10 pz","12,50","125,00"])expect(row).toContain(text);
  expect(row).not.toMatch(/Colore|FERRO|GOFFRATO|forfait|1000/);
  const copy=formatQuoteForCopy(r);expect(copy).toContain("12,50");expect(copy).not.toMatch(/FERRO|Prezzo listino|Sconto cliente/);
  expect(salesDocument("quote",JSON.stringify(r)).rows[0]).toEqual({code:"ART-123",description:"Articolo di serie",quantity:"10",netPrice:"12,50",listPrice:"",discount:""});
 });
 it("excludes inactive series amounts from historic shared cost migration",()=>{
  const r=migrateQuoteToSharedCosts({prodotti:[{...costed(10),progettazione_h:2,costo_progettazione:50},{...series(),progettazione_h:99,costo_progettazione:50}]});
  expect(r.progettazione_totale_euro).toBe(100);expect(r.trattamenti_totale_euro).toBe(0);
 });
});
