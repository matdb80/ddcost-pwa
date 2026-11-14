import {useState} from 'react';
import {trpc} from '@/providers/trpc';
import SalesDocumentView from './SalesDocumentView';
export default function SalesHandoffPanel({kind,sourceId,disabled=false}:{kind:'quote'|'offer';sourceId:number;disabled?:boolean}){
  const [draft,setDraft]=useState<{subject:string;body:string;recipientOid:string;name:string;email:string;hash:string}|null>(null);
  const [mail,setMail]=useState<{url:string;body:string}|null>(null);
  const [recipient,setRecipient]=useState('');const [message,setMessage]=useState('');
  const available=trpc.sales.available.useQuery();
  const preview=trpc.sales.preview.useQuery({kind,sourceId},{enabled:sourceId>0&&!disabled});
  const colleagues=trpc.sales.colleagues.useQuery(undefined,{enabled:available.data===true});
  const share=trpc.sales.share.useMutation();
  if(!sourceId||disabled)return <p className="text-sm text-slate-500">Salva il documento per copiarne i dati definitivi e passarlo al commerciale.</p>;
  return <section className="my-4 rounded-xl border p-4 space-y-3 bg-white"><h2 className="font-semibold">Dati per il gestionale e passaggio al commerciale</h2>
    {preview.error&&<p role="alert">{preview.error.message}</p>}
    {preview.data&&<SalesDocumentView document={preview.data.document}/>}
    {available.data&&<div className="flex flex-wrap gap-2"><select aria-label="Collega destinatario" value={recipient} onChange={e=>setRecipient(e.target.value)} className="border rounded p-2 max-w-full"><option value="">Scegli il collega</option>{colleagues.data?.filter(c=>c.enabled).map(c=><option key={c.oid} value={c.oid}>{c.name} — {c.email}</option>)}</select><button type="button" className="rounded bg-emerald-700 text-white p-3 disabled:opacity-40" disabled={!recipient||!preview.data||share.isPending} onClick={()=>{const c=colleagues.data?.find(c=>c.oid===recipient);if(!c||!preview.data)return;
      setMessage('');setMail(null);setDraft({recipientOid:c.oid,name:c.name,email:c.email,hash:preview.data.hash,
        subject:'DDCost — '+(preview.data.document.reference||'Documento pronto')+' — '+preview.data.document.client,
        body:'Ciao '+c.name+',\n\nil documento per '+preview.data.document.client+' è pronto. Puoi consultarlo in DDCost e copiare i dati per il gestionale o per il cliente.\n\n'});
    }}>Pronto per il commerciale</button></div>}
    {!available.data&&<p className="text-sm text-slate-500">Notifiche ai colleghi in attesa di attivazione.</p>}
    {draft&&<div className="fixed inset-0 z-[110] bg-slate-950/60 p-3 flex items-center justify-center"><section role="dialog" aria-modal="true" aria-labelledby="email-preview-title" className="bg-white rounded-xl p-5 max-w-2xl w-full max-h-[90vh] overflow-auto space-y-3">
      <h2 id="email-preview-title" className="font-bold text-xl">Anteprima email alla collega</h2>
      <p>A: {draft.name} — {draft.email}</p>
      <label className="block">Oggetto<input className="block w-full border rounded p-2" disabled={!!mail} maxLength={250} value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value.replace(/[\r\n]/g,' ')})}/></label>
      <label className="block">Messaggio — aggiungi qui istruzioni e altre informazioni<textarea disabled={!!mail} rows={8} className="block w-full border rounded p-2" value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label>
      <p className="text-sm text-slate-600">In fondo al messaggio verrà aggiunto il link diretto al documento. La conferma rende il documento disponibile alla collega; l’email si invia dal programma di posta.</p>
      {!mail?<div className="flex flex-wrap gap-2"><button type="button" disabled={share.isPending} className="border rounded p-3" onClick={()=>setDraft(null)}>Annulla</button><button type="button" disabled={share.isPending||!draft.subject.trim()||!draft.body.trim()} className="bg-emerald-700 text-white rounded p-3 disabled:opacity-40" onClick={async()=>{try{
        const result=await share.mutateAsync({kind,sourceId,recipientOid:draft.recipientOid,expectedHash:draft.hash});
        const body=draft.body+'\n\nApri il documento: '+window.location.origin+'/commerciale/'+result.id;
        setMail({body,url:'mailto:'+encodeURIComponent(result.email)+'?subject='+encodeURIComponent(draft.subject)+'&body='+encodeURIComponent(body)});
        setMessage('Documento condiviso. Apri la mail e premi Invia nel programma di posta.');
      }catch(e){setMessage(e instanceof Error?e.message:'Condivisione non riuscita');}}}>Conferma condivisione e prepara email</button></div>:
      <div className="space-y-3"><p className="text-sm whitespace-pre-wrap border rounded p-3">{mail.body}</p><div className="flex flex-wrap gap-2"><a className="bg-emerald-700 text-white rounded p-3" href={mail.url}>Apri email nel programma di posta</a><button className="border rounded p-3" onClick={async()=>{try{await navigator.clipboard.writeText('Oggetto: '+draft.subject+'\n\n'+mail.body);setMessage('Testo copiato.');}catch{setMessage('Seleziona il testo per copiarlo.');}}}>Copia email</button><button className="border rounded p-3" onClick={()=>setMail(null)}>Modifica testo</button><button className="border rounded p-3" onClick={()=>setDraft(null)}>Chiudi</button></div></div>}
      <p role="status">{message}</p>
    </section></div>}
    <p role="status">{message}</p></section>;
}
