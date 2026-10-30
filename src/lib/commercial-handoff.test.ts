import {describe,it,expect} from 'vitest';
import {salesDocument,copyNumber,salesText} from './commercial-handoff';
const quote={cliente:'Cliente',riferimento_preventivo:'P1',note_generali:'SECRET',note_fornitori:'SECRET',note_cliente:'Consegna concordata',prodotti:[{codice:'001A',descrizione:'Bandella',quantita:20,prezzo_netto_unitario_finale:12.5,full_cost:5,margine:0.2}],listino:{product_index_riferimento:0,prezzo_listino_generato:25,sconto_riferimento:'40+15+10'}};
describe('Commercial handoff projection',()=>{
 it('only exposes sales fields and copies plain Italian values',()=>{
  const d=salesDocument('quote',JSON.stringify(quote));
  expect(d.rows[0]).toEqual({code:'001A',description:'Bandella',quantity:'20',netPrice:'12,50',listPrice:'25,00',discount:'40+15+10'});
  expect(JSON.stringify(d)).not.toMatch(/SECRET|full_cost|margine|note_fornitori/);
  expect(salesText(d)).toContain('Consegna concordata');
  expect(copyNumber(1588.13)).toBe('1588,13');
 });
 it('does not assign a global list price to the wrong product',()=>{
  const d=salesDocument('quote',JSON.stringify({...quote,prodotti:[...quote.prodotti,{...quote.prodotti[0],codice:'B'}]}));
  expect(d.rows[1].listPrice).toBe('');expect(d.rows[1].discount).toBe('');
 });
 it('rejects drafts and incomplete quantities/prices',()=>{
  expect(()=>salesDocument('quote',JSON.stringify({...quote,stato_preventivo:'bozza'}))).toThrow();
  expect(()=>salesDocument('quote',JSON.stringify({...quote,prodotti:[{quantita:0}]}))).toThrow();
  expect(()=>salesDocument('offer',JSON.stringify({righe:[{lotto:5}]}))).toThrow();
 });
 it('retains sequential discounts and manual offer price',()=>{
  const d=salesDocument('offer',JSON.stringify({righe:[{codice:'A',descrizione:'Articolo',lotto:50,listino:10,sconto_base:'40+15',extra:10,netto:4.59,prezzi_lotti:{'50':{prezzo_netto_manuale:4.4}},full_cost:3}]}));
  expect(d.rows[0].discount).toBe('40+15+10%');expect(d.rows[0].netPrice).toBe('4,40');
 });
});
