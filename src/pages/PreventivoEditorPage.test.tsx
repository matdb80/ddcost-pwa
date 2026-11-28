// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { blankProduct, blankQuote, calculateQuote } from "../lib/quote-calculation";
import { temporaryCode } from "../lib/ral-pricing";
const state=vi.hoisted(()=>({data:null as any,groups:[] as Array<{id:number;name:string}>,calls:[] as Array<{path:string;input:any}>,failDuplicate:false,duplicateGate:null as null|Promise<void>,attachments:null as null|Array<{id:number;fileName:string;mimeType:string;dataBase64:string;fail?:boolean;includeInPdf?:boolean|null}>,attachmentGets:[] as number[],stubAttachments:false,attachmentFiles:null as null|string[],attachmentWarnings:null as null|string[]}));
vi.mock("@/components/Layout",()=>({default:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock("@/components/SalesHandoffPanel",()=>({default:({disabled}:{disabled:boolean})=><button disabled={disabled}>Invia al commerciale (test)</button>}));
vi.mock("@/components/FormulaTooltip",()=>({default:()=>null}));
vi.mock("@/providers/trpc",()=>{
  const utils={quote:{get:{invalidate:async()=>{}},list:{invalidate:async()=>{}},outcomeSummary:{invalidate:async()=>{}}},offer:{nextNumber:{invalidate:async()=>{}}},productGroup:{list:{invalidate:async()=>{}}},quoteAttachment:{list:{fetch:async()=>[...(state.attachments??[])].reverse()},get:{fetch:async(input:{id:number})=>{state.attachmentGets.push(input.id);const f=(state.attachments??[]).find(a=>a.id===input.id);if(!f||f.fail)throw new Error("Verifica integrità dell’allegato fallita");return {id:f.id,fileName:f.fileName,mimeType:f.mimeType,dataBase64:f.dataBase64,sizeBytes:1,sha256:"test"};}}}};
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
// v18: in jsdom non esiste canvas — la rasterizzazione reale è coperta dai test
// di quote-attachment-pages; con stubAttachments la pagina consegna al
// rasterizzatore file fittizi e si ricevono pagine JPEG minime ma valide.
vi.mock("@/lib/quote-attachment-pages",async importOriginal=>{
  const mod=await importOriginal<typeof import("@/lib/quote-attachment-pages")>();
  return {...mod,buildQuoteAttachmentPages:async (files:Array<{fileName:string}>,opts:unknown)=>{
    if(!state.stubAttachments)return mod.buildQuoteAttachmentPages(files as never,opts as never);
    state.attachmentFiles=files.map(f=>f.fileName);
    return {pages:files.map(f=>({caption:`Allegato: ${f.fileName}`,imageBytes:Uint8Array.from([0xff,0xd8,0xff,0xe0,1,2,3,0xff,0xd9]),imageWidth:800,imageHeight:600})),warnings:state.attachmentWarnings??[]};
  }};
});
import Editor from "./PreventivoEditorPage";
function mount(doc:Record<string,any>,mobile=false,revision=1){
  state.data={id:123,rev:revision,editToken:"test-version",dataJson:JSON.stringify(doc),client:"Cliente prova",reference:"Test"};
  window.localStorage.setItem("ddcost.quote.mobile-view",mobile?"1":"0");
  const router=createMemoryRouter([{path:"/preventivi/:id",element:<Editor/>}],{initialEntries:["/preventivi/123"]});
  return render(<RouterProvider router={router}/>);
}
function mountNew(mobile=false, url="/preventivi/new"){
  window.localStorage.setItem("ddcost.quote.mobile-view",mobile?"1":"0");
  const router=createMemoryRouter([{path:"/preventivi/new",element:<Editor/>},{path:"/preventivi/:id",element:<Editor/>}],{initialEntries:[url]});
  return render(<RouterProvider router={router}/>);
}
beforeEach(()=>{
  state.data=null;state.calls=[];state.groups=[];state.failDuplicate=false;state.duplicateGate=null;state.attachments=null;state.attachmentGets=[];state.stubAttachments=false;state.attachmentFiles=null;state.attachmentWarnings=null;window.localStorage.clear();vi.stubGlobal("confirm",vi.fn(()=>true));
  vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));
  Element.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
// v13: «Esporta PDF cliente» scarica il file del generatore interno (stesso
// documento allegato da «Prepara email»). Il helper cattura il File passato a
// URL.createObjectURL e ne decodifica i byte in latin1 (stringhe WinAnsi).
function mockPdfDownload(){
  const files:File[]=[];
  const anchorClick=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
  const createObjectURL=vi.fn((blob:Blob)=>{files.push(blob as File);return "blob:mock-pdf";});
  Object.defineProperty(URL,"createObjectURL",{configurable:true,value:createObjectURL});
  Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:vi.fn()});
  const textOf=async(i:number)=>{
    const bytes=new Uint8Array(await files[i].arrayBuffer());
    let s="";for(const b of bytes)s+=String.fromCharCode(b);
    // stringhe PDF: normalizza gli escape WinAnsi prima dei confronti
    return s.replace(/\\([()\\])/g,"$1");
  };
  return {files,textOf,restore(){anchorClick.mockRestore();Reflect.deleteProperty(URL,"createObjectURL");Reflect.deleteProperty(URL,"revokeObjectURL");}};
}
// Primo test del file: in ambienti lenti (CI/sandbox) assorbe l'avvio di
// jsdom+React e supera il timeout di default di 5 s — timeout esplicito.
it("protects a generated brass prefix when editing and saving its custom finish",{timeout:20000},async()=>{
  const generated={sequence:42,family:"FP",material:"B",color:null,code:"TFP0000042BA"};
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),materiale_prodotto:"ottone",codice:generated.code,codice_temporaneo:generated}]});
  const input=await screen.findByLabelText("Codice articolo") as HTMLInputElement;
  fireEvent.change(input,{target:{value:""}});expect(input.value).toBe(generated.code);
  // la finitura digitata minuscola è convertita subito in maiuscolo (regola v8)
  fireEvent.change(input,{target:{value:"TFP0000042Bz"}});
  expect(input.value).toBe("TFP0000042BZ");
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti[0].codice).toBe("TFP0000042BZ");expect(saved.prodotti[0].codice_temporaneo).toEqual(generated);
});
it("saves the standard black finish separately for each product without changing prices",async()=>{
  const doc=calculateQuote({...blankQuote(),stato_preventivo:"bozza",prodotti:[0,1].map(()=>({...blankProduct(),materiale_cad:10}))});
  mount(doc);
  const checkboxes=await screen.findAllByRole("checkbox",{name:"Goffrato"});
  fireEvent.click(checkboxes[1]);
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti.map((p:any)=>p.nero_standard_goffrato)).toEqual([false,true]);
  expect(saved.totale_finale).toBe(doc.totale_finale);
  expect(saved.verniciatura_ral).toBeFalsy();
});
it("shows each row's live minute equivalent but still saves its hourly rate",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),costo_lavoro:24},{...blankProduct(),costo_lavoro:30}]});
  const fields=await screen.findAllByRole("textbox",{name:"Costo €/h"});
  expect(screen.getByText("(0,4000 €/min)")).toBeTruthy();
  expect(screen.getByText("(0,5000 €/min)")).toBeTruthy();
  fireEvent.focus(fields[0]);fireEvent.change(fields[0],{target:{value:"21,28"}});
  expect(screen.getByText("(0,3547 €/min)")).toBeTruthy();
  fireEvent.blur(fields[0]);fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti.map((p:any)=>p.costo_lavoro)).toEqual([21.28,30]);
});
it("updates the minute equivalent in the actual mobile labor step",async()=>{
  mount({...blankQuote(),cliente:"Prova",stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Prova",gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro",oggetto_modifica:["occhio"]}]},true);
  fireEvent.click(await screen.findByRole("checkbox",{name:"Opzioni avanzate"}));
  for(let i=0;i<30&&!screen.queryByRole("textbox",{name:"Costo €/h"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  const input=screen.getByRole("textbox",{name:"Costo €/h"});
  fireEvent.focus(input);fireEvent.change(input,{target:{value:"30"}});
  expect(screen.getByText("(0,5000 €/min)")).toBeTruthy();
});
it("asks for geometry after unchecking known material cost and preserves inactive inputs",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),materiale_prodotto:"ferro",materiale_cad:2.11}]});
  const known=await screen.findByRole("checkbox",{name:"Conosco il costo del materiale"});
  fireEvent.click(known);
  expect(screen.getByText(/Seleziona la geometria e inserisci le dimensioni/)).toBeTruthy();
  expect((screen.getByLabelText("Geometria del materiale") as HTMLSelectElement).value).toBe("");
  expect(screen.queryByLabelText("Lunghezza (mm)")).toBeNull();
  fireEvent.change(screen.getByLabelText("Geometria del materiale"),{target:{value:"tubo"}});
  expect(screen.queryByLabelText("Larghezza (mm)")).toBeNull();
  for(const [label,value] of [["Lunghezza (mm)","100"],["Diametro esterno (mm)","10"],["Diametro interno (mm)","6"],["Costo materiale (€/kg)","4"]])
    fireEvent.change(screen.getByLabelText(label),{target:{value}});
  await waitFor(()=>expect((screen.getByLabelText("Materiale calcolato €/pz") as HTMLInputElement).value).toBe("0,1578"));
  fireEvent.click(known);
  expect((screen.getByLabelText("Materiale €/pz") as HTMLInputElement).value).toBe("2,11");
  fireEvent.click(known);
  expect((screen.getByLabelText("Diametro interno (mm)") as HTMLInputElement).value).toBe("6");
  fireEvent.change(screen.getByLabelText("Geometria del materiale"),{target:{value:"tondino"}});
  expect(screen.queryByLabelText("Diametro interno (mm)")).toBeNull();
  expect((screen.getByLabelText("Materiale calcolato €/pz") as HTMLInputElement).value).toBe("0,2466");
});
it("recalculates a reopened weighted quote when only its material changes",async()=>{
  const saved=calculateQuote({...blankQuote(),prodotti:[{...blankProduct(),materiale_prodotto:"ferro",costo_materiale_noto:false,
    geometria_materiale:"piatto",lunghezza_mm:100,larghezza_mm:50,spessore_mm:2,costo_materiale_kg:4,quantita:10}]});
  mount(saved);
  await waitFor(()=>expect(screen.getByLabelText("Totale preventivo").textContent).toContain("6,87"));
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));
  fireEvent.change(screen.getByLabelText("Materiale *"),{target:{value:"alluminio"}});
  await waitFor(()=>expect(screen.getByLabelText("Totale preventivo").textContent).toContain("2,36"));
});
it("uses the geometry selection and tube dimensions in the mobile wizard",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Tubo",gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro",oggetto_modifica:["occhio"]}]},true);
  await screen.findByTestId("quote-mobile-wizard");
  for(let i=0;i<15 && !screen.queryByRole("checkbox",{name:"Conosco il costo del materiale"});i++)
    fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"Conosco il costo del materiale"}));
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Geometria del materiale"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("alert").textContent).toContain("Seleziona la geometria");
  fireEvent.change(screen.getByRole("combobox"),{target:{value:"tubo"}});
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  for(const [title,value] of [["Lunghezza (mm)","100"],["Diametro esterno (mm)","10"],["Diametro interno (mm)","6"]]){
    expect(screen.getByRole("heading",{name:title})).toBeTruthy();
    fireEvent.change(document.getElementById("wizard-input")!,{target:{value}});
    fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  }
  expect(screen.getByRole("heading",{name:"Costo materiale al kg"})).toBeTruthy();
});
it("preserves a long historical description and PDF but blocks saving until it is shortened",async()=>{
  const long="A ".repeat(30)+"B";
  mount({...blankQuote(),cliente:"Cliente prova",totale_finale:100,prodotti:[{...blankProduct(),descrizione:long,gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro",oggetto_modifica:["occhio"]}]});
  const description=await screen.findByLabelText("Descrizione *") as HTMLInputElement;
  await waitFor(()=>expect(description.value).toBe(long));
  expect(description.maxLength).toBe(60);
  expect((screen.getByRole("button",{name:"Esporta PDF cliente"}) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));
  fireEvent.change(screen.getByLabelText("Cliente *"),{target:{value:"Cliente modificato"}});
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("60 caratteri, spazi inclusi");
  expect(state.calls).toHaveLength(0);
  fireEvent.change(description,{target:{value:"A ".repeat(30)}});
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  expect(JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson).prodotti[0].descrizione).toBe("A ".repeat(30));
});
it("limits the mobile description and blocks advancing an overlength saved value",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"A".repeat(61)}]},true);
  await screen.findByTestId("quote-mobile-wizard");
  // v20: +1 Avanti per il nuovo passo «Consegna stimata (settimane)» in Intestazione.
  for(let i=0;i<4;i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  const input=document.getElementById("wizard-input") as HTMLInputElement;
  expect(input.maxLength).toBe(60);
  expect(input.value).toHaveLength(61);
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("alert").textContent).toBe("Massimo 60 caratteri, spazi inclusi.");
  fireEvent.change(input,{target:{value:"A ".repeat(30)}});
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Oggetto della modifica"})).toBeTruthy();
});
it("blocks completion until each product has a modification selection",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[0,1].map(i=>({...blankProduct(),
    descrizione:"Prodotto "+(i+1),gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro",oggetto_modifica:i===0?["occhio"]:[]}))});
  await screen.findByRole("button",{name:"Completa preventivo"});
  fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
  expect(screen.getByText(/Prodotto 2: Seleziona almeno una voce/)).toBeTruthy();
  expect(state.calls).toHaveLength(0);
  const second=screen.getAllByRole("group",{name:"Oggetto della modifica *"})[1];
  fireEvent.click(within(second).getByRole("checkbox",{name:"Occhio"}));
  fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.finalizeDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.finalizeDraft")!.input.dataJson);
  expect(saved.prodotti.map((p:Record<string,unknown>)=>p.oggetto_modifica)).toEqual([["occhio"],["occhio"]]);
});
it("blocks the mobile wizard at the modification step until a choice is made",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Bandella"}]},true);
  await screen.findByTestId("quote-mobile-wizard");
  // Client, delivery weeks (v20), labor mode, common hours, description, then modification selection.
  for(let i=0;i<5;i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Oggetto della modifica"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByText("Seleziona almeno una voce in Oggetto della modifica.")).toBeTruthy();
  expect(screen.getByRole("heading",{name:"Oggetto della modifica"})).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox",{name:"Occhio"}));
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Gruppo merceologico"})).toBeTruthy();
});
it("keeps the original PDF available on an unchanged historical quote without modification metadata",async()=>{
  mount({...blankQuote(),totale_finale:100,prodotti:[{...blankProduct(),descrizione:"Bandella",gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro"}]});
  await waitFor(()=>expect(screen.getByLabelText("Totale preventivo").textContent).toContain("100,00"));
  expect((screen.getByRole("button",{name:"Esporta PDF cliente"}) as HTMLButtonElement).disabled).toBe(false);
});
it("shows the saved historical total prominently above the target without recalculating it",async()=>{
  mount({...blankQuote(),totale_finale:1234.56,totale:1234.56});
  const total=await screen.findByLabelText("Totale preventivo");
  await waitFor(()=>expect(total.textContent).toContain("1.234,56"));
  expect(total.className).toContain("text-red-600");
  expect(total.className).toContain("text-3xl");
  const target=screen.getByLabelText("Totale desiderato € (quadratura, facoltativo)");
  expect(total.compareDocumentPosition(target)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("heading",{name:"Attribuzione dei costi comuni"})).toBeTruthy();
});
it("recalculates a saved draft, redistributes the common hours and persists the mode",async()=>{
  const doc={...blankQuote(),stato_preventivo:"bozza",lavoro_ore_totali:100,
    prodotti:[50,25,30].map(quantita=>({...blankProduct(),quantita}))};
  mount(doc);
  await waitFor(()=>expect(screen.getByLabelText("Ore lavoro attribuite al prodotto 1").textContent).toBe("47,619"));
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("5.250,00");
  fireEvent.change(screen.getByLabelText("Ore totali di lavorazione dell'offerta"),{target:{value:"105"}});
  await waitFor(()=>expect(screen.getByLabelText("Ore lavoro attribuite al prodotto 1").textContent).toBe("50"));
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.lavoro_modalita).toBe("complessivo");
  expect(saved.lavoro_ore_totali).toBe(105);
  expect(calculateQuote(saved).prodotti.map((p:Record<string,number>)=>p.lavoro_ore_totali)).toEqual([50,25,30]);
});
it("keeps legacy quotes unchanged until the labor allocation is explicitly selected",async()=>{
  mount({...blankQuote(),lavoro_modalita:undefined,totale_finale:987.65,
    prodotti:[{...blankProduct(),quantita:10,lavoro_h:20},{...blankProduct(),quantita:30,lavoro_h:30}]});
  await waitFor(()=>expect(screen.getByLabelText("Totale preventivo").textContent).toContain("987,65"));
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));
  fireEvent.change(screen.getByLabelText("Imputazione ore di lavorazione"),{target:{value:"complessivo"}});
  await waitFor(()=>expect((screen.getByLabelText("Ore totali di lavorazione dell'offerta") as HTMLInputElement).value).toBe("50"));
  expect(screen.getByLabelText("Ore lavoro attribuite al prodotto 1").textContent).toBe("12,5");
  fireEvent.change(screen.getByLabelText("Imputazione ore di lavorazione"),{target:{value:"per_prodotto"}});
  expect(screen.getAllByText("Ore lavoro prodotto")).toHaveLength(2);
});
it("does not present a missing draft calculation as a zero total",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),quantita:""}]});
  await waitFor(()=>expect(screen.getByLabelText("Totale preventivo").textContent).toBe("Da calcolare"));
});
it("keeps precise allocated per-product hours when a field is focused without editing",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",lavoro_ore_totali:100,
    prodotti:[50,25,30].map(quantita=>({...blankProduct(),quantita}))});
  await waitFor(()=>expect(screen.getByLabelText("Ore lavoro attribuite al prodotto 1").textContent).toBe("47,619"));
  fireEvent.change(screen.getByLabelText("Imputazione ore di lavorazione"),{target:{value:"per_prodotto"}});
  const hours=screen.getAllByLabelText("Ore lavoro prodotto")[0] as HTMLInputElement;
  expect(hours.value).toBe("47,619048");
  fireEvent.focus(hours);fireEvent.blur(hours);
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(calculateQuote(saved).lavoro_ore_calcolate).toBeCloseTo(100,10);
});
it("lets the user enter 16 and four row hours for quote A and persists that meaning",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[10,20].map(quantita=>({...blankProduct(),quantita,materiale_cad:1,trattamenti_cad:1}))});
  await screen.findByLabelText("Imputazione ore di lavorazione");
  fireEvent.change(screen.getByLabelText("Imputazione ore di lavorazione"),{target:{value:"per_prodotto"}});
  expect(screen.queryByRole("option",{name:/singolo pezzo/})).toBeNull();
  expect(screen.queryByLabelText("Ore totali di lavorazione dell'offerta")).toBeNull();
  const hours=screen.getAllByLabelText("Ore lavoro prodotto");
  fireEvent.change(hours[0],{target:{value:"16"}});
  fireEvent.change(hours[1],{target:{value:"4"}});
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("1.181,25");
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.lavoro_modalita).toBe("per_prodotto");
  expect(saved.prodotti.map((p:Record<string,number>)=>p.lavoro_h)).toEqual([16,4]);
  expect(calculateQuote(saved).totale_finale).toBeCloseTo(1181.25,10);
});
it("preserves a quote saved in the old per-piece mode until explicit conversion",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",lavoro_modalita:"per_pezzo",
    prodotti:[{...blankProduct(),quantita:10,lavoro_h:16,materiale_cad:1,trattamenti_cad:1}]});
  await waitFor(()=>expect(screen.getByLabelText("Totale preventivo").textContent).toContain("8.443,75"));
  expect((screen.getByLabelText("Ore lavoro / pezzo") as HTMLInputElement).value).toBe("16");
  fireEvent.change(screen.getByLabelText("Imputazione ore di lavorazione"),{target:{value:"per_prodotto"}});
  expect((screen.getByLabelText("Ore lavoro prodotto") as HTMLInputElement).value).toBe("160");
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("8.443,75");
  fireEvent.change(screen.getByLabelText("Ore lavoro prodotto"),{target:{value:"16"}});
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("883,75");
});
it("offers per-product row hours in the actual mobile mode selector",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",lavoro_ore_totali:16,
    prodotti:[8,12].map(quantita=>({...blankProduct(),quantita,materiale_cad:1,trattamenti_cad:1}))},true);
  await waitFor(()=>expect(screen.getByLabelText("Totale preventivo").textContent).toContain("927,50"));
  // v20: dopo il cliente c'è il passo «Consegna stimata (settimane)».
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  const selector=screen.getByRole("combobox");
  expect(screen.getByRole("option",{name:"Ore di lavoro imputate per ciascun prodotto"})).toBeTruthy();
  expect(screen.queryByRole("option",{name:/singolo pezzo/})).toBeNull();
  fireEvent.change(selector,{target:{value:"per_prodotto"}});
  expect((selector as HTMLSelectElement).value).toBe("per_prodotto");
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("927,50");
});
it("shows the reopened saved total also in the actual mobile wizard",async()=>{
  mount({...blankQuote(),totale_finale:321.45},true);
  await waitFor(()=>expect(screen.getByLabelText("Totale preventivo").textContent).toContain("321,45"));
  expect(screen.getByTestId("quote-mobile-wizard")).toBeTruthy();
});
it("keeps the original mobile PDF available for an unchanged long historical description",async()=>{
  mount({...blankQuote(),totale_finale:100,prodotti:[{...blankProduct(),descrizione:"A".repeat(61),gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro"}]},true);
  await waitFor(()=>expect(screen.getByLabelText("Totale preventivo").textContent).toContain("100,00"));
  for(let i=0;i<40 && !screen.queryByRole("button",{name:"Esporta PDF cliente"});i++)
    fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect((screen.getByRole("button",{name:"Esporta PDF cliente"}) as HTMLButtonElement).disabled).toBe(false);
  expect(state.calls).toHaveLength(0);
});

it("completes and reopens a forfait with description and fixed sale value only",async()=>{
  const initial={...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),quantita:"",materiale_cad:12.34,lavoro_h:16}]};
  mount(initial);
  fireEvent.click(await screen.findByRole("checkbox",{name:"Preventiva a forfait"}));
  expect(screen.queryByLabelText("Codice articolo")).toBeNull();
  expect(screen.queryByLabelText("Materiale *")).toBeNull();
  expect(screen.queryByRole("group",{name:"Oggetto della modifica *"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
  expect(screen.getByRole("alert").textContent).toContain("descrizione");
  fireEvent.change(screen.getByLabelText("Descrizione *"),{target:{value:"Lavorazione speciale"}});
  fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
  expect(screen.getByRole("alert").textContent).toContain("valore di vendita");
  const amount=screen.getByLabelText("Valore di vendita a forfait € *");
  fireEvent.focus(amount);fireEvent.change(amount,{target:{value:"125,50"}});fireEvent.blur(amount);
  fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.finalizeDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.finalizeDraft")!.input.dataJson);
  expect(saved.prodotti[0]).toMatchObject({a_forfait:true,valore_forfait:125.5,materiale_cad:12.34,lavoro_h:16,quantita:""});
  expect(saved.totale_finale).toBe(125.5);
  cleanup();mount(saved);
  const toggle=await screen.findByRole("checkbox",{name:"Preventiva a forfait"}) as HTMLInputElement;
  expect(toggle.checked).toBe(true);expect(toggle.disabled).toBe(true);
  expect((screen.getByLabelText("Valore di vendita a forfait € *") as HTMLInputElement).value).toBe("125,50");
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));fireEvent.click(toggle);
  expect((screen.getByLabelText("Materiale €/pz") as HTMLInputElement).value).toBe("12,34");
  expect(screen.queryByLabelText("Valore di vendita a forfait € *")).toBeNull();
});
it("keeps standard fields on mixed quotes while showing only the forfait amount on its row",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),a_forfait:true,descrizione:"Forfait",valore_forfait:200},blankProduct()]});
  const toggles=await screen.findAllByRole("checkbox",{name:"Preventiva a forfait"}) as HTMLInputElement[];
  expect(toggles.map(c=>c.checked)).toEqual([true,false]);
  expect(screen.getAllByLabelText("Materiale *")).toHaveLength(1);
  expect(screen.getAllByRole("group",{name:"Oggetto della modifica *"})).toHaveLength(1);
  fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
  expect(screen.getByRole("alert").textContent).toContain("prodotto 2");
  expect(state.calls).toHaveLength(0);
});
it("switches the mobile product header to forfait, validates its amount and reaches summary directly",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Lavorazione speciale"}]},true);
  await screen.findByTestId("quote-mobile-wizard");
  // v20: +1 Avanti per il nuovo passo «Consegna stimata (settimane)» in Intestazione.
  for(let i=0;i<4;i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"Preventiva a forfait"}));
  expect(screen.getByRole("heading",{name:"Che prodotto vuoi preventivare?"})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Genera codice temporaneo"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Valore di vendita a forfait (€)"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("alert").textContent).toContain("valore di vendita");
  const amount=document.getElementById("wizard-input")!;fireEvent.change(amount,{target:{value:"250"}});fireEvent.blur(amount);
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Riepilogo finale"})).toBeTruthy();
  expect(screen.getByText("a forfait/da definire")).toBeTruthy();
  expect(screen.getByText(/Margine complessivo non disponibile/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.finalizeDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.finalizeDraft")!.input.dataJson);
  expect(saved.totale_finale).toBe(250);
});

