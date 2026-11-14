import {useState} from "react";
import {predefinedObjectsSet,toggleModificationObject} from "@/lib/quote-material-weight";
import {modificationObjectError} from "@/lib/quote-modification-validation";
import {Pencil} from "lucide-react";

type Props={
  value:unknown;
  disabled?:boolean;
  idPrefix:string;
  compact?:boolean;
  /** Oggetti personalizzati del preventivo (visibili in tutti i prodotti). */
  customObjects?:string[];
  /** Callback quando un oggetto personalizzato viene rinominato. */
  onRename?:(oldName:string,newName:string)=>void;
  onChange:(value:string[])=>void;
};

export default function QuoteModificationObjectFields({value,disabled=false,idPrefix,compact=false,customObjects=[],onRename,onChange}:Props){
  const [custom,setCustom]=useState("");
  const [editing,setEditing]=useState<string|null>(null);
  const [editValue,setEditValue]=useState("");
  const [editError,setEditError]=useState("");
  const selected=Array.isArray(value)?value.filter((item):item is string=>typeof item==="string" && !!item.trim()):[];
  // Catalogo: predefiniti + personalizzati dal preventivo + selezionati locali non ancora nel catalogo
  const options=Array.from(new Set<string>([...predefinedObjectsSet,...customObjects,...selected]));
  const missing=!disabled && Boolean(modificationObjectError(value));
  const isCustom=(option:string)=>!predefinedObjectsSet.has(option);
  const add=()=>{
    const name=custom.trim().replace(/\s+/g," ");
    if(!name||disabled)return;
    const existing=options.find(x=>x.toLocaleLowerCase("it-IT")===name.toLocaleLowerCase("it-IT"));
    const option=existing??name;
    if(!selected.includes(option))onChange([...selected,option]);
    setCustom("");
  };
  const startEdit=(option:string)=>{
    if(disabled||!isCustom(option))return;
    setEditing(option);
    setEditValue(option);
    setEditError("");
  };
  const confirmEdit=(oldName:string)=>{
    const newName=editValue.trim().replace(/\s+/g," ");
    if(!newName){setEditError("Il nome non può essere vuoto.");return;}
    if(newName===oldName){setEditing(null);setEditError("");return;}
    const existing=options.find(x=>x.toLocaleLowerCase("it-IT")===newName.toLocaleLowerCase("it-IT") && x!==oldName);
    if(existing){setEditError(`"${newName}" esiste già nel catalogo.`);return;}
    if(onRename)onRename(oldName,newName);
    setEditing(null);
    setEditError("");
  };
  return <fieldset aria-invalid={missing} aria-describedby={`${idPrefix}-hint`}
    className={`min-w-0 rounded-lg border p-3 ${missing?"border-amber-400 bg-amber-50":"border-slate-200 bg-slate-50"}`}>
    <legend className="px-1 text-sm font-semibold text-slate-800">Oggetto della modifica *</legend>
    <p id={`${idPrefix}-hint`} className="mb-2 text-xs text-slate-600">Seleziona almeno una voce per questo prodotto (obbligatorio). Puoi aggiungere una voce personalizzata. Clicca la matita per modificare il nome di una voce personalizzata.</p>
    <div className={`grid grid-cols-1 ${compact?"sm:grid-cols-2":"sm:grid-cols-2 lg:grid-cols-3"} gap-x-3 gap-y-1.5`}>
      {options.map((option,index)=>{
        const id=`${idPrefix}-${index}`;
        const label=option.charAt(0).toUpperCase()+option.slice(1);
        const editingThis=editing===option;
        return <div key={option}
          className={`flex min-h-9 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-slate-700 ${disabled?"opacity-70":"hover:bg-white"}`}>
          <input id={id} type="checkbox" disabled={disabled} checked={selected.includes(option)}
            onChange={()=>onChange(toggleModificationObject(value,option))}
            className="h-4 w-4 shrink-0 accent-emerald-600"/>
          {editingThis?(
            <div className="min-w-0 flex-1">
              <input value={editValue} autoFocus aria-label={`Modifica nome ${option}`}
                onChange={e=>{setEditValue(e.target.value);setEditError("");}}
                onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();confirmEdit(option);}if(e.key==="Escape"){setEditing(null);setEditError("");}}}
                onBlur={()=>confirmEdit(option)}
                maxLength={120}
                className="w-full rounded border border-emerald-300 bg-white px-1 text-sm"/>
              {editError&&<p className="mt-0.5 text-xs text-red-600">{editError}</p>}
            </div>
          ):<label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">{label}</label>}
          {isCustom(option) && !editingThis && !disabled && (
            <button type="button" onClick={()=>startEdit(option)} aria-label={`Modifica nome ${label}`}
              className="shrink-0 text-slate-400 hover:text-emerald-600">
              <Pencil className="w-3.5 h-3.5"/>
            </button>
          )}
        </div>;
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
