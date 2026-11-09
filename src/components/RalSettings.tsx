import { ralColors, type RalOptions, type calculateRal } from "@/lib/ral-pricing";
export function RalColorSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return <select aria-label="Colore RAL" disabled={disabled} value={value} onChange={e => onChange(e.target.value)} className="h-9 max-w-full rounded border bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100">
    {ralColors.map(c => <option key={c.code} value={c.code}>RAL {c.code} · {c.name}</option>)}
  </select>;
}
export default function RalSettings({ value, disabled, onChange, result }: {
  value: RalOptions | null; disabled: boolean; onChange: (v: RalOptions | null) => void; result?: ReturnType<typeof calculateRal> | null;
}) {
  const color = ralColors.find(c => c.code === value?.color);
  return <section className="space-y-2 rounded-xl border bg-white p-3 text-sm">
    <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={e => onChange(e.target.checked ? { color: "9010", textured: false } : null)}/>Verniciatura RAL sul netto cliente</label>
    {value && <>
      <div className="flex flex-wrap items-center gap-3">
        <RalColorSelect value={value.color} disabled={disabled} onChange={color => onChange({ ...value, color })}/>
        <span className="h-8 w-8 rounded border" style={{ backgroundColor: color?.hex }} title="Colore indicativo a schermo"/>
        <label className="flex items-center gap-2"><input type="checkbox" checked={value.textured} disabled={disabled} onChange={e => onChange({ ...value, textured: e.target.checked })}/>Goffrato</label>
      </div>
      <p className="text-xs text-slate-600">Un solo colore per tutto il documento. Il ricarico si applica al netto cliente; il cambio colore si addebita una sola volta (50 € liscio, 100 € se realmente goffrato). Inox e goffrato non sono compatibili.</p>
      <p className="text-xs text-amber-800">Prezzo verniciato indicativo, da confermare dall’ufficio sul netto del cliente. I colori a schermo sono approssimativi.</p>
      {result && <p>Cambio colore: <b>€ {result.fixed.toFixed(2).replace(".", ",")}</b>{result.onRequest && " · Netto mancante: prezzo su richiesta"}</p>}
    </>}
  </section>;
}
