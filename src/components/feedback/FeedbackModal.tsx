import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, X, Camera, CheckCircle, AlertTriangle } from "lucide-react";
import { captureFeedbackScreenshot } from "@/lib/feedback-screenshot";

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId?: number;
  cycleRev?: number;
}

function getBuildVersion(): string {
  try {
    if (import.meta.env.VITE_GIT_COMMIT) {
      return import.meta.env.VITE_GIT_COMMIT as string;
    }
  } catch {
    // ignore
  }
  return "dev-build";
}

async function compressImage(file: File, maxSizeKB: number = 300): Promise<{ mimeType: "image/webp" | "image/jpeg" | "image/png"; dataBase64: string; fileName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDim = 1280;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas non supportato"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.85;
        const tryCompress = () => {
          const dataUrl = canvas.toDataURL("image/webp", quality);
          const base64 = dataUrl.split(",")[1];
          const sizeBytes = Math.ceil((base64.length * 3) / 4);
          const sizeKB = sizeBytes / 1024;
          if (sizeKB > maxSizeKB && quality > 0.2) {
            quality -= 0.15;
            tryCompress();
          } else if (sizeKB > maxSizeKB) {
            // Try JPEG as fallback
            const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.6);
            const jpegBase64 = jpegDataUrl.split(",")[1];
            const jpegSizeKB = Math.ceil((jpegBase64.length * 3) / 4) / 1024;
            if (jpegSizeKB > maxSizeKB) {
              reject(new Error(`Immagine troppo grande anche dopo la compressione (${Math.round(jpegSizeKB)} KB)`));
              return;
            }
            resolve({ mimeType: "image/jpeg", dataBase64: jpegBase64, fileName: file.name.replace(/\.[^.]+$/, ".jpg") });
          } else {
            resolve({ mimeType: "image/webp", dataBase64: base64, fileName: file.name.replace(/\.[^.]+$/, ".webp") });
          }
        };
        tryCompress();
      };
      img.onerror = () => reject(new Error("Errore caricamento immagine"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Errore lettura file"));
    reader.readAsDataURL(file);
  });
}

