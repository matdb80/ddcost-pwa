import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Layout from "@/components/Layout";
import { trpc } from "@/providers/trpc";
import { ArrowLeft, Plus, Save, Trash2, Calculator, Pencil, Copy } from "lucide-react";
import { formatQuoteForCopy } from "@/lib/quote-copy";
import {
  blankProduct, blankQuote, calculateQuote, migrateQuoteToSharedCosts,
  type Product, type QuoteDocument,
} from "@/lib/quote-calculation";
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

const fields: Array<{key:string;label:string;step?:string}> = [
  {key:"quantita",label:"Quantità",step:"1"},
  {key:"materiale_cad",label:"Materiale €/pz",step:"0.0001"},
  {key:"lavoro_h",label:"Lavorazione ore totali",step:"0.01"},
  {key:"costo_lavoro",label:"Costo lavoro €/h",step:"0.01"},
  {key:"attrezzaggi_h",label:"Attrezzaggio ore totali",step:"0.01"},
  {key:"ricarico_spese",label:"Spese generali (0,75 = 75%)",step:"0.01"},
  {key:"margine",label:"Margine (0,20 = 20%)",step:"0.01"},
  {key:"prezzo_manuale",label:"Prezzo manuale €/pz (facoltativo)",step:"0.0001"},
];

