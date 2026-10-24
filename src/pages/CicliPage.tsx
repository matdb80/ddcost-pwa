import Layout from "@/components/Layout";
import FormulaTooltip from "@/components/FormulaTooltip";
import {trpc} from "@/providers/trpc";
import {Fragment,useState,type FormEvent} from "react";
import {Link} from "react-router";
import {Plus,Search,Trash2,RotateCcw,Pencil,Copy,ChevronLeft,ChevronRight} from "lucide-react";
import {CALCULATION_FORMULAS} from "@/lib/calculation-formulas";
import {copyCycleAsNamedDraft} from "@/lib/cycle-copy";
import {ricalcolaCiclo} from "@/lib/cycle-calculator";
import {serializeCycleDataJson} from "@/types/cycle";
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog";

const PAGE_SIZE=25;
const fmt=(value:string|number|null|undefined)=>{
  if(value===null||value===undefined)return "—";
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2}):String(value);
};
export default function CicliPage(){
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [showDeleted,setShowDeleted]=useState(false);
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const [duplicateSource,setDuplicateSource]=useState<{id:number;code:string|null;description:string|null;rev:number|null}|null>(null);
  const [duplicateCode,setDuplicateCode]=useState("");
  const [duplicateDescription,setDuplicateDescription]=useState("");
  const [duplicatePreparationError,setDuplicatePreparationError]=useState("");
  const [duplicateLoading,setDuplicateLoading]=useState(false);
  const utils=trpc.useUtils();
  const query=trpc.cycle.listGrouped.useQuery({
    search:search||undefined,page,pageSize:PAGE_SIZE,includeDeleted:showDeleted,
  });
  const del=trpc.cycle.delete.useMutation({onSuccess:()=>void query.refetch()});
  const restore=trpc.cycle.restore.useMutation({onSuccess:()=>void query.refetch()});
  const duplicateCycle=trpc.cycle.create.useMutation({onSuccess:async()=>{
    setDuplicateSource(null);
    setDuplicatePreparationError("");
    await query.refetch();
  }});
  const groups=query.data?.groups??[];
  const total=query.data?.total??0;
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const setFilter=(value:string)=>{setSearch(value);setPage(1);setExpanded(new Set());};
  const toggle=(key:string)=>setExpanded(prev=>{
    const next=new Set(prev);if(next.has(key))next.delete(key);else next.add(key);return next;
  });
  const openDuplicate=(c:(typeof groups)[number]["revisions"][number])=>{
    if(c.deleted===1)return;
    duplicateCycle.reset();
    setDuplicatePreparationError("");
    setDuplicateSource({id:c.id,code:c.code,description:c.description,rev:c.rev});
    setDuplicateCode(c.code?.trim()?`${c.code.trim()}-COPIA`:"NUOVO-CICLO");
    setDuplicateDescription(c.description?.trim()?`${c.description.trim()} (copia)`:"Ciclo duplicato");
  };
  const sameSourceCode=duplicateSource!==null && duplicateCode.trim().toLocaleUpperCase("it-IT")===
    (duplicateSource.code??"").trim().toLocaleUpperCase("it-IT");
  const sameSourceDescription=duplicateSource!==null && duplicateDescription.trim().toLocaleLowerCase("it-IT")===
    (duplicateSource.description??"").trim().toLocaleLowerCase("it-IT");
  const submitDuplicate=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!duplicateSource || !duplicateCode.trim() || !duplicateDescription.trim() || sameSourceCode || sameSourceDescription)return;
    setDuplicateLoading(true);
    setDuplicatePreparationError("");
    try{
      const source=await utils.cycle.get.fetch({id:duplicateSource.id});
      if(!source || source.deleted===1)throw new Error("Il ciclo selezionato non è più disponibile.");
      const draft=copyCycleAsNamedDraft(source,duplicateCode,duplicateDescription);
      const calculated=ricalcolaCiclo(draft);
      await duplicateCycle.mutateAsync({
        code:calculated.codice,
        description:calculated.descrizione,
        client:calculated.cliente,
        lot:String(calculated.lotto),
        standardCost:String(calculated.costo_standard),
        minimumPrice:String(calculated.prezzo_minimo),
        dataJson:JSON.stringify(serializeCycleDataJson(calculated)),
      });
    }catch(error){
      setDuplicatePreparationError(error instanceof Error?error.message:"Impossibile duplicare il ciclo selezionato.");
    }finally{
      setDuplicateLoading(false);
    }
  };
  const actions=(c:(typeof groups)[number]["revisions"][number])=>(
    <div className="flex items-center justify-center gap-3">
      {c.deleted!==1?<>
        <button type="button" className="text-slate-500 hover:text-blue-700"
          aria-label={`Duplica ciclo dalla revisione ${c.rev}`} title="Duplica ciclo"
          onClick={()=>openDuplicate(c)}>
          <Copy size={16}/>
        </button>
        <Link to={`/cicli/${c.id}`} className="text-slate-500 hover:text-emerald-700"
          title="Apri o modifica revisione" aria-label={`Apri revisione ${c.rev}`}>
          <Pencil size={16}/>
        </Link>
        <button type="button" className="text-slate-500 hover:text-red-600"
          aria-label={`Elimina revisione ${c.rev}`} title="Elimina revisione"
          onClick={()=>{if(window.confirm("Eliminare questa revisione? Potrà essere recuperata."))del.mutate({id:c.id});}}>
          <Trash2 size={16}/>
        </button>
      </>:<button type="button" className="text-slate-500 hover:text-emerald-700"
        title="Recupera revisione" aria-label={`Recupera revisione ${c.rev}`}
        onClick={()=>{if(window.confirm("Recuperare questa revisione?"))restore.mutate({id:c.id});}}>
        <RotateCcw size={16}/>
      </button>}
    </div>
  );
  return <Layout>
    <div className="w-full max-w-screen-2xl mx-auto">
      <div className="flex flex-wrap items-center justify-between mb-5 gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/>
          <input type="search" aria-label="Cerca cicli" placeholder="Cerca codice, descrizione, cliente..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm"
            value={search} onChange={e=>setFilter(e.target.value)}/>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showDeleted} onChange={e=>{
              setShowDeleted(e.target.checked);setPage(1);setExpanded(new Set());
            }}/>Mostra eliminati
          </label>
          <Link to="/cicli/new" className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white">
            <Plus size={16}/> Nuovo ciclo
          </Link>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-600">Ogni codice appare una volta. Premi la freccia per visualizzare tutte le revisioni, senza duplicare il codice nell'elenco principale.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left p-3">Codice / revisioni</th>
              <th className="text-left p-3">Descrizione</th>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">Lotto</th>
              <th className="text-left p-3">Rev.</th>
              <th className="text-right p-3">Costo industriale standard</th>
              <th className="text-right p-3">Prezzo Min.</th>
              <th className="text-center p-3">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading&&<tr><td colSpan={8} className="py-8 text-center text-slate-500">Caricamento cicli...</td></tr>}
            {query.isError&&<tr><td colSpan={8} className="p-5 text-red-700">Impossibile caricare i cicli. {query.error.message}</td></tr>}
            {!query.isLoading&&!query.isError&&groups.length===0&&<tr><td colSpan={8} className="p-6 text-center text-slate-500">Nessun ciclo trovato.</td></tr>}
            {groups.map(g=>{
              const last=g.latest!;
              const open=expanded.has(g.key);
              return <Fragment key={g.key}>
                <tr className="border-b border-slate-200 bg-white hover:bg-slate-50">
                  <td className="p-3 font-semibold">
                    <button type="button" title={open?"Nascondi revisioni":"Mostra tutte le revisioni"}
                      aria-label={`${open?"Nascondi":"Mostra"} le ${g.revisions.length} revisioni del codice ${last.code??"senza codice"}`}
                      aria-expanded={open}
                      onClick={()=>toggle(g.key)}
                      className="inline-flex items-center gap-2 rounded text-left text-slate-800 hover:text-emerald-700">
                      {open?<ChevronRight size={17} className="rotate-90"/>:<ChevronRight size={17}/>}
                      {last.code||"(senza codice)"}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal">{g.revisions.length} rev.</span>
                    </button>
                    {last.deleted===1&&<span className="ml-2 text-xs text-red-600">Eliminato</span>}
                  </td>
                  <td className="p-3 text-slate-600">{last.description}</td>
                  <td className="p-3 text-slate-600">{last.client}</td>
                  <td className="p-3">{last.lot}</td>
                  <td className="p-3 font-semibold">{last.rev}</td>
                  <td className="p-3 text-right tabular-nums">{last.standardCost!=null?<>€ {fmt(last.standardCost)}<FormulaTooltip label="Costo industriale standard del ciclo" formula={CALCULATION_FORMULAS.cycle.standardCost}/></>:"—"}</td>
                  <td className="p-3 text-right tabular-nums">{last.minimumPrice!=null?<>€ {fmt(last.minimumPrice)}<FormulaTooltip label="Prezzo minimo del ciclo" formula={CALCULATION_FORMULAS.cycle.minimumPrice}/></>:"—"}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <Link to={`/cicli/${last.id}`} className="text-emerald-700 hover:underline">Apri ultima</Link>
                      {last.deleted!==1&&<button type="button" className="text-slate-500 hover:text-blue-700"
                        aria-label={`Duplica ciclo ${last.code??"senza codice"}`} title="Duplica ciclo"
                        onClick={()=>openDuplicate(last)}><Copy size={16}/></button>}
                    </div>
                  </td>
                </tr>
                {open&&g.revisions.map(c=><tr key={c.id} className={`border-b border-slate-100 ${c.deleted===1?"bg-red-50":"bg-slate-50/70"}`}>
                  <td className="py-2 pl-11 pr-3 text-slate-500">
                    <Link to={`/cicli/${c.id}`} className="text-emerald-700 hover:underline">↳ Revisione {c.rev} (ID {c.id})</Link>
                  </td>
                  <td className="p-2 text-slate-600">{c.description}</td>
                  <td className="p-2 text-slate-600">{c.client}</td>
                  <td className="p-2">{c.lot}</td>
                  <td className="p-2">{c.rev}</td>
                  <td className="p-2 text-right tabular-nums">{c.standardCost!=null?<>€ {fmt(c.standardCost)}<FormulaTooltip label="Costo industriale standard del ciclo" formula={CALCULATION_FORMULAS.cycle.standardCost}/></>:"—"}</td>
                  <td className="p-2 text-right tabular-nums">{c.minimumPrice!=null?<>€ {fmt(c.minimumPrice)}<FormulaTooltip label="Prezzo minimo del ciclo" formula={CALCULATION_FORMULAS.cycle.minimumPrice}/></>:"—"}</td>
                  <td className="p-2">{actions(c)}</td>
                </tr>)}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{total} codici distinti · Pagina {page} di {pages}</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Pagina precedente" disabled={page<=1} onClick={()=>{setPage(p=>Math.max(1,p-1));setExpanded(new Set());}} className="rounded border p-2 disabled:opacity-40"><ChevronLeft size={16}/></button>
          <span>{page} / {pages}</span>
          <button type="button" aria-label="Pagina successiva" disabled={page>=pages} onClick={()=>{setPage(p=>Math.min(pages,p+1));setExpanded(new Set());}} className="rounded border p-2 disabled:opacity-40"><ChevronRight size={16}/></button>
        </div>
      </div>
    </div>
    <Dialog open={duplicateSource!==null} onOpenChange={open=>{
      if(!open && !duplicateLoading && !duplicateCycle.isPending)setDuplicateSource(null);
    }}>
      <DialogContent>
        <form onSubmit={submitDuplicate} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Duplica ciclo</DialogTitle>
            <DialogDescription>
              {duplicateSource&&<>Copia i dati della revisione {duplicateSource.rev??1} di <strong>{duplicateSource.code||"(senza codice)"}</strong>. Inserisci un codice e una descrizione diversi dall’originale.</>}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="duplicate-cycle-code" className="mb-1 block text-sm font-medium">Nuovo codice</label>
            <input id="duplicate-cycle-code" required autoFocus value={duplicateCode}
              onChange={event=>setDuplicateCode(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            {sameSourceCode&&<p className="mt-1 text-xs text-red-700">Il codice deve essere diverso da quello originale.</p>}
          </div>
          <div>
            <label htmlFor="duplicate-cycle-description" className="mb-1 block text-sm font-medium">Nuova descrizione</label>
            <input id="duplicate-cycle-description" required value={duplicateDescription}
              onChange={event=>setDuplicateDescription(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            {sameSourceDescription&&<p className="mt-1 text-xs text-red-700">La descrizione deve essere diversa da quella originale.</p>}
          </div>
          {(duplicatePreparationError||duplicateCycle.error)&&<p role="alert" className="text-sm text-red-700">
            {duplicatePreparationError||duplicateCycle.error?.message}
          </p>}
          <DialogFooter>
            <button type="button" disabled={duplicateLoading||duplicateCycle.isPending}
              onClick={()=>setDuplicateSource(null)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Annulla</button>
            <button type="submit" disabled={!duplicateCode.trim()||!duplicateDescription.trim()||sameSourceCode||sameSourceDescription||duplicateLoading||duplicateCycle.isPending}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {duplicateLoading||duplicateCycle.isPending?"Duplicazione…":"Crea duplicato"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </Layout>;
}
