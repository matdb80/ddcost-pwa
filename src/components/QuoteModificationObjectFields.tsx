import {MODIFICATION_OBJECTS,toggleModificationObject,type ModificationObject} from "@/lib/quote-material-weight";

type Props={
  value:unknown;
  disabled?:boolean;
  idPrefix:string;
  compact?:boolean;
  onChange:(value:string[])=>void;
};

export default function QuoteModificationObjectFields({value,disabled=false,idPrefix,compact=false,onChange}:Props){
  const selected=Array.isArray(value)?value.filter((item):item is ModificationObject=>
    MODIFICATION_OBJECTS.includes(item as ModificationObject)) : [];
  return <fieldset className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <legend className="px-1 text-sm font-semibold text-slate-800">Oggetto della modifica</legend>
    <p className="mb-2 text-xs text-slate-600">Seleziona una o più voci, se pertinenti al prodotto.</p>
    <div className={`grid grid-cols-1 ${compact?"sm:grid-cols-2":"sm:grid-cols-2 lg:grid-cols-3"} gap-x-3 gap-y-1.5`}>
      {MODIFICATION_OBJECTS.map((option,index)=>{
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
  </fieldset>;
}
