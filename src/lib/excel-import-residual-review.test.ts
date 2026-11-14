import {describe,it,expect} from 'vitest';
import {extractF3Letters} from './excel-f3-letters';
import {applyF3FieldOverride} from './excel-import-field-override';
import {validateImportDraft} from './excel-import-validation';
import type {WorkbookEvidence,CellEvidence,ProductDraft} from '../types/excel-import';

function workbook(changes:Record<string,string|number>={}):WorkbookEvidence {
 const cells:Record<string,CellEvidence>={};
 const put=(row:number,column:number,value:string|number)=>{const address=String.fromCharCode(64+column)+row;cells[address]={address,row,column,raw:value,displayText:String(value),hiddenRow:false,hiddenColumn:false};};
 put(1,1,'SYNTHETIC');
 ['TIPO COSTO','MATERIALE','VOCE DI COSTO','LUNGHEZZA','LARGHEZZA','SPESSORE','PESO LORDO','PESO NETTO','NR COMPONENTI','FORNITORE','COLPI/MIN','UM','TARIFFA FORNITURA','TARIFFA LAVORO','TOTALE'].forEach((v,i)=>put(2,i+1,v));
 for(const row of [4,5,6]){put(row,1,'c');put(row,3,'Base '+row);put(row,9,1);put(row,12,'pz');put(row,13,1);put(row,15,1);}
 put(8,3,'Finitura A');put(11,3,'Finitura B');
 for(const [row,cost] of [[9,.2],[12,.3],[13,.4]]){put(row,3,'Trattamento '+row);put(row,9,1);put(row,12,'pz');put(row,13,cost);put(row,15,cost);}
 put(20,3,'ATTREZZAGGI');[60,60,20,20,20].forEach((value,i)=>{put(21+i,3,'Setup '+i);put(21+i,4,value);});
 for(const [address,value] of Object.entries(changes))Object.assign(cells[address],{raw:value,displayText:String(value)});
 return {fileName:'synthetic.xls',sha256:'a'.repeat(64),byteLength:1,parserVersion:'test',sheets:[{name:'renamed',hidden:false,cells,merges:[],effectiveRows:25,effectiveColumns:15}]};
}
function prepared(changes:Record<string,string|number>={},index=0){const d=extractF3Letters(workbook(changes));d.products.forEach((p,n)=>p.selected=n===index);d.economicPolicy={currency:'EUR',labourEurPerMinute:.35,lot:1000,overheadFraction:0,marginFraction:0};return d;}
const allProblems=(p:ProductDraft)=>[...p.problems,...p.rows.flatMap(r=>r.problems)];

describe('RESIDUAL independent review corrections',()=>{
 it('isolates setup metadata and source evidence between variants',()=>{
  const [a,b]=prepared().products;expect(a.setupState).not.toBe(b.setupState);expect(a.setupState!.sources).not.toBe(b.setupState!.sources);
  a.setupState!.lot=999;a.setupState!.sources[0].original[0]='changed';
  expect(b.setupState!.lot).toBeUndefined();expect(b.setupState!.sources[0].original[0]).toBe('ATTREZZAGGI');
 });
 it('does not carry a parse error from an unselected finish into the other product',()=>{
  const first=prepared({M12:'ambiguous'},0);expect(validateImportDraft(first).valid).toBe(true);
  expect(allProblems(first.products[0]).some(p=>p.code==='F3_RATE_12')).toBe(false);
  const second=prepared({M12:'ambiguous'},1);expect(validateImportDraft(second).valid).toBe(false);
 });
 it('resolves I4 quantity in both row and product while retaining original evidence',()=>{
  const d=prepared({I4:'ambiguous'});const row=d.products[0].rows.find(r=>r.excelRow===4)!;
  d.products[0]=applyF3FieldOverride(d.products[0],row.key,'nr_componenti',1);
  const problems=allProblems(d.products[0]).filter(p=>p.code==='F3_QUANTITY_4');
  expect(problems.length).toBeGreaterThan(0);expect(problems.every(p=>p.resolved)).toBe(true);
  expect(allProblems(d.products[0]).filter(p=>p.severity==='error'&&!p.resolved)).toHaveLength(0);
  expect(validateImportDraft(d).valid).toBe(true);expect(d.products[0].rows[0].sources.nr_componenti.original).toEqual(['ambiguous']);
 });
 it('retains a price error and the same quantity error on another row',()=>{
  const d=prepared({I4:'ambiguous',I5:'other quantity',M4:'price error'});const p=d.products[0];
  d.products[0]=applyF3FieldOverride(p,p.rows.find(r=>r.excelRow===4)!.key,'nr_componenti',1);
  const problems=allProblems(d.products[0]);expect(problems.filter(p=>p.code==='F3_QUANTITY_4').every(p=>p.resolved)).toBe(true);
  for(const code of ['F3_QUANTITY_5','F3_RATE_4']){const other=problems.filter(p=>p.code===code);expect(other.length).toBeGreaterThan(0);expect(other.every(p=>!p.resolved)).toBe(true);}
  expect(validateImportDraft(d).valid).toBe(false);
 });
 it('does not resolve a quantity with zero and reopens the issue when an override is cleared',()=>{
  const d=prepared({I4:'ambiguous'});const key=d.products[0].rows[0].key;
  let p=applyF3FieldOverride(d.products[0],key,'nr_componenti',0);expect(allProblems(p).filter(p=>p.code==='F3_QUANTITY_4').every(p=>!p.resolved)).toBe(true);
  p=applyF3FieldOverride(p,key,'nr_componenti',1);expect(allProblems(p).filter(p=>p.code==='F3_QUANTITY_4').every(p=>p.resolved)).toBe(true);
  p=applyF3FieldOverride(p,key,'nr_componenti',undefined);expect(allProblems(p).filter(p=>p.code==='F3_QUANTITY_4').every(p=>!p.resolved)).toBe(true);
 });
});
