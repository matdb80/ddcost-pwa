// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
const mock=vi.hoisted(()=>({files:[] as any[],calls:[] as {name:string;input:any}[],failReserve:false}));
vi.mock("@/providers/trpc",()=>({trpc:{
  useUtils:()=>({quoteAttachment:{list:{invalidate:async()=>{}}}}),
  quoteAttachment:{
    list:{useQuery:()=>({data:mock.files,isLoading:false})},
    get:{useQuery:({id}:{id:number})=>({data:mock.files.find(f=>f.id===id),isFetching:false})},
    upload:{useMutation:()=>({mutateAsync:async(input:any)=>{mock.calls.push({name:"upload",input});mock.files.push({...input,id:1,mimeType:"image/png",sizeBytes:8});return {id:1,duplicate:false};}})},
  },
  temporaryProduct:{
    reserve:{useMutation:()=>({mutateAsync:async(input:any)=>{mock.calls.push({name:"reserve",input});if(mock.failReserve){mock.failReserve=false;throw new Error("Connessione interrotta");}return {sequence:42,requestKey:input.requestKey};}})},
    complete:{useMutation:()=>({mutateAsync:async(input:any)=>{mock.calls.push({name:"complete",input});return {sequence:42,...input,code:`T${input.family}0000042${input.material}${input.color?"O"+input.color:""}`};}})},
  },
}}));
import QuoteAttachments from "./QuoteAttachments";
import TemporaryProductCode from "./TemporaryProductCode";
beforeEach(()=>{mock.files=[];mock.calls=[];mock.failReserve=false;URL.createObjectURL=vi.fn(()=>"blob:test");URL.revokeObjectURL=vi.fn();});
afterEach(()=>cleanup());
it("creates a draft before uploading, opens image preview, zooms and reopens the attachment",async()=>{
  const ensure=vi.fn(async()=>123);
  render(<QuoteAttachments quoteId={null} ensureQuoteId={ensure}/>);
  const file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],"test.png",{type:"image/png"});
  fireEvent.change(screen.getByLabelText("Seleziona allegati"),{target:{files:[file]}});
  await screen.findByRole("dialog");
  await screen.findByAltText("test.png");
  expect(ensure).toHaveBeenCalledTimes(1);expect(mock.calls[0].input.quoteId).toBe(123);
  expect(mock.calls[0].input.dataBase64).toBe("iVBORw0KGgo=");
  fireEvent.click(screen.getByRole("button",{name:"Aumenta zoom"}));
  expect(screen.getByRole("button",{name:"Ripristina zoom"}).textContent).toBe("125%");
  expect(screen.getByRole("link",{name:"Scarica"}).getAttribute("download")).toBe("test.png");
  fireEvent.click(screen.getByRole("button",{name:"Close"}));
  expect(URL.revokeObjectURL).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Visualizza allegati"}));await screen.findByAltText("test.png");
  expect(mock.calls.filter(c=>c.name==="upload")).toHaveLength(1);
});
it("rejects an empty attachment before creating any draft",async()=>{
  const ensure=vi.fn(async()=>123);render(<QuoteAttachments quoteId={null} ensureQuoteId={ensure}/>);
  fireEvent.change(screen.getByLabelText("Seleziona allegati"),{target:{files:[new File([],"empty.txt")]}});
  await screen.findByRole("alert");expect(ensure).not.toHaveBeenCalled();expect(mock.calls).toHaveLength(0);
});
it("reserves on family selection, retries the same request and emits a complete painted code",async()=>{
  mock.failReserve=true;const apply=vi.fn();render(<TemporaryProductCode disabled={false} ral={null} onApply={apply}/>);
  fireEvent.click(screen.getByRole("button",{name:"Genera codice temporaneo"}));
  const dialog=within(screen.getByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("Famiglia"),{target:{value:"FP"}});
  await dialog.findByRole("alert");fireEvent.click(dialog.getByRole("button",{name:"Riprova prenotazione"}));
  await waitFor(()=>expect((dialog.getByLabelText("Progressivo automatico") as HTMLInputElement).value).toBe("0000042"));
  expect(mock.calls[0].input.requestKey).toBe(mock.calls[1].input.requestKey);
  fireEvent.change(dialog.getByLabelText("Materiale"),{target:{value:"X"}});
  fireEvent.click(dialog.getByLabelText("Articolo verniciato RAL"));
  fireEvent.change(dialog.getByLabelText("Colore RAL"),{target:{value:"9006"}});
  expect(dialog.getByLabelText("Codice temporaneo completo").textContent).toBe("TFP0000042XO9006");
  fireEvent.click(dialog.getByRole("button",{name:"Usa questo codice"}));
  await waitFor(()=>expect(apply).toHaveBeenCalledWith(expect.objectContaining({code:"TFP0000042XO9006",sequence:42}),{color:"9006",textured:false}));
  expect(mock.calls.filter(c=>c.name==="complete")).toHaveLength(1);
});
