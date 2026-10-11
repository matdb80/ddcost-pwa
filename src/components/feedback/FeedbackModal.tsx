import { useRef, useState } from "react";
import { useLocation } from "react-router";
import { CheckCircle2, AlertTriangle, Camera, MessageSquare, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Kind = "bug" | "miglioramento" | "nuova_funzione";
type Severity = "normale" | "bloccante";
type Shot = { mimeType: "image/webp" | "image/jpeg"; fileName: string; dataBase64: string };
type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  cycleId?: number;
  cycleRev?: number;
};

async function compressScreenshot(file: File): Promise<Shot> {
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
    throw new Error("Seleziona un'immagine non superiore a 15 MB.");
  }
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Formato immagine non valido."));
      img.src = url;
    });
    const max = 1280;
    const ratio = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non supportato.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const mime of ["image/webp", "image/jpeg"] as const) {
      for (const q of [0.83, 0.68, 0.52, 0.36, 0.22]) {
        const data = canvas.toDataURL(mime, q);
        if (!data.startsWith("data:" + mime + ";")) continue;
        const b64 = data.split(",")[1] ?? "";
        if (b64.length > 0 && Math.floor(b64.length * 3 / 4) <= 300 * 1024) {
          return { mimeType: mime, dataBase64: b64,
            fileName: file.name.replace(/\.[^.]*$/, "") + (mime === "image/webp" ? ".webp" : ".jpg") };
        }
      }
    }
    throw new Error("Immagine troppo grande anche dopo la compressione.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function FeedbackModal({open, onOpenChange, cycleId, cycleRev}: Props) {
  const [type, setType] = useState<Kind>("bug");
  const [severity, setSeverity] = useState<Severity>("normale");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [shot, setShot] = useState<Shot | null>(null);
  const [feedback, setFeedback] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");
  const [busyFile, setBusyFile] = useState(false);
  const chooser = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const { user } = useAuth({redirectOnUnauthenticated:false});
  const utils = trpc.useUtils();
  const create = trpc.feedback.create.useMutation();

  const close = () => {
    if (create.isPending || busyFile) return;
    onOpenChange(false);
    setTitle(""); setDescription(""); setShot(null);
    setType("bug"); setSeverity("normale"); setTicketNumber(""); setFeedback("");
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setBusyFile(true); setFeedback("");
    try {
      setShot(await compressScreenshot(file));
    } catch(e) { setFeedback(e instanceof Error ? e.message : "Errore caricamento immagine."); }
    finally {setBusyFile(false);}
  };

  const send = async () => {
    if (!title.trim() || !description.trim() || create.isPending || busyFile) return;
    setFeedback("");
    try {
      const created = await create.mutateAsync({
        type, severity, title:title.trim(), description:description.trim(),
        pageRoute:location.pathname + location.search,
        buildVersion:import.meta.env.VITE_GIT_COMMIT || "dev-build",
        cycleId, cycleRev, screenshot:shot ?? undefined,
      });
      setTicketNumber(created.ticketNumber);
      await utils.feedback.getStats.invalidate();
    } catch(e) { setFeedback(e instanceof Error ? e.message : "Invio non riuscito."); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {if (!next) close();}}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5"/>Invia segnalazione
        </DialogTitle></DialogHeader>
        {ticketNumber ? (
          <div className="space-y-4 py-6 text-center">
            <CheckCircle2 className="mx-auto w-10 h-10 text-emerald-600"/>
            <p className="font-semibold">Segnalazione registrata</p>
            <p>Numero: <strong className="font-mono">{ticketNumber}</strong></p>
            <Button onClick={close}>Chiudi</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {feedback && <p role="alert" className="text-red-700 text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0"/>{feedback}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Tipo</Label>
                <Select value={type} onValueChange={(v)=>setType(v as Kind)}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="miglioramento">Miglioramento</SelectItem>
                    <SelectItem value="nuova_funzione">Nuova funzione</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Criticità</Label>
                <Select value={severity} onValueChange={(v)=>setSeverity(v as Severity)}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normale">Normale</SelectItem>
                    <SelectItem value="bloccante">Bloccante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Titolo</Label>
              <Input value={title} maxLength={255} onChange={(e)=>setTitle(e.target.value)} placeholder="Cosa non funziona?"/>
            </div>
            <div className="space-y-1"><Label>Descrizione</Label>
              <Textarea value={description} rows={5} maxLength={16000}
                onChange={(e)=>setDescription(e.target.value)}
                placeholder="Descrivi cosa è successo o cosa vorresti migliorare."/>
            </div>
            <div className="space-y-1"><Label>Screenshot (facoltativo, max 300 KB)</Label>
              <div className="flex items-center gap-3">
                <input ref={chooser} type="file" className="hidden" accept="image/*"
                  onChange={(e)=>{void upload(e.target.files?.[0]); e.currentTarget.value="";}}/>
                <Button variant="outline" onClick={()=>chooser.current?.click()} disabled={busyFile}>
                  <Camera className="w-4 h-4 mr-2"/>{shot?"Cambia screenshot":"Allega screenshot"}
                </Button>
                {shot && <Button variant="ghost" aria-label="Rimuovi screenshot" onClick={()=>setShot(null)}><X className="w-4 h-4"/></Button>}
              </div>
              {shot && <img src={"data:"+shot.mimeType+";base64,"+shot.dataBase64} alt="Anteprima screenshot" className="max-h-28 object-contain border rounded"/>}
            </div>
            <p className="text-xs text-slate-500">Utente: {user?.name??"N/D"} · Schermata: {location.pathname} {cycleId?"· Ciclo "+cycleId+" rev. "+(cycleRev??"?"):""}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close} disabled={create.isPending || busyFile}>Annulla</Button>
              <Button onClick={()=>void send()} disabled={!title.trim()||!description.trim()||create.isPending||busyFile} className="bg-emerald-600 hover:bg-emerald-700">{create.isPending?"Invio...":"Invia segnalazione"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
