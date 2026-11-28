import {useState} from 'react';
import Layout from '@/components/Layout';
import {trpc} from '@/providers/trpc';
export default function ColleagueAccessPage(){
 const list=trpc.sales.colleagues.useQuery();const save=trpc.sales.authorize.useMutation();
 const empty={oid:'',name:'',email:'',permission:'commercial' as 'commercial'|'editor',enabled:true};
 const [form,setForm]=useState(empty);const [message,setMessage]=useState('');
 return <Layout><div className="max-w-2xl space-y-4"><h1 className="font-bold text-2xl">Accessi colleghi</h1><p>Usa l’Object ID dell’utente nel tenant Microsoft aziendale. Il profilo Commerciale può consultare solo i documenti assegnati; Redattore può accedere ai dati interni e creare documenti.</p>
 <form className="space-y-3" onSubmit={async e=>{e.preventDefault();try{await save.mutateAsync(form);setMessage('Accesso aggiornato.');setForm(empty);await list.refetch();}catch(e){setMessage(e instanceof Error?e.message:'Errore');}}}>{(['oid','name','email'] as const).map(k=><label key={k} className="block">{{oid:'Object ID Microsoft',name:'Nome',email:'Email aziendale'}[k]}<input required type={k==='email'?'email':'text'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} className="block border rounded p-2 w-full"/></label>)}<select aria-label="Permessi" value={form.permission} onChange={e=>setForm({...form,permission:e.target.value as typeof form.permission})}><option value="commercial">Commerciale — sola consultazione dati di vendita</option><option value="editor">Redattore — dati interni e modifica propri documenti</option></select><label className="block"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/> Accesso abilitato</label><button disabled={save.isPending} className="bg-emerald-700 text-white p-3 rounded">Salva accesso</button></form>
 <p role="status">{message}</p>{list.error&&<p role="alert">{list.error.message}</p>}{list.data?.map(c=><button key={c.oid} className="block border rounded p-3 w-full text-left" onClick={()=>setForm({...c,enabled:!!c.enabled})}>{c.name} — {c.email} — {c.enabled?c.permission:'Revocato'}</button>)}</div></Layout>;
}
