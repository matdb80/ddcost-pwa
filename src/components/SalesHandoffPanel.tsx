import {useState} from 'react';
import {trpc} from '@/providers/trpc';
import SalesDocumentView from './SalesDocumentView';
export default function SalesHandoffPanel({kind,sourceId,disabled=false}:{kind:'quote'|'offer';sourceId:number;disabled?:boolean}){
  const [recipient,setRecipient]=useState('');const [message,setMessage]=useState('');
  const available=trpc.sales.available.useQuery();
  const preview=trpc.sales.preview.useQuery({kind,sourceId},{enabled:sourceId>0&&!disabled});
  const colleagues=trpc.sales.colleagues.useQuery(undefined,{enabled:available.data===true});
  const share=trpc.sales.share.useMutation();
  if(!sourceId||disabled)return <p className="text-sm text-slate-500">Salva il documento per copiarne i dati definitivi e passarlo al commerciale.</p>;
  return <section className="my-4 rounded-xl border p-4 space-y-3 bg-white"><h2 className="font-semibold">Dati per il gestionale e passaggio al commerciale</h2>
    {preview.error&&<p role="alert">{preview.error.message}</p>}
    {preview.data&&<SalesDocumentView document={preview.data.document}/>}
    {available.data&&<div className="flex flex-wrap gap-2"><select aria-label="Collega destinatario" value={recipient} onChange={e=>setRecipient(e.target.value)} className="border rounded p-2 max-w-full"><option value="">Scegli il collega</option>{colleagues.data?.filter(c=>c.enabled).map(c=><option key={c.oid} value={c.oid}>{c.name} — {c.email}</option>)}</select><button type="button" className="rounded bg-emerald-700 text-white p-3 disabled:opacity-40" disabled={!recipient||!preview.data||share.isPending} onClick={async()=>{try{await share.mutateAsync({kind,sourceId,recipientOid:recipient,expectedHash:preview.data!.hash});setMessage('Documento disponibile al collega.');}catch(e){setMessage(e instanceof Error?e.message:'Invio non riuscito');await preview.refetch();}}}>Pronto per il commerciale</button></div>}
    {!available.data&&<p className="text-sm text-slate-500">Notifiche ai colleghi in attesa di attivazione.</p>}
    <p role="status">{message}</p></section>;
}
