// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { blankProduct, blankQuote, calculateQuote } from "../lib/quote-calculation";
const state=vi.hoisted(()=>({data:null as any,groups:[] as Array<{id:number;name:string}>,calls:[] as Array<{path:string;input:any}>}));
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
  state.data=null;state.calls=[];state.groups=[];window.localStorage.clear();vi.stubGlobal("confirm",vi.fn(()=>true));
  vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));
  Element.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("protects a generated brass prefix when editing and saving its custom finish",async()=>{
  const generated={sequence:42,family:"FP",material:"B",color:null,code:"TFP0000042Ba"};
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),materiale_prodotto:"ottone",codice:generated.code,codice_temporaneo:generated}]});
  const input=await screen.findByLabelText("Codice articolo") as HTMLInputElement;
  fireEvent.change(input,{target:{value:""}});expect(input.value).toBe(generated.code);
  fireEvent.change(input,{target:{value:"TFP0000042Bz"}});
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti[0].codice).toBe("TFP0000042Bz");expect(saved.prodotti[0].codice_temporaneo).toEqual(generated);
});
it("saves the standard black finish separately for each product without changing prices",async()=>{
  const doc=calculateQuote({...blankQuote(),stato_preventivo:"bozza",prodotti:[0,1].map(()=>({...blankProduct(),materiale_cad:10}))});
  mount(doc);
  const checkboxes=await screen.findAllByRole("checkbox",{name:"Nero standard RAL 9005 goffrato"});
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
    fireEvent.change(screen.getByRole("textbox"),{target:{value}});
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
  for(let i=0;i<3;i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  const input=screen.getByRole("textbox") as HTMLInputElement;
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
  // Client, labor mode, common hours, description, then modification selection.
  for(let i=0;i<4;i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
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
  fireEvent.click(await screen.findByRole("checkbox",{name:"A forfait"}));
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
  const toggle=await screen.findByRole("checkbox",{name:"A forfait"}) as HTMLInputElement;
  expect(toggle.checked).toBe(true);expect(toggle.disabled).toBe(true);
  expect((screen.getByLabelText("Valore di vendita a forfait € *") as HTMLInputElement).value).toBe("125,50");
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));fireEvent.click(toggle);
  expect((screen.getByLabelText("Materiale €/pz") as HTMLInputElement).value).toBe("12,34");
  expect(screen.queryByLabelText("Valore di vendita a forfait € *")).toBeNull();
});
it("keeps standard fields on mixed quotes while showing only the forfait amount on its row",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),a_forfait:true,descrizione:"Forfait",valore_forfait:200},blankProduct()]});
  const toggles=await screen.findAllByRole("checkbox",{name:"A forfait"}) as HTMLInputElement[];
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
  for(let i=0;i<3;i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  fireEvent.click(screen.getByRole("checkbox",{name:"A forfait"}));
  expect(screen.getByRole("heading",{name:"Che prodotto vuoi preventivare?"})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Genera codice temporaneo"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Valore di vendita a forfait (€)"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("alert").textContent).toContain("valore di vendita");
  const amount=screen.getByRole("textbox");fireEvent.change(amount,{target:{value:"250"}});fireEvent.blur(amount);
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
  fireEvent.click(screen.getByRole("checkbox",{name:"Goffrato — nero standard RAL 9005 (tutti i prodotti)"}));
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
  const bulk=await screen.findByRole("checkbox",{name:"Goffrato — nero standard RAL 9005 (tutti i prodotti)"}) as HTMLInputElement;
  fireEvent.click(bulk);
  const rows=screen.getAllByRole("checkbox",{name:"Nero standard RAL 9005 goffrato"}) as HTMLInputElement[];
  expect(rows).toHaveLength(2);expect(rows.every(c=>c.checked)).toBe(true);
  fireEvent.click(rows[1]);expect(bulk.indeterminate).toBe(true);
  expect(screen.getByText(/Finiture diverse/)).toBeTruthy();
  const ral=screen.getByRole("checkbox",{name:"Verniciatura RAL sul netto cliente"});
  fireEvent.click(ral);expect(screen.queryByRole("checkbox",{name:"Goffrato — nero standard RAL 9005 (tutti i prodotti)"})).toBeNull();
  fireEvent.click(ral);
  expect((screen.getByRole("checkbox",{name:"Goffrato — nero standard RAL 9005 (tutti i prodotti)"}) as HTMLInputElement).indeterminate).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti.map((p:any)=>p.nero_standard_goffrato)).toEqual([true,false,false]);
  expect(calculateQuote(saved).totale_finale).toBe(d.totale_finale);
});
it("exposes the black textured bulk choice in the mobile wizard without enabling RAL",async()=>{
  mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Bandella",gruppo_merceologico:"Bandelle",materiale_prodotto:"ferro",oggetto_modifica:["occhio"]}]},true);
  const bulk=await screen.findByRole("checkbox",{name:"Goffrato — nero standard RAL 9005 (tutti i prodotti)"});
  fireEvent.click(bulk);
  expect((screen.getByRole("checkbox",{name:"Verniciatura RAL sul netto cliente"}) as HTMLInputElement).checked).toBe(false);
  for(let i=0;i<30 && !screen.queryByRole("heading",{name:"Riepilogo finale"});i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
  expect(screen.getByRole("heading",{name:"Riepilogo finale"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.saveDraft")).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==="quote.saveDraft")!.input.dataJson);
  expect(saved.prodotti[0].nero_standard_goffrato).toBe(true);expect(saved.verniciatura_ral).toBeFalsy();
});

it("completes, reopens and edits a series product with only code, description, quantity and price",async()=>{
 mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),materiale_cad:12.34,lavoro_h:16}]});
 fireEvent.click(await screen.findByRole("checkbox",{name:"Prodotto di serie"}));
 expect(screen.queryByLabelText("Materiale *")).toBeNull();
 expect(screen.queryByRole("group",{name:"Oggetto della modifica *"})).toBeNull();
 expect(screen.queryByText("Attribuzione dei costi comuni")).toBeNull();
 expect(screen.queryByRole("button",{name:"Genera codice temporaneo"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
 expect(screen.getByRole("alert").textContent).toContain("codice articolo");
 fireEvent.change(screen.getByLabelText("Codice articolo *"),{target:{value:"STD-123"}});
 fireEvent.change(screen.getByLabelText("Descrizione *"),{target:{value:"Articolo di serie"}});
 fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
 expect(screen.getByRole("alert").textContent).toContain("prezzo unitario");
 for(const [name,value] of [["Quantità *","10"],["Prezzo unitario €/pz *","12,50"]]){
  const input=screen.getByLabelText(name);fireEvent.focus(input);fireEvent.change(input,{target:{value}});fireEvent.blur(input);
 }
 fireEvent.click(screen.getByRole("button",{name:"Completa preventivo"}));
 await waitFor(()=>expect(state.calls.some(c=>c.path==="quote.finalizeDraft")).toBe(true));
 const saved=JSON.parse(state.calls.find(c=>c.path==="quote.finalizeDraft")!.input.dataJson);
 expect(saved.totale_finale).toBe(125);expect(saved.prodotti[0]).toMatchObject({prodotto_di_serie:true,prezzo_serie:12.5,quantita:10,materiale_cad:12.34,lavoro_h:16});
 cleanup();mount(saved);
 const toggle=await screen.findByRole("checkbox",{name:"Prodotto di serie"}) as HTMLInputElement;
 expect(toggle.checked).toBe(true);expect(toggle.disabled).toBe(true);
 expect((screen.getByLabelText("Prezzo unitario €/pz *") as HTMLInputElement).value).toBe("12,50");
 fireEvent.click(screen.getByRole("button",{name:"Modifica"}));fireEvent.click(toggle);
 expect((screen.getByLabelText("Materiale €/pz") as HTMLInputElement).value).toBe("12,34");
 fireEvent.click(screen.getByRole("checkbox",{name:"A forfait"}));
 fireEvent.click(toggle);
 expect((screen.getByRole("checkbox",{name:"A forfait"}) as HTMLInputElement).checked).toBe(false);
 expect((screen.getByLabelText("Prezzo unitario €/pz *") as HTMLInputElement).value).toBe("12,50");
 fireEvent.click(screen.getByRole("checkbox",{name:"A forfait"}));expect(toggle.checked).toBe(false);
});
it("offers the four series fields in the mobile wizard and keeps price required",async()=>{
 mount({...blankQuote(),stato_preventivo:"bozza",prodotti:[{...blankProduct(),descrizione:"Serie",codice:"STD-1",quantita:10}]},true);
 await screen.findByTestId("quote-mobile-wizard");
 for(let i=0;i<3;i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
 fireEvent.click(screen.getByRole("checkbox",{name:"Prodotto di serie"}));
 expect(screen.queryByRole("button",{name:"Genera codice temporaneo"})).toBeNull();
 for(let i=0;i<3;i++)fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
 expect(screen.getByRole("heading",{name:"Prezzo unitario di vendita (€/pz)"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Avanti"}));expect(screen.getByRole("alert").textContent).toContain("prezzo unitario");
 const price=screen.getByRole("textbox");fireEvent.change(price,{target:{value:"12,50"}});fireEvent.blur(price);
 fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
 expect(screen.getByRole("heading",{name:"Sconto cliente"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Avanti"}));
 expect(screen.getByRole("heading",{name:"Riepilogo finale"})).toBeTruthy();
 expect(screen.getByLabelText("Totale preventivo").textContent).toContain("125,00");
});

it.each([false,true])('copies the selected first product to the end in mobile=%s',async mobile=>{
  mount({...blankQuote(),cliente:'Prova',stato_preventivo:'bozza',prodotti:[{...blankProduct(),descrizione:'Primo',quantita:10},{...blankProduct(),descrizione:'Secondo',quantita:20}]},mobile);
  for(let i=0;i<4&&!screen.queryByRole('button',{name:'Copia prodotto 1'});i++)fireEvent.click(await screen.findByRole('button',{name:'Avanti'}));
  fireEvent.click(await screen.findByRole('button',{name:'Copia prodotto 1'}));
  if(mobile)fireEvent.click(screen.getByRole('button',{name:'Vista completa'}));
  fireEvent.click(screen.getByRole('button',{name:'Salva bozza'}));
  await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.saveDraft')).toBe(true));
  const saved=JSON.parse(state.calls.find(c=>c.path==='quote.saveDraft')!.input.dataJson);
  expect(saved.prodotti.map((p:any)=>p.descrizione)).toEqual(['Primo','Secondo','Primo']);
  expect(saved.prodotti.map((p:any)=>p.quantita)).toEqual([10,20,'']);
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
  fireEvent.click(await screen.findByRole('checkbox',{name:'Verniciatura RAL sul netto cliente'}));
  const input=screen.getByRole('combobox',{name:'Colore RAL'});
  fireEvent.change(input,{target:{value:'Bianco puro'}});
  fireEvent.click(screen.getByRole('option',{name:/RAL 9010.*Bianco puro/}));
  await waitFor(()=>expect(screen.getByLabelText('Totale preventivo').textContent).toContain('146,90'));
  expect(screen.getByText(/Supplemento RAL: \+100%/)).toBeTruthy();
  fireEvent.change(input,{target:{value:'9005'}});expect(screen.getByRole('option',{name:/RAL 9005/})).toBeTruthy();
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
  const write=vi.fn(),popup=vi.spyOn(window,'open').mockReturnValue({document:{open:vi.fn(),write,close:vi.fn()}} as unknown as Window);
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    expect(write).toHaveBeenCalledOnce();
    const html=write.mock.calls[0][0];
    for(const text of ['<strong>FCA00504HBIO6021</strong>','<strong>FSP001012NIO6021</strong>','Spagnolette (Standard)','+100%','120,00'])expect(html).toContain(text);
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
  }finally{popup.mockRestore();}
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
  const write=vi.fn(),popup=vi.spyOn(window,'open').mockReturnValue({document:{open:vi.fn(),write,close:vi.fn()}} as unknown as Window);
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    expect(write).toHaveBeenCalledOnce();expect(write.mock.calls[0][0]).toContain('<html lang="en">');
    expect(write.mock.calls[0][0]).toContain('Total net quotation: € 74.25');
    fireEvent.click(screen.getByRole('button',{name:'Salva e sovrascrivi versione attuale'}));
    await waitFor(()=>expect(state.calls.some(c=>c.path==='quote.update')).toBe(true));
    const saved=JSON.parse(state.calls.find(c=>c.path==='quote.update')!.input.dataJson);
    expect(saved.pdf_in_inglese).toBe(true);expect(saved.totale_finale).toBe(74.25);expect(saved.prodotti).toEqual(historical.prodotti);
    cleanup();mount(saved,mobile);
    expect((await screen.findByRole('checkbox',{name:'Elabora diciture preventivo in inglese'}) as HTMLInputElement).checked).toBe(true);
  }finally{popup.mockRestore();}
});

it.each([false,true])('exports the actual saved revision even when its JSON is stale, English=%s',async english=>{
  mount({...blankQuote(),numero_preventivo:'DDC90007/2026',rev:1,pdf_in_inglese:english,stato_preventivo:'completo',totale_finale:10,
    prodotti:[{...blankProduct(),prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',quantita:1,prezzo_serie:10,prezzo_netto_unitario_finale:10,totale_finale:10}]},false,3);
  await screen.findByRole('heading',{name:'Preventivo DDC90007/2026 — rev. 3'});
  const write=vi.fn(),popup=vi.spyOn(window,'open').mockReturnValue({document:{open:vi.fn(),write,close:vi.fn()}} as unknown as Window);
  try{
    fireEvent.click(screen.getByRole('button',{name:'Esporta PDF cliente'}));
    expect(write).toHaveBeenCalledOnce();
    const html=write.mock.calls[0][0];
    expect(html).toContain(`DDC90007/2026 <span class="quote-revision">— ${english?'Revision':'Revisione'} 3</span>`);
    expect(html).toMatch(/<title>\d{4}_DDC90007_REV\.3\.pdf<\/title>/);
    expect(state.calls).toHaveLength(0);
  }finally{popup.mockRestore();}
});
