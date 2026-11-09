export default function StandardBlackFinish({value,disabled,onChange}:{
  value:unknown;disabled:boolean;onChange:(value:boolean)=>void;
}){
  return <label className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
    <input type="checkbox" aria-label="Nero standard RAL 9005 goffrato" className="h-4 w-4 shrink-0 accent-emerald-600" disabled={disabled}
      checked={value===true} onChange={event=>onChange(event.target.checked)}/>
    <span>Nero standard RAL 9005 goffrato</span>
    <span className="text-slate-500">Senza supplemento · non selezionato = liscio</span>
  </label>;
}
