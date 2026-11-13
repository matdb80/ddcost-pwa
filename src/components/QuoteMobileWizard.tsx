import ProductGroupRename,{type GroupRenameResult} from "./ProductGroupRename";
import SearchableSelect from "./SearchableSelect";
import QuoteInoxChoice from "./QuoteInoxChoice";
import {isSeries,isFixedPrice} from "@/lib/quote-series";
import {isForfait} from "@/lib/quote-forfait";
import SalesHandoffPanel from "./SalesHandoffPanel";
import { quoteDocumentNumber } from "@/lib/commercial-offer-number";
import {useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {Link} from "react-router";
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, Copy, FileText,
  Plus, Save, Settings2, Trash2, ArrowUp, ArrowDown,
} from "lucide-react";
import TemporaryProductCode, {type GeneratedProductCode} from "./TemporaryProductCode";
import type {RalOptions} from "@/lib/ral-pricing";
import QuoteNumericInput from "@/components/QuoteNumericInput";
import LaborCostField from "@/components/LaborCostField";
import ArticleCodeInput from "@/components/ArticleCodeInput";
import StandardBlackFinish from "@/components/StandardBlackFinish";
import {manualTemporaryCodePrefix,isNaturalTemporaryCode} from "@/lib/ral-pricing";
import QuoteTotal from "@/components/QuoteTotal";
import FormulaTooltip from "@/components/FormulaTooltip";
import { QUOTE_MATERIAL_GEOMETRIES, QUOTE_MATERIAL_HELP, quoteMaterialGeometry } from "@/lib/quote-material-weight";
import QuoteMaterialCostFields from "@/components/QuoteMaterialCostFields";
import QuoteModificationObjectFields from "@/components/QuoteModificationObjectFields";
import { CALCULATION_FORMULAS } from "@/lib/calculation-formulas";
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
  attachments?:ReactNode;
  ralSettings?:ReactNode;
  onTemporaryCode?:(index:number,code:GeneratedProductCode,ral:RalOptions|null)=>void;
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
  onUnsavedLocalChange:(dirty:boolean)=>void;
  hideDocumentTotalInPdf:boolean;
  onHideDocumentTotalInPdfChange:(hide:boolean)=>void;
  priceProductIndex:number;
  onUpdate:(key:string,value:unknown,economic?:boolean)=>void;
  onUpdateProduct:(index:number,key:string,value:unknown)=>void;
  onAddProduct:()=>void;
  onCopyProductAndScaleLot:(index:number)=>void|Promise<boolean>;
  onMoveProduct?:(index:number,direction:-1|1)=>void;
  onRemoveProduct:(index:number)=>void;
  onGroupRenamed:(result:GroupRenameResult)=>void;
  quoteEditToken?:string;
  onCreateGroup:(index:number,name:string)=>Promise<void>;
  onPriceProductIndex:(value:number)=>void;
  onListinoDiscount:(value:string)=>void;
  onSave:()=>void;
  onSaveOverwrite:()=>void;
  onSaveDraft:()=>void;
  onCopy:()=>void;
  onExportPdf:()=>void;
  onEdit:()=>void;
  onUpgrade:()=>void;
  onDesktop:()=>void;
};
export default function QuoteMobileWizard(props:Props){
  const {
    doc,preview,locked,isNew,numericId,isSavedDraft,groups,loadingGroups,error,draftMessage,
    copyMessage,busy,unsavedChanges,onUnsavedLocalChange,priceProductIndex,onUpdate,onUpdateProduct,
    onAddProduct,onCopyProductAndScaleLot,onRemoveProduct,onCreateGroup,onPriceProductIndex,onListinoDiscount,
    hideDocumentTotalInPdf,onHideDocumentTotalInPdfChange,
    onSave,onSaveOverwrite,onSaveDraft,onCopy,onExportPdf,onEdit,onUpgrade,onDesktop,
  }=props;
  const [advanced,setAdvanced]=useState(false);
  const [stepId,setStepId]=useState("cliente");
  const [localError,setLocalError]=useState("");
  const [newGroup,setNewGroup]=useState("");
  const [addingGroup,setAddingGroup]=useState(false);
  const [groupBusy,setGroupBusy]=useState(false);
  const top=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    onUnsavedLocalChange(addingGroup&&newGroup.trim().length>0);
  },[addingGroup,newGroup,onUnsavedLocalChange]);
  useEffect(()=>()=>onUnsavedLocalChange(false),[onUnsavedLocalChange]);
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
  const submit=(overwrite=false)=>{
    const invalid=steps.find(s=>quoteWizardStepError(s,doc));
    if(invalid){goto(invalid.id);setLocalError("Completa questo campo prima di salvare il preventivo.");return;}
    if(overwrite)onSaveOverwrite();else onSave();
  };
  const productIndex=current.index;
  const product=productIndex===undefined?null:(doc.prodotti?.[productIndex] as Product|undefined);
  const field=current.field;
  const value=(productIndex===undefined?doc:product)?.[field??""];
  const updateValue=(v:unknown)=>{
    setLocalError("");
    if(!field)return;
    if(productIndex===undefined)onUpdate(field,v,current.kind==="number"||field==="trattamenti_modalita"||field==="lavoro_modalita");
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
  const copyProductAndScaleLot=async(index:number)=>{
    const i=index+1;
    if(await onCopyProductAndScaleLot(index)===false)return;
    goto("p:"+i+(isForfait(doc.prodotti[index])?":descrizione":":quantita"));
  };
  const orderButtons=(index:number,navigate=false)=>props.onMoveProduct && <>
    <button type="button" aria-label={`Sposta su prodotto ${index+1}`} title="Sposta su" disabled={locked||index===0} className="min-h-11 min-w-9 rounded p-2 disabled:opacity-30"
      onClick={()=>{props.onMoveProduct!(index,-1);if(navigate)goto(`p:${index-1}:${field??"descrizione"}`);}}><ArrowUp size={18}/></button>
    <button type="button" aria-label={`Sposta giù prodotto ${index+1}`} title="Sposta giù" disabled={locked||index===doc.prodotti.length-1} className="min-h-11 min-w-9 rounded p-2 disabled:opacity-30"
      onClick={()=>{props.onMoveProduct!(index,1);if(navigate)goto(`p:${index+1}:${field??"descrizione"}`);}}><ArrowDown size={18}/></button>
  </>;
  const percent=Math.round((activeIndex+1)/steps.length*100);
  const hasPreview=preview!==null && Number.isFinite(Number(preview.totale_finale));
  const price=euro(preview?.totale_finale);
  const cashMargin=Number(preview?.margine_netto_complessivo_perc??0);
  const canShare=hasPreview && !isSavedDraft && !steps.some(s=>
    (s.field!=="oggetto_modifica" || isNew || unsavedChanges) && quoteWizardStepError(
      !isNew && !unsavedChanges ? {...s,maxLength:undefined} : s,doc));
  const costVersion=Number(doc.costi_comuni_versione)||0;
  return <div ref={top} className="mx-auto flex w-full max-w-xl flex-col gap-3 pb-40 text-slate-900" data-testid="quote-mobile-wizard">
    <header className="rounded-xl bg-slate-900 px-4 py-3 text-white shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <Link to="/preventivi" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-slate-800"
          title="Torna all'archivio" aria-label="Torna all'archivio preventivi">
          <ArrowLeft className="h-5 w-5"/>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">DDCost · Preventivo Una Tantum</p>
          <p className="truncate text-sm font-medium">{isNew?"Nuovo preventivo":`Preventivo ${quoteDocumentNumber(doc)??"#"+numericId}`}</p>
        </div>
        <button type="button" onClick={onDesktop} className="min-h-11 rounded-lg bg-slate-800 px-3 text-xs font-semibold"
          title="Disattiva visualizzazione cellulare e apri editor completo">
          <Settings2 size={16} className="mx-auto mb-0.5"/> Vista completa
        </button>
      </div>
      <div className="mt-2">{props.attachments}</div>
    </header>
    {doc.prodotti.some((p:Product)=>!isForfait(p)) && props.ralSettings}
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <QuoteTotal value={preview?.totale_finale ?? preview?.totale}/>
    </div>
    <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 border border-slate-200">
      <label htmlFor="quote-wizard-advanced" className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Settings2 size={16}/> Opzioni avanzate
      </label>
      <input id="quote-wizard-advanced" type="checkbox" checked={advanced}
        onChange={e=>setAdvanced(e.target.checked)}
        className="h-5 w-5 accent-emerald-600"/>
    </div>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className={productIndex===undefined
          ? "min-w-0 text-xs font-semibold uppercase tracking-wide text-emerald-700"
          : "flex w-full min-w-0 flex-wrap items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-sm font-bold text-slate-950"}>
          <span>{current.section}</span>
          {productIndex!==undefined && <label className="ml-3 inline-flex items-center gap-2 text-sm normal-case">
            <input type="checkbox" className="h-4 w-4 accent-emerald-700" disabled={locked} checked={isForfait(product)}
              onChange={e=>{onUpdateProduct(productIndex,"a_forfait",e.target.checked);setAddingGroup(false);goto(`p:${productIndex}:descrizione`);}}/> A forfait
          </label>}
          {productIndex!==undefined && <label className="ml-3 inline-flex items-center gap-2 text-sm normal-case">
            <input type="checkbox" className="h-4 w-4 accent-emerald-700" disabled={locked} checked={isSeries(product)}
              onChange={e=>{onUpdateProduct(productIndex,"prodotto_di_serie",e.target.checked);setAddingGroup(false);goto(`p:${productIndex}:descrizione`);}}/> Prodotto di serie
          </label>}
        {productIndex!==undefined&&!locked&&<div className="ml-auto flex shrink-0 gap-1">{orderButtons(productIndex,true)}<button type="button" aria-label={`Copia prodotto ${productIndex+1}`} title="Copia subito sotto con un nuovo codice temporaneo" className="rounded p-2 text-violet-800" onClick={()=>void copyProductAndScaleLot(productIndex)}><Copy size={18}/></button>
          {doc.prodotti.length>1&&<button type="button" aria-label={`Elimina prodotto ${productIndex+1}`} className="rounded p-2 text-red-800" onClick={()=>{onRemoveProduct(productIndex);goto("riepilogo");}}><Trash2 size={18}/></button>}</div>}
        </div>

        <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-500">Passo {activeIndex+1} di {steps.length}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100" role="progressbar" aria-label="Completamento preventivo"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{width:percent+"%"}}/>
      </div>

      <h1 className="mt-6 text-xl font-bold leading-tight">{current.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{current.hint}</p>
      {product && isNaturalTemporaryCode(product.codice) && <p className="mt-3 text-sm text-slate-600">Grezzo/naturale · senza verniciatura</p>}
      {productIndex!==undefined && !isFixedPrice(product) && (field==="codice" || field==="descrizione") && props.onTemporaryCode && <TemporaryProductCode disabled={locked} ral={doc.verniciatura_ral??null} onApply={(code,ral)=>props.onTemporaryCode!(productIndex,code,ral)}/>}
      <div className="mt-5">
        {current.id==="riepilogo" ? (
          <div className="space-y-4">
            {!isNew && !isSavedDraft && <SalesHandoffPanel kind="quote" sourceId={numericId} disabled={unsavedChanges}/>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div><dt className="text-slate-500">Cliente</dt><dd className="break-words font-semibold">{doc.cliente||"—"}</dd></div>
              <div><dt className="text-slate-500">Prodotti / pezzi</dt><dd className="font-semibold">{doc.prodotti.length} / {preview?.quantita??"—"}</dd></div>
              <div><dt className="text-slate-500">Totale preventivo</dt><dd className="font-semibold">{hasPreview?"€ "+price:"Da calcolare"}{hasPreview&&<FormulaTooltip label="Totale preventivo" formula={CALCULATION_FORMULAS.quote.quoteTotal}/>}</dd></div>
              <div><dt className="text-slate-500">Margine netto</dt><dd className="font-semibold">{hasPreview && preview?.margine_netto_complessivo_perc!=null?cashMargin.toFixed(1).replace(".",",")+"%":"—"}{hasPreview&&<FormulaTooltip label="Margine netto complessivo" formula={CALCULATION_FORMULAS.quote.netMarginPercent}/>}</dd></div>
            </dl>
            {(preview?.ha_righe_forfait || preview?.ha_righe_serie) && <p className="text-xs text-slate-600">Margine complessivo non disponibile: le righe a forfait o di serie non hanno un costo di produzione definito.</p>}
            {costVersion>=2 && doc.prodotti.some((p:Product)=>!isFixedPrice(p)) && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Trattamenti applicati al preventivo</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {doc.trattamenti_modalita==="globale"
                        ? "Unico costo complessivo"
                        : doc.trattamenti_modalita==="ore_lavoro"
                          ? "Inclusi nelle ore di lavorazione"
                          : "Costi distinti per prodotto"}
                    </p>
                    <p className="text-xs text-slate-700">
                      {doc.trattamenti_modalita==="globale"
                        ? "Ripartito sul numero complessivo di pezzi, senza sommare i singoli trattamenti."
                        : doc.trattamenti_modalita==="ore_lavoro"
                          ? "Il costo separato dei trattamenti è zero: includi il tempo nelle ore di lavorazione di ogni prodotto."
                          : "Vengono conteggiati soltanto i trattamenti €/pezzo dei singoli articoli."}
                    </p>
                  </div>
                  <strong className="text-sm tabular-nums text-slate-900">
                    {hasPreview
                      ? "€ "+euro((preview?.prodotti as Product[]).reduce((sum:number,p:Product)=>sum+Number(p.trattamenti_tot??0),0))
                      : "Da calcolare"}
                    {hasPreview&&<FormulaTooltip label="Totale trattamenti applicati" formula="Somma dei costi trattamento dei prodotti. In modalità globale coincide con il costo totale trattamenti inserito; in modalità per prodotto è la somma di costo trattamento €/pz × quantità per ciascun prodotto."/>}
                  </strong>
                </div>
                {!locked && <button type="button" onClick={()=>goto("trattamenti_modalita")}
                  className="mt-3 min-h-10 rounded-lg border border-emerald-600 bg-white px-3 text-sm font-semibold text-emerald-800">
                  Modifica la modalità dei trattamenti
                </button>}
              </div>
            )}
            <div className="space-y-2">
              {(doc.prodotti as Product[]).map((p,i)=><div key={p._rowId??i} className="flex min-h-12 items-center rounded-lg border border-slate-200 p-3 text-sm">
                <button type="button" onClick={()=>goto("p:"+i+":descrizione")}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                  <span className="min-w-0">
                    <span className="block break-words">{i+1}. {p.descrizione||"Prodotto da completare"}</span>
                    <span className="mt-1 block text-xs text-slate-600">{isForfait(p)?"a forfait/da definire":`${p.quantita} pz · ${hasPreview?"€ "+euro(preview?.prodotti?.[i]?.prezzo_netto_unitario_finale)+" /pz":"Da calcolare"}`}</span>
                    {!isFixedPrice(p) && doc.trattamenti_modalita==="ore_lavoro" &&
                      <span className="mt-1 block text-xs font-medium text-amber-800">Costo trattamenti inglobati nel tempo di produzione</span>}
                  </span>
                  <span className="shrink-0 font-semibold">{hasPreview?"€ "+euro(preview?.prodotti?.[i]?.totale_finale):"—"}</span>
                </button>
                {!isFixedPrice(p) && <FormulaTooltip label={`Totale prodotto ${i+1}`} formula={CALCULATION_FORMULAS.quote.productTotal}/>}
                {!locked && orderButtons(i)}
                {!locked && doc.prodotti.length>1 && <button type="button"
                  aria-label={`Elimina prodotto ${i+1}`}
                  onClick={()=>{
                    if(window.confirm("Rimuovere questo prodotto dal preventivo?"))onRemoveProduct(i);
                  }} className="ml-2 min-h-11 min-w-11 text-red-700"><Trash2 size={17}/></button>}
              </div>)}
            </div>
            {costVersion<3 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Questo preventivo usa il modello storico della progettazione. La conversione è facoltativa; poi scegli come salvare le modifiche.
              {!locked && <button type="button" onClick={onUpgrade} className="mt-2 block font-semibold underline">Converti al modello attuale</button>}
            </div>}
            {locked
              ? <button type="button" onClick={onEdit} className={actionClass+" w-full bg-emerald-600 text-white"}>Modifica preventivo</button>
              : <>
                {!isNew && !isSavedDraft && <button type="button" onClick={()=>submit(true)} disabled={busy||!unsavedChanges}
                  className={actionClass+" w-full bg-sky-700 text-white disabled:opacity-50"}>
                  <Save size={19}/> Salva e sovrascrivi versione attuale
                </button>}
                <button type="button" onClick={()=>submit()} disabled={busy}
                  className={actionClass+" w-full bg-emerald-600 text-white disabled:opacity-50"}>
                  <Check size={19}/>{isSavedDraft?"Completa preventivo":isNew?"Salva preventivo":"Salva nuova versione"}
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
            <div className="flex w-full flex-col gap-2">
            <button type="button" onClick={onExportPdf} disabled={busy||!canShare}
              className={actionClass+" w-full border border-slate-300 text-slate-700 disabled:opacity-40"}>
              <FileText size={18}/> Esporta PDF cliente
            </button>
            <label className="flex w-full min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={hideDocumentTotalInPdf}
                onChange={e=>onHideDocumentTotalInPdfChange(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-emerald-600"/>
              Nascondi totale documento nel PDF cliente
            </label>
            </div>
          </div>
        ):current.id==="listino_prodotto" ? (
          <select id="wizard-input" value={priceProductIndex} disabled={locked}
            onChange={e=>onPriceProductIndex(Number(e.target.value))} className={inputClass}>
            {(doc.prodotti as Product[]).map((p,i)=>!isFixedPrice(p)&&<option value={i} key={i}>{i+1}. {p.descrizione||"Prodotto"}</option>)}
          </select>
        ):current.id==="listino_sconto" ? (
          <input id="wizard-input" className={inputClass} disabled={locked}
            placeholder="40+10%" value={doc.listino?.sconto_riferimento??""}
            onChange={e=>onListinoDiscount(e.target.value)}/>
        ):field==="gruppo_merceologico" && productIndex!==undefined ? (
          <div className="space-y-3">
            <SearchableSelect id="wizard-input" label="Gruppo merceologico" className={inputClass} disabled={locked}
              value={String(value??"")} onChange={updateValue} placeholder={loadingGroups?"Caricamento gruppi…":"Digita il gruppo…"}
              options={groups.map(g=>({value:g.name,label:g.name}))}/>

            <ProductGroupRename disabled={locked} group={groups.find(g=>g.name===value)} onRenamed={props.onGroupRenamed} quoteId={isNew?undefined:numericId} quoteToken={props.quoteEditToken}/>
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
          <div><select id="wizard-input" className={inputClass} disabled={locked}
            value={String(value??"")} onChange={e=>updateValue(e.target.value)}>
            <option value="">Seleziona materiale...</option>
            <option value="ferro">Ferro</option><option value="ottone">Ottone</option><option value="inox">Inox</option><option value="alluminio">Alluminio</option>
          </select><QuoteInoxChoice product={product!} disabled={locked} onChange={value=>onUpdateProduct(productIndex!,"inox_aisi",value)}/></div>
        ):field==="geometria_materiale" && product?(
          <select id="wizard-input" className={inputClass} disabled={locked} value={quoteMaterialGeometry(product)} onChange={e=>updateValue(e.target.value)}>
            <option value="">Seleziona geometria...</option>
            {QUOTE_MATERIAL_GEOMETRIES.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        ):field==="materiale_cad" && product && productIndex!==undefined?(
          <QuoteMaterialCostFields product={product} disabled={locked} mobile placement="cost"
            onChange={(key,value)=>onUpdateProduct(productIndex,key,value)}/>
        ):field==="oggetto_modifica" && product && productIndex!==undefined?(
          <QuoteModificationObjectFields value={value} disabled={locked} compact idPrefix={`wizard-modification-${productIndex}`}
            onChange={selected=>onUpdateProduct(productIndex,"oggetto_modifica",selected)}/>
        ):field==="lavoro_modalita"?(
          <select id="wizard-input" className={inputClass} disabled={locked} value={value??"per_prodotto"}
            onChange={e=>updateValue(e.target.value)}>
            <option value="complessivo">Ore di lavoro imputate complessivamente</option>
            <option value="per_prodotto">Ore di lavoro imputate per ciascun prodotto</option>
            {value==="per_pezzo" && <option value="per_pezzo">Ore per singolo pezzo (modalità precedente)</option>}
          </select>
        ):field==="trattamenti_modalita"?(
          <div className="space-y-3">
            {[["per_prodotto","Costo separato per ciascun prodotto (€/pz)"],
              ["globale","Costo totale dell'offerta, distribuito su tutti i pezzi"],
              ["ore_lavoro","Considera il trattamento nelle ore di lavoro totali"]].map(([choice,caption])=>
              <label key={choice} className={`flex min-h-14 items-center gap-3 rounded-xl border p-3 text-sm ${value===choice?"border-emerald-600 bg-emerald-50":"border-slate-200"}`}>
                <input type="radio" name="quote-treatment-mode" value={choice}
                  checked={(value??"per_prodotto")===choice} disabled={locked}
                  onChange={()=>updateValue(choice)} className="h-5 w-5 accent-emerald-600"/>
                <span>{caption}</span>
              </label>)}
            <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              {value==="globale"
                ?"Inserirai una sola cifra nel prossimo passo. Nessun campo trattamenti verrà chiesto sui singoli prodotti."
                :value==="ore_lavoro"
                  ?"Il costo separato dei trattamenti sarà zero. Includi il loro tempo nelle ore di lavorazione secondo la modalità scelta (monte ore dell'offerta o ore di ciascuna riga prodotto); non verranno chiesti costi trattamento separati."
                  :"Il Wizard ti chiederà un costo trattamento €/pezzo per ogni prodotto, identificando sempre l'articolo. Non ti chiederà un totale globale."}
              Cambiare modalità conserva i vecchi valori, ma il preventivo conteggia esclusivamente la modalità selezionata.
            </p>
          </div>
        ):current.kind==="checkbox"?(
          <label className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 p-3 text-base">
            <input type="checkbox" disabled={locked} checked={value!==false}
              onChange={e=>updateValue(e.target.checked)} className="h-5 w-5 accent-emerald-600"/>
            {field==="costo_materiale_noto"
              ?"Conosco il costo del materiale"
              :"Sì, il prezzo può essere rettificato"}
          </label>
        ):field==="costo_lavoro"?(
          <LaborCostField key={current.id} id="wizard-input" value={value??0} disabled={locked}
            inputClassName={inputClass} onChange={updateValue}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur();next();}}}/>
        ):current.kind==="number" && current.numeric?(
          <QuoteNumericInput key={current.id} id="wizard-input"
            className={inputClass+(field==="quantita"&&(value===""||value===null||value===undefined)?" quote-quantity-attention":"")}
            kind={current.numeric}
            fractionDigits={field==="lavoro_h" && (doc.lavoro_modalita==="per_pezzo" || doc.lavoro_modalita==="per_prodotto") ? 6 : undefined}
            optional={field==="prezzo_serie"||field==="valore_forfait"||field==="quantita"||field==="prezzo_manuale"||field==="target_totale"}
            placeholder={field==="quantita"?"Inserisci la quantità":undefined}
            disabled={locked}
            value={field==="prezzo_serie"||field==="valore_forfait"||field==="quantita"?value??null:value??(field==="prezzo_manuale"||field==="target_totale"?null:0)}
            onChange={updateValue}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur();next();}}}/>
        ):current.kind==="textarea"?(
          <textarea id="wizard-input" rows={4} className={inputClass} disabled={locked}
            value={String(value??"")} onChange={e=>updateValue(e.target.value)}/>
        ):field==="codice" && product?(
          <ArticleCodeInput id="wizard-input" aria-label="Codice articolo" className={inputClass} disabled={locked}
            value={String(value??"")} onChange={updateValue}
            protectedPrefix={!isSeries(product) && !doc.verniciatura_ral?manualTemporaryCodePrefix(product.codice_temporaneo):null}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();next();}}}/>
        ):current.kind==="text"?(
          <input id="wizard-input" className={inputClass} disabled={locked}
            maxLength={current.maxLength}
            aria-describedby={current.maxLength!==undefined?"wizard-description-count":undefined}
            aria-invalid={!locked && current.maxLength!==undefined && String(value??"").length>current.maxLength}
            autoComplete="off" value={String(value??"")} onChange={e=>updateValue(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();next();}}}/>
        ):null}
        {field==="materiale_prodotto" && productIndex!==undefined && product && !doc.verniciatura_ral && !isNaturalTemporaryCode(product.codice) &&
          <div className="mt-3"><StandardBlackFinish value={product.nero_standard_goffrato} disabled={locked}
            onChange={checked=>onUpdateProduct(productIndex,"nero_standard_goffrato",checked)}/></div>}
        {field==="costo_materiale_noto" && value===false && <p className="mt-2 text-sm text-slate-600">{QUOTE_MATERIAL_HELP}</p>}
        {field==="costo_materiale_kg" && product && productIndex!==undefined && <div className="mt-3">
          <QuoteMaterialCostFields product={product} disabled={locked} mobile placement="cost" onChange={(key,value)=>onUpdateProduct(productIndex,key,value)}/>
          {preview?.prodotti?.[productIndex]?.peso_teorico_kg!=null && <p className="mt-1 text-sm text-slate-600">Peso teorico: {Number(preview.prodotti[productIndex].peso_teorico_kg).toLocaleString("it-IT",{maximumFractionDigits:6})} kg/pz</p>}
        </div>}
        {current.maxLength!==undefined && <p id="wizard-description-count" className={"mt-1 text-xs "+(String(value??"").length>current.maxLength?"text-red-700":"text-slate-500")}>
          {String(value??"").length}/{current.maxLength} caratteri, spazi inclusi
        </p>}
        {current.kind==="number" && field==="costo_progettazione_ora" &&
            <p className="mt-2 text-xs text-slate-500">Il costo di progettazione è unico per il preventivo. Sarà distribuito sul totale dei pezzi.<FormulaTooltip label="Progettazione per pezzo" formula={CALCULATION_FORMULAS.quote.engineeringPerPiece}/></p>}
        {field==="quantita"&&(value===""||value===null||value===undefined)&&
          <p role="note" className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm font-medium text-violet-900">
            Prodotto copiato: inserisci la nuova quantità per il lotto.
          </p>}
        {current.kind==="number" && field==="trattamenti_totale_euro" &&
          <p className="mt-2 text-xs text-slate-500">Quota per pezzo: € {euro(preview?.costi_comuni_riepilogo?.trattamenti_globali_cad)}<FormulaTooltip label="Trattamenti comuni per pezzo" formula={CALCULATION_FORMULAS.quote.globalTreatmentPerPiece}/></p>}
        {localError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{localError}</p>}
      </div>
    </section>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {draftMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{draftMessage}</p>}
    {copyMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{copyMessage}</p>}

    <nav aria-label="Navigazione guidata" className="fixed bottom-0 left-0 right-0 z-30 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-5px_24px_rgba(15,23,42,.1)] backdrop-blur">
      {!locked && current.id==="riepilogo" && <div className="mx-auto flex w-full max-w-xl gap-2">
        <button type="button" onClick={addAnotherProduct}
          aria-label="Aggiungi prodotto" title="Aggiungi prodotto"
          className={actionClass+" min-w-0 flex-1 border border-emerald-700 px-2 text-xs leading-tight text-emerald-800"}>
          <Plus className="shrink-0" size={17}/> Aggiungi prodotto
        </button>

      </div>}
      <div className="mx-auto flex w-full max-w-xl gap-2">
        <button type="button" onClick={previous} disabled={activeIndex===0}
          className={actionClass+" min-w-0 flex-1 border border-slate-300 px-2 text-xs text-slate-700 disabled:opacity-35"}>
          <ChevronLeft size={18}/> Indietro
        </button>
        {current.id==="riepilogo"
          ? <button type="button" onClick={locked?onEdit:()=>submit()} disabled={busy}
              className={actionClass+" min-w-0 flex-1 px-2 text-xs bg-emerald-600 text-white disabled:opacity-40"}>
              <Check size={18}/>{locked?"Modifica":"Completa"}
            </button>
          : <button type="button" onClick={next}
              className={actionClass+" min-w-0 flex-1 px-2 text-xs bg-emerald-600 text-white"}>
              Avanti <ArrowRight size={18}/>
            </button>}
      </div>
    </nav>
  </div>;
}
