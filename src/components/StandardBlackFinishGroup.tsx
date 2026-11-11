import {useEffect,useRef} from "react";
import {isFixedPrice} from "@/lib/quote-series";
type Row=Record<string,any>;
export function allStandardBlackTextured(rows:Row[]):boolean {
  const active=rows.filter(row=>!isFixedPrice(row));
  return active.length>0 && active.every(row=>row.nero_standard_goffrato===true);
}
export function withStandardBlackFinish<T extends Row>(rows:T[],value:boolean):T[]{
  return rows.map(row=>isFixedPrice(row)?row:{...row,nero_standard_goffrato:value});
}
export default function StandardBlackFinishGroup({rows,disabled,onChange}:{rows:Row[];disabled:boolean;onChange:(value:boolean)=>void}){
  const ref=useRef<HTMLInputElement>(null);
  const active=rows.filter(row=>!isFixedPrice(row));
  const checked=allStandardBlackTextured(rows);
  const mixed=!checked && active.some(row=>row.nero_standard_goffrato===true);
  useEffect(()=>{if(ref.current)ref.current.indeterminate=mixed;},[mixed]);
  if(!active.length)return null;
  return <div className="space-y-1 p-3">
    <label className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
      <input ref={ref} type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-600" disabled={disabled}
        checked={checked} aria-checked={mixed?"mixed":checked} onChange={event=>onChange(event.target.checked)}/>
      Goffrato — nero standard RAL 9005 (tutti i prodotti)
    </label>
    <p className="text-xs text-slate-600">Senza supplemento. Applica la scelta a tutti i prodotti; puoi cambiarla nelle singole righe. Le righe a forfait e di serie sono escluse.</p>
    {mixed && <p className="text-xs font-medium text-amber-800">Finiture diverse: alcuni prodotti sono goffrati, altri lisci.</p>}
  </div>;
}
