import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router';
import Layout from '@/components/Layout';
import {trpc} from '@/providers/trpc';
import {useAuth} from '@/hooks/useAuth';
import SalesDocumentView from '@/components/SalesDocumentView';
const statuses={ready:'Pronto per il commerciale',transferred:'Trasferito nel gestionale',sent:'Inviato al cliente'};
export default function SalesInboxPage(){
 const {id}=useParams();const {user}=useAuth();const [message,setMessage]=useState('');
 const available=trpc.sales.available.useQuery();
 const list=trpc.sales.list.useQuery(undefined,{enabled:available.data===true,refetchInterval:15000});
 const detail=trpc.sales.get.useQuery({id:Number(id)},{enabled:available.data===true&&!!id,refetchInterval:15000});
 const receipt=trpc.sales.receipt.useMutation();const revoke=trpc.sales.revoke.useMutation();
 const [seen,setSeen]=useState('');
 useEffect(()=>{const d=detail.data;if(d?.isRecipient&&seen!==d.hash){setSeen(d.hash);receipt.mutate({id:d.id,hash:d.hash},{onSuccess:()=>void list.refetch(),onError:e=>setMessage(e.message)});}},[detail.data,seen]);
 return <Layout><div className="max-w-4xl mx-auto space-y-4"><h1 className="text-2xl font-bold">Documenti condivisi</h1><p>Le notifiche si aggiornano mentre DDCost è aperto. Le nuove revisioni tornano nello stato “Pronto per il commerciale”.</p>
 {user?.role==='admin'&&<Link className="underline" to="/commerciale/accessi">Gestisci accessi colleghi</Link>}
 {available.data===false&&<p>Funzione in attesa di attivazione.</p>}
 {(list.error||detail.error)&&<p role="alert">{list.error?.message||detail.error?.message}</p>}
 {id?<><Link to="/commerciale" className="underline">Torna alle notifiche</Link>{detail.data&&<><p>Revisione: {detail.data.revision} · {statuses[detail.data.status]}</p><SalesDocumentView key={detail.data.hash} document={detail.data.document}/>{detail.data.isRecipient&&<div className="flex flex-wrap gap-2">{Object.entries(statuses).map(([value,label])=><button key={value} disabled={receipt.isPending} className="border rounded p-3" onClick={async()=>{try{await receipt.mutateAsync({id:detail.data!.id,hash:detail.data!.hash,status:value as keyof typeof statuses});await detail.refetch();await list.refetch();}catch(e){setMessage(String(e));}}}>{label}</button>)}</div>}{detail.data.canRevoke&&<button className="text-red-700 underline" onClick={async()=>{if(!confirm('Revocare la condivisione con questo collega?'))return;await revoke.mutateAsync({id:detail.data!.id});window.location.assign('/commerciale');}}>Revoca condivisione</button>}</>}</>:
 <div className="space-y-2">{list.data?.length===0&&<p>Nessun documento assegnato.</p>}{list.data?.map(d=><Link key={d.id} to={'/commerciale/'+d.id} className="block border rounded-xl p-4 bg-white"><strong>{d.client}</strong> · {d.reference}<span className="block">{d.unread?(d.newRevision?'● Nuova revisione':'● Nuovo documento'):statuses[d.status]}</span>{d.unavailable&&<span>Il documento è stato rimosso o non è disponibile.</span>}</Link>)}</div>}
 <p role="status">{message}</p></div></Layout>;
}
