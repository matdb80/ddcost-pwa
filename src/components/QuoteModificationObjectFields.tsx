import {useState} from "react";
import {MODIFICATION_OBJECTS,toggleModificationObject} from "@/lib/quote-material-weight";

type Props={
  value:unknown;
  disabled?:boolean;
  idPrefix:string;
  compact?:boolean;
  onChange:(value:string[])=>void;
};

export default function QuoteModificationObjectFields({value,disabled=false,idPrefix,compact=false,onChange}:Props){
  const [custom,setCustom]=useState("");
  const [added,setAdded]=useState<string[]>([]);
  const selected=Array.isArray(value)?value.filter((item):item is string=>typeof item==="string" && !!item.trim()):[];
  const options=Array.from(new Set<string>([...MODIFICATION_OBJECTS,...added,...selected]));
  const add=()=>{
    const name=custom.trim().replace(/\s+/g," ");
    if(!name||disabled)return;
    const existing=options.find(x=>x.toLocaleLowerCase("it-IT")===name.toLocaleLowerCase("it-IT"));
    const option=existing??name;
    if(!existing)setAdded(prev=>[...prev,option]);
    if(!selected.includes(option))onChange([...selected,option]);
    setCustom("");
  };
  return <fieldset className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <legend className="px-1 text-sm font-semibold text-slate-800">Oggetto della modifica</legend>
    <p className="mb-2 text-xs text-slate-600">Seleziona una o più voci, se pertinenti al prodotto.</p>
    <div className={`grid grid-cols-1 ${compact?"sm:grid-cols-2":"sm:grid-cols-2 lg:grid-cols-3"} gap-x-3 gap-y-1.5`}>
      {options.map((option,index)=>{
        const id=`${idPrefix}-${index}`;
        const label=option.charAt(0).toUpperCase()+option.slice(1);
        return <label key={option} htmlFor={id}
          className={`flex min-h-9 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-slate-700 ${disabled?"opacity-70":"cursor-pointer hover:bg-white"}`}>
          <input id={id} type="checkbox" disabled={disabled} checked={selected.includes(option)}
            onChange={()=>onChange(toggleModificationObject(value,option))}
            className="h-4 w-4 shrink-0 accent-emerald-600"/>
          <span>{label}</span>
        </label>;
      })}
    </div>
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-xs text-slate-600" htmlFor={`${idPrefix}-custom`}>Nuovo oggetto della modifica
        <input id={`${idPrefix}-custom`} value={custom} disabled={disabled} maxLength={120}
          placeholder="Es. Foratura aggiuntiva" onChange={e=>setCustom(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add();}}}
          className="mt-1 min-h-11 w-full rounded border border-slate-300 bg-white px-3 text-sm"/>
      </label>
      <button type="button" disabled={disabled||!custom.trim()} onClick={add}
        className="min-h-11 rounded bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50">Aggiungi</button>
    </div>
  </fieldset>;
}
