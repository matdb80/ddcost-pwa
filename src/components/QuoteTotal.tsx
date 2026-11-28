/** The displayed total follows the preview; unavailable calculations are never shown as zero. */
export default function QuoteTotal({value}:{value:unknown}) {
  const available=value!==null && value!==undefined && value!=="" && Number.isFinite(Number(value));
  return <div className="text-right">
    <p className="text-xs font-semibold text-slate-600">Totale preventivo</p>
    <output aria-label="Totale preventivo" aria-live="polite"
      className="block break-words text-3xl font-bold tabular-nums leading-tight text-red-600">
      {available ? "€ "+Number(value).toLocaleString("it-IT",{useGrouping:true,minimumFractionDigits:2,maximumFractionDigits:2}) : "Da calcolare"}
    </output>
  </div>;
}