it("reopens an old inox code with P, preserves its recorded prices and saves the original issuance metadata",async()=>{
  const issued={sequence:5,family:"BC",material:"6",color:null,code:"TBC00000056"};
  const doc={...blankQuote(),cliente:"Cliente",totale_finale:3113.44,prodotti:[{...blankProduct(),descrizione:"Angolare",
    materiale_prodotto:"inox",gruppo_merceologico:"Bandelle",oggetto_modifica:["occhio"],codice:issued.code,codice_temporaneo:issued,
    prezzo_netto_unitario_finale:61.8464,totale_finale:1546.16}]};
  mount(doc);
  const code=await screen.findByLabelText("Codice articolo") as HTMLInputElement;
  expect(code.value).toBe("TBC00000056P");
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("3.113,44");
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"Goffrato (tutti i prodotti)"}));
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("3.113,44");
  fireEvent.click(screen.getByRole("button",{name:"Salva e sovrascrivi versione attuale"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.update")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.update")!.input.dataJson);
  expect(saved.prodotti[0].codice).toBe("TBC00000056P");expect(saved.prodotti[0].codice_temporaneo).toEqual(issued);
  expect(saved.prodotti[0].nero_standard_goffrato).toBe(true);expect(saved.totale_finale).toBe(3113.44);
});
it("offers the no-surcharge black textured flag beside RAL, supports mixed finishes and preserves the selection after RAL toggles",async()=>{
  const d=calculateQuote({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),materiale_cad:2},{...blankProduct(),materiale_cad:3},
    {...blankProduct(),a_forfait:true,descrizione:"Forfait",valore_forfait:40}]});
  mount(d);
  const bulk=await screen.findByRole("checkbox",{name:"Goffrato (tutti i prodotti)"}) as HTMLInputElement;
  fireEvent.click(bulk);
  const rows=screen.getAllByRole("checkbox",{name:"Goffrato"}) as HTMLInputElement[];
  expect(rows).toHaveLength(2);expect(rows.every(c=>c.checked)).toBe(true);
  fireEvent.click(rows[1]);expect(bulk.indeterminate).toBe(true);
  expect(screen.getByText(/Finiture diverse/)).toBeTruthy();
  const ral=screen.getByRole("checkbox",{name:"RAL"});
  fireEvent.click(ral);expect(screen.queryByRole("checkbox",{name:"Goffrato (tutti i prodotti)"})).toBeNull();
  fireEvent.click(ral);
  expect((screen.getByRole("checkbox",{name:"Goffrato (tutti i prodotti)"}) as HTMLInputElement).indeterminate).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti.map((p:any)=>p.nero_standard_goffrato)).toEqual([true,false,false]);
  expect(calculateQuote(saved).totale_finale).toBe(d.totale_finale);
});
it("exposes the black textured bulk choice in the mobile wizard without enabling RAL",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Bandella",gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro",oggetto_modifica:["occhio"]}]},true);
  const bulk=await screen.findByRole("checkbox",{name:"Goffrato (tutti i prodotti)"});
  fireEvent.click(bulk);
  expect((screen.getByRole("checkbox",{name:"RAL"}) as HTMLInputElement).checked).toBe(false);
  for(let i=0;i<30 && !screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Riepilogo finale"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti[0].nero_standard_goffrato).toBe(true);expect(saved.verniciatura_ral).toBeFalsy();
});

