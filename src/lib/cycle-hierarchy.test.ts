import { describe, expect, it } from "vitest";
import { emptyRiga, emptyCicloEditorModel, parseCycleRow, serializeCycleDataJson, type RigaCiclo } from "@/types/cycle";
import { adjacentSibling, attachToAssembly, appendChildToAssembly, canAddChild, childrenOf, detachFromAssembly, orderedHierarchy, removeLeaf, moveRowAmongSiblings, swapRows } from "./cycle-hierarchy";
import { ricalcolaCiclo, calcolaBreakdown, calcolaCostoRiga, costoRigaGerarchico } from "./cycle-calculator";

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
 it("keeps a row reference lot inside assemblies; excluding it sets setup to zero",()=>{
   let r=[row("Assembly",0),{
     ...row("Internal work",0),
     categoria:"LAVORAZIONE INTERNA" as const,
     colpi_min:2,attrezzaggio_min:20,lotto_voce:300,
   }];
   r=attachToAssembly(r,1,0);
   const cycle={...make(r),lotti_personalizzati:[25,100]};
   const a=ricalcolaCiclo(cycle);
   expect(a.costo_standard).toBeCloseTo(0.175+7/300,10);
   expect(a.simulazioni.map((simulation)=>simulation.costo_standard)).toEqual([
     0.175+7/300,0.175+7/300,
   ]);
   expect(a.simulazioni.map((simulation)=>simulation.attrezzaggio_pz)).toEqual([7/300,7/300]);
   const b=ricalcolaCiclo({...cycle,righe:r.map((v,i)=>i===1?{...v,considera:false}:v)});
   expect(b.costo_standard).toBe(0);
   expect(b.simulazioni[0].attrezzaggio_pz).toBe(0);
 });
 it("uses the larger row or simulated lot and can force the row lot",()=>{
   const setupRow={
     ...row("Setup",0),
     categoria:"LAVORAZIONE INTERNA" as const,
     attrezzaggio_min:10,
     lotto_voce:20,
   };
   const cycle={...make([setupRow]),lotti_personalizzati:[10,100],costo_lavoro_min:0.6};
   const withReference=ricalcolaCiclo(cycle);
   expect(withReference.costo_standard).toBeCloseTo(0.06,10);
   expect(withReference.simulazioni.map((s)=>s.costo_standard)).toEqual([0.3,0.06]);
   expect(withReference.simulazioni.map((s)=>s.attrezzaggio_pz)).toEqual([0.3,0.06]);
   const forcedToRowLot=ricalcolaCiclo(cycle,"row");
   expect(forcedToRowLot.costo_standard).toBeCloseTo(0.3,10);
   expect(forcedToRowLot.simulazioni.map((s)=>s.costo_standard)).toEqual([0.3,0.3]);

   const bySimulation=ricalcolaCiclo({...cycle,righe:[{...setupRow,lotto_voce:0}]});
   expect(bySimulation.simulazioni.map((s)=>s.costo_standard)).toEqual([0.6,0.06]);
   expect(bySimulation.simulazioni.map((s)=>s.attrezzaggio_pz)).toEqual([0.6,0.06]);
 });
 it("calculates packaging labor per finished piece and preserves it through a save/revision round trip",()=>{
   const packagingRow={
     ...row("Confezionamento",0,4),
     categoria:"LAVORAZIONE INTERNA" as const,
     colpi_min:2,
     confezionamento:true,
     quantita_per_conf:25,
     tempo_confezionamento_min:10,
     attrezzaggio_min:15,
     lotto_voce:0,
   };
   const cycle={...make([packagingRow]),lotto:"25",costo_lavoro_min:0.34,lotti_personalizzati:[25,100]};
   const calculated=ricalcolaCiclo(cycle);
   expect(calcolaCostoRiga(packagingRow,0.34,25)).toBeCloseTo(0.34,10);
   expect(calculated.simulazioni.map((simulation)=>simulation.costo_standard)).toEqual([
     expect.closeTo(0.34,10),expect.closeTo(0.187,10),
   ]);
   expect(calculated.simulazioni.map((simulation)=>simulation.breakdown["LAVORAZIONE INTERNA"])).toEqual([
     expect.closeTo(0.34,10),expect.closeTo(0.187,10),
   ]);

   const savedJson=JSON.stringify(serializeCycleDataJson(calculated));
   const reopened=parseCycleRow({code:"PKG",lot:"25",standardCost:String(calculated.costo_standard),dataJson:savedJson});
   expect(reopened.righe[0]).toMatchObject({
     confezionamento:true,quantita_per_conf:25,tempo_confezionamento_min:10,colpi_min:2,
   });
   const revision=ricalcolaCiclo(reopened);
   expect(revision.simulazioni.map((simulation)=>simulation.costo_standard)).toEqual([
     expect.closeTo(0.34,10),expect.closeTo(0.187,10),
   ]);

   const historicalRow=Object.fromEntries(Object.entries(packagingRow)
     .filter(([key])=>!(["confezionamento","quantita_per_conf","tempo_confezionamento_min"] as string[]).includes(key))) as unknown as RigaCiclo;
   historicalRow.attrezzaggio_min=0;
   expect(calcolaCostoRiga(historicalRow,0.34,25)).toBeCloseTo(0.68,10);
 });
 it("forces the cycle lot only for the selected simulation row",()=>{
   const setupRow={
     ...row("Invito",0),
     categoria:"LAVORAZIONE INTERNA" as const,
     attrezzaggio_min:20,
     lotto_voce:300,
   };
   const cycle={...make([setupRow]),costo_lavoro_min:0.32,lotti_personalizzati:[25,500,1000]};
   const automatic=ricalcolaCiclo(cycle);
   const selected=ricalcolaCiclo(cycle,"max",new Set([1]));
   expect(automatic.simulazioni.map((simulation)=>simulation.attrezzaggio_pz)).toEqual([
     20*0.32/300,20*0.32/500,20*0.32/1000,
   ]);
   expect(selected.simulazioni.map((simulation)=>simulation.attrezzaggio_pz)).toEqual([
     20*0.32/300,20*0.32/300,20*0.32/1000,
   ]);
   expect(selected.simulazioni[0].costo_standard).toBe(automatic.simulazioni[0].costo_standard);
   expect(selected.simulazioni[2].costo_standard).toBe(automatic.simulazioni[2].costo_standard);
 });
 it("uses the row lot for setup, then the simulation lot when the row lot is zero",()=>{
   const setupRow={
     ...row("Setup",0),
     categoria:"LAVORAZIONE INTERNA" as const,
     attrezzaggio_min:10,
     lotto_voce:100,
   };
   const cycle={...make([setupRow]),costo_lavoro_min:24/60,lotti_personalizzati:[100,200]};
   const fixedReference=ricalcolaCiclo(cycle);
   expect(fixedReference.costo_standard).toBeCloseTo(0.04,10);
   expect(fixedReference.simulazioni.map((simulation)=>simulation.costo_standard)).toEqual([0.04,0.02]);
   expect(fixedReference.simulazioni.map((simulation)=>simulation.attrezzaggio_pz)).toEqual([0.04,0.02]);
   expect(ricalcolaCiclo(cycle,"row").simulazioni.map((simulation)=>simulation.attrezzaggio_pz)).toEqual([0.04,0.04]);

   const emptyReference=ricalcolaCiclo({...cycle,righe:[{...setupRow,lotto_voce:0}]});
   expect(emptyReference.simulazioni.map((simulation)=>simulation.costo_standard)).toEqual([0.04,0.02]);
   expect(emptyReference.simulazioni.map((simulation)=>simulation.attrezzaggio_pz)).toEqual([0.04,0.02]);
 });
 it("uses Lotto Voce when present and the simulated lot only for rows without it",()=>{
   const setupRow={
     ...row("Invito",0),
     categoria:"LAVORAZIONE INTERNA" as const,
     colpi_min:5,
     attrezzaggio_min:20,
     lotto_voce:300,
   };
   const fallbackSetupRow={
     ...row("Altra lavorazione interna",0),
     categoria:"LAVORAZIONE INTERNA" as const,
     colpi_min:5,
     attrezzaggio_min:40,
     lotto_voce:0,
   };
   const lots=[25,50,100,250,500,1000];
   const cycle={...make([setupRow,fallbackSetupRow]),costo_lavoro_min:0.32,lotti_personalizzati:lots};
   const calculated=ricalcolaCiclo(cycle);
   const expectedSetup=lots.map((lot)=>20*0.32/Math.max(300,lot)+(40*0.32)/lot);
   const expectedStandard=lots.map((lot)=>0.128+20*0.32/Math.max(300,lot)+(40*0.32)/lot);
   expect(calculated.costo_standard).toBeCloseTo(0.128+20*0.32/300+(40*0.32)/100,10);
   expectedSetup.forEach((expected,index)=>
     expect(calculated.simulazioni[index].attrezzaggio_pz).toBeCloseTo(expected,10)
   );
   expectedStandard.forEach((expected,index)=>
     expect(calculated.simulazioni[index].costo_standard).toBeCloseTo(expected,10)
   );
   expect(calculated.simulazioni[0].costo_standard).toBeGreaterThan(
     calculated.simulazioni[calculated.simulazioni.length-1].costo_standard,
   );
   const forced=ricalcolaCiclo(cycle,"row");
   lots.forEach((lot,index)=>expect(forced.simulazioni[index].attrezzaggio_pz).toBeCloseTo(
     20*0.32/300+(40*0.32)/lot,10,
   ));
   const noSetup=ricalcolaCiclo({...cycle,righe:cycle.righe.map((setup)=>({...setup,attrezzaggio_min:0}))});
   noSetup.simulazioni.forEach((simulation)=>expect(simulation.costo_standard).toBeCloseTo(0.128,10));
 });
 it("adds a direct component by + and keeps cost, parent and independent rows after a reload",()=>{
   const old=[row("Assembly",0),row("Other row",3)];
   const original=JSON.stringify(old);
   const added=appendChildToAssembly(old,0,{...row("Child L2",2),codice_articolo:"P-002"});
   expect(JSON.stringify(old)).toBe(original);
   expect(added[0].assembly_auto).toBe(true);
   expect(added[2].parent_idx).toBe(0);
   const loaded=ricalcolaCiclo(make(added));
   const reopened=parseCycleRow({code:"C",lot:"100",
      dataJson:JSON.stringify(serializeCycleDataJson(loaded))});
   expect(orderedHierarchy(reopened.righe).map(v=>v.depth)).toEqual([1,2,1]);
   expect(reopened.righe[2].codice_articolo).toBe("P-002");
   expect(reopened.costo_standard).toBe(5);
 });
 it("can add a nested operation through level 3 and 4, but never level 5",()=>{
   let rows=[row("Root",0)];
   rows=appendChildToAssembly(rows,0,row("Level 2",0));
   rows=appendChildToAssembly(rows,1,row("Level 3",0));
   rows=appendChildToAssembly(rows,2,{...row("Level 4 operation",0),categoria:"LAVORAZIONE INTERNA" as const,colpi_min:2});
   expect(orderedHierarchy(rows).map(x=>x.depth)).toEqual([1,2,3,4]);
   expect(canAddChild(rows,3)).toBe(false);
   expect(()=>appendChildToAssembly(rows,3,row("Level 5",1))).toThrow(/quarto livello/);
   expect(ricalcolaCiclo(make(rows)).costo_standard).toBeCloseTo(0.175);
 });
 it("never converts historical detail expansion into calculated assembly",()=>{
   const historical=[{...row("Old manual assembly",8),categoria:"COMPONENTE/ASSIEME" as const},
     {...row("Old expansion",15),parent_idx:0}];
   expect(canAddChild(historical,0)).toBe(false);
   expect(()=>appendChildToAssembly(historical,0,row("New child",3))).toThrow();
   expect(ricalcolaCiclo(make(historical)).costo_standard).toBe(8);
 });
 it("enables up/down arrows among siblings even with four-level hierarchies",()=>{
   let rows=[
     {...row("Main",0),codice_articolo:"ROOT"},
     {...row("Other root",2),codice_articolo:"OTHER"},
     {...row("Child A",3),codice_articolo:"A"},
     {...row("Child B",4),codice_articolo:"B"},
     {...row("Under B",5),codice_articolo:"NEST"},
   ];
   rows=attachToAssembly(rows,2,0);
   rows=attachToAssembly(rows,3,0);
   rows=attachToAssembly(rows,4,3);
   const original=JSON.stringify(rows);
   expect(adjacentSibling(rows,3,-1)).toBe(2);
   expect(adjacentSibling(rows,3,1)).toBeNull();
   expect(adjacentSibling(rows,1,-1)).toBe(0);
   const before=ricalcolaCiclo(make(rows)).costo_standard;
   const moved=moveRowAmongSiblings(rows,3,-1);
   const order=orderedHierarchy(moved).map(x=>moved[x.index].codice_articolo);
   expect(order).toEqual(["ROOT","B","NEST","A","OTHER"]);
   expect(moved[4].parent_idx).toBe(2);
   expect(orderedHierarchy(moved).map(x=>x.depth)).toEqual([1,2,3,2,1]);
   expect(ricalcolaCiclo(make(moved)).costo_standard).toBe(before);
   expect(JSON.stringify(rows)).toBe(original);
   expect(moveRowAmongSiblings(rows,2,-1)).toBe(rows); // first child
   expect(moveRowAmongSiblings(rows,1,1)).toBe(rows); // last root
 });
 it("moves top-level items while preserving child references",()=>{
   let rows=[
     {...row("A",0),codice_articolo:"A"},
     {...row("B",0),codice_articolo:"B"},
     {...row("C",1),codice_articolo:"C"},
   ];
   rows=attachToAssembly(rows,2,0);
   const moved=moveRowAmongSiblings(rows,1,-1);
   expect(orderedHierarchy(moved).map(x=>moved[x.index].codice_articolo)).toEqual(["B","A","C"]);
   expect(moved[2].parent_idx).toBe(1);
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
