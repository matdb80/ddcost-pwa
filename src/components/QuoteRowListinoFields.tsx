import {buildRowListino,rowListinoDiscountLabel} from "@/lib/quote-row-listino";
import type {Product} from "@/lib/quote-calculation";
export default function QuoteRowListinoFields({product,net,disabled,onChange,historical}:{
  product:Product;net:unknown;disabled:boolean;onChange:(key:string,value:unknown)=>void;
  historical?:{listino:number;discount:string}|null;
}){
  let gross:number|undefined,error="",label="";
  if(product.genera_listino===true){
    try{
      const result=buildRowListino(Number(net),String(product.sconto_cliente??""));
      if(!result)error="Inserire lo sconto cliente per generare il listino.";
      else{gross=result.listino;label=rowListinoDiscountLabel(product.sconto_cliente);}
    }catch(e){error=(e as Error).message;}
  }
  const money=(v:number)=>v.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});
  return <div className="flex min-w-0 flex-col gap-2 text-xs">
    <label className="flex items-center gap-2 font-medium">
      <input type="checkbox" disabled={disabled} checked={product.genera_listino===true} onChange={e=>onChange("genera_listino",e.target.checked)}/>
      Generare lordo da sconto cliente
    </label>
    {product.genera_listino===true&&<>
      <label className="flex min-w-0 flex-col gap-1"><span>Sconto cliente (es. 40+10%)</span>
        <input disabled={disabled} className="h-10 w-full max-w-48 rounded-lg border border-slate-300 px-2" value={product.sconto_cliente??""} placeholder="40+10%" aria-invalid={Boolean(error)} onChange={e=>onChange("sconto_cliente",e.target.value)}/>
      </label>
      {gross!==undefined&&<p>Listino lordo: <b>€ {money(gross)}</b><span className="block text-slate-500">Sconto: {label}</span></p>}
      {error&&<p role="alert" className="text-red-700">{error}</p>}
    </>}
    {product.genera_listino==null&&historical&&<p>Listino storico: € {money(historical.listino)} · Sconto: {historical.discount}. Attiva la generazione per aggiornarlo.</p>}
  </div>;
}
