import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RalColorSelect } from "./RalSettings";
import { TEMPORARY_FAMILIES, TEMPORARY_MATERIALS, temporaryCode, type RalOptions } from "@/lib/ral-pricing";
export type GeneratedProductCode = { sequence: number; family: string; material: string; color: string | null; code: string };
export default function TemporaryProductCode({ disabled, ral, onApply }: {
  disabled: boolean; ral: RalOptions | null; onApply: (code: GeneratedProductCode, ral: RalOptions | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [family, setFamily] = useState("");
  const [material, setMaterial] = useState("I");
  const [color, setColor] = useState("9010");
  const [painted, setPainted] = useState(false);
  const [sequence, setSequence] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef("");
  const saving = useRef(false);
  const reserve = trpc.temporaryProduct.reserve.useMutation();
  const complete = trpc.temporaryProduct.complete.useMutation();
  async function chooseFamily(value: string) {
    setFamily(value); setError("");
    if (!value || sequence || saving.current) return;
    saving.current = true; setBusy(true);
    try {
      const result = await reserve.mutateAsync({ requestKey: request.current, family: value as typeof TEMPORARY_FAMILIES[number] });
      setSequence(result.sequence);
    } catch (e) { setError(e instanceof Error ? e.message : "Prenotazione non riuscita"); }
    finally { saving.current = false; setBusy(false); }
  }
  async function apply() {
    if (!sequence || saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      if (painted && ral?.textured && (material === "X" || material === "6")) throw new Error("Inox e goffrato non sono compatibili");
      const result = await complete.mutateAsync({ requestKey: request.current, family: family as typeof TEMPORARY_FAMILIES[number], material: material as keyof typeof TEMPORARY_MATERIALS, color: painted ? color : null });
      onApply(result, painted ? { color, textured: ral?.textured ?? false } : ral);
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Generazione non riuscita"); }
    finally { saving.current = false; setBusy(false); }
  }
  let preview = "";
  try { if (sequence) preview = temporaryCode(sequence, family, material, painted ? color : null); } catch { /* fields incomplete */ }
  return <>
    <button type="button" disabled={disabled} className="rounded border border-sky-600 px-2 py-1 text-xs text-sky-800 disabled:opacity-40" onClick={() => {
      request.current = crypto.randomUUID(); setSequence(null); setFamily(""); setMaterial("I"); setError(""); setColor(ral?.color ?? "9010"); setPainted(Boolean(ral)); setOpen(true);
    }}>Genera codice temporaneo</button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogTitle>Nuovo codice prodotto temporaneo</DialogTitle>
        <DialogDescription>Progressivo unico per offerte standard e preventivi una tantum. Un numero prenotato non viene riassegnato se annulli.</DialogDescription>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={painted} disabled={busy || Boolean(ral)} onChange={e => setPainted(e.target.checked)}/>Articolo verniciato RAL</label>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <span className="rounded bg-slate-100 px-3 py-2 font-mono font-bold">T</span>
          <label className="flex flex-col gap-1">Famiglia<select disabled={busy} className="h-9 rounded border px-2" value={family} onChange={e => void chooseFamily(e.target.value)}><option value="">Seleziona</option>{TEMPORARY_FAMILIES.map(f => <option key={f}>{f}</option>)}</select></label>
          <label className="flex flex-col gap-1">Progressivo<input aria-label="Progressivo automatico" readOnly className="h-9 w-28 rounded border bg-slate-100 px-2 font-mono" value={sequence ? String(sequence).padStart(7, "0") : "—"}/></label>
          <label className="flex flex-col gap-1">Materiale<select disabled={busy} className="h-9 rounded border px-2" value={material} onChange={e => setMaterial(e.target.value)}>{Object.entries(TEMPORARY_MATERIALS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
          {painted && <><span className="rounded bg-slate-100 px-3 py-2 font-mono font-bold">O</span><RalColorSelect value={color} disabled={busy || Boolean(ral)} onChange={setColor}/></>}
        </div>
        {preview && <output aria-label="Codice temporaneo completo" className="break-all rounded bg-sky-50 p-3 font-mono text-lg font-bold">{preview}</output>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {error && !sequence && family && <button type="button" disabled={busy} onClick={() => void chooseFamily(family)}>Riprova prenotazione</button>}
        <button type="button" disabled={busy || !preview} onClick={() => void apply()} className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-40">{busy ? "Attendi…" : "Usa questo codice"}</button>
      </DialogContent>
    </Dialog>
  </>;
}
