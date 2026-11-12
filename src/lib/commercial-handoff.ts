import {needsSeriesRalRefresh} from "./quote-series-ral-refresh";
import {seriesDiscount} from "./series-discount";
import {isSeries} from "./quote-series";
import {documentProductCode,documentProductDescription} from "./document-product-fields";
import {isForfait,forfaitProductError} from "./quote-forfait";
import {prepareRalOffer} from "./ral-documents";
import {calculateOfferLotPrice,cycleForOfferRow,offerLotTerms,selectedOfferLots,type CommercialOfferRow} from './commercial-offer-pricing';
import {quoteDocumentNumber} from './commercial-offer-number';
import {listinoProductIndex} from './quote-copy';
export type SalesRow={forfait?:boolean;code:string;description:string;quantity:string;listPrice:string;discount:string;netPrice:string};
export type SalesDocument={number?:string;client:string;reference:string;notes:string;payment:string;transport:string;rows:SalesRow[]};
export function copyNumber(value:unknown):string {
  if(value==null||value==='')return '';
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)throw new Error('Importo non valido');
  return n.toFixed(2).replace('.',',');
}
// Explicit allowlist: NEVER return the source JSON, costs, margins or internal notes.
export function salesDocument(kind:'quote'|'offer',raw:string):SalesDocument{
  let d=JSON.parse(raw);
  if(kind==='offer' && d?.verniciatura_ral)d=prepareRalOffer(d);
  if(!d||typeof d!=='object')throw new Error('Documento non valido');
  if(kind==='quote'&&needsSeriesRalRefresh(d))throw new Error('Aggiorna e salva i supplementi RAL dei prodotti di serie prima di passare il preventivo al commerciale.');
  if(d.stato_preventivo==='bozza')throw new Error('Completa il preventivo prima di condividerlo');
  const source=kind==='quote'?d.prodotti:d.righe;
  if(!Array.isArray(source)||!source.length)throw new Error('Nessun prodotto');
  const selectedRef=kind==='quote'?listinoProductIndex(d):-1;
  const ref=selectedRef>=0 && isSeries(source[selectedRef])?-1:selectedRef;
  const rows:SalesRow[]=source.flatMap((p:Record<string,any>,index:number)=>{
    if(kind==='quote' && isForfait(p)){
      const error=forfaitProductError(p);if(error)throw new Error(error);
      return [{forfait:true,code:"",description:String(p.descrizione),quantity:"",listPrice:"",discount:"",netPrice:copyNumber(p.valore_forfait)}];
    }
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
      const discount=kind==='quote'?(isSeries(p)?seriesDiscount(p.sconto_serie).label:index===ref?String(d.listino?.sconto_riferimento??''):''):
        String(p.sconto_base??'')+(extra>0?'+'+String(extra).replace('.',',')+'%':'');
      return {code:documentProductCode(p,d),description:documentProductDescription(p),quantity:String(quantity).replace('.',','),
        listPrice:copyNumber(kind==='quote'?(isSeries(p)&&seriesDiscount(p.sconto_serie).label?p.prezzo_serie:index===ref?d.listino?.prezzo_listino_generato:null):terms.listino??p.listino),
        discount,netPrice:copyNumber(net)};
    });
  });
  if(d.ral_riepilogo?.fixed)rows.push({code:"",description:"Cambio colore RAL "+String(d.ral_riepilogo.color)+" (una volta per ordine)",quantity:"1",listPrice:"",discount:"",netPrice:copyNumber(d.ral_riepilogo.fixed)});
  const number=kind==='quote'?quoteDocumentNumber(d):(String(d.nome??'').trim()||undefined);
  return {...(number?{number}:{}),client:String(d.cliente??''),reference:String(d.riferimento_preventivo??d.riferimento??d.nome??''),
    notes:String(d.note_cliente??'')+(d.ral_riepilogo?'\nPrezzo verniciato indicativo, da confermare dall’ufficio.':''),payment:String(d.pagamento??''),transport:String(d.trasporto??''),rows};
}
export function salesText(d:SalesDocument):string{
  return [...(d.number?['Numero: '+d.number]:[]),'Cliente: '+d.client,'Riferimento: '+d.reference,...d.rows.map(r=>r.forfait?["Descrizione: "+r.description,"a forfait/da definire","Totale riga: "+r.netPrice+" €"].join("\n"):[
    'Codice: '+r.code,'Descrizione: '+r.description,'Quantità: '+r.quantity,
    ...(r.listPrice?['Listino: '+r.listPrice+' €']:[]),...(r.discount?['Sconti: '+r.discount]:[]),'Netto: '+r.netPrice+' €'].join('\n')),
    ...(d.payment?['Pagamento: '+d.payment]:[]),...(d.transport?['Trasporto: '+d.transport]:[]),d.notes].filter(Boolean).join('\n\n');
}
