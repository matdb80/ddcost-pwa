import Layout from "@/components/Layout";
import { useState } from "react";
import { Calculator, Copy } from "lucide-react";
import FormulaTooltip from "@/components/FormulaTooltip";
import { quoteBandellaT, type TKind, type TPosition, type TRequest, type TResponse, PRICES } from "@/lib/bandelle-t-listino";
import { CALCULATION_FORMULAS } from "@/lib/calculation-formulas";

const AMBITI: Array<{ id: TKind; title: string; desc: string; img: string }> = [
  { id:"standard", title:"Occhio standard", desc:"Occhio centrale o decentrato con posizionamento standard", img:"/images/occhio standard.png" },
  { id:"misura", title:"Occhio decentrato a misura", desc:"Posizione dell'occhio da definire a disegno", img:"/images/decentrato a misura.png" },
  { id:"zanca", title:"Zanca a filo", desc:"Zancatura a filo, lama da 16 cm", img:"/images/zancata a filo.png" },
];
const initial: TRequest = {
  kind:"standard", quantity:20, collar:55, position:"centrale",
  diameterOther:false, reverseOffset:false, overlap:false,
  zancaLength:35,
};
const prices3 = (n:number) => n.toLocaleString("it-IT",{minimumFractionDigits:3,maximumFractionDigits:3});
const prices2 = (n:number) => n.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function BandelleTPage() {
  const [req,setReq] = useState<TRequest>(initial);
  const [response,setResponse] = useState<TResponse|null>(null);
  const [message,setMessage] = useState("");
  const set = <K extends keyof TRequest>(key:K,value:TRequest[K]) => {
    setReq(prev=>({...prev,[key]:value}));
    setResponse(null);
    setMessage("");
  };
  const selectKind = (kind: TKind) => {
    setReq(prev => ({
      ...prev,
      kind,
      collar: PRICES[kind].some(row => row.collo === prev.collar) ? prev.collar : PRICES[kind][0].collo,
    }));
    setResponse(null);
    setMessage("");
  };
  const calculate = () => {
    try {
      const result = quoteBandellaT(req);
      setResponse(result);
      setMessage("");
    } catch (err) {
      setResponse(null);
      setMessage(err instanceof Error ? err.message : "Combinazione non disponibile");
    }
  };
  const copyResult = () => {
    if (!response) return;
    const roundedUnit = Math.round((response.unit + Number.EPSILON) * 100) / 100;
    const roundedTotal = Math.round((roundedUnit * req.quantity + Number.EPSILON) * 100) / 100;
    const eyeType = req.kind === "standard"
      ? (req.position === "centrale" ? "centrale" : "decentrato")
      : (req.kind === "misura" ? "a misura" : "zancato a filo");
    const text = [
      "Codice: " + response.code,
      "Bandella a T occhio " + eyeType + " C=" + response.size,
      "Lotto: " + req.quantity,
      "Prezzo netto unitario: " + prices2(roundedUnit),
      "Totale : " + prices2(roundedTotal),
    ].join("\n");
    void navigator.clipboard.writeText(text).then(()=>setMessage("Riepilogo copiato."),()=>setMessage("Copia non riuscita."));
  };
  return <Layout>
    <div className="max-w-5xl mx-auto pb-10 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Bandelle a T — Listino Smeralda</h2>
        <p className="text-sm text-slate-500">Lama 16 cm · Tabelle originali del file XLSM · Aggiornamento prezzi indicato nel foglio: +4,5% dal 01/03/2026, già incluso.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {AMBITI.map(a=><button type="button" key={a.id} onClick={()=>selectKind(a.id)}
          className={"text-left p-4 rounded-xl border-2 transition-all "+(req.kind===a.id?"border-emerald-500 bg-emerald-50":"border-slate-200 bg-white hover:border-emerald-300")}>
          <div className="h-24 bg-white rounded-lg border border-slate-100 mb-3 flex items-center justify-center overflow-hidden">
            <img src={a.img} alt={a.title} className="max-h-full max-w-full object-contain" />
          </div>
          <h3 className="font-semibold text-slate-800">{a.title}</h3>
          <p className="text-xs text-slate-500 mt-1">{a.desc}</p>
        </button>)}
      </div>
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Calculator size={18} className="text-emerald-600"/>Dati di calcolo</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Quantità lotto (4–100 pz)
            <input type="number" min="4" max="100" step="1" className="border rounded p-2" value={req.quantity}
              onChange={e=>set("quantity",Number(e.target.value))}/>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Collo D (mm) — misura di listino
            <select className="border rounded p-2" value={req.collar}
              onChange={e=>set("collar",Number(e.target.value))}>
              {PRICES[req.kind].map(row=><option key={row.collo} value={row.collo}>{row.collo} mm</option>)}
            </select>
          </label>
          {req.kind==="standard"&&<label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Posizione occhio standard
            <select className="border rounded p-2" value={req.position} onChange={e=>set("position",e.target.value as TPosition)}>
              <option value="centrale">Centrale (Z=2 mm)</option>
              <option value="decentrato">Decentrato (Z=6 mm)</option>
            </select>
          </label>}
          {req.kind==="zanca"&&<label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Lunghezza zanca a filo (mm) — da 15 a 35
            <select className="border rounded p-2" value={req.zancaLength}
              onChange={e=>set("zancaLength",Number(e.target.value))}>
              {Array.from({length:21},(_,i)=>i+15).map(n=><option key={n} value={n}>{n} mm</option>)}
            </select>
          </label>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <label className="flex gap-2 items-center"><input type="checkbox" checked={req.diameterOther} onChange={e=>set("diameterOther",e.target.checked)}/>Occhio diverso da Ø12 (+3,00 €/pz)</label>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={req.overlap} onChange={e=>set("overlap",e.target.checked)}/>Applicazione sormonto (+{req.kind==="zanca"?"2,00":"2,50"} €/pz)</label>
          {req.kind==="standard" && req.position==="decentrato"&&
            <label className="flex gap-2 items-center"><input type="checkbox" checked={req.reverseOffset} onChange={e=>set("reverseOffset",e.target.checked)}/>Decentratura al contrario (+1,00 €/pz)</label>}
        </div>
        {req.kind==="misura"&&<p className="text-slate-600 text-sm">Posizione occhio a disegno. Prima dell'ordine occorre definire le quote e completare il codice variabile.</p>}
        <div className="flex gap-3 flex-wrap">
          <button type="button" onClick={calculate} className="bg-emerald-600 text-white rounded px-4 py-2 font-semibold hover:bg-emerald-700">Calcola prezzo</button>
          <button type="button" onClick={()=>{setReq(initial);setResponse(null);setMessage("");}} className="bg-slate-100 rounded px-4 py-2">Azzera</button>
        </div>
        {message&&<div role="status" className="bg-amber-50 border border-amber-200 text-amber-900 rounded p-3 text-sm">{message}</div>}
      </section>
      {response&&<section className="bg-white rounded-xl border-2 border-emerald-200 p-6 space-y-3">
        <div className="flex justify-between gap-3 flex-wrap items-center"><h3 className="font-semibold text-xl">Preventivo da listino</h3>
          <button type="button" onClick={copyResult} className="border rounded px-3 py-2 text-sm flex gap-2 items-center"><Copy size={16}/>Copia riepilogo</button>
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div><dt className="text-slate-500">Codice listino</dt><dd className="font-mono font-semibold">{response.code}</dd></div>
          <div><dt className="text-slate-500">Collo selezionato</dt><dd className="font-semibold">{response.size} mm</dd></div>
          <div><dt className="text-slate-500">Fascia lotto</dt><dd className="font-semibold">{response.tier} pz</dd></div>
          <div><dt className="text-slate-500">Prezzo base</dt><dd className="font-semibold">{prices3(response.base)} €/pz<FormulaTooltip label="Prezzo base da listino" formula={CALCULATION_FORMULAS.bandelleT.basePrice}/></dd></div>
          <div><dt className="text-slate-500">Supplementi complessivi</dt><dd className="font-semibold">{prices2(response.additions.reduce((s,a)=>s+a.euro,0))} €/pz<FormulaTooltip label="Supplementi complessivi per pezzo" formula={CALCULATION_FORMULAS.bandelleT.additions}/></dd></div>
          <div><dt className="text-slate-500">Prezzo netto unitario</dt><dd className="font-semibold text-lg text-emerald-700">{prices3(response.unit)} €/pz<FormulaTooltip label="Prezzo netto unitario" formula={CALCULATION_FORMULAS.bandelleT.unitPrice}/></dd></div>
        </dl>
        {response.additions.length>0&&<div className="border-t pt-2 text-sm">
          {response.additions.map((a,i)=><p key={i}>{a.description}: +{prices2(a.euro)} €/pz<FormulaTooltip label={`Supplemento ${a.description}`} formula={CALCULATION_FORMULAS.bandelleT.additions}/></p>)}
        </div>}
        <p className="text-2xl font-bold text-emerald-800 border-t pt-3">Totale lotto ({req.quantity} pz): € {prices2(response.total)}<FormulaTooltip label="Totale lotto" formula={CALCULATION_FORMULAS.bandelleT.lotTotal}/></p>
        {response.notes.map((n,i)=><p className="text-sm text-slate-600" key={i}>{n}</p>)}
        <p className="text-xs text-amber-800 bg-amber-50 rounded p-3">Il risultato è basato soltanto sulle combinazioni disponibili nel listino. Per misure e lavorazioni fuori standard è necessaria una verifica tecnico-commerciale; i valori non vengono salvati automaticamente come preventivi aziendali.</p>
      </section>}
    </div>
  </Layout>;
}
