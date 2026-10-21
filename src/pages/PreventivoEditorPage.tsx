import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import Layout from "@/components/Layout";
import FormulaTooltip from "@/components/FormulaTooltip";
import { trpc } from "@/providers/trpc";
import { ArrowLeft, Plus, Save, Trash2, Calculator, Pencil, Copy, FileText } from "lucide-react";
import { formatQuoteForCopy } from "@/lib/quote-copy";
import { buildOneTimeQuotePrintHtml } from "@/lib/quote-pdf";
import { openCommercialOfferPrintWindow } from "@/lib/commercial-offer-pdf";
import { buildQuoteWizardSteps, quoteWizardStepError } from "@/lib/quote-wizard-steps";
import QuoteNumericInput, {type QuoteNumericKind} from "@/components/QuoteNumericInput";
import QuoteMaterialCostFields from "@/components/QuoteMaterialCostFields";
import QuoteModificationObjectFields from "@/components/QuoteModificationObjectFields";
import QuoteMobileWizard from "@/components/QuoteMobileWizard";
import {
  blankProduct, blankQuote, calculateQuote, migrateQuoteToEngineeringHours,
  type Product, type QuoteDocument,
} from "@/lib/quote-calculation";
import { CALCULATION_FORMULAS } from "@/lib/calculation-formulas";
const val = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const euro = (v: unknown) => val(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const euroDetailed = (v: unknown) => val(v).toLocaleString("it-IT", { minimumFractionDigits: 4, maximumFractionDigits: 4 });


function factorFromDiscount(text: string): number {
  const parts = text.replace(/\s/g, "").replace(/%/g, "").split("+");
  if (!parts.length || parts.some(p => !/^\d+(?:[.,]\d+)?$/.test(p))) throw Error("Inserire uno sconto valido (es. 40+10%)");
  let f = 1;
  for (const part of parts) {
    const p = Number(part.replace(",", "."));
    if (p < 0 || p >= 100) throw Error("Sconto fuori intervallo");
    f *= 1 - p / 100;
  }
  return f;
}
function buildListino(previous: Record<string, any>, quote: QuoteDocument, productIndex: number) {
  const chosen = quote.prodotti?.[productIndex] as Product | undefined;
  if (!chosen) throw Error("Selezionare un prodotto di riferimento");
  const discount = String(previous.sconto_riferimento ?? "").trim();
  if (!discount) throw Error("Inserire lo sconto cliente");
  const factor = factorFromDiscount(discount);
  const requestedNet = val(chosen.prezzo_netto_unitario_finale);
  if (!Number.isFinite(requestedNet) || requestedNet <= 0) throw Error("Prezzo netto di riferimento non valido");
  const theoretical = requestedNet / factor;
  // Round UP to the next cent: the discounted price must not drop below target.
  const gross = Math.ceil((theoretical - 1e-10) * 100) / 100;
  const resultNet = gross * factor;
  const full = val(chosen.full_cost);
  return {
    ...previous,
    descrizione_riferimento: String(chosen.descrizione ?? ""),
    codice_riferimento: String(chosen.codice ?? ""),
    product_index_riferimento: productIndex,
    fonte: "prodotto selezionato nel preventivo",
    prezzo_minimo_riferimento: requestedNet,
    full_cost_riferimento: full,
    prezzo_listino_minimo_teorico: theoretical,
    prezzo_listino_generato: gross,
    sconto_riferimento: discount,
    rows: [{
      sconto: discount, fattore_netto: factor, prezzo_listino: gross,
      netto: resultNet, margine_netto: resultNet > 0 ? (resultNet - full) / resultNet * 100 : null,
    }],
  };
}

const fields: Array<{key:string;label:string;shortLabel:string;kind:QuoteNumericKind;optional?:boolean}> = [
  {key:"quantita",label:"Quantità (pezzi)",shortLabel:"Quantità",kind:"decimal"},
  {key:"lavoro_h",label:"Lavorazione ore totali",shortLabel:"Ore lavorazione",kind:"decimal"},
  {key:"trattamenti_cad",label:"Trattamenti €/pezzo",shortLabel:"Trattamenti €/pz",kind:"euro"},
  {key:"costo_lavoro",label:"Costo lavoro €/h",shortLabel:"Costo €/h",kind:"euro"},
  {key:"attrezzaggi_h",label:"Attrezzaggio ore totali",shortLabel:"Ore attrezzaggio",kind:"decimal"},
  {key:"ricarico_spese",label:"Spese generali (%)",shortLabel:"Spese gen. %",kind:"percent"},
  {key:"margine",label:"Margine (%)",shortLabel:"Margine %",kind:"percent"},
];

// Only non-zero values prefilled by DDCost are marked as suggestions.
// It is a VISUAL indication, never used in the cost engine or as provenance.
const initialProductDefaults = blankProduct();
const suggestedProductKeys = new Set(["quantita","costo_lavoro","ricarico_spese","margine"]);
const suggestedProductValue = (product:Product,key:string):boolean =>
  suggestedProductKeys.has(key) && Number(product[key]) === Number(initialProductDefaults[key]);

const compactInputClass = "h-9 w-full min-w-0 rounded-md border px-2 py-1.5 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 disabled:bg-slate-100";
const normalInputClass = "border-slate-300 bg-white focus:border-emerald-500 focus:ring-emerald-200";
const suggestedInputClass = "border-sky-300 bg-sky-50 focus:border-sky-500 focus:bg-white focus:ring-sky-200";
const suggestedHint = "Valore iniziale proposto da DDCost, modificabile";

const MOBILE_VIEW_KEY = "ddcost.quote.mobile-view";
function readMobileViewChoice():boolean|null {
  if(typeof window==="undefined")return null;
  try{
    const stored=window.localStorage.getItem(MOBILE_VIEW_KEY);
    return stored==="1"?true:stored==="0"?false:null;
  }catch{return null;}
}
function isPhoneWidth():boolean {
  return typeof window!=="undefined" && typeof window.matchMedia==="function" &&
    window.matchMedia("(max-width: 767px)").matches;
}

export default function PreventivoEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const numericId = Number(id ?? 0);
  const [doc, setDoc] = useState<QuoteDocument>(blankQuote());
  const [viewOverride,setViewOverride]=useState<boolean|null>(readMobileViewChoice);
  const [phoneWidth,setPhoneWidth]=useState(isPhoneWidth);
  const wizardMode=viewOverride ?? phoneWidth;
  useEffect(()=>{
    const mq=window.matchMedia("(max-width: 767px)");
    const changed=()=>setPhoneWidth(mq.matches);
    mq.addEventListener("change",changed);
    return()=>mq.removeEventListener("change",changed);
  },[]);
  const chooseMobileView=(active:boolean)=>{
    setViewOverride(active);
    try{window.localStorage.setItem(MOBILE_VIEW_KEY,active?"1":"0");}
    catch{/* Keep the current choice if storage is unavailable. */}
  };
  const [baseline, setBaseline] = useState("");
  const [originalJson, setOriginalJson] = useState("");
  const [readOnly, setReadOnly] = useState(!isNew);
  const [dirtyCalculation, setDirtyCalculation] = useState(false);
  const [listinoModified, setListinoModified] = useState(false);
  const [priceProductIndex, setPriceProductIndex] = useState(0);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [newGroupIndex, setNewGroupIndex] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const draftIdRef=useRef<number|null>(null);
  const allowLeaveRef=useRef(false);
  const [draftSaving,setDraftSaving]=useState(false);
  const [draftMessage,setDraftMessage]=useState("");

  const groupsQuery = trpc.productGroup.list.useQuery();
  const createGroup = trpc.productGroup.create.useMutation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.quote.get.useQuery({ id:numericId }, { enabled: !isNew && numericId > 0 });
  const create = trpc.quote.create.useMutation();
  const revise = trpc.quote.saveRevision.useMutation();
  const saveDraftMutation=trpc.quote.saveDraft.useMutation();
  const finalizeDraftMutation=trpc.quote.finalizeDraft.useMutation();
  useEffect(() => {
    if (!data || isNew) return;
    try {
      const parsed: QuoteDocument = JSON.parse(data.dataJson || "{}");
      if (!Array.isArray(parsed.prodotti)) throw new Error("Formato storico non riconosciuto");
      parsed.cliente = data.client ?? parsed.cliente ?? "";
      parsed.riferimento_preventivo = data.reference ?? parsed.riferimento_preventivo ?? "";
      setDoc(parsed);
      setOriginalJson(data.dataJson ?? "");
      setBaseline(JSON.stringify(parsed));
      setDirtyCalculation(false);
      setListinoModified(false);
      setPriceProductIndex(Number.isInteger(parsed.listino?.product_index_riferimento) ? parsed.listino.product_index_riferimento : 0);
      const isDraft=parsed.stato_preventivo==="bozza";
      draftIdRef.current=isDraft?numericId:null;
      setReadOnly(!isDraft);
      setDirtyCalculation(isDraft);
      setError("");
    } catch {
      setError("Il preventivo storico contiene dati non riconosciuti. Nessun record è stato modificato.");
    }
  }, [data, isNew]);
  const changed=isNew
    ? JSON.stringify(doc)!==JSON.stringify(blankQuote())
    : Boolean(data) && JSON.stringify(doc)!==baseline;
  const unsavedChanges=changed && (isNew || !readOnly);
  const isSavedDraft=doc.stato_preventivo==="bozza";
  const blocker=useBlocker(({currentLocation,nextLocation})=>
    unsavedChanges && !allowLeaveRef.current &&
    (currentLocation.pathname!==nextLocation.pathname ||
     currentLocation.search!==nextLocation.search)
  );
  useEffect(()=>{
    if(!unsavedChanges || allowLeaveRef.current)return;
    const handler=(event:BeforeUnloadEvent)=>{
      event.preventDefault();
      event.returnValue="";
    };
    window.addEventListener("beforeunload",handler);
    return()=>window.removeEventListener("beforeunload",handler);
  },[unsavedChanges]);
  const update = (key: string, value: unknown, economic = false) => {
    setDoc(prev => ({ ...prev, [key]: value }));
    if (economic) setDirtyCalculation(true);
  };
  const updateProduct = (index: number, key: string, value: unknown) => {
    setDoc(prev => {
      const prodotti = [...(prev.prodotti as Product[])];
      prodotti[index] = { ...prodotti[index], [key]: value };
      return { ...prev, prodotti };
    });
    if (!["gruppo_merceologico","materiale_prodotto","codice","descrizione"].includes(key))
      setDirtyCalculation(true);
  };
  // A draft is stored in MySQL even with missing client, product group or
  // commercial values. Server-side validations still apply to final quotes.
  async function persistDraft():Promise<number>{
    if(draftSaving || saveDraftMutation.isPending)
      throw new Error("Salvataggio già in corso");
    setDraftSaving(true);
    setError("");
    try{
      const result=await saveDraftMutation.mutateAsync({
        sourceId:draftIdRef.current??(!isNew?numericId:undefined),
        client:String(doc.cliente??""),
        reference:String(doc.riferimento_preventivo??""),
        dataJson:JSON.stringify({...doc,stato_preventivo:"bozza"}),
      });
      draftIdRef.current=result.id;
      setDraftMessage("Bozza salvata nell'archivio preventivi, anche se incompleta.");
      // Persistence is already confirmed: a refresh error must not report a failed save.
      void utils.quote.list.invalidate().catch(()=>{});
      return result.id;
    }catch(err){
      setError(err instanceof Error?err.message:"Impossibile salvare la bozza");
      throw err;
    }finally{
      setDraftSaving(false);
    }
  }
  async function saveDraftAndLeave(){
    try{
      await persistDraft();
      if(blocker.state==="blocked")blocker.proceed();
    }catch{/* Never leave on failed persistence. */}
  }
  async function saveDraftOnly(){
    try{
      const id=await persistDraft();
      if(!isNew && id===numericId){
        // Updating an existing draft does not change route: reset the dirty
        // baseline here rather than accidentally disabling future guards.
        const persisted={...doc,stato_preventivo:"bozza"};
        setDoc(persisted);
        setBaseline(JSON.stringify(persisted));
        setDirtyCalculation(true);
        void utils.quote.get.invalidate({id}).catch(()=>{});
      }else{
        allowLeaveRef.current=true;
        navigate("/preventivi/"+id,{replace:isNew});
      }
    }catch{/* Keep the document editable and error visible. */}
  }
  const addGroup = async (index: number) => {
    setError("");
    try {
      const result = await createGroup.mutateAsync({ name: newGroupName.trim() });
      await utils.productGroup.list.invalidate();
      updateProduct(index,"gruppo_merceologico",result.name);
      setNewGroupIndex(null);
      setNewGroupName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile creare il gruppo");
    }
  };
  const copyQuote = async () => {
    if(isSavedDraft){
      setError("Prima completa il preventivo: una bozza non va inviata al cliente.");
      return;
    }
    setError("");
    setCopyMessage("");
    try {
      const computed = dirtyCalculation || isNew ? calculateQuote(doc) : structuredClone(doc);
      if (listinoModified && String(doc.listino?.sconto_riferimento ?? "").trim())
        computed.listino = buildListino(computed.listino ?? {}, computed, priceProductIndex);
      const text = formatQuoteForCopy(computed);
      await navigator.clipboard.writeText(text);
      setCopyMessage("Dati del preventivo copiati. Puoi incollarli in un'email o documento.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile copiare il preventivo");
    }
  };
  const preview = useMemo(() => {
    if (dirtyCalculation || isNew) {
      try { return calculateQuote(doc); } catch { return null; }
    }
    return doc;
  }, [doc, dirtyCalculation, isNew]);
  const canExportPdf = preview !== null && !isSavedDraft &&
    !buildQuoteWizardSteps(doc).some(step => quoteWizardStepError(step,doc));
  const exportCustomerPdf = () => {
    if (isSavedDraft) {
      setError("Prima completa il preventivo: una bozza incompleta non va inviata al cliente.");
      return;
    }
    if (!canExportPdf) {
      setError("Completa i campi obbligatori prima di esportare il PDF cliente.");
      return;
    }
    setError("");
    try {
      const computed = dirtyCalculation || isNew ? calculateQuote(doc) : structuredClone(doc);
      openCommercialOfferPrintWindow(buildOneTimeQuotePrintHtml(computed,numericId || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile esportare il PDF cliente");
    }
  };
  async function save() {
    setError("");
    if (!doc.cliente?.trim()) return setError("Indicare il cliente");
    if (!Array.isArray(doc.prodotti) || doc.prodotti.length === 0) return setError("Inserire almeno un prodotto");
    for (let i = 0; i < doc.prodotti.length; i++) {
      const p = doc.prodotti[i];
      if (!String(p.gruppo_merceologico ?? "").trim())
        return setError("Indicare un gruppo merceologico per il prodotto " + (i+1));
      if (!["ferro","ottone","inox"].includes(String(p.materiale_prodotto ?? "")))
        return setError("Indicare ferro, ottone o inox per il prodotto " + (i+1));
    }
    if (!isNew && !changed && !isSavedDraft) return setError("Nessuna modifica rilevata");
    if (create.isPending || revise.isPending || finalizeDraftMutation.isPending || draftSaving) return;
    try {
      const computed = dirtyCalculation || isNew ? calculateQuote(doc) : structuredClone(doc);
      if (listinoModified) computed.listino = buildListino(computed.listino ?? {}, computed, priceProductIndex);
      computed.stato_preventivo="completo";
      const json = JSON.stringify(computed);
      if (!isNew && originalJson === json) return setError("Nessuna modifica rilevata");
      const payload = {
        client: String(doc.cliente),
        reference: String(doc.riferimento_preventivo ?? ""),
        targetTotal: computed.target_totale === null ? null : String(computed.target_totale),
        totalBeforeRebalance: String(computed.totale_pre_quadratura ?? 0),
        totalFinal: String(computed.totale_finale ?? 0),
        numProducts: computed.prodotti.length,
        generalNotes: String(computed.note_generali ?? ""),
        clientNotes: String(computed.note_cliente ?? ""),
        supplierNotes: String(computed.note_fornitori ?? ""),
        summary: String(computed.summary ?? ""),
        dataJson: json,
      };
      if(draftIdRef.current!==null){
        const result=await finalizeDraftMutation.mutateAsync({
          draftId:draftIdRef.current,...payload,
        });
        // The draft row is finalized in place. Update local state because
        // navigation to the exact same pathname can reuse this component.
        setDoc(computed);
        setBaseline(JSON.stringify(computed));
        setOriginalJson(json);
        setDirtyCalculation(false);
        setListinoModified(false);
        setReadOnly(true);
        draftIdRef.current=null;
        void utils.quote.list.invalidate().catch(()=>{});
        void utils.quote.get.invalidate({id:result.id}).catch(()=>{});
        if(isNew){
          allowLeaveRef.current=true;
          navigate("/preventivi/"+result.id,{replace:true});
        }
      }else if(isNew){
        const result=await create.mutateAsync({...payload,targetTotal:payload.targetTotal??undefined});
        allowLeaveRef.current=true;
        navigate("/preventivi/"+result.id);
      }else{
        const result=await revise.mutateAsync({sourceId:numericId,...payload});
        allowLeaveRef.current=true;
        navigate("/preventivi/"+result.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio fallito");
    }
  }
  if (!isNew && isLoading) return <Layout><p>Caricamento preventivo...</p></Layout>;
  if (!isNew && !data) return <Layout><p>Preventivo non trovato.</p><Link to="/preventivi">Torna all'elenco</Link></Layout>;
  const locked = readOnly && !isNew;
  const legacyCostModel = !(Number(doc.costi_comuni_versione) >= 2);
  const sharedTreatmentMode = doc.trattamenti_modalita === "globale"
    ? "globale"
    : doc.trattamenti_modalita === "ore_lavoro" ? "ore_lavoro" : "per_prodotto";
  const legacyEngineeringModel = !(Number(doc.costi_comuni_versione) >= 3);
  const upgradeCosts = () => {
    if (locked) return;
    if (!window.confirm(
      "Convertire questo preventivo alla progettazione per ore × tariffa oraria? " +
      "Il costo storico totale rimarrà identico: inizialmente verrà indicata 1 ora " +
      "con tariffa pari all'importo storico. Sostituisci questi valori provvisori con le ore e la tariffa effettive. " +
      "L'originale resta invariato; il risultato si salva soltanto in una nuova revisione."
    )) return;
    try {
      setDoc(migrateQuoteToEngineeringHours(doc));
      setDirtyCalculation(true);
      setListinoModified(Boolean(String(doc.listino?.sconto_riferimento ?? "").trim()));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversione non riuscita");
    }
  };
  return <Layout mobileWizard={wizardMode}>
    <div className={wizardMode?"w-full min-w-0":"w-full max-w-screen-2xl mx-auto space-y-5 pb-10"}>
      {blocker.state==="blocked" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="quote-leave-title"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h2 id="quote-leave-title" className="text-lg font-semibold text-slate-900">
              Vuoi salvare il preventivo prima di uscire?
            </h2>
            <p className="text-sm text-slate-700">
              Ci sono dati non salvati. Puoi conservare il preventivo come
              <strong> bozza anche se incompleto</strong> e riprenderlo dall'archivio.
            </p>
            {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
            <div className="flex flex-col sm:flex-row sm:flex-wrap justify-end gap-2">
              <button type="button" disabled={draftSaving} onClick={()=>blocker.reset()}
                className="rounded-lg border px-4 py-2.5 text-sm font-medium">
                Continua a compilare
              </button>
              <button type="button" disabled={draftSaving} onClick={()=>blocker.proceed()}
                className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700">
                Esci senza salvare
              </button>
              <button type="button" disabled={draftSaving} onClick={()=>void saveDraftAndLeave()}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {draftSaving?"Salvataggio...":"Salva bozza ed esci"}
              </button>
            </div>
          </div>
        </div>
      )}
      {wizardMode ? (
        <QuoteMobileWizard
          doc={doc} preview={preview} locked={locked} isNew={isNew}
          numericId={numericId} isSavedDraft={isSavedDraft}
          groups={groupsQuery.data??[]} loadingGroups={groupsQuery.isLoading}
          error={error} draftMessage={draftMessage} copyMessage={copyMessage}
          busy={draftSaving||create.isPending||revise.isPending||finalizeDraftMutation.isPending}
          unsavedChanges={unsavedChanges}
          priceProductIndex={priceProductIndex}
          onUpdate={update} onUpdateProduct={updateProduct}
          onAddProduct={()=>update("prodotti",[...doc.prodotti,blankProduct()],true)}
          onRemoveProduct={index=>update("prodotti",doc.prodotti.filter((_:Product,i:number)=>i!==index),true)}
          onCreateGroup={async(index,name)=>{
            try{
              const result=await createGroup.mutateAsync({name});
              await utils.productGroup.list.invalidate();
              updateProduct(index,"gruppo_merceologico",result.name);
            }catch(err){
              setError(err instanceof Error?err.message:"Impossibile creare il gruppo");
              throw err;
            }
          }}
          onPriceProductIndex={index=>{
            setPriceProductIndex(index);
            setListinoModified(Boolean(String(doc.listino?.sconto_riferimento??"").trim()));
          }}
          onListinoDiscount={value=>{
            update("listino",{...(doc.listino??{}),sconto_riferimento:value});
            setListinoModified(Boolean(value.trim()));
          }}
          onSave={()=>void save()} onSaveDraft={()=>void saveDraftOnly()}
          onCopy={()=>void copyQuote()} onExportPdf={exportCustomerPdf} onEdit={()=>setReadOnly(false)}
          onUpgrade={upgradeCosts} onDesktop={()=>chooseMobileView(false)}
        />
      ) : (
        <>
        <div className="flex items-center justify-end">
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600"
              checked={wizardMode} onChange={e=>chooseMobileView(e.target.checked)}/>
            Visualizzazione cellulare (Wizard)
          </label>
        </div>
      {/* Sticky quote identity and actions share the same scroll container as the editor. */}
      <div className="sticky top-0 z-30 -mx-2 mb-4 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-md space-y-3 max-h-[60vh] overflow-y-auto">
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <div className="flex items-center gap-2">
          <Link to="/preventivi" className="p-2 border rounded"><ArrowLeft size={16}/></Link>
          <h1 className="text-2xl font-bold">{isNew ? "Nuovo preventivo una tantum" : "Preventivo #" + numericId + " — rev. " + (data?.rev ?? 1)}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!locked && <button type="button" onClick={()=>update("prodotti",[...doc.prodotti,blankProduct()],true)}
            className="border border-emerald-600 text-emerald-700 px-4 py-2 rounded flex gap-2 items-center"
            title="Aggiungi prodotto senza scorrere fino alla sezione prodotti">
            <Plus size={16}/> Aggiungi prodotto
          </button>}
          <button type="button" onClick={copyQuote}
            className="border border-emerald-600 text-emerald-700 px-4 py-2 rounded flex gap-2 items-center">
            <Copy size={16}/> Copia per email / documento
          </button>
          <button type="button" onClick={exportCustomerPdf} disabled={!canExportPdf}
            className="border border-slate-300 text-slate-700 disabled:opacity-40 px-4 py-2 rounded flex gap-2 items-center"
            title="Esporta il documento con i soli dati destinati al cliente">
            <FileText size={16}/> Esporta PDF cliente
          </button>
          {locked ? <button className="bg-emerald-600 text-white px-4 py-2 rounded flex gap-2" onClick={() => setReadOnly(false)}><Pencil size={16}/> Modifica</button>
          : <>
              <button type="button" className="border px-4 py-2 rounded flex gap-2" onClick={() => { try { setDoc(calculateQuote(doc)); setDirtyCalculation(false); setError(""); } catch(e) { setError(e instanceof Error ? e.message : "Errore ricalcolo"); } }}><Calculator size={16}/> Ricalcola</button>
              <button type="button" disabled={draftSaving || !unsavedChanges} onClick={()=>void saveDraftOnly()}
                className="rounded border border-emerald-600 px-4 py-2 font-medium text-emerald-700 disabled:opacity-40">
                {draftSaving?"Salvataggio...":"Salva bozza"}
              </button>
              <button type="button" disabled={create.isPending || revise.isPending || finalizeDraftMutation.isPending || draftSaving || (!isNew && !changed && !isSavedDraft)}
                className="bg-emerald-600 disabled:opacity-40 text-white px-4 py-2 rounded flex gap-2" onClick={()=>void save()}>
                <Save size={16}/> {isSavedDraft?"Completa preventivo":isNew?"Salva preventivo":"Salva nuova revisione"}
              </button>
            </>}
        </div>
      </div>
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {(["cliente","riferimento_preventivo","titolo_preventivo"] as const).map(key=>
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{key === "cliente" ? "Cliente *" : key === "riferimento_preventivo" ? "Riferimento" : "Titolo preventivo"}</span>
            <input className="w-full min-w-0 border rounded p-2 disabled:bg-slate-100" value={doc[key] ?? ""} disabled={locked}
              onChange={e=>update(key,e.target.value)}/>
          </label>)}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Totale desiderato € (quadratura, facoltativo)</span>
          <QuoteNumericInput kind="euro" optional className="w-full min-w-0 border rounded p-2 disabled:bg-slate-100"
            disabled={locked} value={doc.target_totale ?? null}
            onChange={value=>update("target_totale",value,true)}/>
        </label>
      </section>
      </div>
      {draftMessage && <div role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{draftMessage}</div>}
      {copyMessage && <div role="status" className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded p-3">{copyMessage}</div>}
      {error && <div role="alert" className="border border-red-400 bg-red-50 p-3 rounded text-red-800">{error}</div>}
      {!isNew && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded">
        {isSavedDraft
          ? "BOZZA: puoi completare i campi mancanti oppure salvarla ancora. Solo «Completa preventivo» applica le verifiche obbligatorie e rende il documento definitivo."
          : "Ogni modifica salva una nuova revisione; la versione originale non viene sovrascritta. I calcoli storici sono preservati finché non modifichi i dati economici."}
      </div>}
      {legacyCostModel ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <h2 className="font-semibold text-amber-950">Preventivo con struttura costi storica</h2>
          <p className="text-sm text-amber-900">
            In questa versione storica progettazione e trattamenti sono ancora imputati ai singoli prodotti.
            I calcoli rimangono quelli originali finché non scegli di convertirli.
          </p>
          {locked
            ? <p className="text-sm text-amber-900">Se vuoi adottare i costi comuni, premi prima «Modifica», poi «Converti al nuovo modello».</p>
            : <button type="button" onClick={upgradeCosts}
                className="rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-900">
                Converti al nuovo modello costi
              </button>}
        </section>
      ) : (
        <section className="bg-white border rounded-xl p-3 md:p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-lg">Costi comuni all'offerta</h2>
            <p className="text-xs text-slate-600 mt-1">
              La progettazione si inserisce una sola volta. La quota €/pezzo è il totale diviso
              per la somma delle quantità di tutti i prodotti.
              Nessun costo comune viene sommato due volte.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {legacyEngineeringModel ? (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Progettazione totale € (modello precedente)</span>
                  <QuoteNumericInput kind="euro" value={doc.progettazione_totale_euro ?? 0}
                    disabled={locked} onChange={value=>update("progettazione_totale_euro",value,true)}
                    className="w-full min-w-0 rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-100"/>
                </label>
                <p className="text-xs text-amber-950">
                  Questa revisione conserva il costo diretto in euro. Per usare ore × tariffa
                  converti esplicitamente al nuovo modello, senza sovrascrivere lo storico.
                </p>
                {!locked && <button type="button" onClick={upgradeCosts}
                  className="rounded-lg bg-amber-800 px-3 py-2 text-sm font-semibold text-white">
                  Converti progettazione in ore × tariffa
                </button>}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex min-w-0 flex-col gap-1 text-xs">
                    <span className="font-medium" title="Ore complessive di progettazione">Ore progettazione</span>
                    <QuoteNumericInput kind="decimal" value={doc.progettazione_ore ?? 0}
                      disabled={locked} onChange={value=>update("progettazione_ore",value,true)}
                      className={compactInputClass+" "+normalInputClass}/>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1 text-xs">
                    <span className="font-medium" title="Costo orario progettazione (€/h)">Progettazione €/h</span>
                    <QuoteNumericInput kind="euro" value={doc.costo_progettazione_ora ?? 50}
                      disabled={locked} onChange={value=>update("costo_progettazione_ora",value,true)}
                      className={compactInputClass+" "+(Number(doc.costo_progettazione_ora??50)===50?suggestedInputClass:normalInputClass)}
                      title={Number(doc.costo_progettazione_ora??50)===50?suggestedHint:undefined}/>
                  </label>
                </div>
                <p className="text-xs text-slate-600">
                  Costo comune: <strong>€ {euro(preview?.costi_comuni_riepilogo?.progettazione_totale)}<FormulaTooltip label="Costo totale di progettazione" formula={CALCULATION_FORMULAS.quote.engineeringTotal}/></strong>
                  {" "}(ore × tariffa), diviso tra {preview?.costi_comuni_riepilogo?.quantita_totale ?? "—"} pezzi:
                  <strong> € {euroDetailed(preview?.costi_comuni_riepilogo?.progettazione_cad)}<FormulaTooltip label="Quota di progettazione per pezzo" formula={CALCULATION_FORMULAS.quote.engineeringPerPiece}/>/pz</strong>.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label className="flex flex-col gap-1 text-sm" htmlFor="trattamenti-modalita">
                <span className="font-medium">Come attribuire i trattamenti?</span>
                <select id="trattamenti-modalita" value={sharedTreatmentMode}
                  disabled={locked} onChange={e=>update("trattamenti_modalita",e.target.value,true)}
                  className="w-full min-w-0 rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-100">
                  <option value="per_prodotto">Separati per prodotto (€/pz)</option>
                  <option value="globale">Un costo complessivo per l'offerta (€)</option>
                  <option value="ore_lavoro">Considera i trattamenti nelle ore di lavoro totali</option>
                </select>
              </label>
              {sharedTreatmentMode === "globale" ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Costo totale trattamenti dell'offerta (€)</span>
                  <QuoteNumericInput kind="euro" value={doc.trattamenti_totale_euro ?? 0}
                    disabled={locked} onChange={value=>update("trattamenti_totale_euro",value,true)}
                    className="w-full min-w-0 rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-100"/>
                  <span className="text-xs text-slate-500">
                    Quota ripartita: € {euroDetailed(preview?.costi_comuni_riepilogo?.trattamenti_globali_cad)}<FormulaTooltip label="Trattamenti comuni per pezzo" formula={CALCULATION_FORMULAS.quote.globalTreatmentPerPiece}/> /pz.
                  </span>
                </label>
              ) : sharedTreatmentMode === "ore_lavoro" ? (
                <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
                  Costo trattamenti inglobati nel tempo di produzione. Includi il tempo dei trattamenti
                  nelle ore complessive di lavorazione di ciascun prodotto; non verrà aggiunto un costo
                  trattamento separato.
                </p>
              ) : (
                <p className="text-xs text-slate-600">
                  Inserisci il costo trattamento €/pezzo sotto ciascun prodotto.
                  Non viene applicata alcuna quota comune di trattamenti.
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Le modalità di trattamento sono alternative, mai cumulative. Cambiare modalità
            conserva i valori della modalità inattiva per poterli ripristinare, ma non li conteggia.
          </p>
        </section>
      )}
      <section className="bg-white border rounded-xl p-3 md:p-4 space-y-2">
        <h2 className="font-semibold text-lg">Prezzo di listino da sconto cliente</h2>
        <p className="text-xs text-slate-600">Il listino lordo viene ricavato dal prezzo netto finale dell'articolo selezionato, applicando gli sconti successivi (es. 40+10% = fattore 0,54). Il listino è arrotondato in eccesso al centesimo; il prezzo netto del preventivo non viene cambiato.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>Prodotto di riferimento</span>
            <select disabled={locked} className="border rounded p-2 disabled:bg-slate-100" value={priceProductIndex}
              onChange={e=>{setPriceProductIndex(Number(e.target.value));setListinoModified(Boolean(String(doc.listino?.sconto_riferimento??"").trim()));}}>
              {(doc.prodotti as Product[]).map((p,i)=><option key={i} value={i}>{i+1}. {p.descrizione||"(senza descrizione)"}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Sconto cliente (es. 40+10%)</span>
            <input disabled={locked} className="border rounded p-2 disabled:bg-slate-100"
              value={doc.listino?.sconto_riferimento ?? ""}
              onChange={e=>{update("listino",{...(doc.listino ?? {}),sconto_riferimento:e.target.value});setListinoModified(true);}}/>
          </label>
        </div>
        {(() => {
          const discount = String(doc.listino?.sconto_riferimento ?? "").trim();
          if (!discount) return <p className="text-sm text-slate-500">Inserire lo sconto cliente per calcolare il listino lordo.</p>;
          try {
            const data = listinoModified
              ? buildListino(doc.listino ?? {}, preview ?? doc, priceProductIndex)
              : doc.listino;
            return <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-slate-50 rounded p-3 text-sm">
              <span>Netto di riferimento: <b>€ {euro(data.prezzo_minimo_riferimento)}<FormulaTooltip label="Netto di riferimento del prodotto" formula={CALCULATION_FORMULAS.quote.productFinalPrice}/></b></span>
              <span>Listino lordo: <b>€ {euro(data.prezzo_listino_generato)}<FormulaTooltip label="Listino lordo" formula={CALCULATION_FORMULAS.quote.listPrice}/></b></span>
              <span>Netto dopo sconto: <b>€ {euro(data.rows?.[0]?.netto)}<FormulaTooltip label="Netto dopo sconto" formula={CALCULATION_FORMULAS.quote.netAfterDiscount}/></b></span>
            </div>;
          } catch (err) { return <p className="text-red-700 text-sm">{err instanceof Error?err.message:"Sconto non valido"}</p>; }
        })()}
      </section>
      <div className="flex justify-between items-center">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="font-semibold text-xl">Prodotti ({doc.prodotti?.length ?? 0})</h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded border border-sky-300 bg-sky-50"/>
            Azzurro = valore iniziale proposto, modificabile
          </span>
        </div>
      </div>
      {(doc.prodotti as Product[]).map((p,index)=>
        <section key={index} className="bg-white border rounded-xl p-3 md:p-4 space-y-2.5">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Prodotto {index+1}</h3>
            {!locked && doc.prodotti.length > 1 && <button title="Rimuovi prodotto" className="text-red-600" onClick={()=>update("prodotti",doc.prodotti.filter((_:Product,i:number)=>i!==index),true)}><Trash2 size={17}/></button>}
          </div>
          {!legacyCostModel && sharedTreatmentMode === "ore_lavoro" &&
            <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              Costo trattamenti inglobati nel tempo di produzione. Includi il tempo dei trattamenti nelle ore totali
              di lavorazione di questa riga; il costo trattamento separato è pari a zero.
            </p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs sm:col-span-1 lg:col-span-2">
              <span className="font-medium">Codice articolo</span>
              <input className={compactInputClass+" "+normalInputClass} disabled={locked} value={p.codice??""}
                onChange={e=>updateProduct(index,"codice",e.target.value)}/>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs sm:col-span-1 lg:col-span-5">
              <span className="font-medium">Descrizione *</span>
              <input className={compactInputClass+" "+normalInputClass} disabled={locked} value={p.descrizione??""}
                onChange={e=>updateProduct(index,"descrizione",e.target.value)}/>
            </label>
            <div className="flex min-w-0 flex-col gap-1 text-xs lg:col-span-3">
              <label htmlFor={"group-"+index} className="font-medium">Gruppo merceologico *</label>
              <select id={"group-"+index} disabled={locked} className={compactInputClass+" "+normalInputClass}
                value={p.gruppo_merceologico ?? ""} onChange={e=>updateProduct(index,"gruppo_merceologico",e.target.value)}>
                <option value="">Seleziona un gruppo esistente</option>
                {(groupsQuery.data ?? []).map(g=><option key={g.id} value={g.name}>{g.name}</option>)}
                {p.gruppo_merceologico && !(groupsQuery.data ?? []).some(g=>g.name === p.gruppo_merceologico) &&
                  <option value={p.gruppo_merceologico}>{p.gruppo_merceologico} (non presente nel catalogo)</option>}
              </select>
              {!locked && (newGroupIndex === index
                ? <div className="flex flex-wrap items-center gap-2 mt-1">
                    <input aria-label="Nome nuovo gruppo merceologico" autoFocus maxLength={120} className="border rounded p-2 flex-1 min-w-32"
                      value={newGroupName} placeholder="Es. Bandelle a T" onChange={e=>setNewGroupName(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void addGroup(index);}}}/>
                    <button type="button" disabled={createGroup.isPending || newGroupName.trim().length<2}
                      className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50" onClick={()=>void addGroup(index)}>Crea e seleziona</button>
                    <button type="button" className="border rounded px-3 py-2" onClick={()=>setNewGroupIndex(null)}>Annulla</button>
                  </div>
                : <button type="button" className="text-left text-emerald-700 underline text-xs mt-1"
                    onClick={()=>{setNewGroupName("");setNewGroupIndex(index);}}>+ Crea un nuovo gruppo merceologico</button>)}
            </div>
            <label className="flex min-w-0 flex-col gap-1 text-xs lg:col-span-2">
              <span className="font-medium">Materiale *</span>
              <select className={compactInputClass+" "+normalInputClass} disabled={locked}
                value={p.materiale_prodotto ?? ""} onChange={e=>updateProduct(index,"materiale_prodotto",e.target.value)}>
                <option value="">Seleziona materiale</option>
                <option value="ferro">Ferro</option>
                <option value="ottone">Ottone</option>
                <option value="inox">Inox</option>
              </select>
            </label>
          </div>
          <QuoteModificationObjectFields value={p.oggetto_modifica} disabled={locked}
            idPrefix={`quote-product-${index}-modification`}
            onChange={value=>updateProduct(index,"oggetto_modifica",value)}/>
          <QuoteMaterialCostFields product={p} disabled={locked}
            onChange={(key,value)=>updateProduct(index,key,value)}/>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
            {fields.map(f=>{
              if(f.key==="trattamenti_cad" && !legacyCostModel && sharedTreatmentMode!=="per_prodotto")return null;
              const highlighted=suggestedProductValue(p,f.key);
              return <label key={f.key} className="flex min-w-0 flex-col gap-1 text-xs">
                <span className="truncate font-medium text-slate-600" title={f.label}>{f.shortLabel}</span>
                <QuoteNumericInput kind={f.kind} optional={f.optional} disabled={locked}
                  className={compactInputClass+" "+(highlighted?suggestedInputClass:normalInputClass)}
                  title={highlighted?suggestedHint:f.label}
                  value={p[f.key]??(f.optional?null:0)}
                  onChange={value=>updateProduct(index,f.key,value)}/>
              </label>;
            })}
            {legacyCostModel && (
              <>
                <label className="flex min-w-0 flex-col gap-1 text-xs">
                  <span className="truncate font-medium text-slate-600" title="Progettazione ore totali (storico)">Ore prog. (storico)</span>
                  <QuoteNumericInput kind="decimal" disabled={locked}
                    className={compactInputClass+" "+normalInputClass}
                    value={p.progettazione_h??0}
                    onChange={value=>updateProduct(index,"progettazione_h",value)}/>
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-xs">
                  <span className="truncate font-medium text-slate-600" title="Costo progettazione €/h (storico)">Costo prog. €/h</span>
                  <QuoteNumericInput kind="euro" disabled={locked}
                    className={compactInputClass+" "+(Number(p.costo_progettazione??50)===50?suggestedInputClass:normalInputClass)}
                    title={Number(p.costo_progettazione??50)===50?suggestedHint:undefined}
                    value={p.costo_progettazione??50}
                    onChange={value=>updateProduct(index,"costo_progettazione",value)}/>
                </label>
              </>
            )}
            <label className="flex min-w-0 items-center gap-2 text-xs col-span-2 sm:col-span-2">
              <input type="checkbox" disabled={locked} checked={p.quadrabile!==false}
                onChange={e=>updateProduct(index,"quadrabile",e.target.checked)}/>
              Prezzo modificabile dalla quadratura
            </label>
          </div>
          <div className="bg-slate-50 rounded px-3 py-2 text-xs grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-3 gap-y-1">
            <span>Costo primo €/pz: <b>{euro(preview?.prodotti?.[index]?.costo_primo_cad)}<FormulaTooltip label="Costo primo per pezzo" formula={CALCULATION_FORMULAS.quote.productDirectCost}/></b></span>
            {!legacyCostModel && <span>Progettazione comune €/pz: <b>{euroDetailed(preview?.prodotti?.[index]?.progettazione_comune_cad)}<FormulaTooltip label="Progettazione comune per pezzo" formula={CALCULATION_FORMULAS.quote.engineeringPerPiece}/></b></span>}
            {!legacyCostModel && sharedTreatmentMode === "globale" && <span>Trattamenti comuni €/pz: <b>{euroDetailed(preview?.prodotti?.[index]?.trattamenti_globali_cad)}<FormulaTooltip label="Trattamenti comuni per pezzo" formula={CALCULATION_FORMULAS.quote.globalTreatmentPerPiece}/></b></span>}
            <span>Full cost €/pz: <b>{euro(preview?.prodotti?.[index]?.full_cost)}<FormulaTooltip label="Full cost del prodotto" formula={CALCULATION_FORMULAS.quote.productFullCost}/></b></span>
            <span>Prezzo finale €/pz: <b>{euro(preview?.prodotti?.[index]?.prezzo_netto_unitario_finale)}<FormulaTooltip label="Prezzo finale unitario" formula={CALCULATION_FORMULAS.quote.productFinalPrice}/></b></span>
            <label className="flex min-w-0 flex-col gap-1" title="Imposta un prezzo unitario manuale: sostituisce il prezzo calcolato della riga">
              <span className="font-medium text-slate-600">Prezzo manuale €/pz</span>
              <QuoteNumericInput kind="euro" optional disabled={locked}
                value={p.prezzo_manuale??null}
                className={compactInputClass+" "+normalInputClass+" max-w-36"}
                onChange={value=>updateProduct(index,"prezzo_manuale",value)}/>
            </label>
            <span>Totale riga €: <b>{euro(preview?.prodotti?.[index]?.totale_finale)}<FormulaTooltip label="Totale riga prodotto" formula={CALCULATION_FORMULAS.quote.productTotal}/></b></span>
          </div>
        </section>)}
      <section className="bg-white border rounded-xl p-3 md:p-4 space-y-3">
        <h2 className="font-semibold">Note e riepilogo</h2>
        {(["note_generali","note_cliente","note_fornitori"] as const).map(key=><label className="flex flex-col text-sm gap-1" key={key}>
          <span>{key==="note_generali"?"Note generali":key==="note_cliente"?"Note cliente":"Note fornitori"}</span>
          <textarea rows={2} disabled={locked} className="border rounded p-2 disabled:bg-slate-100" value={doc[key]??""} onChange={e=>update(key,e.target.value)}/>
        </label>)}
        {Array.isArray(doc.attachments)&&doc.attachments.length>0&&<p className="text-sm text-amber-700">{doc.attachments.length} allegati storici presenti: i riferimenti vengono mantenuti nelle revisioni, ma i file originali Windows non sono ospitati sul server.</p>}
        <div className="border-t pt-3 text-right text-lg font-bold">Totale preventivo: € {euro(preview?.totale_finale)}<FormulaTooltip label="Totale preventivo" formula={CALCULATION_FORMULAS.quote.quoteTotal}/></div>
        {dirtyCalculation && <p className="text-amber-700 text-sm">Anteprima del ricalcolo; salvando i nuovi valori saranno memorizzati in una nuova revisione.</p>}
      </section>
        </>
      )}
    </div>
  </Layout>;
}
