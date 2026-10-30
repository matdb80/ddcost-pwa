import {calculateOfferLotPrice,cycleForOfferRow,offerLotTerms,selectedOfferLots,type CommercialOfferRow} from './commercial-offer-pricing';
import {listinoProductIndex} from './quote-copy';
export type SalesRow={code:string;description:string;quantity:string;listPrice:string;discount:string;netPrice:string};
export type SalesDocument={client:string;reference:string;notes:string;payment:string;transport:string;rows:SalesRow[]};
export function copyNumber(value:unknown):string {
  if(value==null||value==='')return '';
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)throw new Error('Importo non valido');
  return n.toFixed(2).replace('.',',');
}
// Explicit allowlist: NEVER return the source JSON, costs, margins or internal notes.
export function salesDocument(kind:'quote'|'offer',raw:string):SalesDocument{
  const d=JSON.parse(raw);
  if(!d||typeof d!=='object')throw new Error('Documento non valido');
  if(d.stato_preventivo==='bozza')throw new Error('Completa il preventivo prima di condividerlo');
  const source=kind==='quote'?d.prodotti:d.righe;
  if(!Array.isArray(source)||!source.length)throw new Error('Nessun prodotto');
  const ref=kind==='quote'?listinoProductIndex(d):-1;
  const rows:SalesRow[]=source.flatMap((p:Record<string,any>,index:number)=>{
    const lots=kind==='quote'?[Number(p.quantita)]:selectedOfferLots(p as CommercialOfferRow);
    if(!lots.length)lots.push(Number(p.lotto));
    return lots.map(quantity=>{
      if(!Number.isFinite(quantity)||quantity<=0)throw new Error('Quantità mancante');
      const terms=kind==='offer'?offerLotTerms(p,quantity):{};
      const net=kind==='quote'?(p.prezzo_netto_unitario_finale??p.prezzo_vendita_pre_quadratura??p.prezzo_netto_unitario):
        cycleForOfferRow(p)?calculateOfferLotPrice(p,quantity).netPrice:
        terms.prezzo_netto_manuale??p.prezzo_netto_proposto??p.netto??p.netto_base;
      if(net==null||net==='')throw new Error('Prezzo netto mancante');
      const extra=Number(p.extra??0);
      const discount=kind==='quote'?(index===ref?String(d.listino?.sconto_riferimento??''):''):
        String(p.sconto_base??'')+(extra>0?'+'+String(extra).replace('.',',')+'%':'');
      return {code:String(p.codice??''),description:String(p.descrizione??''),quantity:String(quantity).replace('.',','),
        listPrice:copyNumber(kind==='quote'?(index===ref?d.listino?.prezzo_listino_generato:null):terms.listino??p.listino),
        discount,netPrice:copyNumber(net)};
    });
  });
  return {client:String(d.cliente??''),reference:String(d.riferimento_preventivo??d.riferimento??d.nome??''),
    notes:String(d.note_cliente??''),payment:String(d.pagamento??''),transport:String(d.trasporto??''),rows};
}
export function salesText(d:SalesDocument):string{
  return ['Cliente: '+d.client,'Riferimento: '+d.reference,...d.rows.map(r=>[
    'Codice: '+r.code,'Descrizione: '+r.description,'Quantità: '+r.quantity,
    ...(r.listPrice?['Listino: '+r.listPrice+' €']:[]),...(r.discount?['Sconti: '+r.discount]:[]),'Netto: '+r.netPrice+' €'].join('\n')),
    ...(d.payment?['Pagamento: '+d.payment]:[]),...(d.transport?['Trasporto: '+d.transport]:[]),d.notes].filter(Boolean).join('\n\n');
}
