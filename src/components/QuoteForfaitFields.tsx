import QuoteNumericInput from "./QuoteNumericInput";
import {QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} from "@/lib/quote-product-description";
import type {Product} from "@/lib/quote-calculation";

export default function QuoteForfaitFields({product,disabled,onChange}:{
  product:Product;disabled:boolean;onChange:(key:string,value:unknown)=>void;
}){
  const inputClass="h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 disabled:bg-slate-100";
  return <div className="space-y-3">
    <p className="text-sm text-slate-600">Importo complessivo fisso della riga. Non si applicano costi, quantità, margini, quadratura o supplementi RAL.</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <label className="flex min-w-0 flex-col gap-1 text-xs">
        <span className="flex justify-between gap-2"><span>Descrizione *</span><span>{String(product.descrizione??"").length}/{QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH}</span></span>
        <input className={inputClass} disabled={disabled} aria-label="Descrizione *" maxLength={QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH}
          value={product.descrizione??""} onChange={e=>onChange("descrizione",e.target.value)}/>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs">
        <span>Valore di vendita a forfait € *</span>
        <QuoteNumericInput kind="euro" optional disabled={disabled} className={inputClass}
          value={product.valore_forfait??null} onChange={value=>onChange("valore_forfait",value)}/>
      </label>
    </div>
    <p className="text-xs text-slate-600">Nel PDF: descrizione, valore e <strong>a forfait/da definire</strong>. I dati standard restano conservati se disattivi questa opzione.</p>
  </div>;
}
