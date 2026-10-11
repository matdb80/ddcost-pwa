import { useState } from "react";
import { Navigate } from "react-router";
import { AlertTriangle, Download, RefreshCcw, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statuses = [
  ["nuova","Nuova"],["da_pianificare","Da pianificare"],["in_lavorazione","In lavorazione"],
  ["risolta_collaudo","Risolta nel collaudo"],["rilasciata","Rilasciata"],
  ["duplicata","Duplicata"],["non_riproducibile","Non riproducibile"],
] as const;
type Status = typeof statuses[number][0];
type Kind = "bug" | "miglioramento" | "nuova_funzione";
type Severity = "normale" | "bloccante";
const labelStatus = (s:string) => statuses.find(x=>x[0]===s)?.[1]??s;

export default function FeedbackAdminPage() {
  const { user, isLoading } = useAuth({redirectOnUnauthenticated:false});
  const [page,setPage] = useState(1);
  const [search,setSearch] = useState("");
  const [status,setStatus] = useState<Status | "all">("all");
  const [kind,setKind] = useState<Kind | "all">("all");
  const [severity,setSeverity] = useState<Severity | "all">("all");
  const [detailId,setDetailId] = useState<number | null>(null);
  const [selected,setSelected] = useState<Set<number>>(new Set());
  const [configure,setConfigure] = useState(false);
  const [thresholdInput,setThresholdInput] = useState(10);
  const [error,setError] = useState("");
  const utils=trpc.useUtils();

  const enabled=user?.role==="admin";
  const list=trpc.feedback.listAdmin.useQuery({
    page,pageSize:25,status:status==="all"?undefined:status,
    type:kind==="all"?undefined:kind,
    severity:severity==="all"?undefined:severity,
    search:search||undefined
  },{enabled});
  const stats=trpc.feedback.getStats.useQuery(undefined,{enabled});
  const settings=trpc.feedback.getSettings.useQuery(undefined,{enabled});
  const detail=trpc.feedback.getById.useQuery({id:detailId!},{enabled:enabled&&detailId!==null});
  const change=trpc.feedback.updateStatus.useMutation({onSuccess:()=>{
    void utils.feedback.listAdmin.invalidate();
    void utils.feedback.getStats.invalidate();
    void utils.feedback.getById.invalidate();
  }});
  const configureMutation=trpc.feedback.updateSettings.useMutation({onSuccess:()=>{
    void utils.feedback.getSettings.invalidate();
    void utils.feedback.getStats.invalidate();
    setConfigure(false);
  }});
  const exportMutation=trpc.feedback.export.useMutation();
  const threshold=settings.data?.releaseThreshold??10;
  const pending=stats.data?.pendingForRelease??0;

  const toggle=(id:number)=>{
    setSelected(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next;});
  };
  const toggleAll=()=>{
    const rows=list.data?.items??[];
    const all=rows.length>0&&rows.every(x=>selected.has(x.id));
    setSelected(prev=>{
      const next=new Set(prev);
      for(const row of rows)if(all)next.delete(row.id);else next.add(row.id);
      return next;
    });
  };
  const exportData=async (format:"markdown"|"json")=>{
    setError("");
    try {
      const {content}=await exportMutation.mutateAsync({
        format,ids:selected.size?[...selected]:undefined
      });
      const blob=new Blob([content],{type:format==="json"?"application/json":"text/markdown"});
      const href=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=href;
      a.download=format==="json"?"segnalazioni.json":"segnalazioni.md";
      a.click();
      setTimeout(()=>URL.revokeObjectURL(href),1000);
    }catch(e){setError(e instanceof Error?e.message:"Esportazione non riuscita.");}
  };

  if(isLoading)return <p className="p-6">Caricamento...</p>;
  if(!enabled)return <Navigate to="/" replace/>;
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-3 items-center justify-between">
      <div>
        <h1 className="text-xl font-bold">Registro Segnalazioni</h1>
        <p className="text-sm text-slate-500">Organizzazione delle correzioni cumulative DDCost</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={()=>{setThresholdInput(threshold);setConfigure(true);}}>
          <Settings className="w-4 h-4 mr-2"/>Soglia {threshold}
        </Button>
        <Button variant="outline" onClick={()=>void exportData("markdown")}>
          <Download className="w-4 h-4 mr-2"/>Esporta MD
        </Button>
        <Button variant="outline" onClick={()=>void exportData("json")}>Esporta JSON</Button>
      </div>
    </div>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="bg-white border rounded-xl p-4">
        <p className="text-slate-500 text-sm">Totale segnalazioni</p>
        <p className="text-2xl font-bold">{stats.data?.total??0}</p>
      </div>
      <div className={"border rounded-xl p-4 "+(pending>=threshold?"bg-amber-50":"bg-white")}>
        <p className="text-slate-500 text-sm">Per prossima revisione</p>
        <p className="text-2xl font-bold">{pending} / {threshold}</p>
        {pending>=threshold&&<p className="text-amber-700 text-sm flex gap-1">
          <AlertTriangle className="w-4 h-4"/>Soglia raggiunta
        </p>}
      </div>
      <div className="bg-white border rounded-xl p-4">
        <p className="text-slate-500 text-sm">Bloccanti aperti</p>
        <p className="text-2xl font-bold text-red-600">{stats.data?.blocking??0}</p>
      </div>
    </div>
    <div className="bg-white border rounded-xl p-4 grid gap-3 sm:grid-cols-5">
      <Input value={search} placeholder="Cerca ticket..." onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
      <Select value={status} onValueChange={v=>{setStatus(v as Status|"all");setPage(1);}}>
        <SelectTrigger><SelectValue placeholder="Stato"/></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti gli stati</SelectItem>
          {statuses.map(([value,label])=><SelectItem value={value} key={value}>{label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={kind} onValueChange={v=>{setKind(v as Kind|"all");setPage(1);}}>
        <SelectTrigger><SelectValue placeholder="Tipo"/></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti i tipi</SelectItem>
          <SelectItem value="bug">Bug</SelectItem>
          <SelectItem value="miglioramento">Miglioramento</SelectItem>
          <SelectItem value="nuova_funzione">Nuova funzione</SelectItem>
        </SelectContent>
      </Select>
      <Select value={severity} onValueChange={v=>{setSeverity(v as Severity|"all");setPage(1);}}>
        <SelectTrigger><SelectValue placeholder="Gravità"/></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutte le gravità</SelectItem>
          <SelectItem value="normale">Normale</SelectItem>
          <SelectItem value="bloccante">Bloccante</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" onClick={()=>{setSearch("");setStatus("all");setKind("all");setSeverity("all");setPage(1);}}>
        <RefreshCcw className="w-4 h-4 mr-2"/>Reset
      </Button>
    </div>
    <div className="border bg-white rounded-xl overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-slate-50"><tr>
          <th className="p-3 text-left">
            <Checkbox aria-label="Seleziona pagina"
              checked={list.data?.items.length?list.data.items.every(x=>selected.has(x.id)):false}
              onCheckedChange={toggleAll}/>
          </th>
          <th className="p-3 text-left">Ticket</th>
          <th className="p-3 text-left">Titolo</th>
          <th className="p-3 text-left">Tipo</th>
          <th className="p-3 text-left">Gravità</th>
          <th className="p-3 text-left">Stato</th>
          <th className="p-3 text-left">Data</th>
        </tr></thead>
        <tbody>{list.data?.items.map(t=><tr key={t.id}
          className="border-t hover:bg-slate-50 cursor-pointer"
          onClick={()=>setDetailId(t.id)}>
          <td className="p-3" onClick={e=>e.stopPropagation()}>
            <Checkbox checked={selected.has(t.id)} onCheckedChange={()=>toggle(t.id)}/>
          </td>
          <td className="p-3 font-mono">{t.ticketNumber}</td>
          <td className="p-3 font-semibold">{t.title}</td>
          <td className="p-3">{t.type.replace("_"," ")}</td>
          <td className="p-3">{t.severity==="bloccante"?<Badge variant="destructive">Bloccante</Badge>:t.severity}</td>
          <td className="p-3">{labelStatus(t.status)}</td>
          <td className="p-3">{new Date(t.createdAt).toLocaleDateString("it-IT")}</td>
        </tr>)}</tbody>
      </table>
      {!list.isLoading&&list.data?.items.length===0&&<p className="text-slate-500 p-6">Nessuna segnalazione trovata.</p>}
    </div>
    <div className="flex gap-3 items-center justify-between">
      <p className="text-sm text-slate-500">{list.data?.total??0} ticket · {selected.size} selezionati</p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Precedente</Button>
        <span className="text-sm self-center">{page}/{Math.max(1,list.data?.totalPages??1)}</span>
        <Button variant="outline" disabled={page>=Math.max(1,list.data?.totalPages??1)} onClick={()=>setPage(p=>p+1)}>Successiva</Button>
      </div>
    </div>
    <Dialog open={detailId!==null} onOpenChange={o=>{if(!o)setDetailId(null);}}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Dettaglio segnalazione</DialogTitle></DialogHeader>
        {detail.data?.ticket&&<div className="space-y-4">
          <p className="font-mono font-bold">{detail.data.ticket.ticketNumber}</p>
          <p className="font-semibold">{detail.data.ticket.title}</p>
          <p className="whitespace-pre-wrap text-sm">{detail.data.ticket.description}</p>
          <div className="text-sm text-slate-500">
            <p>Utente: {detail.data.ticket.userName??"N/D"} ({detail.data.ticket.userEmail??"N/D"})</p>
            <p>Pagina: {detail.data.ticket.pageRoute??"N/D"} · Build: {detail.data.ticket.buildVersion??"N/D"}</p>
            <p>Ciclo: {detail.data.ticket.cycleId??"N/D"} · Revisione: {detail.data.ticket.cycleRev??"N/D"}</p>
          </div>
          {detail.data.attachments.map(a=><img key={a.id}
            className="max-h-56 object-contain border rounded"
            alt={a.fileName??"Screenshot"}
            src={"data:"+a.mimeType+";base64,"+a.dataBase64}/>)}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Stato</Label>
              <Select value={detail.data.ticket.status}
                onValueChange={v=>change.mutate({id:detail.data!.ticket!.id,status:v as Status})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {statuses.map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox checked={detail.data.ticket.includeInReleaseCount===1}
                onCheckedChange={v=>change.mutate({
                  id:detail.data!.ticket!.id,
                  status:detail.data!.ticket!.status,
                  includeInReleaseCount:v===true
                })}/>
              <Label>Includi nella prossima revisione</Label>
            </div>
          </div>
          <div className="space-y-1"><Label>Nota tecnica</Label>
            <Textarea key={detail.data.ticket.id}
              defaultValue={detail.data.ticket.technicalNote??""}
              onBlur={e=>{if(e.target.value!==(detail.data!.ticket!.technicalNote??""))
                change.mutate({
                  id:detail.data!.ticket!.id,
                  status:detail.data!.ticket!.status,
                  technicalNote:e.target.value
                });}}
            />
          </div>
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={configure} onOpenChange={setConfigure}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Soglia per revisione cumulativa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>Numero segnalazioni</Label>
          <Input type="number" value={thresholdInput} min={1} max={1000}
            onChange={e=>setThresholdInput(Number(e.target.value)||10)}/>
          <Button disabled={configureMutation.isPending}
            onClick={()=>configureMutation.mutate({releaseThreshold:Math.round(thresholdInput)})}>Salva</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
