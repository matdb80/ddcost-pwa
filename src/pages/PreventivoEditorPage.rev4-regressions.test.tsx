// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { blankProduct, blankQuote, calculateQuote } from "../lib/quote-calculation";
const state=vi.hoisted(()=>({data:null as any,groups:[] as Array<{id:number;name:string}>,calls:[] as Array<{path:string;input:any}>,failDuplicate:false,duplicateGate:null as null|Promise<void>}));
vi.mock("@/components/Layout",()=>({default:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock("@/components/SalesHandoffPanel",()=>({default:({disabled}:{disabled:boolean})=><button disabled={disabled}>Invia al commerciale (test)</button>}));
vi.mock("@/components/FormulaTooltip",()=>({default:()=>null}));
vi.mock("@/providers/trpc",()=>{
  const utils={quote:{get:{invalidate:async()=>{}},list:{invalidate:async()=>{}},outcomeSummary:{invalidate:async()=>{}}},offer:{nextNumber:{invalidate:async()=>{}}},productGroup:{list:{invalidate:async()=>{}}}};
  const proxy=(path:string[]):any=>new Proxy({}, {get:(_,key)=>{
    if(key==="useUtils")return ()=>utils;
    if(key==="useQuery")return ()=>({data:path.join(".")==="quote.get"?state.data:path.join(".")==="productGroup.list"?state.groups:[],isLoading:false});
    if(key==="useMutation")return ()=>({isPending:false,mutateAsync:async(input:any)=>{
      state.calls.push({path:path.join("."),input:structuredClone(input)});
      if(path.join(".")==="temporaryProduct.duplicate"){
        if(state.duplicateGate)await state.duplicateGate;
        if(state.failDuplicate){state.failDuplicate=false;throw new Error("Connessione interrotta");}
        return {sequence:77,family:"BC",material:"6",color:null,code:"TBC000007760"};
      }
      if(path.join(".")==="productGroup.rename")return {id:input.id,oldName:input.expectedName,name:input.name,updatedQuotes:3};
      return {id:123,...(path.join(".")==="quote.update"?{dataJson:input.dataJson}:{})};
    }});
    return proxy([...path,String(key)]);
  }});
  return {trpc:proxy([])};
});
import Editor from "./PreventivoEditorPage";
function mount(doc:Record<string,any>,mobile=false,revision=1){
  state.data={id:123,rev:revision,editToken:"test-version",dataJson:JSON.stringify(doc),client:"Cliente prova",reference:"Test"};
  window.localStorage.setItem("ddcost.quote.mobile-view",mobile?"1":"0");
  const router=createMemoryRouter([{path:"/preventivi/:id",element:<Editor/>}],{initialEntries:["/preventivi/123"]});
  return render(<RouterProvider router={router}/>);
}
beforeEach(()=>{
  state.data=null;state.calls=[];state.groups=[];state.failDuplicate=false;state.duplicateGate=null;window.localStorage.clear();vi.stubGlobal("confirm",vi.fn(()=>true));
  vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));
  Element.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
import Series from '../components/QuoteSeriesFields';
import Objects from '../components/QuoteModificationObjectFields';
import {buildQuoteWizardSteps,quoteWizardStepError} from '../lib/quote-wizard-steps';
import {buildOneTimeQuotePrintHtml} from '../lib/quote-pdf';

it('mixed natural and painted products retain a header RAL swatch without product-row swatches',()=>{
 const doc=calculateQuote({...blankQuote(),cliente:'Test',verniciatura_ral:{color:'6021',textured:true},prodotti:
  ['TBC000000160','TBC0000002In'].map(codice=>({...blankProduct(),codice,descrizione:'Bandella',quantita:2,materiale_cad:10}))});
 const html=buildOneTimeQuotePrintHtml(doc);
 const meta=html.match(/<section class="meta">([\s\S]*?)<\/section>/)![1];
 expect(meta).toContain('class="ral-swatch"');
 expect(meta).toContain('aria-label="RAL 6021"');
 expect(meta.match(/class="ral-swatch"/g)).toHaveLength(1);
 expect(html.match(/<tbody>([\s\S]*?)<\/tbody>/)![1]).not.toContain('class="ral-swatch"');
});

const draft=()=>({...blankQuote(),cliente:'Cliente prova',stato_preventivo:'bozza',prodotti:[0,1].map(i=>({...blankProduct(),descrizione:'Prodotto '+(i+1),gruppo_merceologico:'Bandelle',materiale_prodotto:'ferro',oggetto_modifica:['occhio']}))});
const seriesDraft=(discount='50')=>({...blankQuote(),cliente:'Cliente prova',stato_preventivo:'bozza',prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'STD-1',descrizione:'Serie',quantita:2,prezzo_serie:100,sconto_serie:discount}]});
function addCustom(){
 fireEvent.change(screen.getAllByLabelText('Nuovo oggetto della modifica')[0],{target:{value:'Foratura'}});
 fireEvent.click(screen.getAllByRole('button',{name:'Aggiungi'})[0]);
}
function advanceTo(title:string){
 for(let i=0;i<45&&!screen.queryByRole('heading',{name:title});i++)fireEvent.click(screen.getByRole('button',{name:'Avanti'}));
 expect(screen.getByRole('heading',{name:title})).toBeTruthy();
}
async function saveDraft(){
 fireEvent.click(screen.getByRole('button',{name:'Salva bozza'}));
 await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.saveDraft')).toBe(true));
 return JSON.parse(state.calls.find(c=>c.path==='quote.saveDraft')!.input.dataJson);
}

it('valid free discount does not display a technical validation error',()=>{
 render(<Series product={seriesDraft('40+15+5%').prodotti[0]} disabled={false} onChange={vi.fn()}/>);
 expect(screen.queryAllByRole('alert')).toHaveLength(0);
});
it.each(['101','50+15+10+5'])('mobile optional discount rejects invalid supplied value %s',discount=>{
 const doc=seriesDraft(discount);const step=buildQuoteWizardSteps(doc).find(s=>s.field==='sconto_serie')!;
 expect(step.required).toBeFalsy();
 expect(quoteWizardStepError(step,doc)).not.toBeNull();
});
it('mobile discount stays optional when blank',()=>{
 const doc=seriesDraft('');const step=buildQuoteWizardSteps(doc).find(s=>s.field==='sconto_serie')!;
 expect(quoteWizardStepError(step,doc)).toBeNull();
});
it('changing gross price preserves the existing discount and saved net',async()=>{
 mount(seriesDraft());
 const price=await screen.findByLabelText('Prezzo unitario base €/pz *');
 expect((price as HTMLInputElement).value).toBe('100,00');
 expect((screen.getByLabelText('Sconto di serie') as HTMLInputElement).value).toBe('50');
 fireEvent.focus(price);fireEvent.change(price,{target:{value:'120'}});fireEvent.blur(price);
 const saved=await saveDraft();
 expect(saved.prodotti[0]).toMatchObject({prezzo_serie:120,sconto_serie:'50'});
 expect(calculateQuote(saved).totale_finale).toBe(120);
});
it('new custom option remains visible in both rows after last deselection in the same session',async()=>{
 mount(draft());await screen.findAllByLabelText('Nuovo oggetto della modifica');addCustom();
 expect(screen.getAllByRole('checkbox',{name:'Foratura'})).toHaveLength(2);
 fireEvent.click(screen.getAllByRole('checkbox',{name:'Foratura'})[0]);
 expect(screen.getAllByRole('checkbox',{name:'Foratura'})).toHaveLength(2);
 expect(screen.getAllByRole('checkbox',{name:'Foratura'}).every(e=>!(e as HTMLInputElement).checked)).toBe(true);
});
it('unselected catalog option survives saving and reopening the actual editor',async()=>{
 mount(draft());await screen.findAllByLabelText('Nuovo oggetto della modifica');addCustom();
 fireEvent.click(screen.getAllByRole('checkbox',{name:'Foratura'})[0]);
 expect(screen.getAllByRole('checkbox',{name:'Foratura'})).toHaveLength(2);
 // Ensure the document is dirty for a separate reason, to exercise serialization
 // independently of dirty tracking for catalog-only changes (covered separately).
 fireEvent.change(screen.getByLabelText('Cliente *'),{target:{value:'Cliente aggiornato'}});
 const saved=await saveDraft();cleanup();state.calls=[];mount(saved);
 await screen.findAllByLabelText('Nuovo oggetto della modifica');
 expect(screen.queryAllByRole('checkbox',{name:'Foratura'})).toHaveLength(2);
});
it('adding an unselected catalog option enables saving even without another document change',async()=>{
 mount(draft());await screen.findAllByLabelText('Nuovo oggetto della modifica');addCustom();
 fireEvent.click(screen.getAllByRole('checkbox',{name:'Foratura'})[0]);
 expect(screen.getAllByRole('checkbox',{name:'Foratura'})).toHaveLength(2);
 expect((screen.getByRole('button',{name:'Salva bozza'}) as HTMLButtonElement).disabled).toBe(false);
});
it.each([false,true])('rename propagates to both rows and saved selections; mobile=%s',async mobile=>{
 const doc=draft();doc.prodotti.forEach(p=>{p.oggetto_modifica=['Foratura'];});mount(doc,mobile);
 if(mobile){await screen.findByTestId('quote-mobile-wizard');advanceTo('Oggetto della modifica');}
 else await screen.findAllByRole('checkbox',{name:'Foratura'});
 fireEvent.click(screen.getAllByRole('button',{name:'Modifica nome Foratura'})[0]);
 const input=screen.getByRole('textbox',{name:'Modifica nome Foratura'});
 fireEvent.change(input,{target:{value:'Alesatura'}});fireEvent.keyDown(input,{key:'Enter'});
 expect(screen.getAllByRole('checkbox',{name:'Alesatura'}).length).toBe(mobile?1:2);
 if(mobile)advanceTo('Riepilogo finale');
 const saved=await saveDraft();expect(saved.prodotti.map((p:any)=>p.oggetto_modifica)).toEqual([['Alesatura'],['Alesatura']]);
});
it('checkbox is accessible by name and its label toggles selection',()=>{
 const onChange=vi.fn();render(<Objects value={[]} idPrefix='x' onChange={onChange}/>);
 expect(screen.getByRole('checkbox',{name:'Occhio'})).toBeTruthy();fireEvent.click(screen.getByText('Occhio'));
 expect(onChange).toHaveBeenCalledWith(['occhio']);
});
it('empty rename shows an error and Escape cancels without mutation',()=>{
 const rename=vi.fn();render(<Objects value={['Foratura']} customObjects={['Foratura']} idPrefix='x' onChange={vi.fn()} onRename={rename}/>);
 fireEvent.click(screen.getByRole('button',{name:'Modifica nome Foratura'}));
 const input=screen.getByRole('textbox',{name:'Modifica nome Foratura'});fireEvent.change(input,{target:{value:' '}});fireEvent.keyDown(input,{key:'Enter'});
 expect(screen.getByText('Il nome non può essere vuoto.')).toBeTruthy();expect(rename).not.toHaveBeenCalled();
 fireEvent.keyDown(input,{key:'Escape'});expect(screen.queryByRole('textbox',{name:'Modifica nome Foratura'})).toBeNull();expect(rename).not.toHaveBeenCalled();
});
