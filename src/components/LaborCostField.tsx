import {useEffect,useState} from "react";
import type {KeyboardEventHandler} from "react";
import QuoteNumericInput from "./QuoteNumericInput";

/** The input is always hourly; cycles continue to store their original €/minute. */
export default function LaborCostField({
  id,value,onChange,storedUnit="hour",disabled=false,inputClassName="",inputTitle,onKeyDown,
}: {
  id:string;
  value:number|null|undefined;
  onChange:(value:number)=>void;
  storedUnit?:"hour"|"minute";
  disabled?:boolean;
  inputClassName?:string;
  inputTitle?:string;
  onKeyDown?:KeyboardEventHandler<HTMLInputElement>;
}) {
  const hourly=value==null?null:storedUnit==="minute"?value*60:value;
  const [draftHourly,setDraftHourly]=useState(hourly);
  useEffect(()=>setDraftHourly(hourly),[hourly]);
  const minuteText=draftHourly==null||!Number.isFinite(draftHourly)||draftHourly<0
    ?"—":(draftHourly/60).toLocaleString("it-IT",{minimumFractionDigits:4,maximumFractionDigits:4});
  return <label className="flex min-w-0 flex-col gap-1 text-xs" htmlFor={id}>
    <span className="font-medium leading-4 text-slate-600">
      Costo €/h <span id={id+"-minute-rate"} className="whitespace-nowrap font-normal">({minuteText} €/min)</span>
    </span>
    <QuoteNumericInput id={id} aria-label="Costo €/h" aria-describedby={id+"-minute-rate"}
      kind="euro" fractionDigits={storedUnit==="minute"?6:2} disabled={disabled}
      className={inputClassName} title={inputTitle} value={hourly}
      onDraftChange={setDraftHourly}
      onChange={next=>onChange(storedUnit==="minute"?(next??0)/60:next??0)}
      onKeyDown={onKeyDown}/>
  </label>;
}
