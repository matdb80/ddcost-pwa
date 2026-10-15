import {useEffect,useRef,useState} from "react";
import type {InputHTMLAttributes} from "react";

export type QuoteNumericKind = "euro" | "decimal" | "percent";
export const quoteNumericDecimals = (kind:QuoteNumericKind):number => kind==="euro"?2:1;

export function formatQuoteNumeric(value:number|null|undefined,kind:QuoteNumericKind):string {
  if(value===null || value===undefined || !Number.isFinite(value))return "";
  const n=kind==="percent"?value*100:value;
  return n.toLocaleString("it-IT",{
    useGrouping:false,minimumFractionDigits:kind==="euro"?2:0,
    maximumFractionDigits:quoteNumericDecimals(kind),
  });
}

/** Accepts decimal comma and dot, preserving transitional typing like '1,'
 *  while refusing excess decimal digits and browser's spinner/exponent syntax.
 */
export function validQuoteNumericDraft(raw:string,kind:QuoteNumericKind):boolean {
  if(raw==="")return true;
  const decimals=quoteNumericDecimals(kind);
  return new RegExp("^\\d*(?:[.,]\\d{0,"+decimals+"})?$").test(raw);
}

export function parseQuoteNumericDraft(raw:string,kind:QuoteNumericKind):number|null {
  if(!validQuoteNumericDraft(raw,kind) || !/\d/.test(raw))return null;
  const normalized=Number(raw.replace(",","."));
  if(!Number.isFinite(normalized)||normalized<0)return null;
  return kind==="percent"?normalized/100:normalized;
}

export function roundQuoteNumeric(value:number,kind:QuoteNumericKind):number {
  const factor=Math.pow(10,quoteNumericDecimals(kind));
  // Only user-entered values are rounded. Historic stored costs are unchanged.
  if(kind==="percent")return Math.round((value*100+Number.EPSILON)*factor)/factor/100;
  return Math.round((value+Number.EPSILON)*factor)/factor;
}

export default function QuoteNumericInput({
  value, onChange, kind, optional=false, disabled=false, className="", "aria-label":ariaLabel,
  ...rest
}: {
  value:number|null|undefined;
  onChange:(next:number|null)=>void;
  kind:QuoteNumericKind;
  optional?:boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>,
  "value"|"onChange"|"type"|"inputMode"|"step"|"min"|"max">) {
  const focused=useRef(false);
  const [draft,setDraft]=useState(()=>formatQuoteNumeric(value,kind));
  useEffect(()=>{
    if(!focused.current)setDraft(formatQuoteNumeric(value,kind));
  },[value,kind]);

  return <input
    {...rest}
    aria-label={ariaLabel}
    type="text" inputMode="decimal" autoComplete="off"
    disabled={disabled}
    className={className}
    value={draft}
    onFocus={()=>{focused.current=true;}}
    onChange={event=>{
      const text=event.target.value;
      if(!validQuoteNumericDraft(text,kind))return;
      setDraft(text); // Don't replace an in-progress comma or erase the caret.
      const parsed=parseQuoteNumericDraft(text,kind);
      if(parsed!==null)onChange(parsed);
      // Empty means no final value until blur, so users may freely Backspace.
    }}
    onBlur={()=>{
      focused.current=false;
      const parsed=parseQuoteNumericDraft(draft,kind);
      const committed=parsed===null?(optional?null:0):roundQuoteNumeric(parsed,kind);
      onChange(committed);
      setDraft(formatQuoteNumeric(committed,kind));
    }}
  />;
}
