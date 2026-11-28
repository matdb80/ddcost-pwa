import type {ClipboardEvent,InputHTMLAttributes,KeyboardEvent} from "react";
import {validManualTemporaryCode,validTemporarySuffix} from "@/lib/ral-pricing";

export default function ArticleCodeInput({value,onChange,protectedPrefix,...props}:{
  value:string;onChange:(value:string)=>void;protectedPrefix?:string|null;
}&Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange">){
  // Con prefisso protetto i primi 11 caratteri (emessi dal generatore) non si
  // possono alterare: i tasti che li toccherebbero sono bloccati prima
  // dell'effetto; onChange resta come rete di sicurezza (IME, autofill).
  const guardPrefix=(event:KeyboardEvent<HTMLInputElement>|ClipboardEvent<HTMLInputElement>)=>{
    if(!protectedPrefix)return false;
    const el=event.currentTarget,start=el.selectionStart??0,end=el.selectionEnd??0,p=protectedPrefix.length;
    if(event.type==="cut")return start<p;
    const key=(event as KeyboardEvent<HTMLInputElement>).key;
    if(key==="Backspace")return start===end?start<=p:start<p;
    if(key==="Delete")return start<p;
    return key.length===1&&!(event as KeyboardEvent<HTMLInputElement>).ctrlKey
      &&!(event as KeyboardEvent<HTMLInputElement>).metaKey&&start<p;
  };
  return <input {...props} value={value}
    title={protectedPrefix?"Primi 11 caratteri protetti. Puoi modificare solo il dodicesimo carattere.":props.title}
    onFocus={event=>{
      props.onFocus?.(event);
      if(protectedPrefix)event.currentTarget.setSelectionRange(protectedPrefix.length,value.length);
    }}
    onKeyDown={event=>{
      props.onKeyDown?.(event);
      if(!event.defaultPrevented&&guardPrefix(event))event.preventDefault();
    }}
    onCut={event=>{
      props.onCut?.(event);
      if(!event.defaultPrevented&&guardPrefix(event))event.preventDefault();
    }}
    onDrop={event=>{if(protectedPrefix)event.preventDefault();}}
    onChange={event=>{
      const next=event.target.value;
      // Con prefisso protetto (codice temporaneo ottone/alluminio) il dodicesimo
      // carattere digitato è convertito subito in maiuscolo: il codice nella
      // riga coincide sempre con quello emesso dal generatore.
      if(!protectedPrefix)onChange(next);
      else{
        if(validManualTemporaryCode(next,protectedPrefix,true))onChange(protectedPrefix + next.slice(protectedPrefix.length).toUpperCase());
      }
    }}
    onPaste={event=>{
      props.onPaste?.(event);
      if(event.defaultPrevented||!protectedPrefix)return;
      // L'incolla non scrive mai nel campo: passa solo dalla validazione, così
      // il prefisso non può cambiare nemmeno per un istante. Accetta il solo
      // carattere finale oppure il codice intero, purché col prefisso intatto.
      event.preventDefault();
      const pasted=event.clipboardData.getData("text").trim();
      if(validManualTemporaryCode(pasted,protectedPrefix))onChange(protectedPrefix + pasted.slice(protectedPrefix.length).toUpperCase());
      else if(validTemporarySuffix(pasted))onChange(protectedPrefix+pasted.toUpperCase());
    }}/>
}
