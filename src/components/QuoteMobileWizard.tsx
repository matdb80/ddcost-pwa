import {useMemo, useRef, useState} from "react";
import {Link} from "react-router";
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, Copy, FileText,
  Plus, Save, Settings2, Trash2,
} from "lucide-react";
import QuoteNumericInput from "@/components/QuoteNumericInput";
import QuoteMaterialCostFields from "@/components/QuoteMaterialCostFields";
import QuoteModificationObjectFields from "@/components/QuoteModificationObjectFields";
import {type Product, type QuoteDocument} from "@/lib/quote-calculation";
import {
  buildQuoteWizardSteps, quoteWizardStepError,
} from "@/lib/quote-wizard-steps";

const euro=(value:unknown):string=>Number(value??0).toLocaleString("it-IT",{
  minimumFractionDigits:2,maximumFractionDigits:2,
});
const inputClass="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";
const actionClass="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold";

type Group={id:number;name:string};
type Props={
  doc:QuoteDocument;
  preview:QuoteDocument|null;
  locked:boolean;
  isNew:boolean;
  numericId:number;
  isSavedDraft:boolean;
  groups:Group[];
  loadingGroups:boolean;
  error:string;
  draftMessage:string;
  copyMessage:string;
  busy:boolean;
  unsavedChanges:boolean;
  priceProductIndex:number;
  onUpdate:(key:string,value:unknown,economic?:boolean)=>void;
  onUpdateProduct:(index:number,key:string,value:unknown)=>void;
  onAddProduct:()=>void;
  onRemoveProduct:(index:number)=>void;
  onCreateGroup:(index:number,name:string)=>Promise<void>;
  onPriceProductIndex:(value:number)=>void;
  onListinoDiscount:(value:string)=>void;
  onSave:()=>void;
  onSaveDraft:()=>void;
  onCopy:()=>void;
  onEdit:()=>void;
  onUpgrade:()=>void;
  onDesktop:()=>void;
};
export default function QuoteMobileWizard(props:Props){
  const {
    doc,preview,locked,isNew,numericId,isSavedDraft,groups,loadingGroups,error,draftMessage,
    copyMessage,busy,unsavedChanges,priceProductIndex,onUpdate,onUpdateProduct,
    onAddProduct,onRemoveProduct,onCreateGroup,onPriceProductIndex,onListinoDiscount,
    onSave,onSaveDraft,onCopy,onEdit,onUpgrade,onDesktop,
  }=props;
  const [advanced,setAdvanced]=useState(false);
  const [stepId,setStepId]=useState("cliente");
  const [localError,setLocalError]=useState("");
  const [newGroup,setNewGroup]=useState("");
  const [addingGroup,setAddingGroup]=useState(false);
  const [groupBusy,setGroupBusy]=useState(false);
  const top=useRef<HTMLDivElement>(null);
  const steps=useMemo(()=>buildQuoteWizardSteps(doc,advanced),[doc,advanced]);
  const activeIndex=Math.max(0,steps.findIndex(s=>s.id===stepId));
  const current=steps[activeIndex];
  const goto=(id:string)=>{
    setStepId(id);
    setLocalError("");
    top.current?.scrollIntoView({block:"start",behavior:"smooth"});
  };
  const next=()=>{
    const err=locked?null:quoteWizardStepError(current,doc);
    if(err){setLocalError(err);return;}
    if(activeIndex<steps.length-1)goto(steps[activeIndex+1].id);
  };
  const previous=()=>{
    if(activeIndex>0)goto(steps[activeIndex-1].id);
  };
  const submit=()=>{
    const invalid=steps.find(s=>quoteWizardStepError(s,doc));
    if(invalid){goto(invalid.id);setLocalError("Completa questo campo prima di salvare il preventivo.");return;}
    onSave();
  };
  const productIndex=current.index;
  const product=productIndex===undefined?null:(doc.prodotti?.[productIndex] as Product|undefined);
  const field=current.field;
  const value=(productIndex===undefined?doc:product)?.[field??""];
  const updateValue=(v:unknown)=>{
    setLocalError("");
    if(!field)return;
    if(productIndex===undefined)onUpdate(field,v,current.kind==="number"||field==="trattamenti_modalita");
    else onUpdateProduct(productIndex,field,v);
  };
  const createNewGroup=async()=>{
    if(productIndex===undefined || newGroup.trim().length<2)return;
    setGroupBusy(true);
    setLocalError("");
    try{
      await onCreateGroup(productIndex,newGroup.trim());
      setNewGroup("");
      setAddingGroup(false);
    }catch(err){
      setLocalError(err instanceof Error?err.message:"Impossibile creare il gruppo");
    }finally{setGroupBusy(false);}
  };
  const addAnotherProduct=()=>{
    const i=(doc.prodotti as Product[]).length;
    onAddProduct();
    goto("p:"+i+":descrizione");
  };
  const percent=Math.round((activeIndex+1)/steps.length*100);
  const hasPreview=preview!==null && Number.isFinite(Number(preview.totale_finale));
  const price=euro(preview?.totale_finale);
  const cashMargin=Number(preview?.margine_netto_complessivo_perc??0);
  const canShare=hasPreview && !isSavedDraft && !steps.some(s=>quoteWizardStepError(s,doc));
  const costVersion=Number(doc.costi_comuni_versione)||0;
  return <div ref={top} className="mx-auto flex w-full max-w-xl flex-col gap-3 pb-24 text-slate-900" data-testid="quote-mobile-wizard">
    <header className="rounded-xl bg-slate-900 px-4 py-3 text-white shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <Link to="/preventivi" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-slate-800"
          title="Torna all'archivio" aria-label="Torna all'archivio preventivi">
          <ArrowLeft className="h-5 w-5"/>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">DDCost · Preventivo Una Tantum</p>
          <p className="truncate text-sm font-medium">{isNew?"Nuovo preventivo":`Preventivo #${numericId}`}</p>
        </div>
        <button type="button" onClick={onDesktop} className="min-h-11 rounded-lg bg-slate-800 px-3 text-xs font-semibold"
          title="Disattiva visualizzazione cellulare e apri editor completo">
          <Settings2 size={16} className="mx-auto mb-0.5"/> Vista completa
        </button>
      </div>
    </header>
    <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 border border-slate-200">
      <label htmlFor="quote-wizard-advanced" className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Settings2 size={16}/> Opzioni avanzate
      </label>
      <input id="quote-wizard-advanced" type="checkbox" checked={advanced}
        onChange={e=>setAdvanced(e.target.checked)}
        className="h-5 w-5 accent-emerald-600"/>
    </div>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-emerald-700">{current.section}</p>
        <span className="shrink-0 text-xs tabular-nums text-slate-500">Passo {activeIndex+1} di {steps.length}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100" role="progressbar" aria-label="Completamento preventivo"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{width:percent+"%"}}/>
      </div>

      <h1 className="mt-6 text-xl font-bold leading-tight">{current.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{current.hint}</p>
      <div className="mt-5">
        {current.id.endsWith(":done") && product && productIndex!==undefined ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{product.descrizione||"Prodotto senza descrizione"}</p>
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div><dt className="text-slate-500">Quantità</dt><dd className="font-semibold">{product.quantita} pz</dd></div>
              <div><dt className="text-slate-500">Costo pieno €/pz</dt><dd className="font-semibold">{hasPreview?euro(preview?.prodotti?.[productIndex]?.full_cost):"—"}</dd></div>
              <div><dt className="text-slate-500">Prezzo €/pz</dt><dd className="font-semibold">{hasPreview?euro(preview?.prodotti?.[productIndex]?.prezzo_netto_unitario_finale):"—"}</dd></div>
              <div><dt className="text-slate-500">Totale prodotto</dt><dd className="font-semibold">{hasPreview?"€ "+euro(preview?.prodotti?.[productIndex]?.totale_finale):"—"}</dd></div>
            </dl>
            {Array.isArray(product.oggetto_modifica)&&product.oggetto_modifica.length>0&&
              <p className="text-xs text-slate-600"><strong>Oggetto della modifica:</strong> {product.oggetto_modifica.join(", ")}</p>}
            {product.costo_materiale_noto===false &&
              <p className="text-xs text-slate-600">
                Costo materiale calcolato da peso: {hasPreview?"€ "+euro(preview?.prodotti?.[productIndex]?.materiale_calcolato_cad):"da completare"} /pz.
                Il calcolo usa il peso teorico del grezzo rettangolare.
              </p>}
            {!locked && <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={addAnotherProduct}
                className={actionClass+" border border-emerald-700 text-emerald-800"}><Plus size={17}/> Altro prodotto</button>
              {doc.prodotti.length>1 && <button type="button" onClick={()=>{
                if(!window.confirm("Rimuovere questo prodotto dal preventivo?"))return;
                onRemoveProduct(productIndex);
                goto("riepilogo");
              }} className={actionClass+" border border-red-200 text-red-700"}><Trash2 size={17}/> Elimina</button>}
            </div>}
          </div>
        ):current.id==="riepilogo" ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div><dt className="text-slate-500">Cliente</dt><dd className="break-words font-semibold">{doc.cliente||"—"}</dd></div>
              <div><dt className="text-slate-500">Prodotti / pezzi</dt><dd className="font-semibold">{doc.prodotti.length} / {preview?.quantita??"—"}</dd></div>
              <div><dt className="text-slate-500">Totale preventivo</dt><dd className="font-semibold">{hasPreview?"€ "+price:"Da calcolare"}</dd></div>
              <div><dt className="text-slate-500">Margine netto</dt><dd className="font-semibold">{hasPreview?cashMargin.toFixed(1).replace(".",",")+"%":"—"}</dd></div>
            </dl>
            {costVersion>=2 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Trattamenti applicati al preventivo</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {doc.trattamenti_modalita==="globale"
                        ? "Unico costo complessivo"
                        : "Costi distinti per prodotto"}
                    </p>
                    <p className="text-xs text-slate-700">
                      {doc.trattamenti_modalita==="globale"
                        ? "Ripartito sul numero complessivo di pezzi, senza sommare i singoli trattamenti."
                        : "Vengono conteggiati soltanto i trattamenti €/pezzo dei singoli articoli."}
                    </p>
                  </div>
                  <strong className="text-sm tabular-nums text-slate-900">
                    {hasPreview
                      ? "€ "+euro((preview?.prodotti as Product[]).reduce((sum:number,p:Product)=>sum+Number(p.trattamenti_tot??0),0))
                      : "Da calcolare"}
                  </strong>
                </div>
                {!locked && <button type="button" onClick={()=>goto("trattamenti_modalita")}
                  className="mt-3 min-h-10 rounded-lg border border-emerald-600 bg-white px-3 text-sm font-semibold text-emerald-800">
                  Modifica la modalità dei trattamenti
                </button>}
              </div>
            )}
            <div className="space-y-2">
              {(doc.prodotti as Product[]).map((p,i)=><button type="button" key={i}
                onClick={()=>goto("p:"+i+":descrizione")}
                className="flex w-full min-h-12 items-center justify-between rounded-lg border border-slate-200 p-3 text-left text-sm">
                <span className="min-w-0 truncate">{i+1}. {p.descrizione||"Prodotto da completare"}</span>
                <span className="shrink-0 pl-2 font-semibold">{hasPreview?"€ "+euro(preview?.prodotti?.[i]?.totale_finale):"—"}</span>
              </button>)}
            </div>
            {!locked && <button type="button" onClick={addAnotherProduct}
              className={actionClass+" w-full border border-emerald-600 text-emerald-800"}><Plus size={17}/> Aggiungi un altro prodotto</button>}
            {costVersion<3 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Questo preventivo usa il modello storico della progettazione. La conversione è facoltativa e crea una nuova revisione.
              {!locked && <button type="button" onClick={onUpgrade} className="mt-2 block font-semibold underline">Converti al modello attuale</button>}
            </div>}
            {locked
              ? <button type="button" onClick={onEdit} className={actionClass+" w-full bg-emerald-600 text-white"}>Modifica preventivo</button>
              : <>
                <button type="button" onClick={submit} disabled={busy}
                  className={actionClass+" w-full bg-emerald-600 text-white disabled:opacity-50"}>
                  <Check size={19}/>{isSavedDraft?"Completa preventivo":isNew?"Salva preventivo":"Salva nuova revisione"}
                </button>
                <button type="button" onClick={onSaveDraft} disabled={busy||!unsavedChanges}
                  className={actionClass+" w-full border border-emerald-700 text-emerald-800 disabled:opacity-40"}>
                  <Save size={18}/> Salva bozza
                </button>
              </>}
            <button type="button" onClick={onCopy} disabled={busy||!canShare}
              className={actionClass+" w-full border border-slate-300 text-slate-700 disabled:opacity-40"}>
              <Copy size={18}/> Copia per email / documento
            </button>
          </div>
        ):current.id==="listino_prodotto" ? (
          <select id="wizard-input" value={priceProductIndex} disabled={locked}
            onChange={e=>onPriceProductIndex(Number(e.target.value))} className={inputClass}>
            {(doc.prodotti as Product[]).map((p,i)=><option value={i} key={i}>{i+1}. {p.descrizione||"Prodotto"}</option>)}
          </select>
        ):current.id==="listino_sconto" ? (
          <input id="wizard-input" className={inputClass} disabled={locked}
            placeholder="40+10%" value={doc.listino?.sconto_riferimento??""}
            onChange={e=>onListinoDiscount(e.target.value)}/>
        ):field==="gruppo_merceologico" && productIndex!==undefined ? (
          <div className="space-y-3">
            <select id="wizard-input" className={inputClass} disabled={locked}
              value={String(value??"")} onChange={e=>updateValue(e.target.value)}>
              <option value="">{loadingGroups?"Caricamento gruppi...":"Seleziona gruppo..."}</option>
              {groups.map(g=><option key={g.id} value={g.name}>{g.name}</option>)}
              {value && !groups.some(g=>g.name===value)&&<option value={value}>{value} (storico)</option>}
            </select>
            {!locked && (addingGroup?(
              <div className="flex flex-col gap-2">
                <input className={inputClass} placeholder="Nuovo gruppo merceologico"
                  value={newGroup} onChange={e=>setNewGroup(e.target.value)} maxLength={120}/>
                <button type="button" onClick={()=>void createNewGroup()} disabled={groupBusy||newGroup.trim().length<2}
                  className={actionClass+" bg-emerald-600 text-white disabled:opacity-40"}>
                  {groupBusy?"Creazione...":"Crea e seleziona gruppo"}
                </button>
              </div>
            ):<button type="button" className="text-left text-sm font-semibold text-emerald-700 underline"
              onClick={()=>setAddingGroup(true)}>+ Crea nuovo gruppo</button>)}
          </div>
        ):field==="materiale_prodotto"? (
          <select id="wizard-input" className={inputClass} disabled={locked}
            value={String(value??"")} onChange={e=>updateValue(e.target.value)}>
            <option value="">Seleziona materiale...</option>
            <option value="ferro">Ferro</option><option value="ottone">Ottone</option><option value="inox">Inox</option>
          </select>
        ):field==="materiale_cad" && product && productIndex!==undefined?(
          <QuoteMaterialCostFields product={product} disabled={locked} mobile
            onChange={(key,value)=>onUpdateProduct(productIndex,key,value)}/>
        ):field==="oggetto_modifica" && product && productIndex!==undefined?(
          <QuoteModificationObjectFields value={value} disabled={locked} compact idPrefix={`wizard-modification-${productIndex}`}
            onChange={selected=>onUpdateProduct(productIndex,"oggetto_modifica",selected)}/>
        ):field==="trattamenti_modalita"?(
          <div className="space-y-3">
            {[["per_prodotto","Costo separato per ciascun prodotto (€/pz)"],
              ["globale","Costo totale dell'offerta, distribuito su tutti i pezzi"]].map(([choice,caption])=>
              <label key={choice} className={`flex min-h-14 items-center gap-3 rounded-xl border p-3 text-sm ${value===choice?"border-emerald-600 bg-emerald-50":"border-slate-200"}`}>
                <input type="radio" name="quote-treatment-mode" value={choice}
                  checked={(value??"per_prodotto")===choice} disabled={locked}
                  onChange={()=>updateValue(choice)} className="h-5 w-5 accent-emerald-600"/>
                <span>{caption}</span>
              </label>)}
            <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              {value==="globale"
                ?"Inserirai una sola cifra nel prossimo passo. Nessun campo trattamenti verrà chiesto sui singoli prodotti."
                :"Il Wizard ti chiederà un costo trattamento €/pezzo per ogni prodotto, identificando sempre l'articolo. Non ti chiederà un totale globale."}
              Cambiare modalità conserva i vecchi valori, ma il preventivo conteggia esclusivamente la modalità selezionata.
            </p>
          </div>
        ):current.kind==="checkbox"?(
          <label className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 p-3 text-base">
            <input type="checkbox" disabled={locked} checked={value!==false}
              onChange={e=>updateValue(e.target.checked)} className="h-5 w-5 accent-emerald-600"/>
            {field==="costo_materiale_noto"
              ?"Sì, conosco il costo del materiale per pezzo"
              :"Sì, il prezzo può essere rettificato"}
          </label>
        ):current.kind==="number" && current.numeric?(
          <QuoteNumericInput key={current.id} id="wizard-input" className={inputClass}
            kind={current.numeric} optional={field==="prezzo_manuale"||field==="target_totale"}
            disabled={locked} value={value??(field==="prezzo_manuale"||field==="target_totale"?null:0)}
            onChange={updateValue}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur();next();}}}/>
        ):current.kind==="textarea"?(
          <textarea id="wizard-input" rows={4} className={inputClass} disabled={locked}
            value={String(value??"")} onChange={e=>updateValue(e.target.value)}/>
        ):current.kind==="text"?(
          <input id="wizard-input" className={inputClass} disabled={locked}
            autoComplete="off" value={String(value??"")} onChange={e=>updateValue(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();next();}}}/>
        ):null}
        {current.kind==="number" && field==="costo_progettazione_ora" &&
          <p className="mt-2 text-xs text-slate-500">Il costo di progettazione è unico per il preventivo. Sarà distribuito sul totale dei pezzi.</p>}
        {current.kind==="number" && field==="trattamenti_totale_euro" &&
          <p className="mt-2 text-xs text-slate-500">Quota per pezzo: € {euro(preview?.costi_comuni_riepilogo?.trattamenti_globali_cad)}</p>}
        {localError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{localError}</p>}
      </div>
    </section>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {draftMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{draftMessage}</p>}
    {copyMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{copyMessage}</p>}

    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-slate-600"><FileText size={16}/> Totale provvisorio</span>
        <strong className="text-lg tabular-nums">{hasPreview?"€ "+price:"Da calcolare"}</strong>
      </div>
      {hasPreview && <p className="mt-1 text-xs text-slate-500">Margine netto: {cashMargin.toFixed(1).replace(".",",")}%</p>}
      {!locked && current.id!=="riepilogo" && <button type="button" disabled={busy||!unsavedChanges}
        onClick={onSaveDraft} className="mt-3 min-h-11 w-full rounded-lg border border-emerald-600 font-semibold text-emerald-800 disabled:opacity-40">
        <Save size={16} className="mr-2 inline"/> {busy?"Salvataggio...":"Salva bozza"}
      </button>}
    </div>

    <nav aria-label="Navigazione guidata" className="fixed bottom-0 left-0 right-0 z-30 flex items-center gap-2 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-5px_24px_rgba(15,23,42,.1)] backdrop-blur">
      <button type="button" onClick={previous} disabled={activeIndex===0}
        className={actionClass+" flex-1 border border-slate-300 text-slate-700 disabled:opacity-35"}>
        <ChevronLeft size={18}/> Indietro
      </button>
      {current.id==="riepilogo"
        ? <button type="button" onClick={locked?onEdit:submit} disabled={busy}
            className={actionClass+" flex-1 bg-emerald-600 text-white disabled:opacity-40"}>
            <Check size={18}/>{locked?"Modifica":"Completa"}
          </button>
        : <button type="button" onClick={next}
            className={actionClass+" flex-1 bg-emerald-600 text-white"}>
            Avanti <ArrowRight size={18}/>
          </button>}
    </nav>
  </div>;
}
