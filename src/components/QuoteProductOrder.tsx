import {useEffect,useId,useRef,useState} from "react";
import {ArrowDown,ArrowUp} from "lucide-react";

/** Wait for Enter/blur so typing a multi-digit position never moves a partial value. */
export default function QuoteProductOrder({index,count,disabled=false,onMoveTo}:{
  index:number;count:number;disabled?:boolean;onMoveTo:(target:number)=>boolean|void;
}){
  const [draft,setDraft]=useState(String(index+1));
  const [error,setError]=useState("");
  const edited=useRef(false);
  const errorId=useId();
  useEffect(()=>{setDraft(String(index+1));setError("");edited.current=false;},[index,count]);
  const reset=()=>{setDraft(String(index+1));setError("");edited.current=false;};
  function commit(){
    if(disabled||!edited.current)return;
    const position=Number(draft);
    if(!/^\d+$/.test(draft)||!Number.isSafeInteger(position)||position<1||position>count){
      setError(`Inserisci un numero intero da 1 a ${count}`);return;
    }
    edited.current=false;setError("");
    if(position===index+1 || onMoveTo(position-1)===false)setDraft(String(index+1));
    else setDraft(String(position));
  }
  return <div className="flex shrink-0 flex-col gap-1">
    <div className="flex items-center gap-1">
      <button type="button" aria-label={`Sposta su prodotto ${index+1}`} title="Sposta su" disabled={disabled||index===0}
        className="min-h-9 min-w-8 rounded p-1 hover:bg-white/30 disabled:opacity-30"
        onPointerDown={e=>e.preventDefault()} onClick={()=>{reset();onMoveTo(index-1);}}><ArrowUp size={17}/></button>
      <label className="flex items-center gap-1 whitespace-nowrap text-xs font-normal">
        Posizione
        <input type="text" inputMode="numeric" autoComplete="off" aria-label={`Posizione prodotto ${index+1}`}
          aria-invalid={Boolean(error)} aria-describedby={error?errorId:undefined}
          title={`Posizione da 1 a ${count}. Premi Invio o esci dal campo per spostare il prodotto.`}
          disabled={disabled} value={draft} size={Math.max(2,String(count).length)}
          style={{width:`${Math.max(2,String(count).length)+2}ch`}}
          className="h-9 rounded border border-slate-400 bg-white px-1 text-center text-sm font-semibold text-slate-950 disabled:bg-slate-100"
          onChange={e=>{edited.current=true;setDraft(e.target.value);setError("");}}
          onBlur={commit} onKeyDown={e=>{
            if(e.key==="Enter"){e.preventDefault();commit();}
            if(e.key==="Escape"){e.preventDefault();reset();}
          }}/>
        <span className="tabular-nums">/ {count}</span>
      </label>
      <button type="button" aria-label={`Sposta giù prodotto ${index+1}`} title="Sposta giù" disabled={disabled||index===count-1}
        className="min-h-9 min-w-8 rounded p-1 hover:bg-white/30 disabled:opacity-30"
        onPointerDown={e=>e.preventDefault()} onClick={()=>{reset();onMoveTo(index+1);}}><ArrowDown size={17}/></button>
    </div>
    {error&&<span id={errorId} role="alert" className="max-w-52 text-xs font-medium text-red-950">{error}</span>}
  </div>;
}