it("completes and reopens a series product with four required fields and optional discount",async()=>{
 mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),materiale_cad:12.34,lavoro_h:16}]});
 fireEvent.click(await screen.findByRole("checkbox",{name:"Prodotto di serie"}));
 expect(screen.queryByLabelText("Materiale *")).toBeNull();
 expect(screen.queryByRole("group",{name:"Oggetto della modifica *"})).toBeNull();
 expect(screen.queryByText("Attribuzione dei costi comuni")).toBeNull();
 expect(screen.queryByRole("button",{name:"Genera codice temporaneo"})).toBeNull();
 const saleFields=screen.getByLabelText("Codice articolo *").closest(".grid")!.querySelectorAll("input");
 expect(saleFields).toHaveLength(5);expect(Array.from(saleFields).filter(input=>input.required)).toHaveLength(4);
 expect((screen.getByLabelText("Sconto di serie") as HTMLInputElement).required).toBe(false);
 expect(screen.queryByRole("combobox",{name:"Gruppo merceologico *"})).toBeNull();
 expect(screen.queryByRole("textbox",{name:"Costo €/h"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
 expect(screen.getByRole("alert").textContent).toContain("codice articolo");
 fireEvent.change(screen.getByLabelText("Codice articolo *"),{target:{value:"STD-123"}});
 fireEvent.change(screen.getByLabelText("Descrizione *"),{target:{value:"Articolo di serie"}});
 fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
 expect(screen.getByRole("alert").textContent).toContain("prezzo unitario");
 for(const [name,value] of [["Quantità *","10"],["Prezzo unitario base €/pz *","12,50"]]){
  const input=screen.getByLabelText(name);fireEvent.focus(input);fireEvent.change(input,{target:{value}});fireEvent.blur(input);
 }
 fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
 await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.finalizeDraft")).toBe(true));
 const saved=JSON.parse(state.calls.find(c=>c.path==="quote.finalizeDraft")!.input.dataJson);
 expect(saved.totale_finale).toBe(125);expect(saved.prodotti[0]).toMatchObject({prodotto_di_serie:true,prezzo_serie:12.5,quantita:10,materiale_cad:12.34,lavoro_h:16});
 cleanup();mount(saved);
 const toggle=await screen.findByRole("checkbox",{name:"Prodotto di serie"}) as HTMLInputElement;
 expect(toggle.checked).toBe(true);expect(toggle.disabled).toBe(true);
 expect((screen.getByLabelText("Prezzo unitario base €/pz *") as HTMLInputElement).value).toBe("12,50");
 fireEvent.click(screen.getByRole("button",{name:"Modifica"}));fireEvent.click(toggle);
 expect((screen.getByLabelText("Materiale €/pz") as HTMLInputElement).value).toBe("12,34");
 fireEvent.click(screen.getByRole("checkbox",{name:"Preventiva a forfait"}));
 fireEvent.click(toggle);
 expect((screen.getByRole("checkbox",{name:"Preventiva a forfait"}) as HTMLInputElement).checked).toBe(false);
 expect((screen.getByLabelText("Prezzo unitario base €/pz *") as HTMLInputElement).value).toBe("12,50");
 fireEvent.click(screen.getByRole("checkbox",{name:"Preventiva a forfait"}));expect(toggle.checked).toBe(false);
});
it("offers five series fields in the mobile wizard with a required base price and optional discount",async()=>{
 mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Serie",codice:"STD-1",quantita:10}]},true);
 await screen.findByTestId("quote-mobile-wizard");
 // v20: +1 Avanti per il nuovo passo «Consegna stimata (settimane)» in Intestazione.
 for(let i=0;i<4;i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
 fireEvent.click(screen.getByRole("checkbox",{name:"Prodotto di serie"}));
 expect(screen.queryByRole("button",{name:"Genera codice temporaneo"})).toBeNull();
 for(let i=0;i<3;i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
 expect(screen.getByRole("heading",{name:"Prezzo unitario base (€/pz)"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Avanti"}));expect(screen.getByRole("alert").textContent).toContain("prezzo unitario");
 const price=document.getElementById("wizard-input")!;fireEvent.change(price,{target:{value:"12,50"}});fireEvent.blur(price);
 fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
 expect(screen.getByRole("heading",{name:"Sconto di serie"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
 expect(screen.getByRole("heading",{name:"Riepilogo finale"})).toBeTruthy();
 expect(screen.getByLabelText("Totale preventivo").textContent).toContain("125,00");
});

it.each([false,true])("preserves historical series discounts and net totals when opening, saving and editing the base price, mobile=%s",async mobile=>{
 const old=calculateQuote({...blankQuote(),cliente:"Cliente",stato_preventivo:"bozza",prodotti:[{...blankProduct(),
  prodotto_di_serie:true,codice:"STD-1",descrizione:"Serie",quantita:10,prezzo_serie:10,sconto_serie:"40+15+5%"}]});
 const priceField=async()=>{
  if(!mobile)return await screen.findByLabelText("Prezzo unitario base €/pz *") as HTMLInputElement;
  await screen.findByTestId("quote-mobile-wizard");
  for(let i=0;i<10&&!screen.queryByRole("heading",{name:"Prezzo unitario base (€/pz)"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Prezzo unitario base (€/pz)"})).toBeTruthy();
  return document.getElementById("wizard-input") as HTMLInputElement;
 };
 const save=async()=>{
  if(mobile){
    for(let i=0;i<4&&!screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
    expect(screen.getByRole("heading",{name:"Riepilogo finale"})).toBeTruthy();
   }
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  return JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
 };
 mount(old,mobile);
 const input=await priceField();expect(input.value).toBe("10,00");
 fireEvent.focus(input);fireEvent.blur(input);
 // Change an unrelated option to enable saving the otherwise unchanged draft.
 fireEvent.click(screen.getByRole("checkbox",{name:"Elabora diciture preventivo in inglese"}));
 const unchanged=await save();
 expect(unchanged.prodotti[0]).toMatchObject({prezzo_serie:10,sconto_serie:"40+15+5%"});
 expect(calculateQuote(unchanged).totale_finale).toBe(old.totale_finale);
 cleanup();state.calls=[];mount(unchanged,mobile);
 const reopened=await priceField();expect(reopened.value).toBe("10,00");
 fireEvent.focus(reopened);fireEvent.change(reopened,{target:{value:"7,1234"}});fireEvent.blur(reopened);
 const edited=await save();
 expect(edited.prodotti[0]).toMatchObject({prezzo_serie:7.1234,sconto_serie:"40+15+5%"});
 expect(calculateQuote(edited).totale_finale).toBeCloseTo(34.513,4);
});

it.each([false,true])('copies the selected first product immediately below its source in mobile=%s',async mobile=>{
  mount({...blankQuote(),cliente:'Prova',stato_preventivo:'bozza',prodotti:[{...blankProduct(),descrizione:'Primo',quantita:10},{...blankProduct(),descrizione:'Secondo',quantita:20}]},mobile);
  for(let i=0;i<4&&!screen.queryByRole('button',{name:'Copia prodotto 1'});i++)fireEvent.click(await screen.findByRole('button',{name:'Avanti'}));
  fireEvent.click(await screen.findByRole('button',{name:'Copia prodotto 1'}));
  if(mobile)fireEvent.click(screen.getByRole('button',{name:'Vista completa'}));
  fireEvent.click(screen.getByRole('button',{name:'Salva bozza'}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.saveDraft')).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==='quote.saveDraft')!.input.dataJson);
  expect(saved.prodotti.map((p:any)=>p.descrizione)).toEqual(['Primo','Primo','Secondo']);
  expect(saved.prodotti.map((p:any)=>p.quantita)).toEqual([10,'',20]);
});
it('requires an explicit continue action for missing costs and saves the warning',async()=>{
  mount({...blankQuote(),cliente:'Prova',stato_preventivo:'bozza',prodotti:[{...blankProduct(),descrizione:'Primo',gruppo_merceologico:'Bandelle',materiale_prodotto:'ferro',oggetto_modifica:['occhio']}]});
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(await screen.findByRole('button',{name:'Completa preventivo'}));
  await waitFor(()=>expect(window.confirm).toHaveBeenCalled());expect(state.calls.filter(c=>c.path==='quote.finalizeDraft')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Completa preventivo'}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.finalizeDraft')).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==='quote.finalizeDraft')!.input.dataJson);
  expect(saved.costi_incompleti.length).toBeGreaterThan(0);expect(saved.costi_incompleti_conferma).toBeTruthy();
});
it('offers mutually exclusive inox grades and persists the selected one',async()=>{
  mount({...blankQuote(),stato_preventivo:'bozza',prodotti:[blankProduct()]});
  fireEvent.change(await screen.findByLabelText('Materiale *'),{target:{value:'inox'}});
  const a=screen.getByRole('checkbox',{name:'AISI 304'}) as HTMLInputElement,b=screen.getByRole('checkbox',{name:'AISI 316'}) as HTMLInputElement;
  fireEvent.click(a);expect(a.checked).toBe(true);expect(b.checked).toBe(false);
  fireEvent.click(b);expect(a.checked).toBe(false);expect(b.checked).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Salva bozza'}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.saveDraft')).toBe(true));
  expect(JSON.parse(state.calls.find(c=>c.path==='quote.saveDraft')!.input.dataJson).prodotti[0].inox_aisi).toBe('316');
});
it('searches groups, confirms global rename and keeps unsaved quote fields',async()=>{
  state.groups=[{id:1,name:'Bandelle'},{id:2,name:'Cardini'}];
  mount({...blankQuote(),cliente:'Prova',stato_preventivo:'bozza',prodotti:[{...blankProduct(),descrizione:'Non perdere',gruppo_merceologico:'Bandelle'}]});
  const input=await screen.findByRole('combobox',{name:'Gruppo merceologico *'});
  fireEvent.change(input,{target:{value:'card'}});expect(screen.getByRole('option',{name:'Cardini'})).toBeTruthy();expect(screen.queryByRole('option',{name:'Bandelle'})).toBeNull();
  fireEvent.click(screen.getByRole('option',{name:'Cardini'}));
  fireEvent.click(screen.getByRole('button',{name:'Rinomina gruppo merceologico'}));
  expect(screen.getByText(/La modifica verrà applicata a tutti i preventivi/)).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox',{name:'Nuovo nome gruppo'}),{target:{value:'Cardini speciali'}});
  expect(state.calls).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Conferma modifica in tutti i preventivi'}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==='productGroup.rename')).toBe(true));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button',{name:'Salva bozza'}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.saveDraft')).toBe(true));
  const p=JSON.parse(state.calls.find(c=>c.path==='quote.saveDraft')!.input.dataJson).prodotti[0];
  expect(p).toMatchObject({descrizione:'Non perdere',gruppo_merceologico:'Cardini speciali',gruppo_merceologico_id:2});
});
it('shows RAL on a series-only quote and searches a color by its full name',async()=>{
  mount({...blankQuote(),stato_preventivo:'bozza',prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'TFP0000001In',descrizione:'Serie',quantita:10,prezzo_serie:10,sconto_serie:'40+15+5%'}]});
  fireEvent.click(await screen.findByRole('checkbox',{name:'RAL'}));
  const input=screen.getByRole('combobox',{name:'Colore RAL'});
  fireEvent.change(input,{target:{value:'Bianco puro'}});
  fireEvent.click(screen.getByRole('option',{name:/RAL 9010.*Bianco puro/}));
  await waitFor(()=>expect(screen.getByLabelText('Totale preventivo').textContent).toContain('146,90'));
  expect(screen.getByText(/\+100% per RAL ·/)).toBeTruthy();
  fireEvent.change(input,{target:{value:'9005'}});expect(screen.getByRole('option',{name:/RAL 9005/})).toBeTruthy();
});

it('shows the unpacking surcharge flag only on series rows and clears it when series is off',async()=>{
  mount({...blankQuote(),stato_preventivo:'bozza',prodotti:[
    {...blankProduct(),descrizione:'Standard',quantita:1},
    {...blankProduct(),prodotto_di_serie:true,codice:'FSP001012NIN',descrizione:'Serie',quantita:2,prezzo_serie:50},
  ]});
  // il flag esiste solo sulla riga di serie: sulla riga standard non è né visibile né selezionabile
  const flag=await screen.findByRole('checkbox',{name:/Applica supplemento per sconfezionamento/});
  expect(screen.getAllByRole('checkbox',{name:/Applica supplemento per sconfezionamento/})).toHaveLength(1);
  expect(screen.getByLabelText('Totale preventivo').textContent).toContain('100,00');
  fireEvent.click(flag);
  await waitFor(()=>expect(screen.getByLabelText('Totale preventivo').textContent).toContain('120,00'));
  // disattivando «Prodotto di serie» il flag sparisce e viene azzerato
  fireEvent.click(screen.getAllByRole('checkbox',{name:'Prodotto di serie'})[1]);
  await waitFor(()=>expect(screen.queryByRole('checkbox',{name:/Applica supplemento per sconfezionamento/})).toBeNull());
  fireEvent.click(screen.getAllByRole('checkbox',{name:'Prodotto di serie'})[1]);
  const again=await screen.findByRole('checkbox',{name:/Applica supplemento per sconfezionamento/});
  expect((again as HTMLInputElement).checked).toBe(false);
  expect(screen.getByLabelText('Totale preventivo').textContent).toContain('100,00');
});

it('uppercases the manual suffix typed or pasted in the row code field, through save, reopen and print',async()=>{
  const temporary={sequence:37,family:'RN',material:'B',color:null,code:'TRN0000037BZ'};
  const doc={...blankQuote(),cliente:'Prova',stato_preventivo:'bozza',prodotti:[{...blankProduct(),descrizione:'Ottone',quantita:1,prezzo_netto_unitario_finale:10,totale_finale:10,codice:'TRN0000037BZ',codice_temporaneo:temporary}]};
  mount(doc);
  const field=await screen.findByRole('textbox',{name:'Codice articolo'});
  expect((field as HTMLInputElement).value).toBe('TRN0000037BZ');
  // digitazione minuscola → maiuscola immediata
  fireEvent.change(field,{target:{value:'TRN0000037Bz'}});
  expect((field as HTMLInputElement).value).toBe('TRN0000037BZ');
  // incolla minuscolo → maiuscolo immediato
  fireEvent.change(field,{target:{value:'TRN0000037B'}});
  fireEvent.focus(field);fireEvent.paste(field,{clipboardData:{getData:()=>'z'}});
  expect((field as HTMLInputElement).value).toBe('TRN0000037BZ');
  // il codice è tornato al valore iniziale: rendo il documento «modificato» con la descrizione
  fireEvent.change(screen.getByLabelText('Descrizione *'),{target:{value:'Ottone lavorato'}});
  // salvataggio
  fireEvent.click(screen.getByRole('button',{name:'Salva bozza'}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.saveDraft')).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==='quote.saveDraft')!.input.dataJson);
  expect(saved.prodotti[0].codice).toBe('TRN0000037BZ');
  expect(saved.prodotti[0].codice_temporaneo).toBeTruthy();
  // riapertura
  cleanup();mount(saved);
  expect(((await screen.findByRole('textbox',{name:'Codice articolo'})) as HTMLInputElement).value).toBe('TRN0000037BZ');
  // PDF: una bozza salvata non è esportabile per regola dell'app, quindi la
  // stampa si verifica sul documento completato che conserva lo stesso codice.
  const printable={...saved,stato_preventivo:'completo',prodotti:saved.prodotti.map((p:any)=>({...p,oggetto_modifica:['occhio'],gruppo_merceologico:'Bandelle',materiale_prodotto:'ferro'}))};
  cleanup();mount(printable);
  await screen.findByRole('button',{name:'Modifica'});
  // v13: il pulsante scarica il PDF del generatore interno (non più la finestra di stampa)
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
    const text=await download.textOf(0);
    expect(text).toContain('TRN0000037BZ');
    expect(text).not.toContain('TRN0000037Bz');
  }finally{download.restore();}
});

it('wizard: the row code field uppercases the manual suffix as well',async()=>{
  const temporary={sequence:37,family:'RN',material:'B',color:null,code:'TRN0000037BZ'};
  mount({...blankQuote(),cliente:'Prova',stato_preventivo:'bozza',prodotti:[{...blankProduct(),descrizione:'Ottone',oggetto_modifica:['occhio'],quantita:1,codice:'TRN0000037BZ',codice_temporaneo:temporary}]},true);
  fireEvent.click(await screen.findByLabelText('Opzioni avanzate'));
  for(let i=0;i<40&&!screen.queryByRole('textbox',{name:'Codice articolo'});i++)fireEvent.click(screen.getByRole('button',{name:'Avanti'}));
  const field=await screen.findByRole('textbox',{name:'Codice articolo'});
  expect((field as HTMLInputElement).value).toBe('TRN0000037BZ');
  fireEvent.change(field,{target:{value:'TRN0000037Bz'}});
  expect((field as HTMLInputElement).value).toBe('TRN0000037BZ');
  fireEvent.change(field,{target:{value:'TRN0000037B'}});
  fireEvent.focus(field);fireEvent.paste(field,{clipboardData:{getData:()=>'z'}});
  expect((field as HTMLInputElement).value).toBe('TRN0000037BZ');
});

it.each([false,true])('recovers an old series RAL quote in mobile=%s, exports the new codes and persists only after explicit save',async mobile=>{
  const old={...blankQuote(),stato_preventivo:'completo',verniciatura_ral:{color:'6021',textured:false},totale_finale:40,
    prodotti:['FCA00504HBIN','FSP001012NIN'].map(codice=>({...blankProduct(),prodotto_di_serie:true,codice,descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}))};
  mount(old,mobile);
  await screen.findByText(/Supplementi RAL aggiornati anche per i prodotti di serie/);
  expect(screen.getByLabelText('Totale preventivo').textContent).toContain('120,00');
  expect(state.calls).toHaveLength(0);
  if(mobile)for(let i=0;i<30&&!screen.queryByRole('heading',{name:'Riepilogo finale'});i++)fireEvent.click(screen.getByRole('button',{name:'Avanti'}));
  expect((screen.getByRole('button',{name:'Invia al commerciale (test)'}) as HTMLButtonElement).disabled).toBe(true);
  if(mobile)fireEvent.click(screen.getByRole('button',{name:'Vista completa'}));
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
    const pdfText=await download.textOf(0);
    for(const text of ['FCA00504HBIO6021','FSP001012NIO6021','Spagnolette (Standard)','+100%','120,00'])expect(pdfText).toContain(text);
    expect(state.calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button',{name:'Modifica'}));
    fireEvent.click(screen.getByRole('button',{name:'Salva e sovrascrivi versione attuale'}));
    await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.update')).toBe(true));
    const request=state.calls.find(c=>c.path==='quote.update')!.input,saved=JSON.parse(request.dataJson);
    expect(request).toMatchObject({expectedToken:'test-version',totalFinal:'120'});
    expect(saved.prodotti.map((p:any)=>p.codice)).toEqual(old.prodotti.map(p=>p.codice));
    expect(saved.prodotti.map((p:any)=>p.ral_percentuale)).toEqual([50,100]);
    await waitFor(()=>expect(screen.queryByText(/Supplementi RAL aggiornati anche per i prodotti di serie/)).toBeNull());
    expect((screen.getByRole('button',{name:'Invia al commerciale (test)'}) as HTMLButtonElement).disabled).toBe(false);
    cleanup();mount(saved);
    await screen.findByRole('button',{name:'Modifica'});
    expect(screen.getByLabelText('Totale preventivo').textContent).toContain('120,00');
    expect(screen.queryByText(/Supplementi RAL aggiornati anche per i prodotti di serie/)).toBeNull();
    expect(state.calls).toHaveLength(1);
  }finally{download.restore();}
});

it.each([false,true])('stores the PDF language choice in mobile=%s without recalculating saved prices',async mobile=>{
  const historical={...blankQuote(),stato_preventivo:'completo',totale_finale:74.25,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Descrizione invariata',quantita:2,prezzo_serie:10,prezzo_netto_unitario_finale:37.125,totale_finale:74.25}]};
  mount(historical,mobile);
  const flag=await screen.findByRole('checkbox',{name:'Elabora diciture preventivo in inglese'}) as HTMLInputElement;
  expect(flag.checked).toBe(false);expect(flag.disabled).toBe(true);
  if(mobile)for(let i=0;i<25&&!screen.queryByRole('heading',{name:'Riepilogo finale'});i++)fireEvent.click(screen.getByRole('button',{name:'Avanti'}));
  fireEvent.click(screen.getByRole('button',{name:mobile?'Modifica preventivo':'Modifica'}));
  fireEvent.click(flag);expect(flag.checked).toBe(true);
  if(mobile)fireEvent.click(screen.getByRole('button',{name:'Vista completa'}));
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
    const pdfText=await download.textOf(0);
    expect(pdfText).toContain('Total net quotation');
    expect(pdfText).toContain('74.25');
    fireEvent.click(screen.getByRole('button',{name:'Salva e sovrascrivi versione attuale'}));
    await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.update')).toBe(true));
    const saved=JSON.parse(state.calls.find(c=>c.path==='quote.update')!.input.dataJson);
    expect(saved.pdf_in_inglese).toBe(true);expect(saved.totale_finale).toBe(74.25);expect(saved.prodotti).toEqual(historical.prodotti);
    cleanup();mount(saved,mobile);
    expect((await screen.findByRole('checkbox',{name:'Elabora diciture preventivo in inglese'}) as HTMLInputElement).checked).toBe(true);
  }finally{download.restore();}
});

it.each([false,true])('exports the actual saved revision even when its JSON is stale, English=%s',async english=>{
  mount({...blankQuote(),numero_preventivo:'DDC90007/2026',rev:1,pdf_in_inglese:english,stato_preventivo:'completo',totale_finale:10,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',quantita:1,prezzo_serie:10,prezzo_netto_unitario_finale:10,totale_finale:10}]},false,3);
  await screen.findByRole('heading',{name:'Preventivo DDC90007/2026 — rev. 3'});
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
    expect(download.files[0].name).toMatch(/^\d{4}_DDC90007_REV\.3\.pdf$/);
    const pdfText=await download.textOf(0);
    expect(pdfText).toContain('DDC90007/2026');
    expect(pdfText).toContain(english?'Revision 3':'Revisione 3');
    expect(state.calls).toHaveLength(0);
  }finally{download.restore();}
});

it.each([false,true])("moves products in desktop/mobile, keeps price selection, and persists the new order: mobile=%s",async mobile=>{
  mount({...blankQuote(),cliente:"Prova",stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Primo",quantita:10},{...blankProduct(),descrizione:"Secondo",quantita:20}],listino:{product_index_riferimento:1}},mobile);
  if(mobile)for(let i=0;i<5&&!screen.queryByRole("button",{name:"Sposta giù prodotto 1"});i++)fireEvent.click(await screen.findByRole("button",{name:"Avanti"}));
  const up=await screen.findByRole("button",{name:"Sposta su prodotto 1"}) as HTMLButtonElement;
  expect(up.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Sposta giù prodotto 1"}));
  if(mobile)fireEvent.click(screen.getByRole("button",{name:"Vista completa"}));
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti.map((p:any)=>[p.descrizione,p.quantita])).toEqual([["Secondo",20],["Primo",10]]);
  expect(saved.listino.product_index_riferimento).toBe(0);
  expect(saved.prodotti[0]._rowId).not.toBe(saved.prodotti[1]._rowId);
  cleanup();mount(saved);
  expect((await screen.findAllByLabelText("Descrizione *")).map(e=>(e as HTMLInputElement).value)).toEqual(["Secondo","Primo"]);
});
it("copies an issued natural code once, retries the same request after failure and preserves the source",async()=>{
  const generated={sequence:1,family:"BC",material:"6",color:null,code:"TBC000000160"};
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Originale",codice:generated.code,codice_temporaneo:generated,materiale_prodotto:"inox",inox_aisi:"316",quantita:10},{...blankProduct(),descrizione:"Successivo"}]});
  state.failDuplicate=true;
  fireEvent.click(await screen.findByRole("button",{name:"Copia prodotto 1"}));
  await screen.findByText("Connessione interrotta");
  expect(screen.getAllByLabelText("Descrizione *")).toHaveLength(2);
  let release!:()=>void;state.duplicateGate=new Promise<void>(resolve=>{release=resolve;});
  const button=screen.getByRole("button",{name:"Copia prodotto 1"});
  fireEvent.click(button);fireEvent.click(button);
  expect(state.calls.filter(c=>c.path==="temporaryProduct.duplicate")).toHaveLength(2);
  release();
  await waitFor(()=>expect(screen.getAllByLabelText("Descrizione *")).toHaveLength(3));
  expect(state.calls.filter(c=>c.path==="temporaryProduct.duplicate")[0].input).toEqual(state.calls.filter(c=>c.path==="temporaryProduct.duplicate")[1].input);
  const fields=screen.getAllByLabelText("Codice articolo") as HTMLInputElement[];
  expect(fields.map(f=>f.value)).toEqual([generated.code,"TBC000007760",""]);
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti[0].codice_temporaneo).toEqual(generated);
  expect(saved.prodotti[1].codice_temporaneo.sequence).toBe(77);
  expect(saved.prodotti[1].quantita).toBe("");
});

it.each([false,true])("sets an exact product position and retains it after saving/reopening, mobile=%s",async mobile=>{
  const products=["Primo","Secondo","Terzo","Quarto","Quinto"].map((descrizione,i)=>({...blankProduct(),descrizione,quantita:i+1,materiale_cad:10+i,gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro",oggetto_modifica:["occhio"]}));
  mount({...blankQuote(),cliente:"Prova",stato_preventivo:"bozza",prodotti:products,listino:{product_index_riferimento:2}},mobile);
  if(mobile){
    for(let i=0;i<100&&!screen.queryByRole("textbox",{name:"Posizione prodotto 3"});i++)fireEvent.click(await screen.findByRole("button",{name:"Avanti"}));
  }
  const input=await screen.findByRole("textbox",{name:"Posizione prodotto 3"});
  fireEvent.change(input,{target:{value:"1"}});fireEvent.keyDown(input,{key:"Enter"});
  if(mobile){
    // The wizard follows the same product to its new position.
    expect(screen.getByRole("textbox",{name:"Posizione prodotto 1"})).toBeTruthy();
    expect((document.getElementById("wizard-input") as HTMLInputElement).value).toBe("Terzo");
    fireEvent.click(screen.getByRole("button",{name:"Vista completa"}));
  }
  expect(screen.getAllByLabelText("Descrizione *").map(e=>(e as HTMLInputElement).value)).toEqual(["Terzo","Primo","Secondo","Quarto","Quinto"]);
  const fourth=screen.getByRole("textbox",{name:"Posizione prodotto 4"});
  fireEvent.change(fourth,{target:{value:"5"}});fireEvent.blur(fourth);
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti.map((p:any)=>[p.descrizione,p.quantita,p.materiale_cad])).toEqual([["Terzo",3,12],["Primo",1,10],["Secondo",2,11],["Quinto",5,14],["Quarto",4,13]]);
  expect(saved.listino.product_index_riferimento).toBe(0);
  cleanup();mount(saved);
  expect((await screen.findAllByLabelText("Descrizione *")).map(e=>(e as HTMLInputElement).value)).toEqual(["Terzo","Primo","Secondo","Quinto","Quarto"]);
  expect(screen.getAllByRole("textbox",{name:/Posizione prodotto/}).map(e=>(e as HTMLInputElement).value)).toEqual(["1","2","3","4","5"]);
});

// Regressione TKT-20261119-86210001: la copia prodotto su /preventivi/new deve
// sempre aggiungere la riga; se fallisce, l'errore deve essere portato nel viewport.
it("copies a product row on /preventivi/new without calling the server (regression TKT-20261119-86210001)",async()=>{
  mountNew();
  fireEvent.click(await screen.findByRole("button",{name:"Copia prodotto 1"}));
  await waitFor(()=>expect(screen.getAllByLabelText("Descrizione *")).toHaveLength(2));
  expect(state.calls.filter(c=>c.path==="temporaryProduct.duplicate")).toHaveLength(0);
  expect(screen.queryByRole("alert")).toBeNull();
});
it("copies a row with an issued temporary code on /preventivi/new (regression TKT-20261119-86210001)",async()=>{
  mountNew();
  fireEvent.click(await screen.findByRole("button",{name:"Genera codice temporaneo"}));
  fireEvent.change(await screen.findByLabelText("Famiglia"),{target:{value:"BC"}});
  await waitFor(()=>expect(state.calls.some(c=>c.path==="temporaryProduct.reserve")).toBe(true));
  fireEvent.click(await screen.findByRole("button",{name:"Usa questo codice"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="temporaryProduct.complete")).toBe(true));
  const codeField=(await screen.findByLabelText("Codice articolo")) as HTMLInputElement;
  expect(codeField.value).toBe("TBC0000042IN");
  fireEvent.click(screen.getByRole("button",{name:"Copia prodotto 1"}));
  await waitFor(()=>expect(screen.getAllByLabelText("Descrizione *")).toHaveLength(2));
  const duplicate=state.calls.filter(c=>c.path==="temporaryProduct.duplicate");
  expect(duplicate).toHaveLength(1);
  expect(duplicate[0].input.currentCode).toBe("TBC0000042IN");
  const fields=screen.getAllByLabelText("Codice articolo") as HTMLInputElement[];
  expect(fields.map(f=>f.value)).toEqual(["TBC0000042IN","TBC000007760"]);
  expect(screen.queryByRole("alert")).toBeNull();
});
it("shows the copy error and scrolls it into view when duplicating fails (regression TKT-20261119-86210001)",async()=>{
  const generated={sequence:1,family:"BC",material:"6",color:null,code:"TBC000000160"};
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Originale",codice:generated.code,codice_temporaneo:generated,materiale_prodotto:"inox",inox_aisi:"316",quantita:10}]});
  state.failDuplicate=true;
  fireEvent.click(await screen.findByRole("button",{name:"Copia prodotto 1"}));
  const alert=await screen.findByRole("alert");
  expect(alert.textContent).toContain("Connessione interrotta");
  await waitFor(()=>expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  expect(vi.mocked(Element.prototype.scrollIntoView).mock.calls.at(-1)?.[0]).toMatchObject({block:"center"});
  expect(screen.getAllByLabelText("Descrizione *")).toHaveLength(1);
});
it("shows the copy error and scrolls it into view in the mobile wizard (regression TKT-20261119-86210001)",async()=>{
  const generated={sequence:1,family:"BC",material:"6",color:null,code:"TBC000000160"};
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Originale",codice:generated.code,codice_temporaneo:generated,materiale_prodotto:"inox",inox_aisi:"316",quantita:10}]},true);
  for(let i=0;i<8&&!screen.queryByRole("button",{name:"Copia prodotto 1"});i++)fireEvent.click(await screen.findByRole("button",{name:"Avanti"}));
  state.failDuplicate=true;
  fireEvent.click(await screen.findByRole("button",{name:"Copia prodotto 1"}));
  const alert=await screen.findByRole("alert");
  expect(alert.textContent).toContain("Connessione interrotta");
  await waitFor(()=>expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  expect(screen.queryByRole("button",{name:"Copia prodotto 2"})).toBeNull();
});

// Regressione TKT-20261119-86210002: nota fissa prodotti custom precompilata,
// editabile, solo sui preventivi nuovi.
it("prefills the fixed custom-products note on /preventivi/new and lets the user replace it (regression TKT-20261119-86210002)",async()=>{
  mountNew();
  const field=(await screen.findByLabelText("Note cliente")) as HTMLTextAreaElement;
  expect(field.value).toContain("Il preventivo contiene prodotti custom realizzati su specifiche del cliente.");
  expect(field.value).toContain("Non considerare valida l'offerta se le quantità dovessero variare.");
  fireEvent.change(field,{target:{value:"Nota sostituita dall'utente"}});
  expect(((await screen.findByLabelText("Note cliente")) as HTMLTextAreaElement).value).toBe("Nota sostituita dall'utente");
});
it("does not inject the custom-products note into an existing quote (regression TKT-20261119-86210002)",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",note_cliente:""});
  const field=(await screen.findByLabelText("Note cliente")) as HTMLTextAreaElement;
  expect(field.value).toBe("");
});

// Regressione TKT-20261117-84210001: invio del PDF preventivo via email.
it("v13: export and email produce the SAME bytes for the same quote (un solo PDF)",async()=>{
  mount({...blankQuote(),stato_preventivo:'completo',numero_preventivo:'DDC00042/2026',cliente:'Cliente prova',totale_finale:40,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}]});
  await screen.findByRole('button',{name:'Esporta PDF cliente'});
  const download=mockPdfDownload();
  try{
    // «Prepara email» usato direttamente, SENZA prima esportare (ramo download+mailto)
    fireEvent.click(screen.getByRole('button',{name:'Prepara email (PDF da allegare)'}));
    await screen.findByText(/Allega manualmente il file nel programma di posta/);
    await waitFor(()=>expect(download.files).toHaveLength(1));
    // «Esporta PDF cliente»: scarica lo stesso file
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    await waitFor(()=>expect(download.files).toHaveLength(2));
    expect(download.files[1].name).toBe(download.files[0].name);
    const a=new Uint8Array(await download.files[0].arrayBuffer());
    const b=new Uint8Array(await download.files[1].arrayBuffer());
    expect(b.length).toBe(a.length);
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
  }finally{download.restore();}
});

it("downloads a real PDF and requests a prefilled email with an explicit manual attachment reminder (regression TKT-20261117-84210001)",async()=>{
  mount({...blankQuote(),stato_preventivo:'completo',numero_preventivo:'DDC00042/2026',cliente:'Cliente prova',totale_finale:40,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}]});
  const button=await screen.findByRole('button',{name:'Prepara email (PDF da allegare)'});
  expect((button as HTMLButtonElement).disabled).toBe(false);
  let mailto="";
  const downloads:Array<{href:string;name:string}>=[];
  const anchorClick=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){
    if(this.download)downloads.push({href:this.href,name:this.download});else mailto=this.href;
  });
  const createObjectURL=vi.fn(()=>'blob:mock-pdf');
  const revoke=vi.fn();
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:createObjectURL});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
  try{
    fireEvent.click(button);
    await screen.findByText(/Allega manualmente il file nel programma di posta/);
    await waitFor(()=>expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe('2026_DDC00042_REV.1.pdf');
    expect(createObjectURL).toHaveBeenCalled();
    expect(mailto.startsWith('mailto:?subject=')).toBe(true);
    const decoded=decodeURIComponent(mailto);
    expect(decoded).toContain('Preventivo DDC00042/2026 - Cliente prova');
    expect(decoded).toContain('Gentile Cliente,');
    expect(decoded).toContain('in allegato il preventivo richiesto, restiamo a disposizione per eventuali chiarimenti');
    expect(decoded).toContain('Cordiali saluti');
  }finally{anchorClick.mockRestore();Reflect.deleteProperty(URL,'createObjectURL');Reflect.deleteProperty(URL,'revokeObjectURL');}
});
it("shares the real quote PDF as a file when the browser supports it (regression TKT-20261117-84210001)",async()=>{
  mount({...blankQuote(),stato_preventivo:'completo',numero_preventivo:'DDC00042/2026',cliente:'Cliente prova',totale_finale:40,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}]});
  const button=await screen.findByRole('button',{name:'Prepara email (PDF da allegare)'});
  let shared:{files:File[];text:string}|null=null;
  const nav=navigator as Navigator&{canShare?:(d:{files:File[]})=>boolean;share?:(d:{files:File[];text:string})=>Promise<void>};
  nav.canShare=vi.fn(()=>true);
  nav.share=vi.fn(async data=>{shared=data as {files:File[];text:string};});
  try{
    fireEvent.click(button);
    await screen.findByText(/PDF condiviso come file/);
    expect(shared).not.toBeNull();
    const file=(shared as unknown as {files:File[];text:string}).files[0];
    expect(file.name).toBe('2026_DDC00042_REV.1.pdf');
    expect(file.type).toBe('application/pdf');
    expect((shared as unknown as {files:File[];text:string}).text).toContain('Gentile Cliente,');
    const content=await file.text();
    expect(content).toContain('%PDF-');
    expect(content).toContain('DDC00042/2026');
    expect(content).toContain('Cliente prova');
    expect(content).toContain('FCA00504HBIN');
  }finally{Reflect.deleteProperty(nav,'canShare');Reflect.deleteProperty(nav,'share');}
});
it("keeps send-by-email disabled for an incomplete draft (regression TKT-20261117-84210001)",async()=>{
  mount({...blankQuote(),stato_preventivo:'bozza',prodotti:[{...blankProduct(),descrizione:'Bozza'}]});
  const button=await screen.findByRole('button',{name:'Prepara email (PDF da allegare)'});
  expect((button as HTMLButtonElement).disabled).toBe(true);
});

// v18: il recupero degli allegati è per singolo file — una lettura fallita non
// blocca l'export né sacrifica gli allegati già recuperati.
const PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
it("v18: un allegato non recuperabile è escluso singolarmente, gli altri restano nel PDF in ordine",async()=>{
  state.attachments=[
    {id:11,fileName:"primo.png",mimeType:"image/png",dataBase64:PNG_B64},
    {id:12,fileName:"rotto.pdf",mimeType:"application/pdf",dataBase64:"AAAA",fail:true},
    {id:13,fileName:"terzo.png",mimeType:"image/png",dataBase64:PNG_B64},
  ];
  state.stubAttachments=true;
  mount({...blankQuote(),stato_preventivo:'completo',numero_preventivo:'DDC00042/2026',cliente:'Cliente prova',totale_finale:40,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}]});
  await screen.findByRole('button',{name:'Esporta PDF cliente'});
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
    // il ciclo ha tentato tutte e tre le letture, senza fermarsi al fallimento
    expect(state.attachmentGets).toEqual([11,12,13]);
    // al rasterizzatore arrivano solo i file recuperati, in ordine di caricamento
    expect(state.attachmentFiles).toEqual(["primo.png","terzo.png"]);
    // avviso di recupero che nomina il file escluso
    await screen.findByText("Allegati non recuperati, esclusi dal PDF: rotto.pdf.");
    // nel PDF: primo e terzo in ordine, rotto assente, condizioni in fondo
    const text=await download.textOf(0);
    expect(text).toContain("Allegato: primo.png");
    expect(text).toContain("Allegato: terzo.png");
    expect(text).not.toContain("Allegato: rotto.pdf");
    expect(text.indexOf("Allegato: primo.png")).toBeLessThan(text.indexOf("Allegato: terzo.png"));
    expect(text.indexOf("Allegato: terzo.png")).toBeLessThan(text.indexOf("CONDIZIONI DI VENDITA"));
  }finally{download.restore();}
});
it("v18: l'avviso di recupero segue la lingua del PDF e precede quelli di conversione",async()=>{
  state.attachments=[
    {id:11,fileName:"primo.png",mimeType:"image/png",dataBase64:PNG_B64},
    {id:12,fileName:"rotto.pdf",mimeType:"application/pdf",dataBase64:"AAAA",fail:true},
    {id:13,fileName:"nota.txt",mimeType:"text/plain",dataBase64:"AAAA"},
  ];
  state.stubAttachments=true;
  // il txt non è stampabile: avviso di conversione da affiancare a quello di recupero
  state.attachmentWarnings=["Unsupported attachments, not included in the PDF: nota.txt."];
  mount({...blankQuote(),stato_preventivo:'completo',pdf_in_inglese:true,numero_preventivo:'DDC00042/2026',cliente:'Cliente prova',totale_finale:40,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}]});
  await screen.findByRole('button',{name:'Esporta PDF cliente'});
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
    expect(state.attachmentFiles).toEqual(["primo.png","nota.txt"]);
    // gli avvisi convivono nello stesso contenitore (un <p> per avviso):
    // recupero prima, conversione dopo
    const alerts=await screen.findAllByRole("alert");
    const text=alerts.map(a=>a.textContent??"").join("\n");
    const retrieval=text.indexOf("Attachments not retrieved, excluded from the PDF: rotto.pdf.");
    const conversion=text.indexOf("Unsupported attachments, not included in the PDF: nota.txt.");
    expect(retrieval).toBeGreaterThanOrEqual(0);
    expect(conversion).toBeGreaterThanOrEqual(0);
    expect(retrieval).toBeLessThan(conversion);
  }finally{download.restore();}
});

