import type {InputHTMLAttributes} from "react";
import {validManualTemporaryCode,validTemporarySuffix} from "@/lib/ral-pricing";

export default function ArticleCodeInput({value,onChange,protectedPrefix,...props}:{
  value:string;onChange:(value:string)=>void;protectedPrefix?:string|null;
}&Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange">){
  return <input {...props} value={value}
    title={protectedPrefix?"Primi 11 caratteri protetti. Puoi modificare solo il dodicesimo carattere.":props.title}
    onFocus={event=>{
      props.onFocus?.(event);
      if(protectedPrefix)event.currentTarget.setSelectionRange(protectedPrefix.length,value.length);
    }}
    onChange={event=>{
      const next=event.target.value;
      if(!protectedPrefix || validManualTemporaryCode(next,protectedPrefix,true))onChange(next);
    }}
    onPaste={event=>{
      props.onPaste?.(event);
      const pasted=event.clipboardData.getData("text");
      if(!event.defaultPrevented && protectedPrefix && validTemporarySuffix(pasted)){
        event.preventDefault();onChange(protectedPrefix+pasted);
      }
    }}/>
}
