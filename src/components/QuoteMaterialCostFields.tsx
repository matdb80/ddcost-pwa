import QuoteNumericInput from "@/components/QuoteNumericInput";
import { calculateMaterialByWeight, type MaterialName } from "@/lib/quote-material-weight";
import type { Product } from "@/lib/quote-calculation";

type Props={
  product:Product;
  disabled:boolean;
  onChange:(key:string,value:unknown)=>void;
  mobile?:boolean;
};
const fields=[
  {key:"lunghezza_mm",label:"Lunghezza (mm)",kind:"decimal" as const},
  {key:"larghezza_mm",label:"Larghezza (mm)",kind:"decimal" as const},
  {key:"spessore_mm",label:"Spessore (mm)",kind:"decimal" as const},
  {key:"costo_materiale_kg",label:"Costo materiale (€/kg)",kind:"euro" as const},
];

export default function QuoteMaterialCostFields({product,disabled,onChange,mobile=false}:Props){
  // Undefined on historic documents means the pre-existing cost-per-piece model.
  const known=product.costo_materiale_noto!==false;
  let result:ReturnType<typeof calculateMaterialByWeight>|null=null;
  let validationMessage="";
  if(!known){
    try {
      result=calculateMaterialByWeight({
        material:String(product.materiale_prodotto??"") as MaterialName,
        lengthMm:Number(product.lunghezza_mm??0),
        widthMm:Number(product.larghezza_mm??0),
        thicknessMm:Number(product.spessore_mm??0),
        euroPerKg:Number(product.costo_materiale_kg??0),
      });
    }catch(error){
      validationMessage=error instanceof Error?error.message:"Dimensioni o materiale non validi";
    }
  }
  const inputClass=mobile
    ?"h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base tabular-nums focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
    :"h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm tabular-nums focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";
  const amount=(n:number,digits:number)=>n.toLocaleString("it-IT",{minimumFractionDigits:digits,maximumFractionDigits:digits});
  return <div className={mobile?"space-y-3":"rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 space-y-2"}>
    <label className="flex min-h-7 cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
      <input type="checkbox" className="h-4 w-4 accent-emerald-600" disabled={disabled}
        checked={known} onChange={e=>onChange("costo_materiale_noto",e.target.checked)}/>
      Conosci il costo del materiale
    </label>
    {known?
      <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-700">
        <span className="font-medium">Materiale €/pz</span>
        <QuoteNumericInput kind="euro" disabled={disabled} className={inputClass+(mobile?"":" max-w-44")}
          value={product.materiale_cad??0} onChange={value=>onChange("materiale_cad",value)}/>
      </label>
    :<>
      <div className={mobile?"grid grid-cols-2 gap-3":"grid grid-cols-2 gap-2 sm:grid-cols-4"}>
        {fields.map(f=><label key={f.key} className="flex min-w-0 flex-col gap-1 text-xs text-slate-700">
          <span className="font-medium">{f.label}</span>
          <QuoteNumericInput kind={f.kind} disabled={disabled} className={inputClass}
            value={product[f.key]??0} onChange={value=>onChange(f.key,value)}/>
        </label>)}
      </div>
      {result?
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-emerald-900" role="status">
          <span>Peso teorico: <strong>{amount(result.theoreticalWeightKg,4)} kg/pz</strong></span>
          <span>Costo materiale calcolato: <strong>€ {amount(result.materialCostPerPiece,4)}/pz</strong></span>
        </div>
      : <p className="text-xs text-amber-800" role="status">{validationMessage}</p>}
      <p className="text-[11px] text-slate-500">
        Stima di un grezzo rettangolare pieno. Peso specifico indicativo:
        ferro 7,85 · inox 8,00 · ottone 8,50 g/cm³.
        Fori, sagome, sfridi e altri costi non sono inclusi.
      </p>
    </>}
  </div>;
}