// v19: nel PDF cliente entrano solo gli allegati selezionati («Includi nel PDF
// cliente»). NULL = allegato storico, incluso finché l'utente non sceglie.
it("v19: solo gli allegati selezionati entrano nel PDF, gli storici NULL restano inclusi",async()=>{
  state.attachments=[
    {id:11,fileName:"disegno-cliente.png",mimeType:"image/png",dataBase64:PNG_B64,includeInPdf:true},
    {id:12,fileName:"foto-interna.png",mimeType:"image/png",dataBase64:PNG_B64,includeInPdf:false},
    {id:13,fileName:"storico.png",mimeType:"image/png",dataBase64:PNG_B64,includeInPdf:null},
  ];
  state.stubAttachments=true;
  mount({...blankQuote(),stato_preventivo:'completo',numero_preventivo:'DDC00042/2026',cliente:'Cliente prova',totale_finale:40,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}]});
  await screen.findByRole('button',{name:'Esporta PDF cliente'});
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
    // il file escluso non viene nemmeno recuperato dall'archivio
    expect(state.attachmentGets).toEqual([11,13]);
    // al rasterizzatore arrivano solo i selezionati, in ordine di caricamento
    expect(state.attachmentFiles).toEqual(["disegno-cliente.png","storico.png"]);
    const text=await download.textOf(0);
    expect(text).toContain("Allegato: disegno-cliente.png");
    expect(text).toContain("Allegato: storico.png");
    expect(text).not.toContain("Allegato: foto-interna.png");
    expect(text.indexOf("Allegato: disegno-cliente.png")).toBeLessThan(text.indexOf("Allegato: storico.png"));
    expect(text.indexOf("Allegato: storico.png")).toBeLessThan(text.indexOf("CONDIZIONI DI VENDITA"));
    // l'esclusione è una scelta, non un errore: nessun avviso
    expect(screen.queryByText(/foto-interna/)).toBeNull();
  }finally{download.restore();}
});
it("v19: «Prepara email» diretto applica la stessa selezione degli allegati",async()=>{
  state.attachments=[
    {id:11,fileName:"disegno-cliente.png",mimeType:"image/png",dataBase64:PNG_B64,includeInPdf:true},
    {id:12,fileName:"foto-interna.png",mimeType:"image/png",dataBase64:PNG_B64,includeInPdf:false},
  ];
  state.stubAttachments=true;
  mount({...blankQuote(),stato_preventivo:'completo',numero_preventivo:'DDC00042/2026',cliente:'Cliente prova',totale_finale:40,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}]});
  const button=await screen.findByRole('button',{name:'Prepara email (PDF da allegare)'});
  const download=mockPdfDownload();
  try{
    fireEvent.click(button);
    await screen.findByText(/Allega manualmente il file nel programma di posta/);
    await waitFor(()=>expect(download.files).toHaveLength(1));
    expect(state.attachmentGets).toEqual([11]);
    const text=await download.textOf(0);
    expect(text).toContain("Allegato: disegno-cliente.png");
    expect(text).not.toContain("Allegato: foto-interna.png");
    expect(text.indexOf("Allegato: disegno-cliente.png")).toBeLessThan(text.indexOf("CONDIZIONI DI VENDITA"));
  }finally{download.restore();}
});
it("v19: con nessun allegato selezionato il PDF esce senza pagine allegato e senza avvisi",async()=>{
  state.attachments=[
    {id:11,fileName:"disegno-cliente.png",mimeType:"image/png",dataBase64:PNG_B64,includeInPdf:false},
    {id:12,fileName:"foto-interna.png",mimeType:"image/png",dataBase64:PNG_B64,includeInPdf:false},
  ];
  state.stubAttachments=true;
  mount({...blankQuote(),stato_preventivo:'completo',numero_preventivo:'DDC00042/2026',cliente:'Cliente prova',totale_finale:40,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',prezzo_serie:10,quantita:2,prezzo_netto_unitario_finale:10,totale_finale:20}]});
  await screen.findByRole('button',{name:'Esporta PDF cliente'});
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
    expect(state.attachmentGets).toEqual([]);
    expect(state.attachmentFiles).toBeNull();
    const text=await download.textOf(0);
    expect(text).not.toContain("Allegato:");
    expect(text).toContain("CONDIZIONI DI VENDITA");
    expect(screen.queryByRole("alert")).toBeNull();
  }finally{download.restore();}
});

// v20: «Consegna stimata (settimane)» — campo numerico intero facoltativo in
// testata, su desktop e nel wizard mobile; salvato con la revisione.
it("saves the estimated delivery weeks with the draft and finds them on reopen",{timeout:20000},async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza"});
  const field=await screen.findByLabelText("Consegna stimata (settimane)") as HTMLInputElement;
  // i decimali sono rifiutati: la bozza resta vuota
  fireEvent.change(field,{target:{value:"4,5"}});
  expect(field.value).toBe("");
  fireEvent.change(field,{target:{value:"4"}});
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.consegna_settimane).toBe(4);
  // riapertura: il valore salvato si ritrova nel campo
  cleanup();
  mount(saved);
  const reopened=await screen.findByLabelText("Consegna stimata (settimane)") as HTMLInputElement;
  expect(reopened.value).toBe("4");
});

