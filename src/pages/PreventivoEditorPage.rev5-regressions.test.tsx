// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { blankProduct, blankQuote } from "../lib/quote-calculation";
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
const draft=()=>({...blankQuote(),cliente:'Test',stato_preventivo:'bozza',prodotti:[{...blankProduct(),codice:'ABC',descrizione:'Bandella',gruppo_merceologico:'Bandelle',materiale_prodotto:'ferro',oggetto_modifica:['occhio'],materiale_cad:10,quantita:2,prezzo_manuale:54}]});
it('R5-E01: desktop activates, completes, reopens and retains gross',async()=>{
 mount(draft());fireEvent.click(await screen.findByRole('checkbox',{name:'Generare lordo da sconto cliente'}));fireEvent.change(screen.getByLabelText('Sconto cliente (es. 40+10%)'),{target:{value:'50'}});fireEvent.click(screen.getByRole('button',{name:'Completa preventivo'}));
 await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.finalizeDraft')).toBe(true));const saved=JSON.parse(state.calls.find(c=>c.path==='quote.finalizeDraft')!.input.dataJson);expect(saved.prodotti[0].genera_listino).toBe(true);expect(saved.prodotti[0].listino_lordo).toBe(108);
 cleanup();mount(saved);expect((await screen.findByRole('checkbox',{name:'Generare lordo da sconto cliente'}) as HTMLInputElement).checked).toBe(true);
});
it('R5-E02: invalid discount blocks completion',async()=>{
 mount(draft());fireEvent.click(await screen.findByRole('checkbox',{name:'Generare lordo da sconto cliente'}));fireEvent.change(screen.getByLabelText('Sconto cliente (es. 40+10%)'),{target:{value:'abc'}});fireEvent.click(screen.getByRole('button',{name:'Completa preventivo'}));await new Promise(r=>setTimeout(r,50));expect(state.calls.filter(c=>c.path==='quote.finalizeDraft')).toHaveLength(0);
});
it('R5-E03: reordering preserves the original historical reference',async()=>{
 const d=draft();d.prodotti.push({...d.prodotti[0],codice:'DEF',descrizione:'Secondo'});mount({...d,listino:{product_index_riferimento:0,prezzo_listino_generato:108,sconto_riferimento:'50'}});fireEvent.click(await screen.findByRole('button',{name:'Sposta giù prodotto 1'}));fireEvent.click(screen.getByRole('button',{name:'Salva bozza'}));await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.saveDraft')).toBe(true));const saved=JSON.parse(state.calls.find(c=>c.path==='quote.saveDraft')!.input.dataJson);expect(saved.prodotti.map((p:any)=>p.codice)).toEqual(['DEF','ABC']);expect(saved.listino.product_index_riferimento).toBe(1);
});
it('R5-E04: brass with RAL cannot be finalized',async()=>{
 const d=draft();d.prodotti[0].materiale_prodotto='ottone';mount({...d,verniciatura_ral:{color:'6021',textured:false}});fireEvent.click(await screen.findByRole('button',{name:'Completa preventivo'}));expect(state.calls.filter(c=>c.path==='quote.finalizeDraft')).toHaveLength(0);expect(screen.getByRole('alert').textContent).toMatch(/ottone/);
});
it('R5-E05: mobile advanced per-row listino can be entered and finalized',async()=>{
 mount(draft(),true);await screen.findByTestId('quote-mobile-wizard');fireEvent.click(screen.getByRole('checkbox',{name:'Opzioni avanzate'}));
 for(let i=0;i<60&&!screen.queryByRole('heading',{name:'Listino lordo del prodotto'});i++)fireEvent.click(screen.getByRole('button',{name:'Avanti'}));expect(screen.getByRole('heading',{name:'Listino lordo del prodotto'})).toBeTruthy();
 fireEvent.click(screen.getByRole('checkbox',{name:'Generare lordo da sconto cliente'}));fireEvent.change(screen.getByLabelText('Sconto cliente (es. 40+10%)'),{target:{value:'40+10%'}});expect(screen.getByText('€ 100,00')).toBeTruthy();
 for(let i=0;i<40&&!screen.queryByRole('heading',{name:'Riepilogo finale'});i++)fireEvent.click(screen.getByRole('button',{name:'Avanti'}));fireEvent.click(screen.getByRole('button',{name:'Completa preventivo'}));await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.finalizeDraft')).toBe(true));const saved=JSON.parse(state.calls.find(c=>c.path==='quote.finalizeDraft')!.input.dataJson);expect(saved.prodotti[0].listino_lordo).toBe(100);expect(saved.prodotti[0].prezzo_netto_unitario_finale).toBe(54);
});
it('R5-E06: deleting the historic reference never assigns gross to a different row',async()=>{
 const d=draft();d.prodotti.push({...d.prodotti[0],codice:'DEF',descrizione:'Secondo'});mount({...d,listino:{product_index_riferimento:0,prezzo_listino_generato:108,sconto_riferimento:'50'}});
 fireEvent.click((await screen.findAllByTitle('Rimuovi prodotto'))[0]);fireEvent.click(screen.getByRole('button',{name:'Salva bozza'}));await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.saveDraft')).toBe(true));const saved=JSON.parse(state.calls.find(c=>c.path==='quote.saveDraft')!.input.dataJson);expect(saved.prodotti[0].codice).toBe('DEF');expect(saved.listino).toBeUndefined();
});
