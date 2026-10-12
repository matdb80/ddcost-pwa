import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Layout from "@/components/Layout";
import { trpc } from "@/providers/trpc";
import { ArrowLeft, Plus, Save, Trash2, Calculator, Pencil } from "lucide-react";

type Product = Record<string, any>;
type QuoteDocument = Record<string, any>;
const val = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const euro = (v: unknown) => val(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const blankProduct = (): Product => ({
  codice: "", descrizione: "", quantita: 1, materiale_cad: 0, lavoro_h: 0, costo_lavoro: 24,
  trattamenti_cad: 0, attrezzaggi_h: 0, progettazione_h: 0, costo_progettazione: 50,
  ricarico_spese: 0.75, margine: 0.2, prezzo_manuale: null, quadrabile: true,
});
const blankQuote = (): QuoteDocument => ({
  tipo: "Prezzo per articolo unatantum", cliente: "", riferimento_preventivo: "",
  titolo_preventivo: "Preventivo unatantum", prodotti: [blankProduct()],
  target_totale: null, note_generali: "", note_cliente: "", note_fornitori: "", attachments: [],
});
function calculateQuote(document: QuoteDocument): QuoteDocument {
  const d = structuredClone(document);
  if (!Array.isArray(d.prodotti) || !d.prodotti.length) throw new Error("Inserire almeno un prodotto");
  let baseTotal = 0;
  let saleBefore = 0;
  let fullTotal = 0;
  for (const p of d.prodotti as Product[]) {
    const q = val(p.quantita);
    if (!(q > 0)) throw new Error("La quantità dei prodotti deve essere maggiore di zero");
    const m = val(p.materiale_cad), lh = val(p.lavoro_h), hcost = val(p.costo_lavoro);
    const treatment = val(p.trattamenti_cad), ah = val(p.attrezzaggi_h);
    const dh = val(p.progettazione_h), dcost = val(p.costo_progettazione);
    const overhead = val(p.ricarico_spese), margin = val(p.margine);
    if (margin >= 1 || margin < 0 || overhead < 0) throw new Error("Margine e ricarico non validi");
    p.materiale_tot = m * q;
    p.lavoro_tot = lh * hcost;
    p.trattamenti_tot = treatment * q;
    p.attrezzaggi_tot = ah * hcost;
    p.progettazione_tot = dh * dcost;
    p.costo_primo_cad = (p.materiale_tot + p.lavoro_tot + p.trattamenti_tot + p.attrezzaggi_tot + p.progettazione_tot) / q;
    p.full_cost = p.costo_primo_cad * (1 + overhead);
    p.prezzo_netto_unitario = p.full_cost / (1 - margin);
    p.totale = p.prezzo_netto_unitario * q;
    const manual = p.prezzo_manuale === null || p.prezzo_manuale === "" || p.prezzo_manuale === undefined
      ? null : val(p.prezzo_manuale);
    p.prezzo_manuale = manual;
    p.prezzo_vendita_pre_quadratura = manual ?? p.prezzo_netto_unitario;
    p.totale_vendita_pre_quadratura = p.prezzo_vendita_pre_quadratura * q;
    p.rettifica_unitaria = 0;
    p.prezzo_netto_unitario_finale = p.prezzo_vendita_pre_quadratura;
    p.totale_finale = p.totale_vendita_pre_quadratura;
    baseTotal += p.totale;
    saleBefore += p.totale_vendita_pre_quadratura;
    fullTotal += p.full_cost * q;
  }
  const target = d.target_totale === null || d.target_totale === "" || d.target_totale === undefined
    ? null : val(d.target_totale);
  d.target_totale = target;
  const diff = target === null ? 0 : target - saleBefore;
  const variable = (d.prodotti as Product[]).filter(p => p.quadrabile !== false);
  const variableTotal = variable.reduce((sum, p) => sum + p.totale_vendita_pre_quadratura, 0);
  const variableQuantity = variable.reduce((sum, p) => sum + val(p.quantita), 0);
  if (Math.abs(diff) > 1e-8 && variableQuantity === 0) {
    throw new Error("Quadratura impossibile: tutte le righe hanno prezzo bloccato");
  }
  for (const p of variable) {
    // Proportional to variable line values; quantity fallback for zero-valued lines.
    const weight = Math.abs(variableTotal) > 1e-12
      ? p.totale_vendita_pre_quadratura / variableTotal
      : val(p.quantita) / variableQuantity;
    const adjustment = diff * weight;
    p.rettifica_unitaria = adjustment / val(p.quantita);
    p.prezzo_netto_unitario_finale = p.prezzo_vendita_pre_quadratura + p.rettifica_unitaria;
    p.totale_finale = p.prezzo_netto_unitario_finale * val(p.quantita);
  }
  const totalFinal = (d.prodotti as Product[]).reduce((sum,p) => sum + p.totale_finale, 0);
  d.num_prodotti = d.prodotti.length;
  d.quantita = (d.prodotti as Product[]).reduce((sum,p) => sum + val(p.quantita), 0);
  d.totale_pre_quadratura = baseTotal;
  d.totale_vendita_pre_quadratura = saleBefore;
  d.quadratura_applicata = target !== null;
  d.rettifica_totale = totalFinal - saleBefore;
  d.totale_finale = totalFinal;
  d.totale = totalFinal;
  d.prezzo_netto_unitario = d.quantita ? totalFinal / d.quantita : 0;
  d.full_cost_totale = fullTotal;
  d.margine_netto_complessivo_valore = totalFinal - fullTotal;
  d.margine_netto_complessivo_perc = totalFinal ? (totalFinal - fullTotal) / totalFinal * 100 : 0;
  d.descrizione = d.titolo_preventivo || "Preventivo unatantum";
  const lines = (d.prodotti as Product[]).map((p,i) =>
    (i + 1) + ". " + p.descrizione + " - " + p.quantita + " pz - € " + euro(p.prezzo_netto_unitario_finale) + "/pz - € " + euro(p.totale_finale)
  );
  d.summary = "PREVENTIVO UNA TANTUM\nCliente: " + (d.cliente || "") +
    "\nRiferimento: " + (d.riferimento_preventivo || "") +
    "\n\n" + lines.join("\n") + "\n\nTotale: € " + euro(totalFinal);
  return d;
}
const fields: Array<{key:string;label:string;step?:string}> = [
  {key:"quantita",label:"Quantità",step:"1"},
  {key:"materiale_cad",label:"Materiale €/pz",step:"0.0001"},
  {key:"lavoro_h",label:"Lavorazione ore totali",step:"0.01"},
  {key:"costo_lavoro",label:"Costo lavoro €/h",step:"0.01"},
  {key:"trattamenti_cad",label:"Trattamenti €/pz",step:"0.0001"},
  {key:"attrezzaggi_h",label:"Attrezzaggio ore totali",step:"0.01"},
  {key:"progettazione_h",label:"Progettazione ore totali",step:"0.01"},
  {key:"costo_progettazione",label:"Costo progettazione €/h",step:"0.01"},
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
  const [error, setError] = useState("");
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
    setDirtyCalculation(true);
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
    if (!isNew && !changed) return setError("Nessuna modifica rilevata");
    if (create.isPending || revise.isPending) return;
    try {
      const computed = dirtyCalculation || isNew ? calculateQuote(doc) : doc;
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
  return <Layout>
    <div className="max-w-6xl mx-auto space-y-5 pb-10">
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <div className="flex items-center gap-2">
          <Link to="/preventivi" className="p-2 border rounded"><ArrowLeft size={16}/></Link>
          <h1 className="text-2xl font-bold">{isNew ? "Nuovo preventivo una tantum" : "Preventivo #" + numericId + " — rev. " + (data?.rev ?? 1)}</h1>
        </div>
        <div className="flex gap-2">
          {locked ? <button className="bg-emerald-600 text-white px-4 py-2 rounded flex gap-2" onClick={() => setReadOnly(false)}><Pencil size={16}/> Modifica</button>
          : <>
              <button type="button" className="border px-4 py-2 rounded flex gap-2" onClick={() => { try { setDoc(calculateQuote(doc)); setDirtyCalculation(false); setError(""); } catch(e) { setError(e instanceof Error ? e.message : "Errore ricalcolo"); } }}><Calculator size={16}/> Ricalcola</button>
              <button type="button" disabled={create.isPending || revise.isPending || (!isNew && !changed)} className="bg-emerald-600 disabled:opacity-40 text-white px-4 py-2 rounded flex gap-2" onClick={save}><Save size={16}/> {isNew ? "Salva preventivo" : "Salva nuova revisione"}</button>
            </>}
        </div>
      </div>
      {error && <div role="alert" className="border border-red-400 bg-red-50 p-3 rounded text-red-800">{error}</div>}
      {!isNew && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded">
        Ogni modifica salva una nuova revisione; la versione originale non viene sovrascritta. I calcoli storici sono preservati finché non modifichi i dati economici.
      </div>}
      <section className="bg-white border rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {(["cliente","riferimento_preventivo","titolo_preventivo"] as const).map(key=>
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{key === "cliente" ? "Cliente *" : key === "riferimento_preventivo" ? "Riferimento" : "Titolo preventivo"}</span>
            <input className="border rounded p-2 disabled:bg-slate-100" value={doc[key] ?? ""} disabled={locked}
              onChange={e=>update(key,e.target.value)}/>
          </label>)}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Totale desiderato € (quadratura, facoltativo)</span>
          <input type="number" step="0.01" className="border rounded p-2 disabled:bg-slate-100"
            disabled={locked} value={doc.target_totale ?? ""}
            onChange={e=>update("target_totale",e.target.value === "" ? null : Number(e.target.value),true)}/>
        </label>
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
            {fields.map(f=><label key={f.key} className="flex flex-col text-sm gap-1">
              <span>{f.label}</span>
              <input type="number" step={f.step??"any"} className="border p-2 rounded disabled:bg-slate-100"
                disabled={locked} value={p[f.key]??""} onChange={e=>updateProduct(index,f.key,e.target.value === "" && f.key==="prezzo_manuale" ? null : Number(e.target.value))}/>
            </label>)}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} checked={p.quadrabile!==false} onChange={e=>updateProduct(index,"quadrabile",e.target.checked)}/> Prezzo modificabile dalla quadratura</label>
          </div>
          <div className="bg-slate-50 rounded p-3 text-sm grid grid-cols-1 md:grid-cols-4 gap-2">
            <span>Costo primo €/pz: <b>{euro(preview?.prodotti?.[index]?.costo_primo_cad)}</b></span>
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
