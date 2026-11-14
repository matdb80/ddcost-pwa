import SearchableSelect from "./SearchableSelect";
import type {ReactNode} from "react";
import { ralColors, type RalOptions, type calculateRal } from "@/lib/ral-pricing";
export function RalColorSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return <SearchableSelect label="Colore RAL" disabled={disabled} value={value} onChange={onChange}
    className="h-9 w-full min-w-48 rounded border bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100"
    options={ralColors.map(c=>({value:c.code,label:`RAL ${c.code} · ${c.name}`}))}/>;
}
export default function RalSettings({ value, disabled, onChange, result, standardFinish }: {
  value: RalOptions | null; disabled: boolean; onChange: (v: RalOptions | null) => void; result?: ReturnType<typeof calculateRal> | null; standardFinish?:ReactNode;
}) {
  const color = ralColors.find(c => c.code === value?.color);
  return <section className="rounded-xl border border-slate-200 bg-white text-sm shadow-sm">
    <label className={`block rounded-t-xl p-2 ${disabled ? "cursor-default" : "cursor-pointer"}`} style={{ background: "linear-gradient(105deg, #8b5cf6 0%, #ef4444 25%, #facc15 50%, #22c55e 75%, #3b82f6 100%)" }}>
      <span className="inline-flex max-w-full items-center gap-2 rounded-md bg-white/95 px-3 py-1.5 font-semibold leading-5 text-slate-900 shadow-sm">
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-600" checked={Boolean(value)} disabled={disabled} onChange={e => onChange(e.target.checked ? { color: "9010", textured: false } : null)}/>
        <span>Verniciatura RAL sul netto cliente</span>
      </span>
    </label>
    {!value && standardFinish}
    {value && <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <RalColorSelect value={value.color} disabled={disabled} onChange={color => onChange({ ...value, color })}/>
        <span className="h-8 w-8 rounded border" style={{ backgroundColor: color?.hex }} title="Colore indicativo a schermo"/>
        <label className="flex items-center gap-2"><input type="checkbox" checked={value.textured} disabled={disabled} onChange={e => onChange({ ...value, textured: e.target.checked })}/>Goffrato</label>
      </div>
      <p className="text-xs text-slate-600">Un solo colore per tutto il documento. Il ricarico si applica al netto cliente; il cambio colore si addebita una sola volta (50 € liscio, 100 € se realmente goffrato). Inox e goffrato non sono compatibili.</p>
      <p className="text-xs text-amber-800">Prezzo verniciato indicativo, da confermare dall’ufficio sul netto del cliente. I colori a schermo sono approssimativi.</p>
      {result && <p>Cambio colore: <b>€ {result.fixed.toFixed(2).replace(".", ",")}</b>{result.onRequest && " · Netto mancante: prezzo su richiesta"}</p>}
    </div>}
  </section>;
}
