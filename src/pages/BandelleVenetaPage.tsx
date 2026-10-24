import Layout from "@/components/Layout";
import FormulaTooltip from "@/components/FormulaTooltip";
import { useEffect, useState } from "react";
import { useBlocker } from "react-router";
import { Calculator, AlertCircle } from "lucide-react";
import {
  BANDELLE_VENETA_TYPES,
  BANDELLE_VENETA_CONFIGURATIONS,
  quoteBandellaVeneta,
  type BandellaVenetaType,
  type BandellaVenetaTypology,
  type BandellaVenetaQuote,
} from "@/lib/bandelle-veneta";
import { CALCULATION_FORMULAS } from "@/lib/calculation-formulas";

const prices2 = (value: number) => value.toLocaleString("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

export default function BandelleVenetaPage() {
  const [bandellaType, setBandellaType] = useState<BandellaVenetaType | "">("");
  const [typology, setTypology] = useState<BandellaVenetaTypology | "">("");
  const [screwHoles, setScrewHoles] = useState("");
  const [holesFirst, setHolesFirst] = useState("");
  const [holesSecond, setHolesSecond] = useState("");
  const [quantity, setQuantity] = useState("");
  const [weldedEyes, setWeldedEyes] = useState(false);
  const [extraThicknessMm, setExtraThicknessMm] = useState("0");
  const [reinforcement, setReinforcement] = useState(false);
  const [nonStandardDiameter, setNonStandardDiameter] = useState(false);
  const [response, setResponse] = useState<BandellaVenetaQuote | null>(null);
  const [message, setMessage] = useState("");
  const isDouble = bandellaType === "vicentine-doppie";
  const configuration = bandellaType ? BANDELLE_VENETA_CONFIGURATIONS[bandellaType] : undefined;
  const supplementRates = configuration?.supplements;
  const priceRows = configuration?.prices;
  const hasUnsavedInput = Boolean(bandellaType || typology || screwHoles || holesFirst || holesSecond || quantity)
    || weldedEyes || extraThicknessMm !== "0" || reinforcement || nonStandardDiameter;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    hasUnsavedInput && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (!hasUnsavedInput) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedInput]);

  const clearResult = () => {
    setResponse(null);
    setMessage("");
  };
  const resetOptions = () => {
    setScrewHoles("");
    setHolesFirst("");
    setHolesSecond("");
    setWeldedEyes(false);
    setExtraThicknessMm("0");
    setReinforcement(false);
    setNonStandardDiameter(false);
  };
  const reset = () => {
    setBandellaType("");
    setTypology("");
    setQuantity("");
    resetOptions();
    clearResult();
  };
  const calculate = () => {
    if (!bandellaType) {
      setResponse(null);
      setMessage("Seleziona il tipo di bandella.");
      return;
    }
    try {
      setResponse(quoteBandellaVeneta({
        kind: bandellaType,
        typology,
        screwHoles: isDouble ? Number(holesFirst) + Number(holesSecond) : Number(screwHoles),
        holesFirst: isDouble ? Number(holesFirst) : undefined,
        holesSecond: isDouble ? Number(holesSecond) : undefined,
        quantity: Number(quantity),
        weldedEyes,
        extraThicknessMm: Number(extraThicknessMm),
        reinforcement,
        nonStandardDiameter,
      }));
      setMessage("");
    } catch (error) {
      setResponse(null);
      setMessage(error instanceof Error ? error.message : "Combinazione non disponibile.");
    }
  };

  return (
    <Layout>
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="bandelle-veneta-leave-title" className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-2xl">
            <h2 id="bandelle-veneta-leave-title" className="text-lg font-semibold text-slate-900">Vuoi uscire dal calcolatore?</h2>
            <p className="text-sm text-slate-700">I dati inseriti non sono salvati. Puoi restare oppure uscire e perderli.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => blocker.proceed()} className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700">Esci senza salvare</button>
              <button type="button" onClick={() => blocker.reset()} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Continua qui</button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-4xl space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Bandelle alla veneta Giotto Plus</h2>
        <form noValidate onSubmit={(event) => { event.preventDefault(); calculate(); }} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Calculator className="h-4 w-4 text-emerald-600" />
            Dati calcolo
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="bandella-veneta-type" className="mb-1 block text-sm font-medium text-slate-600">Tipo di bandella</label>
              <select
                id="bandella-veneta-type"
                className={inputClass}
                value={bandellaType}
                onChange={(event) => {
                  setBandellaType(event.target.value as BandellaVenetaType | "");
                  setTypology("");
                  resetOptions();
                  clearResult();
                }}
              >
                <option value="">Seleziona il tipo di bandella...</option>
                {BANDELLE_VENETA_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            {configuration && (
              <div>
                <label htmlFor="bandella-veneta-typology" className="mb-1 block text-sm font-medium text-slate-600">Tipologia</label>
                <select
                  id="bandella-veneta-typology"
                  className={inputClass}
                  value={typology}
                  onChange={(event) => {
                    setTypology(event.target.value as BandellaVenetaTypology | "");
                    resetOptions();
                    clearResult();
                  }}
                >
                  <option value="">Seleziona la tipologia...</option>
                  {configuration.typologies.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}
            {priceRows && typology && (
              <>
                {isDouble ? (
                  <>
                    <div>
                      <label htmlFor="bandella-veneta-holes-first" className="mb-1 block text-sm font-medium text-slate-600">Fori vite prima metà</label>
                      <select id="bandella-veneta-holes-first" className={inputClass} value={holesFirst} onChange={(event) => { setHolesFirst(event.target.value); clearResult(); }}>
                        <option value="">Seleziona i fori...</option>
                        {[2, 3, 4, 5, 6].map((holes) => <option key={holes} value={holes}>{holes}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="bandella-veneta-holes-second" className="mb-1 block text-sm font-medium text-slate-600">Fori vite seconda metà</label>
                      <select id="bandella-veneta-holes-second" className={inputClass} value={holesSecond} onChange={(event) => { setHolesSecond(event.target.value); clearResult(); }}>
                        <option value="">Seleziona i fori...</option>
                        {[2, 3, 4, 5, 6].map((holes) => <option key={holes} value={holes}>{holes}</option>)}
                      </select>
                    </div>
                    <p className="text-xs text-slate-500 md:col-span-2">Minimo 2+2 fori. Il prezzo dipende dalla somma: per i totali dispari 5, 7, 9 e 11 si usa la media delle due righe adiacenti.</p>
                  </>
                ) : (
                  <div>
                    <label htmlFor="bandella-veneta-holes" className="mb-1 block text-sm font-medium text-slate-600">Numero di fori vite</label>
                    <select
                      id="bandella-veneta-holes"
                      className={inputClass}
                      value={screwHoles}
                      aria-describedby="bandella-veneta-holes-help"
                      onChange={(event) => { setScrewHoles(event.target.value); clearResult(); }}
                    >
                      <option value="">Seleziona il numero di fori...</option>
                      {priceRows.map((row) => (
                        <option key={row.screwHoles} value={row.screwHoles}>{row.screwHoles} fori</option>
                      ))}
                    </select>
                    <p id="bandella-veneta-holes-help" className="mt-1 text-xs text-slate-500">Per altri numeri di fori il prezzo è da definire.</p>
                  </div>
                )}
                <div>
                  <label htmlFor="bandella-veneta-quantity" className="mb-1 block text-sm font-medium text-slate-600">Quantità lotto (pz)</label>
                  <input
                    id="bandella-veneta-quantity"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    step={1}
                    className={inputClass}
                    placeholder="Da 1 a 100 pezzi"
                    value={quantity}
                    aria-describedby="bandella-veneta-quantity-help"
                    onChange={(event) => { setQuantity(event.target.value); clearResult(); }}
                  />
                  <p id="bandella-veneta-quantity-help" className="mt-1 text-xs text-slate-500">Per 1–3 pezzi si usa il prezzo unitario della fascia 4–10.</p>
                </div>
              </>
            )}
          </div>
          {bandellaType && !priceRows && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {configuration
                ? "Il listino per questo tipo di bandella è da definire."
                : "Le opzioni e il listino per questo tipo di bandella sono in preparazione."}
            </p>
          )}
          {supplementRates && typology && (
              <fieldset className="mt-5 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">Supplementi per pezzo</legend>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={weldedEyes} onChange={(event) => { setWeldedEyes(event.target.checked); clearResult(); }} className="h-4 w-4 accent-emerald-600" />
                    Occhi saldati (+{prices2(supplementRates.weldedEyes)} €/pz)
                  </label>
                  <div>
                    <label htmlFor="bandella-veneta-thickness" className="mb-1 block text-sm font-medium text-slate-600">Aumento spessore rispetto allo standard (mm)</label>
                    <input
                      id="bandella-veneta-thickness"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={supplementRates.extraThicknessStepMm}
                      className={inputClass}
                      value={extraThicknessMm}
                      placeholder="0"
                      aria-describedby="bandella-veneta-thickness-help"
                      onChange={(event) => { setExtraThicknessMm(event.target.value); clearResult(); }}
                    />
                    <p id="bandella-veneta-thickness-help" className="mt-1 text-xs text-slate-500">+{prices2(supplementRates.extraThicknessPerStep)} €/pz ogni {supplementRates.extraThicknessStepMm.toLocaleString("it-IT")} mm aggiuntivi.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={reinforcement} onChange={(event) => { setReinforcement(event.target.checked); clearResult(); }} className="h-4 w-4 accent-emerald-600" />
                    Rinforzo (+{prices2(supplementRates.reinforcement)} €/pz)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={nonStandardDiameter} onChange={(event) => { setNonStandardDiameter(event.target.checked); clearResult(); }} className="h-4 w-4 accent-emerald-600" />
                    Diametro occhio diverso da Ø12 mm (+{prices2(supplementRates.nonStandardDiameter)} €/pz)
                  </label>
                </div>
              </fieldset>
          )}
          {configuration && typology && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <h4 className="text-sm font-semibold text-slate-800">Varianti ammesse</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {configuration.variants.map((variant) => <li key={variant.value}>{variant.label}</li>)}
              </ul>
            </div>
          )}
          {message && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0" />{message}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={!priceRows || !supplementRates || !typology || !(isDouble ? holesFirst && holesSecond : screwHoles) || !quantity} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              Calcola prezzo
            </button>
            <button type="button" onClick={reset} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200">Azzera</button>
          </div>
        </form>

        {response && (
          <section aria-label="Risultato del calcolo" aria-live="polite" className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6">
            <h3 className="font-semibold text-slate-800">Prezzo di vendita</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-slate-600">Numero di fori vite</dt><dd className="font-semibold">{response.holePair ? `${response.holePair[0]}+${response.holePair[1]} (${response.screwHoles} totali)` : response.screwHoles}</dd></div>
              <div><dt className="text-slate-600">Fascia lotto</dt><dd className="font-semibold">{response.tier} pz</dd></div>
              <div><dt className="text-slate-600">Prezzo base</dt><dd className="font-semibold">{prices2(response.base)} €/pz<FormulaTooltip label="Prezzo base" formula={response.holePair ? CALCULATION_FORMULAS.bandelleVeneta.doubleBasePrice : CALCULATION_FORMULAS.bandelleVeneta.basePrice} /></dd></div>
              <div><dt className="text-slate-600">Supplementi</dt><dd className="font-semibold">{prices2(response.supplements)} €/pz<FormulaTooltip label="Supplementi per pezzo" formula={CALCULATION_FORMULAS.bandelleVeneta.additions} /></dd></div>
              <div className="col-span-2">
                <dt className="text-slate-600">Prezzo di vendita unitario</dt>
                <dd className="text-xl font-bold text-emerald-800">{prices2(response.unit)} €/pz<FormulaTooltip label="Prezzo di vendita unitario" formula={CALCULATION_FORMULAS.bandelleVeneta.unitPrice} /></dd>
              </div>
            </dl>
            {response.interpolatedFrom && (
              <p className="text-sm text-slate-700">Prezzo base calcolato come media tra le righe da {response.interpolatedFrom[0]} e {response.interpolatedFrom[1]} fori della fascia {response.tier}, arrotondata al centesimo.</p>
            )}
            {response.additions.length > 0 && (
              <ul className="space-y-1 border-t border-emerald-200 pt-3 text-sm text-slate-700">
                {response.additions.map((addition) => <li key={addition.description}>{addition.description}: +{prices2(addition.euro)} €/pz</li>)}
              </ul>
            )}
            {response.minimumTierApplied && <p className="text-sm text-slate-700">Applicato il prezzo unitario della fascia 4–10 al lotto richiesto di {response.quantity} pz.</p>}
            <p className="border-t border-emerald-200 pt-3 text-xl font-bold text-emerald-800">
              Totale lotto ({response.quantity} pz): {prices2(response.total)} €<FormulaTooltip label="Totale lotto" formula={CALCULATION_FORMULAS.bandelleVeneta.lotTotal} />
            </p>
          </section>
        )}
      </div>
    </Layout>
  );
}
