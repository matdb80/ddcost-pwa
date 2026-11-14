import {describe,it,expect} from 'vitest';
import {extractF3Letters,setupMinutes,applyOptionSelection,currentSetupState} from './excel-f3-letters';
import {asValidatedDraft,validateImportDraft} from './excel-import-validation';
import {buildValidatedPreview} from './excel-import-to-cycle';
import type {WorkbookEvidence,CellEvidence} from '../types/excel-import';
function fixture(options=false,dr=0,dc=0):WorkbookEvidence{
 const cells:Record<string,CellEvidence>={};const put=(r:number,c:number,v:string|number)=>{r+=dr;c+=dc;const address=String.fromCharCode(64+c)+r;cells[address]={address,row:r,column:c,raw:v,displayText:String(v),hiddenRow:false,hiddenColumn:false}};
 put(1,1,'F3TEST');
 ['TIPO COSTO (c=componente;m=materia prima;w=lavorazione interna)','TIPO MATERIALE','VOCE DI COSTO LAVORAZIONI INTERNE','DIMENSIONI MATERIALI TRANCIATO','','','peso compreso sfrido','peso senza sfrido','nr.componenti','fornitore','colpi/min','um','C.U. fornitura (€/u.m.)','C.U. orario (€/min)','TOT.VOCE DI COSTO (€)'].forEach((v,i)=>{if(v)put(2,i+1,v)});
 for(const [r,kind,label] of [[4,'m','Lamiera'],[5,'w','Stampaggio'],[6,'c','Acquisto']] as const){put(r,1,kind);put(r,3,label);put(r,9,1)}
 put(4,4,125);put(4,5,40);put(4,6,1.5);put(4,7,.0585);put(4,12,'kg');put(4,13,.65);put(4,15,.038025);
 put(5,7,'---');put(5,11,10);put(5,12,'min');put(5,14,.3);put(5,15,.03);
 put(6,7,'---');put(6,12,'pz');put(6,13,2);put(6,15,2);
 put(8,3,'COSTI COMPLESSIVI SUDDIVISI PER FINITURA');put(9,3,options?'NERO':'SILVER');if(options)put(9,4,'SCELTA');
 for(let r=10;r<=(options?13:10);r++){put(r,3,'Trattamento '+r);put(r,9,1);put(r,12,'pz');put(r,13,.1*r);put(r,15,.1*r)}
 if(options){put(10,4,'X');put(12,4,'X')}
 put(15,14,'C.P. (senza attrezzaggi)');put(16,3,'ATTREZZAGGI');put(17,3,'Stampo');put(17,4,'min');put(17,11,'per lotto da pz:');put(18,11,200);
 [60,60,20,20,20].forEach((v,i)=>{put(18+i,3,'Dettaglio '+i);put(18+i,4,v)});put(25,4,160);put(25,5,57.6);
 return {fileName:'synthetic.xlsx',sha256:'a'.repeat(64),byteLength:1,parserVersion:'test',sheets:[{name:'sheet',hidden:false,cells,merges:[],effectiveRows:25+dr,effectiveColumns:15+dc}]};
}
function draft(options=false){const d=extractF3Letters(fixture(options));d.products[0].selected=true;d.economicPolicy={currency:'EUR',labourEurPerMinute:.3,lot:200,overheadFraction:0,marginFraction:0};return d}
describe('FINAL review corrections',()=>{
 it('recognizes real-style O header and retains historical total',()=>{expect(draft().products[0].historicalDirectCostEur).toBeCloseTo(3.068025,12)});
 it('does not add the unnamed setup summary',()=>{const p=draft().products[0];expect(p.rows.filter(r=>r.kind==='setup')).toHaveLength(5);expect(setupMinutes(p)).toBe(180);expect(p.setupState?.sources.some(s=>s.original.includes(160))).toBe(true)});
 it('reads lot under its header and ignores senza attrezzaggi as section title',()=>{expect(draft().products[0].setupState?.lot).toBe(200)});
 it('reads X from SCELTA and excludes setup headings from options',()=>{const p=draft(true).products[0];expect(p.options).toHaveLength(4);expect(p.options?.map(o=>o.historicalSelected)).toEqual([true,false,true,false]);expect(p.options?.some(o=>o.label==='Stampo')).toBe(false)});
 it('separates current and historical selection',()=>{const p=draft(true).products[0];const changed=applyOptionSelection(p,p.options![0].key,false);expect(changed.options![0].selected).toBe(false);expect(changed.options![0].historicalSelected).toBe(true)});
 it('does not let an alternative exclusion bypass mandatory costs',()=>{const d=draft(true);expect(validateImportDraft(d).valid).toBe(true);d.products[0].rows[0].included=false;expect(validateImportDraft(d).valid).toBe(false)});
 it('retains mandatory finish rows without a SCELTA column',()=>{const p=draft().products[0];expect(p.options![0].required).toBe(true);expect(applyOptionSelection(p,p.options![0].key,false).options![0].selected).toBe(true)});
 it('uses current edited setup in display and provenance',()=>{const d=draft(true);d.products[0].rows.find(r=>r.kind==='setup')!.row.attrezzaggio_min=80;expect(setupMinutes(d.products[0])).toBe(200);const preview=buildValidatedPreview(asValidatedDraft(d));expect(preview.provenance.setupState?.minutes).toBe(200);expect(preview.provenance.options).toHaveLength(4)});
 it('keeps explicit zero separate from missing',()=>{const d=draft();d.products[0].rows.filter(r=>r.kind==='setup').forEach(r=>r.row.attrezzaggio_min=0);expect(currentSetupState(d.products[0])?.status).toBe('explicit-zero');expect(setupMinutes(d.products[0])).toBe(0);expect(validateImportDraft(d).valid).toBe(true)});
 it('keeps dimensions and setup after row/column introduction',()=>{const p=extractF3Letters(fixture(true,2,1)).products[0];expect(p.rows[0].row).toMatchObject({lunghezza:125,larghezza:40,spessore:1.5,peso_kg:.0585});expect(setupMinutes(p)).toBe(180);expect(p.setupState?.lot).toBe(200);expect(p.options?.filter(o=>o.historicalSelected)).toHaveLength(2)});
 it('O cannot override M and labour sources are retained',()=>{const w=fixture();w.sheets[0].cells.O4.raw=999;const p=extractF3Letters(w).products[0];expect(p.rows[0].row.costo_unitario).toBe(.65);expect(p.rows[1].sources.tariffa_storica.addresses).toContain('N5')});
 it('blocks combined independent finish groups until product splitting is implemented',()=>{const w=fixture();const s=w.sheets[0];s.cells.C11={address:'C11',row:11,column:3,raw:'ALTRO',displayText:'ALTRO',hiddenRow:false,hiddenColumn:false};const p=extractF3Letters(w).products[0];expect(p.problems.some(x=>x.code==='F3_VARIANTS_REQUIRED')).toBe(true);expect(p.historicalDirectCostEur).toBeUndefined()});
});