export default function PreventivoEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const numericId = Number(id ?? 0);
  const [doc, setDoc] = useState<QuoteDocument>(blankQuote());
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
  const groupsQuery = trpc.productGroup.list.useQuery();
  const createGroup = trpc.productGroup.create.useMutation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.quote.get.useQuery({ id:numericId }, { enabled: !isNew && numericId > 0 });
  const create = trpc.quote.create.useMutation();
  const revise = trpc.quote.saveRevision.useMutation();
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
      setReadOnly(true);
      setError("");
    } catch {
      setError("Il preventivo storico contiene dati non riconosciuti. Nessun record è stato modificato.");
    }
  }, [data, isNew]);
  const changed = JSON.stringify(doc) !== baseline;
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
    if (!isNew && !changed) return setError("Nessuna modifica rilevata");
    if (create.isPending || revise.isPending) return;
    try {
      const computed = dirtyCalculation || isNew ? calculateQuote(doc) : doc;
      if (listinoModified) computed.listino = buildListino(computed.listino ?? {}, computed, priceProductIndex);
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
      if (isNew) {
        const result = await create.mutateAsync({
          ...payload,
          targetTotal: payload.targetTotal ?? undefined,
        });
        navigate("/preventivi/" + result.id);
      } else {
        const result = await revise.mutateAsync({ sourceId: numericId, ...payload });
        navigate("/preventivi/" + result.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio fallito");
    }
  }
  if (!isNew && isLoading) return <Layout><p>Caricamento preventivo...</p></Layout>;
  if (!isNew && !data) return <Layout><p>Preventivo non trovato.</p><Link to="/preventivi">Torna all'elenco</Link></Layout>;
  const locked = readOnly && !isNew;
  const legacyCostModel = !(Number(doc.costi_comuni_versione) >= 2);
  const sharedTreatmentMode = doc.trattamenti_modalita === "globale" ? "globale" : "per_prodotto";
  const upgradeCosts = () => {
    if (locked) return;
    if (!window.confirm(
      "Convertire questo preventivo al nuovo modello? La progettazione delle vecchie righe diventerà un unico costo comune; i trattamenti resteranno per prodotto. " +
      "I prezzi potranno variare se prodotti diversi hanno margini o spese generali differenti. " +
      "L'originale resta invariato; il nuovo calcolo verrà salvato solo creando una revisione."
    )) return;
    try {
      setDoc(migrateQuoteToSharedCosts(doc));
      setDirtyCalculation(true);
      setListinoModified(Boolean(String(doc.listino?.sconto_riferimento ?? "").trim()));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversione non riuscita");
    }
  };
  return <Layout>
    <div className="w-full max-w-screen-2xl mx-auto space-y-5 pb-10">
      {/* Sticky quote identity and actions share the same scroll container as the editor. */}
      <div className="sticky top-0 z-30 -mx-2 mb-4 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-md space-y-3 max-h-[60vh] overflow-y-auto">
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <div className="flex items-center gap-2">
          <Link to="/preventivi" className="p-2 border rounded"><ArrowLeft size={16}/></Link>
          <h1 className="text-2xl font-bold">{isNew ? "Nuovo preventivo una tantum" : "Preventivo #" + numericId + " — rev. " + (data?.rev ?? 1)}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={copyQuote}
            className="border border-emerald-600 text-emerald-700 px-4 py-2 rounded flex gap-2 items-center">
            <Copy size={16}/> Copia per email / documento
          </button>
          {locked ? <button className="bg-emerald-600 text-white px-4 py-2 rounded flex gap-2" onClick={() => setReadOnly(false)}><Pencil size={16}/> Modifica</button>
          : <>
              <button type="button" className="border px-4 py-2 rounded flex gap-2" onClick={() => { try { setDoc(calculateQuote(doc)); setDirtyCalculation(false); setError(""); } catch(e) { setError(e instanceof Error ? e.message : "Errore ricalcolo"); } }}><Calculator size={16}/> Ricalcola</button>
              <button type="button" disabled={create.isPending || revise.isPending || (!isNew && !changed)} className="bg-emerald-600 disabled:opacity-40 text-white px-4 py-2 rounded flex gap-2" onClick={save}><Save size={16}/> {isNew ? "Salva preventivo" : "Salva nuova revisione"}</button>
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
          <input type="number" step="0.01" className="w-full min-w-0 border rounded p-2 disabled:bg-slate-100"
            disabled={locked} value={doc.target_totale ?? ""}
            onChange={e=>update("target_totale",e.target.value === "" ? null : Number(e.target.value),true)}/>
        </label>
      </section>
      </div>
      {copyMessage && <div role="status" className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded p-3">{copyMessage}</div>}
      {error && <div role="alert" className="border border-red-400 bg-red-50 p-3 rounded text-red-800">{error}</div>}
      {!isNew && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded">
        Ogni modifica salva una nuova revisione; la versione originale non viene sovrascritta. I calcoli storici sono preservati finché non modifichi i dati economici.
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
        <section className="bg-white border rounded-xl p-4 md:p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">Costi comuni all'offerta</h2>
            <p className="text-xs text-slate-600 mt-1">
              La progettazione si inserisce una sola volta. La quota €/pezzo è il totale diviso
              per la somma delle quantità di tutti i prodotti.
              Nessun costo comune viene sommato due volte.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Costo totale progettazione (€)</span>
              <input type="number" min="0" step="0.01" value={doc.progettazione_totale_euro ?? 0}
                disabled={locked} onChange={e=>update("progettazione_totale_euro",Number(e.target.value),true)}
                className="w-full min-w-0 rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-100"/>
              <span className="text-xs text-slate-500">
                Ripartito su {preview?.costi_comuni_riepilogo?.quantita_totale ?? "—"} pezzi:
                € {euroDetailed(preview?.costi_comuni_riepilogo?.progettazione_cad)} /pz.
              </span>
            </label>
            <div className="space-y-2">
              <label className="flex flex-col gap-1 text-sm" htmlFor="trattamenti-modalita">
                <span className="font-medium">Come attribuire i trattamenti?</span>
                <select id="trattamenti-modalita" value={sharedTreatmentMode}
                  disabled={locked} onChange={e=>update("trattamenti_modalita",e.target.value,true)}
                  className="w-full min-w-0 rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-100">
                  <option value="per_prodotto">Separati per prodotto (€/pz)</option>
                  <option value="globale">Un costo complessivo per l'offerta (€)</option>
                </select>
              </label>
              {sharedTreatmentMode === "globale" ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Costo totale trattamenti dell'offerta (€)</span>
                  <input type="number" min="0" step="0.01" value={doc.trattamenti_totale_euro ?? 0}
                    disabled={locked} onChange={e=>update("trattamenti_totale_euro",Number(e.target.value),true)}
                    className="w-full min-w-0 rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-100"/>
                  <span className="text-xs text-slate-500">
                    Quota ripartita: € {euroDetailed(preview?.costi_comuni_riepilogo?.trattamenti_globali_cad)} /pz.
                  </span>
                </label>
              ) : (
                <p className="text-xs text-slate-600">
                  Inserisci il costo trattamento €/pezzo sotto ciascun prodotto.
                  Non viene applicata alcuna quota comune di trattamenti.
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Le due modalità di trattamento sono alternative, mai cumulative. Cambiare modalità
            conserva i valori della modalità inattiva per poterli ripristinare, ma non li conteggia.
          </p>
        </section>
      )}
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-lg">Prezzo di listino da sconto cliente</h2>
        <p className="text-xs text-slate-600">Il listino lordo viene ricavato dal prezzo netto finale dell'articolo selezionato, applicando gli sconti successivi (es. 40+10% = fattore 0,54). Il listino è arrotondato in eccesso al centesimo; il prezzo netto del preventivo non viene cambiato.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>Prodotto di riferimento</span>
            <select disabled={locked} className="border rounded p-2 disabled:bg-slate-100" value={priceProductIndex}
              onChange={e=>{setPriceProductIndex(Number(e.target.value));setListinoModified(true);}}>
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
              <span>Netto di riferimento: <b>€ {euro(data.prezzo_minimo_riferimento)}</b></span>
              <span>Listino lordo: <b>€ {euro(data.prezzo_listino_generato)}</b></span>
              <span>Netto dopo sconto: <b>€ {euro(data.rows?.[0]?.netto)}</b></span>
            </div>;
          } catch (err) { return <p className="text-red-700 text-sm">{err instanceof Error?err.message:"Sconto non valido"}</p>; }
        })()}
      </section>
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-xl">Prodotti ({doc.prodotti?.length ?? 0})</h2>
        {!locked && <button className="border border-emerald-600 text-emerald-700 rounded px-3 py-2 flex gap-2" onClick={()=>{update("prodotti",[...doc.prodotti,blankProduct()],true);}}><Plus size={16}/> Aggiungi prodotto</button>}
      </div>
      {(doc.prodotti as Product[]).map((p,index)=>
        <section key={index} className="bg-white border rounded-xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Prodotto {index+1}</h3>
            {!locked && doc.prodotti.length > 1 && <button title="Rimuovi prodotto" className="text-red-600" onClick={()=>update("prodotti",doc.prodotti.filter((_:Product,i:number)=>i!==index),true)}><Trash2 size={17}/></button>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex flex-col text-sm gap-1"><span>Codice articolo</span><input className="border p-2 rounded disabled:bg-slate-100" disabled={locked} value={p.codice??""} onChange={e=>updateProduct(index,"codice",e.target.value)}/></label>
            <label className="flex flex-col text-sm gap-1 md:col-span-2"><span>Descrizione *</span><input className="border p-2 rounded disabled:bg-slate-100" disabled={locked} value={p.descrizione??""} onChange={e=>updateProduct(index,"descrizione",e.target.value)}/></label>
            <div className="flex flex-col text-sm gap-1 md:col-span-2">
              <label htmlFor={"group-"+index} className="font-medium">Gruppo merceologico *</label>
              <select id={"group-"+index} disabled={locked} className="border rounded p-2 disabled:bg-slate-100"
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
            <label className="flex flex-col text-sm gap-1">
              <span className="font-medium">Materiale prodotto *</span>
              <select className="border rounded p-2 disabled:bg-slate-100" disabled={locked}
                value={p.materiale_prodotto ?? ""} onChange={e=>updateProduct(index,"materiale_prodotto",e.target.value)}>
                <option value="">Seleziona materiale</option>
                <option value="ferro">Ferro</option>
                <option value="ottone">Ottone</option>
                <option value="inox">Inox</option>
              </select>
            </label>
            {fields.map(f=><label key={f.key} className="flex flex-col text-sm gap-1">
              <span>{f.label}</span>
              <input type="number" step={f.step??"any"} className="border p-2 rounded disabled:bg-slate-100"
                disabled={locked} value={p[f.key]??""} onChange={e=>updateProduct(index,f.key,e.target.value === "" && f.key==="prezzo_manuale" ? null : Number(e.target.value))}/>
            </label>)}
            {(legacyCostModel || sharedTreatmentMode === "per_prodotto") && (
              <label className="flex flex-col text-sm gap-1">
                <span>Trattamenti €/pezzo</span>
                <input type="number" min="0" step="0.0001" disabled={locked}
                  className="border rounded p-2.5 disabled:bg-slate-100"
                  value={p.trattamenti_cad ?? 0}
                  onChange={e=>updateProduct(index,"trattamenti_cad",Number(e.target.value))}/>
              </label>
            )}
            {legacyCostModel && (
              <>
                <label className="flex flex-col text-sm gap-1">
                  <span>Progettazione ore totali (storico)</span>
                  <input type="number" step="0.01" disabled={locked}
                    className="border rounded p-2.5 disabled:bg-slate-100"
                    value={p.progettazione_h ?? 0}
                    onChange={e=>updateProduct(index,"progettazione_h",Number(e.target.value))}/>
                </label>
                <label className="flex flex-col text-sm gap-1">
                  <span>Costo progettazione €/h (storico)</span>
                  <input type="number" step="0.01" disabled={locked}
                    className="border rounded p-2.5 disabled:bg-slate-100"
                    value={p.costo_progettazione ?? 50}
                    onChange={e=>updateProduct(index,"costo_progettazione",Number(e.target.value))}/>
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} checked={p.quadrabile!==false} onChange={e=>updateProduct(index,"quadrabile",e.target.checked)}/> Prezzo modificabile dalla quadratura</label>
          </div>
          <div className="bg-slate-50 rounded p-3 text-sm grid grid-cols-1 md:grid-cols-4 gap-2">
            <span>Costo primo €/pz: <b>{euro(preview?.prodotti?.[index]?.costo_primo_cad)}</b></span>
            {!legacyCostModel && <span>Progettazione comune €/pz: <b>{euroDetailed(preview?.prodotti?.[index]?.progettazione_comune_cad)}</b></span>}
            {!legacyCostModel && sharedTreatmentMode === "globale" && <span>Trattamenti comuni €/pz: <b>{euroDetailed(preview?.prodotti?.[index]?.trattamenti_globali_cad)}</b></span>}
            <span>Full cost €/pz: <b>{euro(preview?.prodotti?.[index]?.full_cost)}</b></span>
            <span>Prezzo finale €/pz: <b>{euro(preview?.prodotti?.[index]?.prezzo_netto_unitario_finale)}</b></span>
            <span>Totale riga €: <b>{euro(preview?.prodotti?.[index]?.totale_finale)}</b></span>
          </div>
        </section>)}
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold">Note e riepilogo</h2>
        {(["note_generali","note_cliente","note_fornitori"] as const).map(key=><label className="flex flex-col text-sm gap-1" key={key}>
          <span>{key==="note_generali"?"Note generali":key==="note_cliente"?"Note cliente":"Note fornitori"}</span>
          <textarea rows={2} disabled={locked} className="border rounded p-2 disabled:bg-slate-100" value={doc[key]??""} onChange={e=>update(key,e.target.value)}/>
        </label>)}
        {Array.isArray(doc.attachments)&&doc.attachments.length>0&&<p className="text-sm text-amber-700">{doc.attachments.length} allegati storici presenti: i riferimenti vengono mantenuti nelle revisioni, ma i file originali Windows non sono ospitati sul server.</p>}
        <div className="border-t pt-3 text-right text-lg font-bold">Totale preventivo: € {euro(preview?.totale_finale)}</div>
        {dirtyCalculation && <p className="text-amber-700 text-sm">Anteprima del ricalcolo; salvando i nuovi valori saranno memorizzati in una nuova revisione.</p>}
      </section>
    </div>
  </Layout>;
}
