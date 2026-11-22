// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { blankProduct, blankQuote } from "../lib/quote-calculation";
import { temporaryCode } from "../lib/ral-pricing";
const state=vi.hoisted(()=>({data:null as any,groups:[] as Array<{id:number;name:string}>,calls:[] as Array<{path:string;input:any}>,failDuplicate:false,duplicateGate:null as null|Promise<void>}));
vi.mock("@/components/Layout",()=>({default:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock("@/components/SalesHandoffPanel",()=>({default:({disabled}:{disabled:boolean})=><button disabled={disabled}>Invia al commerciale (test)</button>}));
vi.mock("@/components/FormulaTooltip",()=>({default:()=>null}));
vi.mock("@/providers/trpc",()=>{
  const utils={quote:{get:{invalidate:async()=>{}},list:{invalidate:async()=>{}},outcomeSummary:{invalidate:async()=>{}}},offer:{nextNumber:{invalidate:async()=>{}}},productGroup:{list:{invalidate:async()=>{}}},quoteAttachment:{list:{fetch:async()=>[]},get:{fetch:async()=>({})}}};
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
      if(path.join(".")==="temporaryProduct.reserve")return {sequence:42,requestKey:input.requestKey};
      if(path.join(".")==="temporaryProduct.complete")return {sequence:42,family:input.family,material:input.material,color:input.color??null,code:temporaryCode(42,input.family,input.material,input.color??null,undefined,input.natural)};
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
function mountNew(mobile=false){
  window.localStorage.setItem("ddcost.quote.mobile-view",mobile?"1":"0");
  const router=createMemoryRouter([{path:"/preventivi/new",element:<Editor/>},{path:"/preventivi/:id",element:<Editor/>}],{initialEntries:["/preventivi/new"]});
  return render(<RouterProvider router={router}/>);
}
beforeEach(()=>{
  state.data=null;state.calls=[];state.groups=[];state.failDuplicate=false;state.duplicateGate=null;window.localStorage.clear();vi.stubGlobal("confirm",vi.fn(()=>true));
  vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));
  Element.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it("REVIEW-B01: a new quote with only default notes must not count as user edits",async()=>{
  mountNew();
  await screen.findByLabelText("Note cliente");
  const e=new Event("beforeunload",{cancelable:true});window.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(false);
});
it("REVIEW-B02: clearing the default note must count as a user edit",async()=>{
  mountNew();
  const field=await screen.findByLabelText("Note cliente");
  fireEvent.change(field,{target:{value:""}});
  const e=new Event("beforeunload",{cancelable:true});window.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
});
it("REVIEW-I03: sharing the real PDF must not claim an automatic email attachment",async()=>{
  mount({...blankQuote(),stato_preventivo:'completo',numero_preventivo:'DDC00042/2026',cliente:'Cliente prova',totale_finale:20,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}]});
  // jsdom non supporta la condivisione di file: si verifica il percorso mailto.
  const downloads:string[]=[];
  let mailtoClicks=0;
  const spy=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){
    if(this.download)downloads.push(this.download);else mailtoClicks++;
  });
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>'blob:mock-pdf')});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});
  try {
    fireEvent.click(await screen.findByRole('button',{name:'Prepara email (PDF da allegare)'}));
    // v16: il handler è asincrono — attende che il messaggio di conferma sia presente,
    // poi verifica il testo completo di tutti gli status (intenzione del test invariata)
    await screen.findByText(/Download del PDF richiesto/);
    const status=(await screen.findAllByRole('status')).map(el=>el.textContent).join(' ');
    expect(status).not.toMatch(/PDF esportato e email preparata/);
    expect(status).not.toMatch(/allegato automaticamente/);
    // messaggio verificabile: conferma il download e ricorda l'allegato manuale;
    // «l'email è pronta» non deve comparire
    expect(status).toContain("Download del PDF richiesto");
    expect(status).toContain("Allega manualmente il file nel programma di posta");
    expect(status).not.toContain("l'email è pronta");
    expect(downloads).toEqual(['2026_DDC00042_REV.1.pdf']);
    expect(mailtoClicks).toBe(1);
  } finally {spy.mockRestore();Reflect.deleteProperty(URL,'createObjectURL');Reflect.deleteProperty(URL,'revokeObjectURL');}
});
it("REVIEW-C01: a failed PDF download must prevent opening the mail client",async()=>{
  mount({...blankQuote(),stato_preventivo:'completo',numero_preventivo:'DDC00042/2026',totale_finale:20,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}]});
  const mailto=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:()=>{throw new Error('download bloccato');}});
  try {
    fireEvent.click(await screen.findByRole('button',{name:'Prepara email (PDF da allegare)'}));
    expect((await screen.findByRole('alert')).textContent).toContain('download bloccato');
    expect(mailto).not.toHaveBeenCalled();
  } finally {mailto.mockRestore();Reflect.deleteProperty(URL,'createObjectURL');}
});
it("REVIEW-C02: navigating from an existing quote to new must initialize the default note",async()=>{
  state.data={id:123,rev:1,editToken:'version',client:'Cliente storico',reference:'',dataJson:JSON.stringify({...blankQuote(),stato_preventivo:'completo',note_cliente:'Nota storica'})};
  const router=createMemoryRouter([{path:'/preventivi/new',element:<Editor/>},{path:'/preventivi/:id',element:<Editor/>}],{initialEntries:['/preventivi/123']});
  render(<RouterProvider router={router}/>);
  expect((await screen.findByLabelText('Note cliente') as HTMLTextAreaElement).value).toBe('Nota storica');
  await act(async()=>{await router.navigate('/preventivi/new');});
  const field = await screen.findByLabelText('Note cliente') as HTMLTextAreaElement;
  expect(field.value).toContain('Il preventivo contiene prodotti custom');
  expect(field.disabled).toBe(false);
  expect((screen.getByLabelText('Cliente *') as HTMLInputElement).value).toBe('');
  const clean = new Event('beforeunload', {cancelable:true});window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  fireEvent.change(field, {target:{value:'Nuova nota'}});
  const dirty = new Event('beforeunload', {cancelable:true});window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
});
