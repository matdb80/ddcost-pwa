import {describe,it,expect} from 'vitest';
import {extractF3Letters,setF3RowIncluded} from './excel-f3-letters';
import {asValidatedDraft,validateImportDraft} from './excel-import-validation';
import {buildValidatedPreview} from './excel-import-to-cycle';
import type {WorkbookEvidence,CellEvidence} from '../types/excel-import';

function fixture():WorkbookEvidence {
 const cells:Record<string,CellEvidence>={};
 const put=(row:number,column:number,value:string|number)=>{const address=String.fromCharCode(64+column)+row;cells[address]={address,row,column,raw:value,displayText:String(value),hiddenRow:false,hiddenColumn:false};};
 put(1,1,'SYNTHETIC');
 ['TIPO COSTO','TIPO MATERIALE','VOCE DI COSTO','LUNGHEZZA','LARGHEZZA','SPESSORE','PESO LORDO','PESO NETTO','NR COMPONENTI','FORNITORE','COLPI/MIN','UM','TARIFFA FORNITURA','TARIFFA LAVORO','TOT.VOCE DI COSTO'].forEach((v,i)=>put(2,i+1,v));
 put(4,1,'c');put(4,3,'Base');put(4,9,1);put(4,12,'pz');put(4,13,1);put(4,15,1);
 put(7,3,'Finiture');put(7,4,'SCELTA');
 for(const row of [8,9]){put(row,3,'Finitura '+row);put(row,9,1);put(row,12,'pz');put(row,13,2);put(row,15,2);}
 put(8,4,'X');
 return {fileName:'synthetic.xlsx',sha256:'a'.repeat(64),byteLength:1,parserVersion:'synthetic',sheets:[{name:'sheet',hidden:false,cells,merges:[],effectiveRows:9,effectiveColumns:15}]};
}
function prepared(w=fixture()){
 const d=extractF3Letters(w);d.products[0].selected=true;
 d.economicPolicy={currency:'EUR',labourEurPerMinute:.35,lot:200,overheadFraction:0,marginFraction:0};return d;
}
describe('PATCHED residual corrections',()=>{
 it('keeps missing historical cost unknown while a valid current preview can be calculated',()=>{
  const w=fixture();delete w.sheets[0].cells.O4;const d=prepared(w);
  const preview=buildValidatedPreview(asValidatedDraft(d));
  expect(preview.historicalDirectCost).toBeUndefined();expect(preview.difference).toBeUndefined();expect(preview.pwaDirectCost).toBe(3);
  expect(d.products[0].problems).toContainEqual(expect.objectContaining({code:'F3_HISTORICAL_INCOMPLETE',severity:'warning'}));
 });
 it('preserves explicit zero as a valid historical cost',()=>{
  const w=fixture();w.sheets[0].cells.O4.raw=0;w.sheets[0].cells.O4.displayText='0';
  expect(prepared(w).products[0].historicalDirectCostEur).toBe(2);
 });
 it('keeps a formula without cache blocking after the historical fix',()=>{
  const w=fixture();Object.assign(w.sheets[0].cells.O4,{raw:null,cached:null,displayText:'',formula:'I4*M4'});
  const result=validateImportDraft(prepared(w));expect(result.valid).toBe(false);expect(result.draft.problems.some(p=>p.code==='SOURCE_ERROR')).toBe(true);
 });
 it('saves the option selected through the mapping checkbox in provenance',()=>{
  const d=prepared();const p=d.products[0],row=p.rows.find(r=>r.excelRow===9)!;
  d.products[0]=setF3RowIncluded(p,row.key,true);
  const preview=buildValidatedPreview(asValidatedDraft(d));
  expect(preview.model.righe).toHaveLength(3);expect(preview.provenance.options?.find(o=>o.rowKeys.includes(row.key))).toMatchObject({selected:true,historicalSelected:false});
 });
 it('allows deselecting an optional finish from mapping without changing its historical selection',()=>{
  const d=prepared();const p=d.products[0],row=p.rows.find(r=>r.excelRow===8)!;
  d.products[0]=setF3RowIncluded(p,row.key,false);
  const preview=buildValidatedPreview(asValidatedDraft(d));
  expect(preview.model.righe).toHaveLength(1);expect(preview.provenance.options?.find(o=>o.rowKeys.includes(row.key))).toMatchObject({selected:false,historicalSelected:true});
 });
});