it("never stores 0 as delivery weeks: the draft is rejected and the saved value stays null",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza"});
  const field=await screen.findByLabelText("Consegna stimata (settimane)") as HTMLInputElement;
  fireEvent.change(field,{target:{value:"0"}});
  fireEvent.blur(field);
  expect(field.value).toBe("");
  // nessuna modifica reale → il salvataggio resta disabilitato
  expect((screen.getByRole("button",{name:"Salva bozza"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Cliente *"),{target:{value:"Cliente nuovo"}});
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.consegna_settimane).toBeNull();
});

it("offers the delivery weeks step in the mobile wizard, optional and persistent",{timeout:20000},async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza"},true);
  await screen.findByTestId("quote-mobile-wizard");
  fireEvent.click(screen.getByRole("button",{name:"Avanti"})); // cliente → consegna
  expect(screen.getByRole("heading",{name:"Consegna stimata (settimane)"})).toBeTruthy();
  const input=document.getElementById("wizard-input") as HTMLInputElement;
  // facoltativo: il passo non blocca mai l'avanzamento
  fireEvent.change(input,{target:{value:"4,5"}});
  expect(input.value).toBe("");
  fireEvent.change(input,{target:{value:"4"}});
  expect(input.value).toBe("4");
  // il valore sopravvive alla navigazione Indietro/Avanti
  fireEvent.click(screen.getByRole("button",{name:"Indietro"}));
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Consegna stimata (settimane)"})).toBeTruthy();
  expect((document.getElementById("wizard-input") as HTMLInputElement).value).toBe("4");
});

// v22: «consegna_settimane» è un dato di testata NON economico anche nel
// wizard mobile (sul desktop lo è già): cambiarla non deve attivare il
// ricalcolo, che riscriverebbe gli importi storici salvati.
it("v22: dal wizard mobile la sola consegna stimata non ricalcola gli importi storici",{timeout:20000},async()=>{
  // importi salvati diversi da quelli che produrrebbe un ricalcolo
  // (ricalcolo: 10 € × 2 pz = 20,00 €; storico: 37,125 €/pz, 74,25 € totali)
  const historical={...blankQuote(),cliente:"Cliente storico",stato_preventivo:"completo",totale_finale:74.25,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:"FCA00504HBIN",descrizione:"Serie storica",quantita:2,prezzo_serie:10,prezzo_netto_unitario_finale:37.125,totale_finale:74.25}]};
  mount(historical,true);
  await screen.findByTestId("quote-mobile-wizard");
  // storico bloccato: lo sblocco è nel riepilogo finale
  for(let i=0;i<15&&!screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  fireEvent.click(screen.getByRole("button",{name:"Modifica preventivo"}));
  // torna al passo «Consegna stimata» e cambia SOLO quello
  for(let i=0;i<15&&!screen.queryByRole("heading",{name:"Consegna stimata (settimane)"});i++)fireEvent.click(screen.getByRole("button",{name:"Indietro"}));
  const input=document.getElementById("wizard-input") as HTMLInputElement;
  fireEvent.change(input,{target:{value:"4"}});
  expect(input.value).toBe("4");
  // avanti fino al riepilogo: il totale resta quello storico (nessuna anteprima di ricalcolo a 20,00 €)
  for(let i=0;i<15&&!screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("74,25");
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveRevision")!.input.dataJson);
  expect(saved.consegna_settimane).toBe(4);
  expect(saved.totale_finale).toBe(74.25);
  expect(saved.prodotti).toEqual(historical.prodotti);
  // riapertura: importi intatti ed export dal wizard con la dicitura esatta
  cleanup();state.calls=[];
  mount(saved,true);
  await screen.findByTestId("quote-mobile-wizard");
  for(let i=0;i<15&&!screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("74,25");
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole("button",{name:"Esporta PDF cliente"}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
    const pdfText=await download.textOf(0);
    expect(pdfText).toContain("Consegna stimata: 4 settimane dalla conferma scritta");
    // prezzi storici nel PDF: unitario 37,125 reso a 2 decimali, totali 74,25
    // (la conservazione esatta degli importi è verificata sul payload salvato)
    expect(pdfText).toContain("37,13");
    expect(pdfText).toContain("74,25");
    expect(state.calls).toHaveLength(0); // l'export non scrive nulla
  }finally{download.restore();}
});

// v22: guardia contro la correzione eccessiva — una modifica a un dato
// economico reale (costo del materiale) deve continuare ad attivare il
// ricalcolo anche dal wizard mobile.
it("v22: dal wizard una modifica effettiva al costo continua ad attivare il ricalcolo",{timeout:20000},async()=>{
  const historical={...blankQuote(),cliente:"Cliente storico",stato_preventivo:"completo",lavoro_modalita:"per_prodotto",totale_finale:74.25,
    prodotti:[{...blankProduct(),descrizione:"Lavorazione storica",gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro",oggetto_modifica:["occhio"],quantita:2,materiale_cad:2.11,lavoro_h:1,prezzo_netto_unitario_finale:37.125,totale_finale:74.25}]};
  mount(historical,true);
  await screen.findByTestId("quote-mobile-wizard");
  for(let i=0;i<25&&!screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  fireEvent.click(screen.getByRole("button",{name:"Modifica preventivo"}));
  // torna al passo del costo materiale e alza il costo da 2,11 a 5 €/pz
  for(let i=0;i<25&&!screen.queryByRole("heading",{name:"Costo materiale per pezzo"});i++)fireEvent.click(screen.getByRole("button",{name:"Indietro"}));
  const input=screen.getByLabelText("Materiale €/pz") as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input,{target:{value:"5"}});
  fireEvent.blur(input);
  // al riepilogo l'anteprima mostra il ricalcolo, non più il totale storico
  for(let i=0;i<25&&!screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByLabelText("Totale preventivo").textContent).not.toContain("74,25");
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveRevision")!.input.dataJson);
  // gli importi salvati sono quelli del ricalcolo, non quelli storici divergenti
  const expected=calculateQuote({...historical,prodotti:[{...historical.prodotti[0],materiale_cad:5}]}).totale_finale;
  expect(expected).not.toBe(74.25);
  expect(saved.totale_finale).toBeCloseTo(expected,6);
  expect(saved.prodotti[0].materiale_cad).toBe(5);
  expect(saved.prodotti[0].prezzo_netto_unitario_finale).not.toBe(37.125);
});

// v23: caso DDC90020/2026 — codice articolo digitato con il RAL «cotto»
// (VBCD091Z03IO7035) mentre il documento ha RAL 9010 liscio selezionato.
// Lo storico salvato ha il supplemento a 0 (il motore non ricarica i codici
// già verniciati): la riga va corretta alla finitura standard.
const v23Ral={color:"9010",textured:false};
const v23DDC90020=()=>calculateQuote({...blankQuote(),cliente:"Cliente DDC90020",stato_preventivo:"completo",verniciatura_ral:v23Ral,
  prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:"VBCD091Z03IO7035",descrizione:"Valvola a sfera",quantita:8,prezzo_serie:17.5}]});
const v23Warning="Il codice inserito è già in RAL 7035. Inserisci il codice con finitura standard. DDCost lo convertirà in RAL 9010 e calcolerà il relativo supplemento";
const v23RowError=/correggi il codice articolo della riga 1 \(VBCD091Z03IO7035\)/;
const v23Line=(text:string)=>screen.getByText((_,el)=>el?.tagName==="P"&&el.textContent===text);

it("v23: caso DDC90020 — storico intatto all'apertura, correzione guidata, supplemento dal motore e una sola volta dopo salvataggio e riapertura",{timeout:30000},async()=>{
  const stored=v23DDC90020();
  expect(stored.totale_finale).toBe(140); // codice cotto: nessun supplemento
  mount(stored);
  // apertura: codice e prezzi storici conservati, nessuna scrittura automatica
  const input=await screen.findByLabelText(/Codice articolo/) as HTMLInputElement;
  expect(input.value).toBe("VBCD091Z03IO7035");
  expect(screen.getByText(v23Warning)).toBeTruthy();
  expect(screen.getByText("Supplemento RAL da calcolare")).toBeTruthy();
  expect((screen.getByRole("button",{name:"Usa VBCD091Z03IN"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("140,00");
  expect(state.calls).toHaveLength(0);
  // export, email e copia sono bloccati finché la riga non è corretta
  const blocked=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole("button",{name:"Esporta PDF cliente"}));
    await screen.findByText(v23RowError);
    fireEvent.click(screen.getByRole("button",{name:"Prepara email (PDF da allegare)"}));
    fireEvent.click(screen.getByRole("button",{name:"Copia per email / documento"}));
    expect(blocked.files).toHaveLength(0);
  }finally{blocked.restore();}
  // correzione guidata dal pulsante «Usa …»
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));
  fireEvent.click(screen.getByRole("button",{name:"Usa VBCD091Z03IN"}));
  expect(input.value).toBe("VBCD091Z03IN");
  expect(screen.getByText("Codice nel PDF cliente: VBCD091Z03IO9010")).toBeTruthy();
  expect(v23Line("+50% per RAL · +8,75 €/pz · Prezzo finale: 26,25 €/pz")).toBeTruthy();
  expect(v23Line("Totale riga: 210,00\u00A0€")).toBeTruthy();
  expect(screen.queryByText("Supplemento RAL da calcolare")).toBeNull();
  // salvataggio definitivo: importi dal motore, cambio colore voce unica
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveRevision")!.input.dataJson);
  expect(saved.prodotti[0]).toMatchObject({codice:"VBCD091Z03IN",netto_prima_ral:17.5,ral_percentuale:50,ral_ricarico_cad:8.75,prezzo_netto_unitario_finale:26.25,totale_finale:210});
  expect(saved.totale_finale).toBe(260);
  expect(saved.ral_riepilogo.fixed).toBe(50);
  expect(saved.ral_riepilogo.rows).toHaveLength(1);
  // riapertura: il supplemento è conteggiato una sola volta
  cleanup();state.calls=[];
  mount(saved);
  const reopened=await screen.findByLabelText(/Codice articolo/) as HTMLInputElement;
  expect(reopened.value).toBe("VBCD091Z03IN");
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("260,00");
  expect(v23Line("+50% per RAL · +8,75 €/pz · Prezzo finale: 26,25 €/pz")).toBeTruthy();
  expect(screen.getByText("Codice nel PDF cliente: VBCD091Z03IO9010")).toBeTruthy();
  expect(state.calls).toHaveLength(0);
  // export ed email producono lo stesso PDF, con codice convertito e importi attesi
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole("button",{name:"Esporta PDF cliente"}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
    fireEvent.click(screen.getByRole("button",{name:"Prepara email (PDF da allegare)"}));
    await waitFor(()=>expect(download.files).toHaveLength(2));
    const exportText=await download.textOf(0),emailText=await download.textOf(1);
    expect(emailText).toBe(exportText);
    expect(exportText).toContain("VBCD091Z03IO9010");
    expect(exportText).toContain("26,2500");
    expect(exportText).toContain("210,00");
    expect(exportText).toContain("Cambio colore (una volta per ordine)");
    expect(exportText).not.toContain("(già RAL)");
    expect(state.calls).toHaveLength(0);
  }finally{download.restore();}
});

it("v23: con il codice RAL cotto la bozza si salva, il completamento è bloccato e indica la riga",{timeout:20000},async()=>{
  mount({...v23DDC90020(),stato_preventivo:"bozza"});
  await screen.findByLabelText(/Codice articolo/);
  expect(screen.getByText(v23Warning)).toBeTruthy();
  // bozza: consentita, il codice resta quello digitato
  fireEvent.change(screen.getByLabelText(/Descrizione/),{target:{value:"Valvola a sfera DN25"}});
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const draft=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(draft.prodotti[0].codice).toBe("VBCD091Z03IO7035");
  // completamento: bloccato, l'errore nomina la riga da correggere
  fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
  await screen.findByText(v23RowError);
  expect(state.calls.some(c=>c.path==="quote.finalizeDraft")).toBe(false);
  // export da bozza: comportamento esistente invariato (pulsante disabilitato)
  expect((screen.getByRole("button",{name:"Esporta PDF cliente"}) as HTMLButtonElement).disabled).toBe(true);
});

it("v23: wizard — avviso al passo codice, completamento bloccato fino alla correzione, supplemento nel riepilogo",{timeout:30000},async()=>{
  mount(v23DDC90020(),true);
  await screen.findByTestId("quote-mobile-wizard");
  for(let i=0;i<15&&!screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  // la riga da correggere è segnalata nel riepilogo
  expect(screen.getByText("Supplemento RAL da calcolare")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Modifica preventivo"}));
  // completamento bloccato: si torna al passo del codice con l'errore sulla riga
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await screen.findByRole("heading",{name:"Codice articolo"});
  expect(screen.getByText(v23RowError)).toBeTruthy();
  expect(screen.getByText(v23Warning)).toBeTruthy();
  expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(false);
  // correzione guidata dal pulsante
  fireEvent.click(screen.getByRole("button",{name:"Usa VBCD091Z03IN"}));
  expect((document.getElementById("wizard-input") as HTMLInputElement).value).toBe("VBCD091Z03IN");
  expect(screen.getByText("Codice nel PDF cliente: VBCD091Z03IO9010")).toBeTruthy();
  // riepilogo: dettaglio dal motore e salvataggio corretto
  for(let i=0;i<15&&!screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(v23Line("+50% per RAL · +8,75 €/pz")).toBeTruthy();
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("260,00");
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveRevision")!.input.dataJson);
  expect(saved.prodotti[0]).toMatchObject({codice:"VBCD091Z03IN",ral_percentuale:50,ral_ricarico_cad:8.75,prezzo_netto_unitario_finale:26.25,totale_finale:210});
  expect(saved.totale_finale).toBe(260);
});

it("v23: RAL attivato o cambiato dopo l'inserimento dell'articolo, e RAL digitato uguale a quello di testata",{timeout:20000},async()=>{
  const base=()=>({...blankQuote(),cliente:"Cliente",stato_preventivo:"bozza",prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:"VBCD091Z03IN",descrizione:"Valvola a sfera",quantita:8,prezzo_serie:17.5}]});
  mount(base());
  await screen.findByLabelText(/Codice articolo/);
  expect(screen.queryByText(/Codice nel PDF cliente/)).toBeNull();
  // RAL attivato dopo l'inserimento: anteprima codice PDF e supplemento subito
  fireEvent.click(screen.getByRole("checkbox",{name:"RAL"}));
  expect(screen.getByText("Codice nel PDF cliente: VBCD091Z03IO9010")).toBeTruthy();
  expect(v23Line("+50% per RAL · +8,75 €/pz · Prezzo finale: 26,25 €/pz")).toBeTruthy();
  // finitura cambiata in goffrato: aliquota del ruvido
  fireEvent.click(screen.getByRole("checkbox",{name:"Goffrato"}));
  expect(v23Line("+100% per RAL · +17,50 €/pz · Prezzo finale: 35,00 €/pz")).toBeTruthy();
  cleanup();
  // RAL digitato coincidente con quello di testata: stesso avviso e correzione
  mount({...base(),prodotti:[{...base().prodotti[0],codice:"VBCD091Z03IO9010"}]});
  await screen.findByLabelText(/Codice articolo/);
  expect(screen.queryByText(/già in RAL/)).toBeNull();
  fireEvent.click(screen.getByRole("checkbox",{name:"RAL"}));
  expect(screen.getByText("Il codice inserito è già in RAL 9010. Inserisci il codice con finitura standard. DDCost lo convertirà in RAL 9010 e calcolerà il relativo supplemento")).toBeTruthy();
  expect(screen.getByRole("button",{name:"Usa VBCD091Z03IN"})).toBeTruthy();
  expect(screen.getByText("Supplemento RAL da calcolare")).toBeTruthy();
});

it("v23: anche per un prodotto speciale il codice RAL cotto è segnalato e bloccante fino alla correzione",{timeout:20000},async()=>{
  const stored=calculateQuote({...blankQuote(),cliente:"Cliente",stato_preventivo:"completo",lavoro_modalita:"per_prodotto",verniciatura_ral:v23Ral,
    prodotti:[{...blankProduct(),codice:"VBCD091Z03IO7035",descrizione:"Bandella speciale",gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro",oggetto_modifica:["occhio"],quantita:2,materiale_cad:2.11,lavoro_h:1}]});
  mount(stored);
  const input=await screen.findByLabelText("Codice articolo") as HTMLInputElement;
  expect(input.value).toBe("VBCD091Z03IO7035");
  expect(screen.getByText(v23Warning)).toBeTruthy();
  expect(screen.getByText("Supplemento RAL da calcolare")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));
  // salvataggio definitivo bloccato finché la riga non è corretta
  fireEvent.change(input,{target:{value:"VBCD091Z03IO7036"}});
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await screen.findByText(/correggi il codice articolo della riga 1 \(VBCD091Z03IO7036\)/);
  expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(false);
  // correzione col pulsante e salvataggio
  fireEvent.click(screen.getByRole("button",{name:"Usa VBCD091Z03IN"}));
  expect(input.value).toBe("VBCD091Z03IN");
  expect(screen.getByText("Codice nel PDF cliente: VBCD091Z03IO9010")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveRevision")!.input.dataJson);
  expect(saved.prodotti[0].codice).toBe("VBCD091Z03IN");
  expect(saved.prodotti[0].ral_percentuale).toBe(50);
});

// v24: quattro rilievi sul controllo RAL v23 — nylon escluso a prescindere,
// pulsante «Usa …» solo se la conversione è effettiva, motivi di esclusione
// sotto la riga (forfait incluso) su desktop e nel wizard.
it("v24: nylon con RAL cotto — nessun blocco né pulsante, motivo di esclusione, salvataggio ed export consentiti",{timeout:30000},async()=>{
  const stored=calculateQuote({...blankQuote(),cliente:"Cliente nylon",stato_preventivo:"completo",verniciatura_ral:v23Ral,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:"LRNG211605NO7035",descrizione:"Larghetta nylon",quantita:2,prezzo_serie:10}]});
  expect(stored.prodotti[0].ral_percentuale).toBe(0); // il motore applica correttamente lo 0%
  expect(stored.totale_finale).toBe(20);
  mount(stored);
  const input=await screen.findByLabelText(/Codice articolo/) as HTMLInputElement;
  expect(input.value).toBe("LRNG211605NO7035");
  expect(screen.queryByText(/già in RAL/)).toBeNull();
  expect(screen.queryByText("Supplemento RAL da calcolare")).toBeNull();
  expect(screen.queryByRole("button",{name:/^Usa /})).toBeNull();
  expect(screen.queryByText(/Codice nel PDF cliente/)).toBeNull();
  expect(v23Line("Supplemento RAL non applicabile: nylon")).toBeTruthy();
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("20,00");
  // export PDF consentito
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole("button",{name:"Esporta PDF cliente"}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
  }finally{download.restore();}
  // salvataggio definitivo consentito: la riga resta nylon a 0%
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));
  fireEvent.change(screen.getByLabelText(/Descrizione/),{target:{value:"Larghetta nylon 35mm"}});
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveRevision")!.input.dataJson);
  expect(saved.prodotti[0]).toMatchObject({codice:"LRNG211605NO7035",ral_percentuale:0,ral_ricarico_cad:0,prezzo_netto_unitario_finale:10,totale_finale:20});
});

it("v24: riga a forfait — motivo di esclusione su desktop e nel wizard, riga di serie invariata, nessun blocco",{timeout:30000},async()=>{
  const doc=()=>calculateQuote({...blankQuote(),cliente:"Cliente forfait",stato_preventivo:"completo",verniciatura_ral:v23Ral,
    prodotti:[
      {...blankProduct(),prodotto_di_serie:true,codice:"VBCD091Z03IN",descrizione:"Valvola a sfera",quantita:8,prezzo_serie:17.5},
      {...blankProduct(),a_forfait:true,descrizione:"Gestione ordine",valore_forfait:100},
    ]});
  const stored=doc();
  expect(stored.totale_finale).toBe(360); // 210 + 50 cambio colore + 100 forfait
  mount(stored);
  await screen.findByLabelText(/Codice articolo/);
  expect(v23Line("+50% per RAL · +8,75 €/pz · Prezzo finale: 26,25 €/pz")).toBeTruthy();
  expect(v23Line("Supplemento RAL non applicabile: riga a forfait")).toBeTruthy();
  expect(screen.queryByText("Supplemento RAL da calcolare")).toBeNull();
  expect(screen.getByLabelText("Totale preventivo").textContent).toContain("360,00");
  // export e salvataggio consentiti
  const download=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole("button",{name:"Esporta PDF cliente"}));
    await waitFor(()=>expect(download.files).toHaveLength(1));
  }finally{download.restore();}
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));
  fireEvent.change(screen.getAllByLabelText(/Descrizione/)[0],{target:{value:"Valvola a sfera DN25"}});
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveRevision")!.input.dataJson);
  expect(saved.prodotti[0]).toMatchObject({codice:"VBCD091Z03IN",ral_percentuale:50});
  expect(saved.prodotti[1]).toMatchObject({a_forfait:true,valore_forfait:100});
  expect(saved.totale_finale).toBe(360);
  cleanup();state.calls=[];
  // wizard: stessa dicitura nel riepilogo, nessun blocco RAL
  mount(doc(),true);
  await screen.findByTestId("quote-mobile-wizard");
  for(let i=0;i<15&&!screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(v23Line("+50% per RAL · +8,75 €/pz")).toBeTruthy();
  expect(v23Line("Supplemento RAL non applicabile: riga a forfait")).toBeTruthy();
  expect(screen.queryByText("Supplemento RAL da calcolare")).toBeNull();
  expect(screen.queryByText(/correggi il codice articolo/)).toBeNull();
});

it("v24: codice con trattino — avviso senza pulsante, riga da calcolare, blocchi attivi fino alla correzione manuale",{timeout:30000},async()=>{
  const stored=calculateQuote({...blankQuote(),cliente:"Cliente trattino",stato_preventivo:"completo",verniciatura_ral:v23Ral,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:"VBCD091-03IO7035",descrizione:"Valvola a sfera",quantita:8,prezzo_serie:17.5}]});
  mount(stored);
  const input=await screen.findByLabelText(/Codice articolo/) as HTMLInputElement;
  expect(input.value).toBe("VBCD091-03IO7035");
  expect(screen.getByText(v23Warning)).toBeTruthy();
  expect(screen.getByText("Supplemento RAL da calcolare")).toBeTruthy();
  // nessun pulsante: «VBCD091-03IN» non sarebbe convertito nel PDF
  expect(screen.queryByRole("button",{name:/^Usa /})).toBeNull();
  expect(screen.queryByText(/Codice nel PDF cliente/)).toBeNull();
  const rowError=/correggi il codice articolo della riga 1 \(VBCD091-03IO7035\)/;
  // export bloccato
  const blocked=mockPdfDownload();
  try{
    fireEvent.click(screen.getByRole("button",{name:"Esporta PDF cliente"}));
    await screen.findByText(rowError);
    expect(blocked.files).toHaveLength(0);
  }finally{blocked.restore();}
  // salvataggio definitivo bloccato finché l'operatore non corregge a mano
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await screen.findByText(rowError);
  expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(false);
  // correzione manuale al codice standard valido: supplemento dal motore e salvataggio
  fireEvent.change(input,{target:{value:"VBCD091Z03IN"}});
  expect(screen.getByText("Codice nel PDF cliente: VBCD091Z03IO9010")).toBeTruthy();
  expect(v23Line("+50% per RAL · +8,75 €/pz · Prezzo finale: 26,25 €/pz")).toBeTruthy();
  expect(screen.queryByText("Supplemento RAL da calcolare")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Salva nuova versione"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveRevision")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveRevision")!.input.dataJson);
  expect(saved.prodotti[0]).toMatchObject({codice:"VBCD091Z03IN",ral_percentuale:50,ral_ricarico_cad:8.75,prezzo_netto_unitario_finale:26.25,totale_finale:210});
});

