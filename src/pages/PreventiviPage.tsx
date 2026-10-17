import Layout from "@/components/Layout";
import {trpc} from "@/providers/trpc";
import {useState} from "react";
import {Link} from "react-router";
import {Plus,Search} from "lucide-react";
import {quoteIsDraft} from "@/lib/quote-draft-state";
import type {QuoteOutcome} from "@/lib/quote-outcomes";

const formatEuro=(value:number)=>"€ "+value.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2});
const LABELS:Record<QuoteOutcome,string>={in_attesa:"In attesa",vinto:"Vinto",perso:"Perso"};

export default function PreventiviPage(){
  const [search,setSearch]=useState("");
  const [statusError,setStatusError]=useState("");
  const {data:quotes,isLoading,isError,error}=trpc.quote.list.useQuery({search,limit:500});
  const {data:commercial,isLoading:loadingSummary,isError:summaryError}=trpc.quote.outcomeSummary.useQuery();
  const utils=trpc.useUtils();
  const setOutcome=trpc.quote.setOutcome.useMutation({
    onSuccess:async()=>{
      setStatusError("");
      await Promise.all([utils.quote.list.invalidate(),utils.quote.outcomeSummary.invalidate()]);
    },
    onError:(e)=>setStatusError(e.message),
  });
  const latestById=new Map((commercial?.latest??[]).map(row=>[row.id,row]));
  const totals=commercial?.summary;
  const summaryCards=[
    {key:"vinto" as const,label:"Preventivi vinti",border:"border-emerald-200",text:"text-emerald-700"},
    {key:"perso" as const,label:"Preventivi persi",border:"border-red-200",text:"text-red-700"},
    {key:"in_attesa" as const,label:"Preventivi in attesa",border:"border-amber-200",text:"text-amber-700"},
  ];

  return <Layout>
    <div className="w-full max-w-screen-2xl mx-auto space-y-4">
      <div>
        <h2 className="font-semibold text-lg text-slate-900">Stato delle offerte Una Tantum</h2>
        <p className="text-sm text-slate-600">Importi economici complessivi, considerando solo la revisione definitiva più recente di ogni preventivo. Le bozze non entrano nelle statistiche.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summaryCards.map(card=>{
          const values=totals?.[card.key];
          return <div key={card.key} className={`rounded-xl border bg-white px-4 py-3 ${card.border}`}>
            <p className="text-sm font-medium text-slate-600">{card.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${card.text}`}>
              {loadingSummary?"...":formatEuro(values?.value??0)}
            </p>
            <p className="text-xs text-slate-600">{values?.count??0} preventivi
              {values?.unpriced? ` · ${values.unpriced} senza importo disponibile` : ""}
            </p>
          </div>;
        })}
      </div>
      {totals&&<p className="text-xs text-slate-600">
        Totale preventivi definitivi: {totals.total.count} · Valore complessivo: {formatEuro(totals.total.value)}
        {totals.total.unpriced>0?` · Attenzione: ${totals.total.unpriced} preventivi senza importo non contribuiscono al valore in euro.`:""}
      </p>}
      {summaryError&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Le statistiche non sono disponibili. Verifica la connessione prima di cambiare gli esiti.</div>}
      {statusError&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{statusError}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/>
          <input type="search" aria-label="Cerca preventivo"
            placeholder="Cerca per cliente o riferimento"
            className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm"
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <Link to="/preventivi/new" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white sm:w-auto">
          <Plus size={16}/>Nuovo preventivo
        </Link>
      </div>
      {/* Phone: cards instead of a seven-column horizontal scrolling table. */}
      <div className="space-y-3 md:hidden" aria-label="Elenco preventivi">
        {isLoading&&<p className="rounded-lg bg-white p-4 text-sm text-slate-600">Caricamento preventivi...</p>}
        {isError&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error.message}</p>}
        {!isLoading&&(!quotes||quotes.length===0)&&<p className="rounded-lg bg-white p-4 text-sm text-slate-600">Nessun preventivo trovato.</p>}
        {quotes?.map(q=>{
          const draft=quoteIsDraft(q.dataJson);
          const latest=latestById.get(q.id);
          return <article key={q.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Preventivo #{q.id} · Revisione {q.rev}</p>
                <h3 className="mt-1 break-words font-semibold text-slate-900">{q.client||"(senza cliente)"}</h3>
                {q.reference&&<p className="mt-1 break-words text-xs text-slate-600">{q.reference}</p>}
              </div>
              {draft&&<span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Bozza</span>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs font-medium text-slate-500">Totale</span>
              <strong className="text-lg tabular-nums">{draft?"Da completare":q.totalFinal!==null?formatEuro(Number(q.totalFinal)):"—"}</strong>
            </div>
            {!draft&&latest&&
              <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
                <span>Esito commerciale</span>
                <select aria-label={`Esito commerciale preventivo ${q.id}`}
                  className="min-h-11 max-w-[55%] rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:opacity-50"
                  value={latest.outcome}
                  disabled={setOutcome.isPending||loadingSummary||summaryError}
                  onChange={e=>setOutcome.mutate({quoteId:q.id,outcome:e.target.value as QuoteOutcome})}>
                  {Object.entries(LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            }
            <Link to={`/preventivi/${q.id}`}
              className="flex min-h-12 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white">
              {draft?"Riprendi bozza":"Apri preventivo"}
            </Link>
          </article>;
        })}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full min-w-[790px] text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">Cliente</th>
              <th className="p-3 text-left">Riferimento</th>
              <th className="p-3 text-left">Rev.</th>
              <th className="p-3 text-right">Totale</th>
              <th className="p-3 text-left">Esito commerciale</th>
              <th className="p-3 text-center">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {isLoading&&<tr><td colSpan={7} className="p-5 text-center text-slate-500">Caricamento preventivi...</td></tr>}
            {isError&&<tr><td colSpan={7} className="p-5 text-red-700">{error.message}</td></tr>}
            {quotes?.map(q=>{
              const draft=quoteIsDraft(q.dataJson);
              const latest=latestById.get(q.id);
              return <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-3 text-slate-500 tabular-nums">{q.id}</td>
                <td className="p-3 font-medium text-slate-800">
                  <Link className="text-emerald-700 hover:underline" to={`/preventivi/${q.id}`}>{q.client||"(senza cliente)"}</Link>
                  {draft&&<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Bozza</span>}
                </td>
                <td className="p-3 text-slate-600">{q.reference}</td>
                <td className="p-3 text-slate-500">{q.rev}</td>
                <td className="p-3 text-right font-mono text-slate-700">{draft?"Da completare":q.totalFinal!==null?formatEuro(Number(q.totalFinal)):"—"}</td>
                <td className="p-3">
                  {draft?<span className="text-xs text-amber-800">Bozza, non conteggiata</span>:
                    latest?<select
                      aria-label={`Esito commerciale preventivo ${q.id}`}
                      className="w-full max-w-36 rounded border border-slate-300 bg-white px-2 py-2 text-sm disabled:opacity-50"
                      value={latest.outcome}
                      disabled={setOutcome.isPending||loadingSummary||summaryError}
                      onChange={e=>setOutcome.mutate({quoteId:q.id,outcome:e.target.value as QuoteOutcome})}>
                      {Object.entries(LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>:
                    <span className="text-xs text-slate-500">Revisione storica</span>}
                </td>
                <td className="p-3 text-center">
                  <Link className="text-emerald-700 hover:underline" to={`/preventivi/${q.id}`}>{draft?"Riprendi bozza":"Apri / Modifica"}</Link>
                </td>
              </tr>;
            })}
            {!isLoading&&(!quotes||quotes.length===0)&&<tr><td colSpan={7} className="p-6 text-center text-slate-500">Nessun preventivo trovato.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Lo stato commerciale è indipendente dai costi. Le statistiche comprendono tutto l'archivio, anche quando la ricerca filtra l'elenco.</p>
    </div>
  </Layout>;
}
