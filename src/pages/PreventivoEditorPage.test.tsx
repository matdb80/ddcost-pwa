// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { blankProduct, blankQuote, calculateQuote } from "../lib/quote-calculation";
const state=vi.hoisted(()=>({data:null as any,calls:[] as Array<{path:string;input:any}>}));
vi.mock("@/components/Layout",()=>({default:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock("@/components/SalesHandoffPanel",()=>({default:()=>null}));
vi.mock("@/components/FormulaTooltip",()=>({default:()=>null}));
vi.mock("@/providers/trpc",()=>{
  const utils={quote:{get:{invalidate:async()=>{}},list:{invalidate:async()=>{}}},productGroup:{list:{invalidate:async()=>{}}}};
  const proxy=(path:string[]):any=>new Proxy({}, {get:(_,key)=>{
    if(key==="useUtils")return ()=>utils;
    if(key==="useQuery")return ()=>({data:path.join(".")==="quote.get"?state.data:[],isLoading:false});
    if(key==="useMutation")return ()=>({isPending:false,mutateAsync:async(input:any)=>{
      state.calls.push({path:path.join("."),input:structuredClone(input)});
      return {id:123};
    }});
    return proxy([...path,String(key)]);
  }});
  return {trpc:proxy([])};
});
import Editor from "./PreventivoEditorPage";
function mount(doc:Record<string,any>,mobile=false){
  state.data={id:123,rev:1,dataJson:JSON.stringify(doc),client:"Cliente prova",reference:"Test"};
  window.localStorage.setItem("ddcost.quote.mobile-view",mobile?"1":"0");
  const router=createMemoryRouter([{path:"/preventivi/:id",element:<Editor/>}],{initialEntries:["/preventivi/123"]});
  return render(<RouterProvider router={router}/>);
}
beforeEach(()=>{
  state.data=null;state.calls=[];window.localStorage.clear();
  vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));
  Element.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
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
