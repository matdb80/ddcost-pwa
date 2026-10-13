import { describe, expect, it } from "vitest";
import { emptyRiga, emptyCicloEditorModel, type RigaCiclo } from "@/types/cycle";
import { attachToAssembly, childrenOf, detachFromAssembly, orderedHierarchy, removeLeaf, swapRows } from "./cycle-hierarchy";
import { ricalcolaCiclo, calcolaBreakdown, costoRigaGerarchico } from "./cycle-calculator";

const row=(desc:string,unit:number,nr=1):RigaCiclo=>({
  ...emptyRiga(), descrizione:desc, costo_unitario:unit,nr_componenti:nr,
});
const make=(righe:RigaCiclo[])=>({...emptyCicloEditorModel(),lotto:"100",righe,costo_lavoro_min:0.35});
describe("DDCost four-level assemblies and nonpersisted simulation",()=>{
 it("dragging a component onto another assembles recursively to four levels with no double count",()=>{
   let r=[row("ROOT",999),row("L2",0,2),row("L3",0),row("L4",2,3),row("Extra",5)];
   r=attachToAssembly(r,3,2);
   r=attachToAssembly(r,2,1);
   r=attachToAssembly(r,1,0);
   r=attachToAssembly(r,4,0);
   expect(orderedHierarchy(r).map(x=>x.depth)).toEqual([1,2,3,4,2]);
   expect(costoRigaGerarchico(r,0,0.35,100)).toBe(17);
   const calculated=ricalcolaCiclo(make(r));
   expect(calculated.costo_standard).toBe(17);
   expect(calculated.breakdown["COMPONENTE/ASSIEME"]).toBe(17);
   expect(calculated.breakdown.COMPONENTE).toBe(0);
   expect(calculated.simulazioni[0].costo_standard).toBe(17);
   expect(r[0].costo_unitario).toBe(999); // historical manual value not destroyed
 });
 it("refuses a fifth level and circular drag, without mutating the source",()=>{
   let r=[row("A",0),row("B",0),row("C",0),row("D",0),row("E",0)];
   r=attachToAssembly(r,3,2);
   r=attachToAssembly(r,2,1);
   r=attachToAssembly(r,1,0);
   const before=JSON.stringify(r);
   expect(()=>attachToAssembly(r,4,3)).toThrow(/quattro livelli/);
   expect(()=>attachToAssembly(r,0,3)).toThrow(/se stesso/);
   expect(JSON.stringify(r)).toBe(before);
 });
 it("does not reinterpret historical parent_idx as auto-calculated assembly",()=>{
   const r=[{...row("Old assembly",10),categoria:"COMPONENTE/ASSIEME" as const},
     {...row("Legacy detail",50),parent_idx:0}];
   const original=JSON.stringify(r);
   expect(calcolaBreakdown(make(r))["COMPONENTE/ASSIEME"]).toBe(10);
   expect(ricalcolaCiclo(make(r)).costo_standard).toBe(10);
   expect(JSON.stringify(r)).toBe(original);
   expect(()=>attachToAssembly(r,1,0)).toThrow();
 });
 it("simulation excludes leaves/assemblies then restores identical baseline without changing source",()=>{
   let r=[row("Assembly",0),row("Part A",7),row("Part B",4)];
   r=attachToAssembly(r,1,0);r=attachToAssembly(r,2,0);
   const cycle=make(r);
   const snapshot=JSON.stringify(cycle);
   const baseline=ricalcolaCiclo(cycle);
   const excludePart=ricalcolaCiclo({...cycle,righe:r.map((v,i)=>i===1?{...v,considera:false}:v)});
   expect(baseline.costo_standard).toBe(11);
   expect(excludePart.costo_standard).toBe(4);
   const excludeAssembly=ricalcolaCiclo({...cycle,righe:r.map((v,i)=>i===0?{...v,considera:false}:v)});
   expect(excludeAssembly.costo_standard).toBe(0);
   expect(ricalcolaCiclo(cycle).costo_standard).toBe(11);
   expect(JSON.stringify(cycle)).toBe(snapshot);
 });
 it("reorders and deletes without leaving dangling parent indexes",()=>{
   let r=attachToAssembly([row("A",1),row("B",2),row("C",3)],2,1);
   r=swapRows(r,0,1);
   expect(r[2].parent_idx).toBe(0);
   r=detachFromAssembly(r,2);
   expect(r[2].parent_idx).toBeNull();
   r=attachToAssembly(r,2,0);
   expect(childrenOf(r,0)).toEqual([2]);
   expect(()=>removeLeaf(r,0)).toThrow(/sgancia/i);
   const after=removeLeaf(r,1);
   expect(after[1].parent_idx).toBe(0);
 });
});
