import { useEffect, useRef, useState } from "react";
import { Paperclip, Files, Download, ZoomIn, ZoomOut } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MAX_QUOTE_FILE_BYTES } from "@/lib/quote-attachments";

type Props = { quoteId: number | null; ensureQuoteId: () => Promise<number>; disabled?: boolean };
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lettura del file fallita"));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}
export default function QuoteAttachments({ quoteId, ensureQuoteId, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [persistedId, setPersistedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const id = quoteId ?? persistedId;
  const utils = trpc.useUtils();
  const list = trpc.quoteAttachment.list.useQuery({ quoteId: id ?? 0 }, { enabled: Boolean(id) && open, refetchOnWindowFocus: false });
  const current = trpc.quoteAttachment.get.useQuery({ quoteId: id ?? 0, id: activeId ?? 0 }, { enabled: open && Boolean(id && activeId), staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
  const upload = trpc.quoteAttachment.upload.useMutation();
  useEffect(() => {
    setZoom(100); setUrl(""); setText("");
    if (!open || !current.data || current.data.id !== activeId) return;
    const bytes = Uint8Array.from(atob(current.data.dataBase64), c => c.charCodeAt(0));
    const next = URL.createObjectURL(new Blob([bytes], { type: current.data.mimeType }));
    setUrl(next);
    if (current.data.mimeType === "text/plain") setText(new TextDecoder().decode(bytes.subarray(0, 100000)) + (bytes.length > 100000 ? "\n… Anteprima limitata; scarica il file completo." : ""));
    return () => URL.revokeObjectURL(next);
  }, [open, current.data, activeId]);
  async function attach(files: File[]) {
    if (busyRef.current || !files.length) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    let saved = 0;
    try {
      if (files.some(f => !f.size || f.size > MAX_QUOTE_FILE_BYTES)) throw new Error("Scegli file non vuoti, fino a 10 MB ciascuno.");
      const target = id ?? await ensureQuoteId();
      setPersistedId(target);
      for (const file of files) {
        const result = await upload.mutateAsync({ quoteId: target, fileName: file.name, dataBase64: await readFile(file) });
        setActiveId(result.id); saved++;
      }
      await utils.quoteAttachment.list.invalidate({ quoteId: target });
      setMessage(`${saved} file disponibili nell’archivio allegati. I file identici non vengono duplicati.`);
      setOpen(true);
    } catch (e) {
      setError((saved ? `${saved} file già salvati. ` : "") + (e instanceof Error ? e.message : "Caricamento fallito"));
      if (saved && id) await utils.quoteAttachment.list.invalidate({ quoteId: id });
    } finally { busyRef.current = false; setBusy(false); if (input.current) input.current.value = ""; }
  }
  const selected = current.data?.id === activeId ? current.data : null;
  const button = "inline-flex shrink-0 items-center justify-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 disabled:opacity-40";
  return <div className="shrink-0 text-slate-800">
    <div className="flex flex-wrap gap-1">
      <input ref={input} type="file" multiple className="sr-only" aria-label="Seleziona allegati" disabled={disabled || busy} onChange={e => void attach(Array.from(e.target.files ?? []))}/>
      <button type="button" className={button} disabled={disabled || busy} onClick={() => input.current?.click()}><Paperclip size={15}/>{busy ? "Caricamento…" : "Allega file"}</button>
      <button type="button" className={button} onClick={() => setOpen(true)}><Files size={15}/>Visualizza allegati</button>
    </div>
    {!id && <p className="mt-1 max-w-64 text-[11px]">Allegare un file salva prima il nuovo preventivo come bozza.</p>}
    {message && <p role="status" className="mt-1 max-w-64 whitespace-normal text-xs text-emerald-800">{message}</p>}
    {error && <p role="alert" className="mt-1 max-w-64 whitespace-normal text-xs text-red-700">{error}</p>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[88dvh] max-w-[96vw] flex-col gap-2 p-4 sm:max-w-[96vw]">
        <DialogTitle>Allegati del preventivo</DialogTitle>
        <DialogDescription>Condivisi tra tutte le versioni. PDF, immagini e testi in anteprima; altri formati scaricabili. Massimo 20 file, 10 MB per file e 50 MB totali.</DialogDescription>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(5rem,25%)_1fr] gap-3 md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-1">
          <aside className="overflow-auto rounded border bg-slate-50 p-2" aria-label="Elenco allegati">
            {list.isLoading && <p>Caricamento…</p>}
            {list.error && <p role="alert" className="text-sm text-red-700">{list.error.message}</p>}
            {!list.isLoading && !list.error && !(list.data?.length) && <p className="text-sm">Nessun allegato caricato.</p>}
            {list.data?.map(file => <button type="button" key={file.id} aria-pressed={activeId === file.id} onClick={() => setActiveId(file.id)} className={`mb-1 block w-full break-words rounded p-2 text-left text-sm ${activeId === file.id ? "bg-sky-100 font-semibold" : "hover:bg-white"}`}>
              {file.fileName}<span className="block text-xs font-normal">{(file.sizeBytes / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} KB</span>
            </button>)}
          </aside>
          <section className="flex min-h-0 min-w-0 flex-col gap-2" aria-label="Anteprima allegato">
            {current.error && <p role="alert" className="text-red-700">{current.error.message}</p>}
            {current.isFetching && <p>Caricamento anteprima…</p>}
            {!activeId && <p>Seleziona un allegato nell’elenco.</p>}
            {selected && url && <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 break-words text-sm font-semibold">{selected.fileName}</span>
                {selected.mimeType !== "application/octet-stream" && <>
                  <button type="button" className={button} aria-label="Riduci zoom" disabled={zoom <= 25} onClick={() => setZoom(z => Math.max(25, z - 25))}><ZoomOut size={18}/></button>
                  <button type="button" className={button} onClick={() => setZoom(100)} aria-label="Ripristina zoom">{zoom}%</button>
                  <button type="button" className={button} aria-label="Aumenta zoom" disabled={zoom >= 400} onClick={() => setZoom(z => Math.min(400, z + 25))}><ZoomIn size={18}/></button>
                </>}
                <a className={button} href={url} download={selected.fileName}><Download size={16}/>Scarica</a>
              </div>
              <div className="min-h-0 flex-1 overflow-auto rounded border bg-slate-100">
                {selected.mimeType.startsWith("image/") ? <img src={url} alt={selected.fileName} style={{ width: `${zoom}%`, maxWidth: "none" }} />
                  : selected.mimeType === "application/pdf" ? <object key={zoom} type="application/pdf" data={`${url}#zoom=${zoom}`} className="h-full min-h-64 w-full"><p className="p-3">Anteprima PDF non supportata da questo browser. Usa Scarica per aprire il documento.</p></object>
                  : selected.mimeType === "text/plain" ? <pre className="whitespace-pre-wrap break-words p-3" style={{ fontSize: `${zoom * 0.14}px` }}>{text}</pre>
                  : <p className="p-4 text-sm">Anteprima non disponibile per questo formato. Scarica il file per aprirlo nell’applicazione dedicata.</p>}
              </div>
            </>}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
