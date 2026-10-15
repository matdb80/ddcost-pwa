import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Layout from "@/components/Layout";
import { trpc } from "@/providers/trpc";
import { ArrowLeft, Plus, Save, Pencil, Trash2 } from "lucide-react";

type OfferRow = Record<string, any>;
type OfferDocument = Record<string, any>;
const parseNumber = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (v: unknown) => parseNumber(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const blankRow = (): OfferRow => ({
  codice: "", descrizione: "", lotto: 1, listino: 0, tipo_listino: "Listino calcolato",
  sconto_base: "40+10%", extra: 0, netto_base: 0, netto: 0, sconto_finale: "40+10%",
  full_cost: null, prezzo_minimo: null,
});
const blankOffer = (): OfferDocument => ({ nome: "", cliente: "", riferimento: "", note: "", righe: [blankRow()] });
function discountFactor(raw: string): number {
  const parts = raw.replace(/\s|%/g, "").split("+");
  if (!parts.length || parts.some(p => p === "" || !/^\d+(?:[.,]\d+)?$/.test(p))) throw Error("Sconto non valido: usare ad esempio 40+10%");
  let factor = 1;
  for (const p of parts) {
    const n = Number(p.replace(",", "."));
    if (n < 0 || n >= 100) throw Error("Sconto non valido: ogni percentuale deve essere tra 0 e 99,99");
    factor *= 1 - n / 100;
  }
  return factor;
}
function recompute(row: OfferRow): OfferRow {
  if (parseNumber(row.listino) < 0 || parseNumber(row.extra) < 0 || parseNumber(row.extra) >= 100) {
    throw Error("Listino o sconto extra non valido");
  }
  const factor = discountFactor(String(row.sconto_base ?? ""));
  const base = parseNumber(row.listino) * factor;
  const net = base * (1 - parseNumber(row.extra) / 100);
  return {
    ...row, netto_base: base, netto: net,
    sconto_finale: String(row.sconto_base || "") + (parseNumber(row.extra) ? "+" + row.extra + "%" : ""),
    margine_pct: net > 0 && row.full_cost != null ? (net - parseNumber(row.full_cost)) / net * 100 : null,
    ...(row.totale_riga === undefined ? {} : { totale_riga: net * parseNumber(row.lotto) }),
  };
}

export default function OffertaEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const numericId = Number(id ?? 0);
  const [offer, setOffer] = useState<OfferDocument>(blankOffer());
  const [baseline, setBaseline] = useState("");
  const [readOnly, setReadOnly] = useState(!isNew);
  const [error, setError] = useState("");
  const { data, isLoading } = trpc.offer.get.useQuery({ id: numericId }, { enabled: !isNew && numericId > 0 });
  const create = trpc.offer.create.useMutation();
  const update = trpc.offer.update.useMutation();

  useEffect(() => {
    if (!data || isNew) return;
    try {
      const original = JSON.parse(data.dataJson ?? "{}") as OfferDocument;
      if (!original || !Array.isArray(original.righe)) throw Error("Manca la lista righe");
      const merged: OfferDocument = {
        ...original,
        nome: data.name ?? original.nome ?? "",
        cliente: data.client ?? original.cliente ?? "",
        riferimento: data.reference ?? original.riferimento ?? "",
        note: data.notes ?? original.note ?? "",
      };
      setOffer(merged);
      setBaseline(JSON.stringify(merged));
      setReadOnly(true);
      setError("");
    } catch {
      setError("Il formato storico dell'offerta non è riconosciuto. Nessun dato è stato modificato.");
    }
  }, [data, isNew]);

  const changed = JSON.stringify(offer) !== baseline;
  const locked = !isNew && readOnly;
  const edit = (key: string, value: unknown) => setOffer(prev => ({ ...prev, [key]: value }));
  const editRow = (index: number, key: string, value: unknown) => {
    setOffer(prev => {
      const righe: OfferRow[] = [...prev.righe];
      righe[index] = { ...righe[index], [key]: value };
      if (["listino", "sconto_base", "extra"].includes(key)) {
        try { righe[index] = recompute(righe[index]); setError(""); }
        catch (e) { setError(e instanceof Error ? e.message : "Sconto non valido"); }
      }
      return { ...prev, righe };
    });
  };
  const save = async () => {
    setError("");
    if (!offer.nome?.trim()) return setError("Inserire il nome dell'offerta");
    if (!Array.isArray(offer.righe) || offer.righe.length < 1) return setError("Inserire almeno una riga");
    if (offer.righe.some((r: OfferRow) => !String(r.descrizione ?? "").trim())) return setError("Inserire la descrizione di ogni riga");
    if (!isNew && !changed) return setError("Nessuna modifica rilevata");
    try {
      for (const r of offer.righe) {
        discountFactor(String(r.sconto_base ?? ""));
        if (parseNumber(r.listino) < 0 || parseNumber(r.extra) < 0 || parseNumber(r.extra) >= 100) {
          throw Error("Listino o sconto extra non valido");
        }
      }
      const body = {
        name: String(offer.nome),
        client: String(offer.cliente ?? ""),
        reference: String(offer.riferimento ?? ""),
        notes: String(offer.note ?? ""),
        numRows: offer.righe.length,
        dataJson: JSON.stringify(offer),
      };
      if (isNew) {
        const result = await create.mutateAsync(body);
        navigate("/offerte/" + result.id);
      } else {
        await update.mutateAsync({ id: numericId, ...body });
        setBaseline(JSON.stringify(offer));
        setReadOnly(true);
        window.alert("Offerta salvata. Riaprila per verificare i dati persistenti.");
        navigate("/offerte");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito");
    }
  };

  if (!isNew && isLoading) return <Layout>Caricamento offerta...</Layout>;
  if (!isNew && !data) return <Layout><p>Offerta non trovata.</p><Link to="/offerte">Torna all'elenco</Link></Layout>;
  return <Layout>
    <div className="w-full max-w-screen-2xl mx-auto space-y-5 pb-8">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex gap-3 items-center">
          <Link to="/offerte" className="p-2 border rounded"><ArrowLeft size={16}/></Link>
          <h1 className="font-bold text-2xl">{isNew ? "Nuova offerta commerciale prodotti standard" : "Offerta #" + numericId}</h1>
        </div>
        {locked ? <button type="button" onClick={() => setReadOnly(false)} className="flex gap-2 bg-emerald-600 text-white rounded px-4 py-2"><Pencil size={16}/>Modifica</button>
        : <button type="button" disabled={create.isPending || update.isPending || (!isNew && !changed)} onClick={save} className="flex gap-2 bg-emerald-600 disabled:opacity-40 text-white rounded px-4 py-2"><Save size={16}/>Salva offerta</button>}
      </div>
      {error && <p role="alert" className="p-3 bg-red-50 border border-red-300 text-red-800 rounded">{error}</p>}
      <p className="text-sm text-slate-600">I riferimenti dei Cicli Standard e i dati tecnici delle righe importate vengono conservati. Le modifiche vengono salvate solo dopo conferma.</p>
      <section className="bg-white border rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        {([
          ["nome","Nome offerta"],["cliente","Cliente"],["riferimento","Riferimento"],
        ] as const).map(([k, lab]) => <label key={k} className="flex flex-col text-sm gap-1">
          <span>{lab}</span><input disabled={locked} value={offer[k] ?? ""} onChange={e => edit(k,e.target.value)} className="p-2 border rounded disabled:bg-slate-100"/>
        </label>)}
        <label className="flex flex-col text-sm gap-1 md:col-span-2">
          <span>Note</span><textarea disabled={locked} rows={3} value={offer.note ?? ""} onChange={e=>edit("note",e.target.value)} className="p-2 border rounded disabled:bg-slate-100"/>
        </label>
      </section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Righe ({offer.righe.length})</h2>
        {!locked && <button className="flex gap-2 px-3 py-2 border border-emerald-600 text-emerald-700 rounded" onClick={() => edit("righe",[...offer.righe,blankRow()])}><Plus size={16}/>Aggiungi riga</button>}
      </div>
      {(offer.righe as OfferRow[]).map((r,i) => <section key={i} className="bg-white border rounded-xl p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">Riga {i+1}{r.record_id ? " · ciclo "+ r.record_id + " rev. " + (r.rev ?? 1) : ""}</h3>
          {!locked && offer.righe.length > 1 && <button title="Rimuovi riga" className="text-red-500" onClick={() => edit("righe",offer.righe.filter((_:OfferRow,j:number) => i!==j))}><Trash2 size={16}/></button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([["codice","Codice articolo"],["descrizione","Descrizione"]] as const).map(([k,l]) => <label key={k} className="flex flex-col text-sm gap-1">
            <span>{l}</span><input disabled={locked} className="p-2 rounded border disabled:bg-slate-100" value={r[k] ?? ""} onChange={e=>editRow(i,k,e.target.value)}/>
          </label>)}
          {([["lotto","Lotto"],["listino","Listino €"],["extra","Sconto extra %"]] as const).map(([k,l]) => <label key={k} className="flex flex-col text-sm gap-1">
            <span>{l}</span><input disabled={locked} type="number" step="any" className="p-2 rounded border disabled:bg-slate-100" value={r[k] ?? ""} onChange={e=>editRow(i,k,Number(e.target.value))}/>
          </label>)}
          <label className="flex flex-col text-sm gap-1"><span>Sconto base (es. 40+10%)</span>
            <input disabled={locked} className="p-2 rounded border disabled:bg-slate-100" value={r.sconto_base ?? ""} onChange={e=>editRow(i,"sconto_base",e.target.value)}/>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-slate-50 rounded text-sm">
          <span>Netto unitario: <b>€ {money(r.netto)}</b></span>
          <span>Full cost unitario: <b>€ {money(r.full_cost)}</b></span>
          <span>Margine: <b>{r.margine_pct == null ? "—" : money(r.margine_pct)+"%"}</b></span>
        </div>
        {r.data && <p className="text-xs text-slate-500">Dati del ciclo sorgente collegati e conservati.</p>}
      </section>)}
    </div>
  </Layout>;
}