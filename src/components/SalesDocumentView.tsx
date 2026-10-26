import {useState} from 'react';
import {Copy} from 'lucide-react';
import {salesText,type SalesDocument} from '@/lib/commercial-handoff';
export function CopyValue({label,value}:{label:string;value:string}){
  const [message,setMessage]=useState('');
  return <div className="min-w-0"><span className="block text-xs text-slate-500">{label}</span><div className="flex items-start gap-2"><span className="break-words min-w-0 flex-1">{value||'—'}</span><button type="button" disabled={!value} title={'Copia '+label} aria-label={'Copia '+label} className="shrink-0 p-2 rounded border disabled:opacity-30" onClick={async()=>{try{await navigator.clipboard.writeText(value);setMessage('Copiato');}catch{setMessage('Copia non riuscita: seleziona il testo');}}}><Copy size={15}/></button></div><span role="status" className="text-xs text-emerald-700">{message}</span></div>;
}
export default function SalesDocumentView({document:d}:{document:SalesDocument}){
  return <section className="space-y-3"><CopyValue label="Cliente" value={d.client}/><CopyValue label="Riferimento" value={d.reference}/>{d.rows.map((r,i)=><div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border p-3 bg-white"><CopyValue label="Codice articolo" value={r.code}/><CopyValue label="Descrizione" value={r.description}/><CopyValue label="Quantità" value={r.quantity}/><CopyValue label="Prezzo di listino" value={r.listPrice}/><CopyValue label="Sconti" value={r.discount}/><CopyValue label="Prezzo netto" value={r.netPrice}/></div>)}{d.payment&&<CopyValue label="Pagamento" value={d.payment}/ >}{d.transport&&<CopyValue label="Trasporto" value={d.transport}/ >}{d.notes&&<CopyValue label="Note cliente" value={d.notes}/ >}<details><summary className="cursor-pointer font-medium">Copia tutta l’offerta</summary><div className="whitespace-pre-wrap text-sm"><CopyValue label="Testo per il cliente" value={salesText(d)}/></div></details></section>;
}
