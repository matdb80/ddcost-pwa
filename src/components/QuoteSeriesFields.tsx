import {ralCodeInfo} from "@/lib/ral-pricing";
import {seriesNetPriceWithSurcharge} from "@/lib/quote-series";
import {seriesDiscount} from "@/lib/series-discount";
import QuoteNumericInput from "./QuoteNumericInput";
import {QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} from "@/lib/quote-product-description";
import type {Product} from "@/lib/quote-calculation";
export default function QuoteSeriesFields({product,calculated,ralEnabled,disabled,onChange}:{product:Product;calculated?:Product;ralEnabled?:boolean;disabled:boolean;onChange:(key:string,value:unknown)=>void}) {
  const inputClass="h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 disabled:bg-slate-100";
  let net=NaN,error="";
  try{net=seriesNetPriceWithSurcharge(product);}catch{error="Prezzo base o sconto non valido: verifica i valori inseriti.";}
  const finalNet=ralEnabled?calculated?.prezzo_netto_unitario_finale:net;
  const total=Number(product.quantita)*finalNet;
  const valid=product.prezzo_serie!=null && product.prezzo_serie!=="" && Number(product.quantita)>0 && Number.isFinite(total);
  // Prezzo base memorizzato (non il netto calcolato)
  const basePrice=typeof product.prezzo_serie==="number"?product.prezzo_serie:typeof product.prezzo_serie==="string"&&product.prezzo_serie.trim()!==""?Number(product.prezzo_serie):null;
  // Validazione sconto
  let discountError="";
  if(product.sconto_serie!=null && product.sconto_serie!==""){
    try{seriesDiscount(product.sconto_serie);}catch(e){discountError=(e as Error).message;}
  }
  return <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_7rem_10rem_12rem]">
      <label className="flex min-w-0 flex-col gap-1 text-xs"><span>Codice articolo *</span>
        <input className={inputClass} disabled={disabled} required value={product.codice??""} onChange={e=>onChange("codice",e.target.value)}/>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs"><span>Descrizione *</span>
        <input className={inputClass} disabled={disabled} required maxLength={QUOTE_PRODUCT_DESCRIPTION_MAX_LENGTH} value={product.descrizione??""} onChange={e=>onChange("descrizione",e.target.value)}/>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs"><span>Quantità *</span>
        <QuoteNumericInput kind="decimal" optional required disabled={disabled} className={inputClass} value={product.quantita??null} onChange={v=>onChange("quantita",v)}/>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs"><span>Prezzo unitario base €/pz *</span>
        <QuoteNumericInput kind="euro" fractionDigits={4} optional required disabled={disabled} className={inputClass} value={basePrice} onChange={v=>onChange("prezzo_serie",v)}/>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs"><span>Sconto di serie</span>
        <input className={inputClass} disabled={disabled} placeholder="Es. 50+15%"
          value={String(product.sconto_serie??"")}
          onChange={e=>onChange("sconto_serie",e.target.value||undefined)}/>
      </label>
    </div>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-emerald-700" disabled={disabled}
        checked={product.supplemento_sconfezionamento===true}
        onChange={e=>onChange("supplemento_sconfezionamento",e.target.checked)}/>
      Applica supplemento per sconfezionamento (+20%)
    </label>
    {product.supplemento_sconfezionamento===true&&<p className="text-xs text-slate-600">Maggiorazione del 20% per confezioni non conformi ai quantitativi della colonna «pack» (condizioni di vendita allegate).</p>}
    {ralEnabled&&ralCodeInfo(String(product.codice??" ")).paintable&&!/^[a-z0-9]{11}/i.test(String(product.codice??""))&&<p className="text-sm text-amber-800">Codice articolo incompleto: inserisci il codice completo, compreso il materiale, per ottenere la versione RAL.</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {discountError&&<p role="alert" className="text-sm text-red-700">{discountError}</p>}
    {valid&&<p className="text-right text-sm">Prezzo netto: {net.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:4})} €/pz</p>}
    {ralEnabled&&calculated&&<p className="text-right text-sm">Supplemento RAL: +{calculated.ral_percentuale??0}% · Netto con RAL: {Number(finalNet).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:4})} €/pz</p>}
    <p className="text-right text-sm font-semibold">Totale riga: {valid?total.toLocaleString("it-IT",{style:"currency",currency:"EUR"}):"—"}</p>
  </div>;
}