export default function FeedbackModal({ open, onOpenChange, cycleId, cycleRev }: FeedbackModalProps) {
  const { user } = useAuth({ redirectOnUnauthenticated: false });
  const location = useLocation();
  const [type, setType] = useState<"bug" | "miglioramento" | "nuova_funzione">("bug");
  const [severity, setSeverity] = useState<"normale" | "bloccante">("normale");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<{ mimeType: "image/webp" | "image/jpeg" | "image/png"; dataBase64: string; fileName: string } | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [captureState,setCaptureState] = useState<"idle"|"capturing"|"ready"|"unavailable"|"removed">("idle");
  const manualScreenshotOverride=useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; ticketNumber?: string; message?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [position,setPosition]=useState({x:0,y:0});
  const dragRef=useRef<{x:number;y:number;startX:number;startY:number}|null>(null);
  const onDragStart=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(event.button!==0 || isSubmitting)return;
    dragRef.current={x:position.x,y:position.y,startX:event.clientX,startY:event.clientY};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDragMove=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!dragRef.current)return;
    const deltaX=event.clientX-dragRef.current.startX;
    const deltaY=event.clientY-dragRef.current.startY;
    const maxX=Math.max(0,(window.innerWidth-Math.min(window.innerWidth-32,512))/2);
    const maxY=Math.max(0,(window.innerHeight-180)/2);
    setPosition({
      x:Math.max(-maxX,Math.min(maxX,dragRef.current.x+deltaX)),
      y:Math.max(-maxY,Math.min(maxY,dragRef.current.y+deltaY)),
    });
  };
  const onDragEnd=()=>{dragRef.current=null;};

  const createMutation = trpc.feedback.create.useMutation();

  const reset = useCallback(() => {
    setType("bug");
    setSeverity("normale");
    setTitle("");
    setDescription("");
    setScreenshot(null);
    setScreenshotPreview(null);
    setCaptureState("idle");
    setPosition({x:0,y:0});
    dragRef.current=null;
    manualScreenshotOverride.current=false;
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    if(isSubmitting)return;
    const hasUnsentInput=Boolean(title.trim()||description.trim()||type!=="bug"||severity!=="normale"||
      (manualScreenshotOverride.current&&screenshot));
    if(hasUnsentInput&&!result?.success&&
      !window.confirm("La segnalazione non è stata inviata. Chiudere e cancellare i dati inseriti?"))return;
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange, isSubmitting, title, description, type, severity, screenshot, result]);

  // Capture automatically on opening the report. Radix portals the dialog
  // outside #root, so the screenshot contains the underlying page, not this
  // form. If the browser cannot render the page, sending text still works.
  useEffect(()=>{
    if(!open)return;
    let canceled=false;
    manualScreenshotOverride.current=false;
    setCaptureState("capturing");
    const root=document.getElementById("root");
    if(!root){
      setCaptureState("unavailable");
      return;
    }
    let timeoutId:ReturnType<typeof setTimeout>|undefined;
    const timeout=new Promise<never>((_,reject)=>{
      timeoutId=setTimeout(()=>reject(new Error("Acquisizione non disponibile")),8000);
    });
    void Promise.race([captureFeedbackScreenshot(root),timeout])
      .then(file=>compressImage(file,300))
      .then(compressed=>{
        if(canceled || manualScreenshotOverride.current)return;
        setScreenshot(compressed);
        setScreenshotPreview(`data:${compressed.mimeType};base64,${compressed.dataBase64}`);
        setCaptureState("ready");
      })
      .catch(()=>{
        if(canceled || manualScreenshotOverride.current)return;
        setCaptureState("unavailable");
      })
      .finally(()=>{if(timeoutId!==undefined)clearTimeout(timeoutId);});
    return ()=>{canceled=true;if(timeoutId!==undefined)clearTimeout(timeoutId);};
  },[open]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    manualScreenshotOverride.current=true;

    if (!file.type.startsWith("image/")) {
      setResult({ success: false, message: "Solo immagini sono accettate" });
      return;
    }

    try {
      const compressed = await compressImage(file, 300);
      setScreenshot(compressed);
      setScreenshotPreview(`data:${compressed.mimeType};base64,${compressed.dataBase64}`);
      setCaptureState("ready");
      setResult(null);
    } catch (err: any) {
      setCaptureState("unavailable");
      setResult({ success: false, message: err.message || "Errore compressione immagine" });
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      setResult({ success: false, message: "Titolo e descrizione sono obbligatori" });
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const res = await createMutation.mutateAsync({
        type,
        severity,
        title: title.trim(),
        description: description.trim(),
        pageRoute: location.pathname,
        buildVersion: getBuildVersion(),
        cycleId,
        cycleRev,
        screenshot: screenshot
          ? {
              mimeType: screenshot.mimeType,
              fileName: screenshot.fileName,
              dataBase64: screenshot.dataBase64,
            }
          : undefined,
      });

      setResult({ success: true, ticketNumber: res.ticketNumber });
    } catch (err: any) {
      setResult({ success: false, message: err.message || "Errore invio segnalazione" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        style={{transform:`translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`}}
      >
        <DialogHeader
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="cursor-move select-none touch-none"
          title="Trascina per spostare questa finestra"
        >
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            Invia segnalazione
            <span className="ml-auto mr-6 text-xs font-normal text-slate-500">Trascina per spostare</span>
          </DialogTitle>
        </DialogHeader>

        {result?.success ? (
          <div className="py-8 text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" />
            <div>
              <p className="font-semibold text-lg">Segnalazione inviata!</p>
              <p className="text-slate-500 mt-1">Ticket: <span className="font-mono font-bold">{result.ticketNumber}</span></p>
            </div>
            <Button onClick={handleClose} className="bg-emerald-600 hover:bg-emerald-700">
              Chiudi
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {result?.message && (
              <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {result.message}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="miglioramento">Miglioramento</SelectItem>
                    <SelectItem value="nuova_funzione">Nuova funzione</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Criticità</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normale">Normale</SelectItem>
                    <SelectItem value="bloccante">Bloccante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Titolo</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Breve riassunto del problema"
                maxLength={255}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Descrizione</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrivi il problema o l'idea in dettaglio..."
                rows={4}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Screenshot della pagina (automatico, opzionale, max 300 KB)</Label>
              <p className="text-xs text-slate-600">
                Quando apri questa segnalazione DDCost acquisisce la schermata corrente.
                L'anteprima può contenere dati visibili nella pagina: controllala e,
                se preferisci, rimuovila prima dell'invio.
              </p>
              {captureState==="capturing" && <p role="status" className="text-xs text-blue-700">Acquisizione automatica in corso...</p>}
              {captureState==="ready" && <p role="status" className="text-xs text-emerald-700">Screenshot pronto: verrà allegato insieme alla segnalazione.</p>}
              {captureState==="unavailable" && <p role="status" className="text-xs text-amber-700">
                Screenshot automatico non disponibile in questo browser. Puoi inviare la segnalazione senza immagine o allegarla manualmente.
              </p>}
              {captureState==="removed" && <p role="status" className="text-xs text-slate-600">
                Screenshot rimosso: la segnalazione sarà inviata senza immagine.
              </p>}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  {screenshot ? "Sostituisci screenshot" : "Allega manualmente"}
                </Button>
                {screenshot && (
                  <button
                    onClick={() => {
                      manualScreenshotOverride.current=true;
                      setScreenshot(null);
                      setScreenshotPreview(null);
                      setCaptureState("removed");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {screenshotPreview && (
                <img
                  src={screenshotPreview}
                  alt="Preview"
                  className="mt-2 max-h-32 rounded border border-slate-200 object-contain"
                />
              )}
            </div>

            <div className="text-xs text-slate-400 bg-slate-50 p-2 rounded">
              Utente: {user?.name ?? "N/D"} | Pagina: {location.pathname}
              {cycleId ? ` | Ciclo: ${cycleId}` : ""}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Annulla
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || captureState==="capturing" || !title.trim() || !description.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isSubmitting ? "Invio..." : "Invia segnalazione"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
