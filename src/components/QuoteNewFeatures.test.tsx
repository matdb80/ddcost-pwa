// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {temporaryCode} from "@/lib/ral-pricing";
const mock=vi.hoisted(()=>({files:[] as any[],calls:[] as {name:string;input:any}[],failReserve:false}));
vi.mock("@/providers/trpc",()=>({trpc:{
  useUtils:()=>({quoteAttachment:{list:{invalidate:async()=>{}}}}),
  quoteAttachment:{
    list:{useQuery:()=>({data:mock.files,isLoading:false})},
    get:{useQuery:({id}:{id:number})=>({data:mock.files.find(f=>f.id===id),isFetching:false})},
    upload:{useMutation:()=>({mutateAsync:async(input:any)=>{mock.calls.push({name:"upload",input});mock.files.push({...input,id:1,mimeType:"image/png",sizeBytes:8,includeInPdf:false});return {id:1,duplicate:false};}})},
    // v19: il mock riproduce il server: nuovi caricamenti deselezionati, scelta ed
    // eliminazione persistite sull'archivio.
    setIncludeInPdf:{useMutation:()=>({mutateAsync:async(input:any)=>{mock.calls.push({name:"setIncludeInPdf",input});const f=mock.files.find(x=>x.id===input.id);if(f)f.includeInPdf=input.include;return {id:input.id,includeInPdf:input.include};}})},
    remove:{useMutation:()=>({mutateAsync:async(input:any)=>{mock.calls.push({name:"remove",input});mock.files=mock.files.filter(f=>f.id!==input.id);return {id:input.id,deleted:true};}})},
  },
  temporaryProduct:{
    reserve:{useMutation:()=>({mutateAsync:async(input:any)=>{mock.calls.push({name:"reserve",input});if(mock.failReserve){mock.failReserve=false;throw new Error("Connessione interrotta");}return {sequence:42,requestKey:input.requestKey};}})},
    complete:{useMutation:()=>({mutateAsync:async(input:any)=>{mock.calls.push({name:"complete",input});return {sequence:42,...input,code:temporaryCode(42,input.family,input.material,input.color,input.suffix,input.natural)};}})},
  },
}}));
import QuoteAttachments from "./QuoteAttachments";
import TemporaryProductCode from "./TemporaryProductCode";
beforeEach(()=>{mock.files=[];mock.calls=[];mock.failReserve=false;URL.createObjectURL=vi.fn(()=>"blob:test");URL.revokeObjectURL=vi.fn();});
afterEach(()=>cleanup());
it.each([["I","N"],["X","P"],["6","P"]])("generates the automatic unpainted finish for %s",async(material,suffix)=>{
  const apply=vi.fn();render(<TemporaryProductCode disabled={false} ral={null} onApply={apply}/>);
  fireEvent.click(screen.getByRole("button",{name:"Genera codice temporaneo"}));
  fireEvent.change(screen.getByLabelText("Famiglia"),{target:{value:"FP"}});
  await waitFor(()=>expect((screen.getByLabelText("Progressivo automatico") as HTMLInputElement).value).toBe("0000042"));
  fireEvent.change(screen.getByLabelText("Materiale"),{target:{value:material}});
  expect(screen.getByLabelText("Codice temporaneo completo").textContent).toBe(`TFP0000042${material}${suffix}`);
  fireEvent.click(screen.getByRole("button",{name:"Usa questo codice"}));
  await waitFor(()=>expect(apply).toHaveBeenCalledWith(expect.objectContaining({code:`TFP0000042${material}${suffix}`}),null));
});
it.each(["B","A"])("lets users enter only one final character for unpainted %s",async material=>{
  const apply=vi.fn();render(<TemporaryProductCode disabled={false} ral={null} onApply={apply}/>);
  fireEvent.click(screen.getByRole("button",{name:"Genera codice temporaneo"}));
  fireEvent.change(screen.getByLabelText("Famiglia"),{target:{value:"FP"}});
  await waitFor(()=>expect((screen.getByLabelText("Progressivo automatico") as HTMLInputElement).value).toBe("0000042"));
  fireEvent.change(screen.getByLabelText("Materiale"),{target:{value:material}});
  const code=screen.getByRole("textbox",{name:"Codice temporaneo completo"}) as HTMLInputElement;
  const prefix=`TFP0000042${material}`;
  expect(code.value).toBe(prefix);
  expect((screen.getByRole("button",{name:"Usa questo codice"}) as HTMLButtonElement).disabled).toBe(true);
  for(const invalid of ["",prefix.slice(1),prefix+"ab",prefix+" ","TFP0000043"+material+"z",prefix+"ß"]){
    fireEvent.change(code,{target:{value:invalid}});expect(code.value).toBe(prefix);
  }
  fireEvent.focus(code);
  fireEvent.paste(code,{clipboardData:{getData:()=>"z"}});
  // il suffisso digitato (anche minuscolo) è convertito in maiuscolo in anteprima e in emissione
  expect(code.value).toBe(prefix+"Z");
  fireEvent.click(screen.getByRole("button",{name:"Usa questo codice"}));
  await waitFor(()=>expect(apply).toHaveBeenCalledWith(expect.objectContaining({code:prefix+"Z"}),null));
  expect(mock.calls.find(c=>c.name==="complete")!.input.suffix).toBe("Z");
});
it("keeps the RAL code read-only even for brass when the document flag is selected",async()=>{
  render(<TemporaryProductCode disabled={false} ral={{color:"9006",textured:false}} onApply={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button",{name:"Genera codice temporaneo"}));
  fireEvent.change(screen.getByLabelText("Famiglia"),{target:{value:"FP"}});
  await waitFor(()=>expect((screen.getByLabelText("Progressivo automatico") as HTMLInputElement).value).toBe("0000042"));
  fireEvent.change(screen.getByLabelText("Materiale"),{target:{value:"B"}});
  expect(screen.queryByRole("textbox",{name:"Codice temporaneo completo"})).toBeNull();
  expect(screen.getByLabelText("Codice temporaneo completo").textContent).toBe("TFP0000042BO9006");
});
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

it.each([null,{color:"6021",textured:true}])("natural checkbox always produces suffix zero and disables painting",async ral=>{
  const apply=vi.fn();render(<TemporaryProductCode disabled={false} ral={ral} onApply={apply}/>);
  fireEvent.click(screen.getByRole("button",{name:"Genera codice temporaneo"}));
  fireEvent.change(screen.getByLabelText("Famiglia"),{target:{value:"BC"}});
  await waitFor(()=>expect((screen.getByLabelText("Progressivo automatico") as HTMLInputElement).value).toBe("0000042"));
  fireEvent.change(screen.getByLabelText("Materiale"),{target:{value:"6"}});
  fireEvent.click(screen.getByRole("checkbox",{name:"Grezzo/naturale"}));
  const painted=screen.getByRole("checkbox",{name:"Articolo verniciato RAL"}) as HTMLInputElement;
  expect(painted.checked).toBe(false);expect(painted.disabled).toBe(true);
  expect(screen.getByLabelText("Codice temporaneo completo").textContent).toBe("TBC000004260");
  fireEvent.click(screen.getByRole("button",{name:"Usa questo codice"}));
  await waitFor(()=>expect(apply).toHaveBeenCalledWith(expect.objectContaining({code:"TBC000004260",color:null}),ral));
});

// v19 — controlli per singolo allegato: inclusione nel PDF cliente ed eliminazione.
const PNG_ROW=(id:number,fileName:string,includeInPdf:boolean|null)=>({id,fileName,mimeType:"image/png",sizeBytes:2048,includeInPdf,dataBase64:"iVBORw0KGgo="});
it("keeps legacy attachments included and starts new uploads deselected",async()=>{
  mock.files.push(PNG_ROW(7,"storico.png",null));
  render(<QuoteAttachments quoteId={5} ensureQuoteId={vi.fn(async()=>5)}/>);
  fireEvent.click(screen.getByRole("button",{name:"Visualizza allegati"}));
  const legacy=await screen.findByLabelText("Includi storico.png nel PDF cliente") as HTMLInputElement;
  expect(legacy.checked).toBe(true);
  const file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],"nota-interna.png",{type:"image/png"});
  fireEvent.change(screen.getByLabelText("Seleziona allegati"),{target:{files:[file]}});
  const uploaded=await screen.findByLabelText("Includi nota-interna.png nel PDF cliente") as HTMLInputElement;
  expect(uploaded.checked).toBe(false);
  expect(screen.getByText("Escluso dal PDF cliente")).toBeTruthy();
});
it("saves the include-in-PDF choice immediately and keeps it on reopening",async()=>{
  mock.files.push(PNG_ROW(7,"disegno.png",null));
  render(<QuoteAttachments quoteId={5} ensureQuoteId={vi.fn(async()=>5)}/>);
  fireEvent.click(screen.getByRole("button",{name:"Visualizza allegati"}));
  const box=await screen.findByLabelText("Includi disegno.png nel PDF cliente") as HTMLInputElement;
  fireEvent.click(box);
  await waitFor(()=>expect(mock.calls.find(c=>c.name==="setIncludeInPdf")?.input).toEqual({quoteId:5,id:7,include:false}));
  await waitFor(()=>expect((screen.getByLabelText("Includi disegno.png nel PDF cliente") as HTMLInputElement).checked).toBe(false));
  expect(screen.getByText("Escluso dal PDF cliente")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Close"}));
  fireEvent.click(screen.getByRole("button",{name:"Visualizza allegati"}));
  expect(((await screen.findByLabelText("Includi disegno.png nel PDF cliente")) as HTMLInputElement).checked).toBe(false);
});
it("deletes an attachment only after confirmation and allows cancelling",async()=>{
  mock.files.push(PNG_ROW(7,"disegno.png",true),PNG_ROW(8,"pdf-sbagliato.png",false));
  render(<QuoteAttachments quoteId={5} ensureQuoteId={vi.fn(async()=>5)}/>);
  fireEvent.click(screen.getByRole("button",{name:"Visualizza allegati"}));
  fireEvent.click(await screen.findByRole("button",{name:"Elimina pdf-sbagliato.png"}));
  const warning=await screen.findByRole("alert");
  expect(warning.textContent).toContain("pdf-sbagliato.png");
  expect(warning.textContent).toContain("condiviso tra tutte le revisioni del preventivo");
  fireEvent.click(screen.getByRole("button",{name:"Annulla"}));
  expect(mock.calls.filter(c=>c.name==="remove")).toHaveLength(0);
  expect(screen.getByRole("button",{name:"Elimina pdf-sbagliato.png"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Elimina pdf-sbagliato.png"}));
  fireEvent.click(await screen.findByRole("button",{name:"Conferma eliminazione"}));
  await waitFor(()=>expect(mock.calls.find(c=>c.name==="remove")?.input).toEqual({quoteId:5,id:8}));
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Elimina pdf-sbagliato.png"})).toBeNull());
  expect(screen.getByRole("button",{name:"Elimina disegno.png"})).toBeTruthy();
});
it("offers the PDF checkbox only for images and PDFs, never for other formats",async()=>{
  mock.files.push({id:9,fileName:"note.txt",mimeType:"text/plain",sizeBytes:512,includeInPdf:null,dataBase64:"Y2lhby=="});
  render(<QuoteAttachments quoteId={5} ensureQuoteId={vi.fn(async()=>5)}/>);
  fireEvent.click(screen.getByRole("button",{name:"Visualizza allegati"}));
  await screen.findByRole("button",{name:"Elimina note.txt"});
  expect(screen.queryByLabelText("Includi note.txt nel PDF cliente")).toBeNull();
});