it("opens the selected revision as an independent editable quote and saves only the copy",async()=>{
  const issued={sequence:42,family:"FP",material:"B",color:null,code:"TFP0000042BZ"};
  const original={...blankQuote(),numero_preventivo:"DDC00080/2026",rev:4,root_id:8,
    stato_preventivo:"completo",esito_commerciale:"vinto",consegna_settimane:4,
    attachments:[{fileName:"cliente-originale.pdf"}],prodotti:[
      {...blankProduct(),descrizione:"Staffa",materiale_prodotto:"ottone",codice:issued.code,codice_temporaneo:issued},
      {...blankProduct(),descrizione:"Montaggio",a_forfait:true,valore_forfait:30}]};
  const json=JSON.stringify(original);
  state.data={id:10,rev:4,client:"Cliente originale",reference:"INT123",dataJson:json};
  mountNew(false,"/preventivi/new?duplica=10");
  expect((await screen.findAllByLabelText("Descrizione *")).map(field=>(field as HTMLInputElement).value)).toEqual(["Staffa","Montaggio"]);
  fireEvent.change(screen.getByLabelText("Cliente *"),{target:{value:"Nuovo cliente"}});
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(call=>call.path==="quote.saveDraft")).toBe(true));
  const call=state.calls.find(call=>call.path==="quote.saveDraft")!;
  expect(call.input.sourceId).toBeUndefined();
  const copy=JSON.parse(call.input.dataJson);
  expect(copy).toMatchObject({cliente:"Nuovo cliente",riferimento_preventivo:"INT123",consegna_settimane:4,attachments:[],stato_preventivo:"bozza"});
  for(const key of ["numero_preventivo","root_id","rev","esito_commerciale"])expect(copy).not.toHaveProperty(key);
  expect(copy.prodotti).toEqual(original.prodotti);
  expect(state.data.dataJson).toBe(json);
});

it("does not open a blank editor when the requested source is missing",async()=>{
  mountNew(true,"/preventivi/new?duplica=999");
  expect((await screen.findByRole("alert")).textContent).toContain("Preventivo da duplicare non trovato");
  expect(screen.queryByRole("button",{name:"Salva bozza"})).toBeNull();
});
