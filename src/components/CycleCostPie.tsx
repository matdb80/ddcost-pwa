import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import FormulaTooltip from "@/components/FormulaTooltip";
import type { CicloEditorModel } from "@/types/cycle";
import { calculateCyclePieCosts } from "@/lib/cycle-cost-pie";
import { CALCULATION_FORMULAS } from "@/lib/calculation-formulas";

const COLORS = {
  terzisti: "#2563eb",
  interne: "#059669",
  fornitori: "#d97706",
} as const;

const eur = (value: number) => value.toLocaleString("it-IT", {
  minimumFractionDigits: 4, maximumFractionDigits: 4,
});
const pct = (value: number) => value.toLocaleString("it-IT", {
  minimumFractionDigits: 1, maximumFractionDigits: 1,
});

export default function CycleCostPie({cycle}: {cycle: CicloEditorModel}) {
  const result = useMemo(() => {
    try {return {data:calculateCyclePieCosts(cycle),error:null as string|null};}
    catch(err) {return {data:null,error:err instanceof Error?err.message:"Dati non validi"};}
  },[cycle]);
  if(result.error || !result.data) {
    return <div role="status" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Grafico non disponibile: {result.error}. Controllare i dati del ciclo.
    </div>;
  }
  const costs=result.data;
  const entries = [
    {name:"Lavorazioni da terzista", value:costs.terzisti, color:COLORS.terzisti},
    {name:"Lavorazioni interne", value:costs.interne, color:COLORS.interne},
    {name:"Fornitori non terzisti", value:costs.fornitori, color:COLORS.fornitori},
  ];
  const slices=entries.filter(x=>x.value>0);
  return (
    <div className="mt-5 border-t border-slate-200 pt-4">
      <h3 className="text-sm font-semibold text-slate-800">Ripartizione percentuale dei costi</h3>
      <p className="mt-1 text-xs text-slate-500">
        Percentuali sui soli costi delle tre categorie richieste, esclusa ogni spesa
        di attrezzatura dedicata. Gli altri costi sono mostrati separatamente.
      </p>
      {costs.totaleClassificato>0 ? (
        <>
          <div className="h-60 w-full" role="img" aria-label={entries.map(x=>x.name+": "+pct(100*x.value/costs.totaleClassificato)+"%").join(", ")}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={83} labelLine={false}
                  label={({percent})=>pct((percent ?? 0)*100)+"%"}>
                  {slices.map(x=><Cell key={x.name} fill={x.color}/>)}
                </Pie>
                <Tooltip content={({active,payload})=>{
                  if(!active || !payload?.length)return null;
                  const value=Number(payload[0]?.value??0);
                  const name=String(payload[0]?.name??"Costo categoria");
                  return <div className="max-w-72 rounded border border-slate-200 bg-white p-3 text-xs shadow-lg">
                    <strong>{name}: € {eur(value)}</strong>
                    <p className="mt-1">{pct(100*value/costs.totaleClassificato)}% sul totale classificato.</p>
                    <p className="mt-1 text-slate-600">{CALCULATION_FORMULAS.cycle.costPieShare}</p>
                  </div>;
                }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-1">
            {entries.map(x=>(
              <div key={x.name} className="flex gap-2 items-center justify-between text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{backgroundColor:x.color}}/>
                  <span>{x.name}<FormulaTooltip label={`Quota di ${x.name}`} formula={CALCULATION_FORMULAS.cycle.costPieShare}/></span>
                </span>
                <span className="font-medium whitespace-nowrap tabular-nums">
                  {pct(100*x.value/costs.totaleClassificato)}% · € {eur(x.value)}<FormulaTooltip label={`Importo e percentuale ${x.name}`} formula={CALCULATION_FORMULAS.cycle.costPieShare}/>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t pt-2 text-xs text-slate-600">
            Totale delle categorie rappresentate: <strong>€ {eur(costs.totaleClassificato)}<FormulaTooltip label="Totale delle categorie rappresentate" formula={CALCULATION_FORMULAS.cycle.costPieTotal}/></strong>
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Nessun costo positivo nelle tre categorie selezionate.</p>
      )}
      {costs.nonClassificati>0 && (
        <p className="mt-2 rounded bg-slate-100 p-2 text-xs text-slate-600">
          Altri costi senza classificazione nel grafico: <strong>€ {eur(costs.nonClassificati)}<FormulaTooltip label="Costi non classificati" formula="Somma delle righe incluse che non sono attrezzature dedicate, lavorazioni interne o terzisti e non hanno un fornitore indicato."/></strong>.
          Per attribuirli ai fornitori non terzisti, compilare il campo Fornitore nelle relative righe.
        </p>
      )}
      {costs.esclusiAttrezzatura>0 && (
        <p className="mt-2 text-xs text-slate-500">
          Attrezzatura dedicata esclusa dalla torta: € {eur(costs.esclusiAttrezzatura)}<FormulaTooltip label="Attrezzature dedicate escluse dalla torta" formula={CALCULATION_FORMULAS.cycle.costPieDedicatedExcluded}/>
        </p>
      )}
    </div>
  );
}
