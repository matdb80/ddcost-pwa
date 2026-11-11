import QuoteNumericInput from "./QuoteNumericInput";
import {QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} from "@/lib/quote-product-description";
import type {Product} from "@/lib/quote-calculation";
export default function QuoteSeriesFields({product,disabled,onChange}:{product:Product;disabled:boolean;onChange:(key:string,value:unknown)=>void}) {
  const inputClass="h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 disabled:bg-slate-100";
  const total=Number(product.quantita)*Number(product.prezzo_serie);
  const valid=product.prezzo_serie!=null && product.prezzo_serie!=="" && Number(product.quantita)>0 && Number.isFinite(total);
  return <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_8rem_12rem]">
      <label className="flex min-w-0 flex-col gap-1 text-xs"><span>Codice articolo *</span>
        <input className={inputClass} disabled={disabled} required value={product.codice??""} onChange={e=>onChange("codice",e.target.value)}/>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs"><span>Descrizione *</span>
        <input className={inputClass} disabled={disabled} required maxLength={QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} value={product.descrizione??""} onChange={e=>onChange("descrizione",e.target.value)}/>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs"><span>Quantità *</span>
        <QuoteNumericInput kind="decimal" optional required disabled={disabled} className={inputClass} value={product.quantita??null} onChange={v=>onChange("quantita",v)}/>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs"><span>Prezzo unitario €/pz *</span>
        <QuoteNumericInput kind="euro" optional required disabled={disabled} className={inputClass} value={product.prezzo_serie??null} onChange={v=>onChange("prezzo_serie",v)}/>
      </label>
    </div>
    <p className="text-right text-sm font-semibold">Totale riga: {valid?total.toLocaleString("it-IT",{style:"currency",currency:"EUR"}):"—"}</p>
  </div>;
}
