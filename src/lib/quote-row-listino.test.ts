import {it,expect} from 'vitest';
import {buildRowListino,rowListinoDiscountLabel} from './quote-row-listino';
import {blankQuote,blankProduct,calculateQuote} from './quote-calculation';
import {formatQuoteForCopy} from './quote-copy';
import {salesDocument} from './commercial-handoff';
import {buildQuoteWizardSteps,quoteWizardStepError} from './quote-wizard-steps';
import {quoteOttoneError} from './quote-ottone';
const row=()=>({...blankProduct(),codice:'ABC',descrizione:'Bandella',quantita:2,materiale_prodotto:'ferro',gruppo_merceologico:'Bandelle',oggetto_modifica:['occhio'],materiale_cad:10,prezzo_manuale:54});
const quote=()=>({...blankQuote(),cliente:'Test',prodotti:[row()]});
it('R5-P01: example 40+10% yields finite gross 100 from net 54',()=>expect(buildRowListino(54,'40+10%')?.listino).toBe(100));
it('R5-P02: valid plain sequential discount works',()=>expect(buildRowListino(54,'40+10')?.listino).toBe(100));
it.each(['abc','50++10','50+','+','1e1','50+10+5+2','100'])('R5-P03: rejects invalid inverse discount %s',s=>expect(()=>buildRowListino(54,s)).toThrow());
it('R5-P04: labels never duplicate percent signs',()=>expect(rowListinoDiscountLabel('40+10%')).toBe('40% + 10%'));
it('R5-P05: engine persists gross without changing net',()=>{
 const d=calculateQuote({...quote(),prodotti:[{...row(),genera_listino:true,sconto_cliente:'40+10'}]});expect(d.prodotti[0].prezzo_netto_unitario_finale).toBe(54);expect(d.prodotti[0].listino_lordo).toBe(100);
});
it('R5-P06: manual price changes recalculate gross',()=>{
 const d=calculateQuote({...quote(),prodotti:[{...row(),genera_listino:true,sconto_cliente:'50',listino_lordo:100,prezzo_manuale:60}]});expect(d.prodotti[0].listino_lordo).toBe(120);
});
it('R5-P07: generated listino appears in handoff and copy',()=>{
 const d=calculateQuote({...quote(),prodotti:[{...row(),genera_listino:true,sconto_cliente:'50'}]});expect(salesDocument('quote',JSON.stringify(d)).rows[0].listPrice).toBe('108,00');expect(formatQuoteForCopy(d)).toContain('Prezzo listino: 108,00');
});
it('R5-P08: historic indexed listino handoff is executable',()=>{
 const d={...calculateQuote(quote()),listino:{product_index_riferimento:0,prezzo_listino_generato:100,sconto_riferimento:'40+10%'}};expect(salesDocument('quote',JSON.stringify(d)).rows[0].listPrice).toBe('100,00');
});
it('R5-P09: historic code reference survives in copy',()=>{
 const d={...calculateQuote(quote()),listino:{codice_riferimento:'ABC',prezzo_listino_generato:100,sconto_riferimento:'40+10%'}};expect(formatQuoteForCopy(d)).toContain('Prezzo listino: 100,00');
});
it('R5-P10: explicit opt-out overrides historic fallback',()=>{
 const d:Record<string,any>={...calculateQuote(quote()),listino:{product_index_riferimento:0,prezzo_listino_generato:100,sconto_riferimento:'40+10%'}};d.prodotti[0].genera_listino=false;expect(formatQuoteForCopy(d)).not.toContain('Prezzo listino:');
});
it('R5-P11: mobile exposes the per-row choice',()=>expect(buildQuoteWizardSteps(quote(),true).filter(s=>s.index===0).map(s=>s.field)).toContain('genera_listino'));
it('R5-P12: removed document steps stay removed and advanced notes remain',()=>{
 const ids=buildQuoteWizardSteps(quote(),true).map(s=>s.id);expect(ids).not.toContain('listino_prodotto');expect(ids).not.toContain('listino_sconto');expect(ids).toContain('target_totale');expect(ids).toContain('note_cliente');
});
it('R5-P13: brass validator blocks painted or textured',()=>{
 expect(quoteOttoneError({...row(),materiale_prodotto:'ottone'},true)).toContain('ottone');expect(quoteOttoneError({...row(),materiale_prodotto:'ottone',nero_standard_goffrato:true},false)).toContain('ottone');expect(quoteOttoneError({...row(),materiale_prodotto:'ottone'},false)).toBeNull();
});
it('R5-P14: mobile detects brass conflict early',()=>{
 const d={...quote(),verniciatura_ral:{color:'6021',textured:false},prodotti:[{...row(),materiale_prodotto:'ottone'}]};const s=buildQuoteWizardSteps(d).find(s=>s.field==='materiale_prodotto')!;expect(quoteWizardStepError(s,d)).toMatch(/ottone/);
});
it('R5-P15: gross follows RAL and target without changing totals',()=>{
 const d={...quote(),target_totale:120,verniciatura_ral:{color:'6021',textured:false},prodotti:[{...row(),codice:'FCA00504HBIN',prezzo_manuale:null,genera_listino:true,sconto_cliente:'50'}]};
 const base=calculateQuote({...d,prodotti:[{...d.prodotti[0],genera_listino:false}]}),out=calculateQuote(d);expect(out.totale_finale).toBe(base.totale_finale);expect(out.prodotti[0].listino_lordo).toBe(Math.ceil(out.prodotti[0].prezzo_netto_unitario_finale*200)/100);
});
it('R5-P16: series and forfait ignore inactive custom listino fields',()=>{
 const d=calculateQuote({...quote(),prodotti:[{...row(),prodotto_di_serie:true,prezzo_serie:100,sconto_serie:'50',genera_listino:true,sconto_cliente:'abc'},{...row(),a_forfait:true,valore_forfait:30,genera_listino:true,sconto_cliente:'abc'}]});
 const out=salesDocument('quote',JSON.stringify(d));expect(out.rows[0].listPrice).toBe('100,00');expect(out.rows[0].netPrice).toBe('50,00');expect(out.rows[1].listPrice).toBe('');expect(out.rows[1].netPrice).toBe('30,00');
});
it('R5-P17: legacy monetary snapshots are read without recomputing',()=>{
 const d={...calculateQuote(quote()),listino:{descrizione_riferimento:'Bandella',prezzo_listino_generato:123.45,sconto_riferimento:'50'}};const before=JSON.stringify(d);expect(salesDocument('quote',before).rows[0].listPrice).toBe('123,45');expect(formatQuoteForCopy(d)).toContain('123,45');expect(JSON.stringify(d)).toBe(before);
});
it('R5-P18: opt-in rejects invalid discounts; opt-out preserves net',()=>{
 for(const s of ['', 'abc','100'])expect(()=>calculateQuote({...quote(),prodotti:[{...row(),genera_listino:true,sconto_cliente:s}]})).toThrow();
 const d=calculateQuote({...quote(),prodotti:[{...row(),genera_listino:false,sconto_cliente:'abc',listino_lordo:108}]});expect(d.prodotti[0].prezzo_netto_unitario_finale).toBe(54);expect(formatQuoteForCopy(d)).not.toContain('Prezzo listino:');
});
