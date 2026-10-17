import {useMemo,useState} from "react";
import {Eye,EyeOff} from "lucide-react";
import type {CicloEditorModel} from "@/types/cycle";
import {categoryReductionTarget,calculateCostReductionTarget} from "@/lib/cycle-cost-reduction";

function money(v:number):string {
  return v.toLocaleString("it-IT",{minimumFractionDigits:4,maximumFractionDigits:4});
}
function percentage(v:number):string {
  return v.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})+"%";
}

/** Read-only what-if; changes ONLY visibility of the independent % scenarios. */
export default function CostReductionBreakdown({
  cycle,marketPrice
}:{
  cycle:CicloEditorModel;
  marketPrice:number|null;
}) {
  const [visible,setVisible]=useState<Set<string>>(new Set());
  const breakdownRows=Object.entries(cycle.breakdown);
  const totalCategories=breakdownRows.reduce((n,[,v])=>n+v,0);
  const breakdownConsistent=Number.isFinite(totalCategories) &&
    Math.abs(totalCategories-cycle.costo_standard)<=1e-6*Math.max(1,Math.abs(cycle.costo_standard));
  const target=useMemo(()=>{
    if(marketPrice===null || !breakdownConsistent)return null;
    return calculateCostReductionTarget({
      marketPrice,
      directCost:cycle.costo_standard,
      fullCost:cycle.full_cost,
      overheadRate:cycle.ricarico_spese,
      targetNetMargin:cycle.margine_minimo,
    });
  },[marketPrice,breakdownConsistent,cycle.costo_standard,cycle.full_cost,cycle.ricarico_spese,cycle.margine_minimo]);

  return (
    <>
      {target && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950">
          <p className="font-semibold">Obiettivo di riduzione dei costi industriali</p>
          <p className="mt-1">
            Margine reale: <strong>{percentage(target.actualMarginPercent)}</strong> ·
            obiettivo: <strong>{percentage(target.targetMarginPercent)}</strong>.
          </p>
          <p className="mt-1">
            Al prezzo di mercato di € {money(target.marketPrice)}, occorre ridurre
            il costo industriale complessivo di <strong>€ {money(target.directSavings)} per pezzo</strong>
            (−{percentage(target.overallReductionPercent)}).
          </p>
          <p className="mt-1 text-xs text-amber-900">
            Con il ricarico delle spese generali invariato al {percentage(cycle.ricarico_spese*100)},
            il nuovo costo industriale obiettivo è € {money(target.targetDirectCost)}.
          </p>
          <p className="mt-2 text-xs">
            <strong>Premi l'occhio vicino a una categoria:</strong> vedrai quanto dovrebbe diminuire
            quella categoria <strong>se fosse l'unica a essere ridotta</strong>.
            Sono scenari alternativi: le percentuali non si sommano.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {breakdownRows.map(([cat,val])=>{
          const alternative=target?categoryReductionTarget(target,val):null;
          const isShown=visible.has(cat);
          return (
            <div key={cat} className="text-sm">
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 min-w-0">{cat}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono tabular-nums">{money(val)}</span>
                  {alternative && (
                    <button type="button"
                      aria-label={(isShown?"Nascondi":"Vedi")+" % riduzione necessaria per "+cat}
                      aria-pressed={isShown}
                      title={isShown?"Nascondi % riduzione necessaria":"Vedi % riduzione necessaria"}
                      onClick={() => setVisible(previous => {
                        const next=new Set(previous);
                        if(next.has(cat))next.delete(cat);else next.add(cat);
                        return next;
                      })}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600"
                    >
                      {isShown?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}
                    </button>
                  )}
                </div>
              </div>
              {alternative && isShown && (
                <p className={"text-xs mt-1 text-right "+
                  (alternative.feasibleAlone?"text-amber-900":"text-red-700")}
                  role="status">
                  {alternative.feasibleAlone
                    ? "Riduzione necessaria solo su questa categoria: −"+percentage(alternative.reductionPercent)
                    : "−"+percentage(alternative.reductionPercent)+" — impossibile agendo solo su questa categoria (>100%)."}
                </p>
              )}
            </div>
          );
        })}
        <div className="border-t pt-2 flex justify-between font-semibold text-slate-800">
          <span>Totale</span>
          <span className="font-mono">{money(cycle.costo_standard)}</span>
        </div>
      </div>

      {marketPrice!==null && !breakdownConsistent && (
        <p className="mt-3 text-xs text-amber-800">
          Target riduzione non disponibile: la somma delle categorie non coincide con il costo industriale mostrato.
          Verifica i dati prima di usare la simulazione.
        </p>
      )}
    </>
  );
}
