// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {createMemoryRouter,RouterProvider} from "react-router";
import type {ReactNode} from "react";
import {emptyCicloEditorModel,emptyRiga,serializeCycleDataJson} from "@/types/cycle";
import {ricalcolaCiclo} from "@/lib/cycle-calculator";
const state=vi.hoisted(()=>({data:null as any,calls:[] as Array<{path:string;input:any}>}));
vi.mock("@/components/Layout",()=>({default:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock("@/components/CycleCostPie",()=>({default:()=>null}));
vi.mock("@/components/FormulaTooltip",()=>({default:()=>null}));
vi.mock("@/components/ui/tooltip",()=>{const Pass=({children}:{children:ReactNode})=><>{children}</>;return {Tooltip:Pass,TooltipContent:Pass,TooltipTrigger:Pass};});
vi.mock("@/providers/trpc",()=>{
  const proxy=(path:string[]):any=>new Proxy({}, {get:(_,key)=>{
    if(key==="useUtils")return ()=>({});
    if(key==="useQuery")return ()=>({data:path.join(".")==="cycle.get"?state.data:undefined,isLoading:false,refetch:async()=>{}});
    if(key==="useMutation")return ()=>({isPending:false,mutate:(input:any)=>state.calls.push({path:path.join("."),input:structuredClone(input)})});
    return proxy([...path,String(key)]);
  }});return {trpc:proxy([])};
});
import Editor from "./CicloEditorPage";
beforeEach(()=>{state.calls=[];vi.stubGlobal("alert",vi.fn());});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("edits hourly rates, saves minute rates, and reopens without changing cycle costs",async()=>{
  const cycle={...emptyCicloEditorModel(),codice:"TEST",descrizione:"Test",lotto:"100",costo_lavoro_min:0.3547,
    righe:[{...emptyRiga(),categoria:"LAVORAZIONE INTERNA" as const,colpi_min:2,considera:true}]};
  state.data={id:123,rootId:123,rev:1,code:"TEST",description:"Test",lot:"100",dataJson:JSON.stringify(serializeCycleDataJson(ricalcolaCiclo(cycle)))};
  const mount=()=>render(<RouterProvider router={createMemoryRouter([{path:"/cicli/:id",element:<Editor/>}],{initialEntries:["/cicli/123"]})}/>);
  const view=mount();
  const input=await screen.findByRole("textbox",{name:"Costo €/h"}) as HTMLInputElement;
  await waitFor(()=>expect(input.value).toBe("21,282"));
  fireEvent.click(screen.getByRole("button",{name:"Modifica"}));
  fireEvent.focus(input);fireEvent.blur(input);
  expect((screen.getByRole("button",{name:"Salva"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.focus(input);fireEvent.change(input,{target:{value:"24,60"}});
  expect(screen.getByText("(0,4100 €/min)")).toBeTruthy();
  fireEvent.blur(input);fireEvent.click(screen.getByRole("button",{name:"Ricalcola"}));
  fireEvent.click(screen.getByRole("button",{name:"Salva"}));
  fireEvent.click(screen.getByRole("button",{name:"Sì, nuova revisione"}));
  expect(vi.mocked(alert).mock.calls).toEqual([]);
  expect(state.calls).toHaveLength(1);
  const saved=JSON.parse(state.calls[0].input.dataJson);
  expect(saved.costo_lavoro_min).toBeCloseTo(0.41,12);
  expect(saved.costo_standard).toBeCloseTo(0.205,12);
  view.unmount();state.data={...state.data,dataJson:JSON.stringify(saved)};mount();
  await waitFor(()=>expect((screen.getByRole("textbox",{name:"Costo €/h"}) as HTMLInputElement).value).toBe("24,60"));
});
