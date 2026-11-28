import type { RigaCiclo } from "@/types/cycle";
import { RAW_GEOMETRIES, RAW_MATERIALS, rawMaterialCalculation } from "@/lib/cycle-raw-material";

export default function CycleRawMaterialFields({ row, onChange }: { row: RigaCiclo; onChange: (row: RigaCiclo) => void }) {
  const result = rawMaterialCalculation(row);
  const shape = row.geometria_materia_prima;
  const manual = row.peso_modalita === "manuale";
  const cls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";
  const numberField = (key: "lunghezza" | "larghezza" | "spessore" | "diametro" | "diametro_interno" | "peso_kg", label: string) => <label className="block text-xs font-medium text-slate-600">
    {label}<input className={`${cls} mt-1`} type="number" min="0" step="any" inputMode="decimal"
      value={row[key] || ""} onChange={e => onChange({ ...row, [key]: e.target.value === "" ? 0 : Number(e.target.value),
        ...(key === "peso_kg" ? { peso_storico_preservato: false } : {}) })}/>
  </label>;
  const fmt = (n: number | null | undefined, digits = 6) => n == null ? "—" : n.toLocaleString("it-IT", { maximumFractionDigits: digits });
  return <div className="col-span-2 md:col-span-3 space-y-3 rounded-lg border border-sky-200 bg-sky-50/50 p-4">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      <label className="block text-xs font-medium text-slate-600">Materiale
        <select className={`${cls} mt-1`} value={row.materiale_id ?? ""} onChange={e => {
          const material = RAW_MATERIALS.find(m => m.id === e.target.value)!;
          onChange({ ...row, materiale_id: material.id, tipo_materiale: material.label, densita_kg_m3: material.density });
        }}>
          <option value="" disabled>Seleziona materiale</option>
          {RAW_MATERIALS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">Geometria
        <select className={`${cls} mt-1`} value={shape ?? "piatto"} onChange={e => {
          const geometry = RAW_GEOMETRIES.find(g => g.id === e.target.value)!;
          onChange({ ...row, geometria_materia_prima: geometry.id, tipo_materia_prima: geometry.label });
        }}>{RAW_GEOMETRIES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
      </label>
      <label className="block text-xs font-medium text-slate-600">Unità di costo
        <select className={`${cls} mt-1`} value={row.unita_costo_materiale ?? "kg"}
          onChange={e => onChange({ ...row, unita_costo_materiale: e.target.value as "kg" | "m" })}>
          <option value="kg">€/kg</option><option value="m">€/metro</option>
        </select>
      </label>
      {numberField("lunghezza", "Lunghezza totale materiale (mm)")}
      {(shape === "piatto" || shape === "nastro") && <>{numberField("larghezza", "Larghezza (mm)")}{numberField("spessore", "Spessore (mm)")}</>}
      {(shape === "tubo" || shape === "tondino") && numberField("diametro", shape === "tubo" ? "Diametro esterno (mm)" : "Diametro (mm)")}
      {shape === "tubo" && numberField("diametro_interno", "Diametro interno (mm)")}
      <label className="block text-xs font-medium text-slate-600">Peso per componente
        <select className={`${cls} mt-1`} value={row.peso_modalita ?? "automatico"}
          onChange={e => onChange({ ...row, peso_modalita: e.target.value as "automatico" | "manuale", peso_storico_preservato: false,
            ...(e.target.value === "manuale" && result.weightKg !== null ? { peso_kg: result.weightKg } : {}) })}>
          <option value="automatico">Calcolato dalle dimensioni</option><option value="manuale">Inserito manualmente</option>
        </select>
      </label>
      {manual && numberField("peso_kg", "Peso manuale per componente (kg)")}
    </div>
    <p className="text-xs text-slate-600">Indica la lunghezza di tutto il materiale necessario per un componente, comprese le eccedenze di taglio. Non viene aggiunta una percentuale di sfrido.</p>
    {row.peso_storico_preservato && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      Il peso salvato include l’eventuale sfrido precedente e conserva il costo della riga. Per usare le dimensioni, scegli “Calcolato dalle dimensioni” e verifica la lunghezza totale.
    </p>}
    <div aria-live="polite" className="rounded bg-white p-3 text-sm text-slate-800">
      <p>Densità nominale: <strong>{fmt(result.density, 0)} kg/m³</strong> · Peso per componente: <strong>{fmt(result.weightKg)} kg</strong></p>
      <p className="mt-1">Costo riga: <strong>{fmt(result.cost)} €/pz</strong>{row.unita_costo_materiale === "m" ? ` · ${fmt(result.lengthM)} m × ${row.nr_componenti} × ${row.costo_unitario} €/m` : " · peso × componenti × €/kg"}</p>
      {result.errors.length > 0 && <p className="mt-2 text-xs text-slate-600">{result.errors[0]}</p>}
    </div>
  </div>;
}
