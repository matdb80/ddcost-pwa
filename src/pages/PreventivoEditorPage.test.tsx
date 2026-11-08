// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
