import { describe, expect, it } from "vitest";
import { emptyCicloEditorModel, emptyRiga, type RigaCiclo } from "@/types/cycle";
import { appendChildToAssembly, attachToAssembly } from "./cycle-hierarchy";
import { calcolaBreakdown, calcolaCostoStandard } from "./cycle-calculator";
import { calculateCyclePieCosts } from "./cycle-cost-pie";

function r(p: Partial<RigaCiclo>): RigaCiclo {
  return {...emptyRiga(),...p};
}
function c(righe:RigaCiclo[]){
  return {...emptyCicloEditorModel(),lotto:"100",costo_lavoro_min:0.4,righe};
}

describe("TKT-20261013-12060003 cost breakdown pie",()=>{
  it("groups third party by category, internal by category, vendors by filled supplier, excludes dedicated tooling",()=>{
    const cycle=c([
      r({categoria:"LAVORAZIONE TERZISTA A PEZZO",nr_componenti:2,costo_unitario:3}), // 6
      r({categoria:"LAVORAZIONE TERZISTA A PESO",nr_componenti:1,peso_kg:2,costo_unitario:4,fornitore:"Terzista SpA"}), // 8
      r({categoria:"LAVORAZIONE INTERNA",nr_componenti:1,colpi_min:2,fornitore:"Società A"}), // 0.2
      r({categoria:"COMPONENTE",nr_componenti:2,costo_unitario:5,fornitore:" Fornitore Rossi "}), // 10
      r({categoria:"MATERIA PRIMA DA TRASFORMARE",peso_kg:1,costo_unitario:7,fornitore:"Acciaieria"}), // 7
      r({categoria:"COMPONENTE",costo_unitario:9,fornitore:"   "}), // 9 unclassified
      r({categoria:"SPESA ATTREZZATURA DEDICATA",considera:true,costo_unitario:1000,fornitore:"Toolmaker"}), // 10 excluded
    ]);
    const x=calculateCyclePieCosts(cycle);
    expect(x.terzisti).toBe(14);
    expect(x.interne).toBeCloseTo(0.2);
    expect(x.fornitori).toBe(17);
    expect(x.nonClassificati).toBe(9);
    expect(x.esclusiAttrezzatura).toBe(10);
    expect(x.totaleClassificato).toBeCloseTo(31.2);
    expect(x.totaleSenzaAttrezzatura).toBeCloseTo(40.2);
    expect(calcolaCostoStandard(calcolaBreakdown(cycle))).toBeCloseTo(50.2);
  });
  it("does not count included=false rows or costs from disabled nested assemblies",()=>{
    let rows=[r({categoria:"COMPONENTE",costo_unitario:999}),r({categoria:"COMPONENTE",costo_unitario:2,fornitore:"X"})];
    rows=attachToAssembly(rows,1,0);
    rows[0].considera=false;
    expect(calculateCyclePieCosts(c(rows)).totaleClassificato).toBe(0);
    rows[0].considera=true;
    rows[1].considera=false;
    expect(calculateCyclePieCosts(c(rows)).totaleClassificato).toBe(0);
  });
  it("allocates leaves in nested auto assemblies using each parent multiplier",()=>{
    let rows=[r({codice_articolo:"MAIN",nr_componenti:2,costo_unitario:1000})];
    rows=appendChildToAssembly(rows,0,r({codice_articolo:"SUB",nr_componenti:3}));
    rows=appendChildToAssembly(rows,1,r({codice_articolo:"PART",costo_unitario:4,fornitore:"Vendor"}));
    rows=appendChildToAssembly(rows,1,r({categoria:"LAVORAZIONE INTERNA",colpi_min:2}));
    rows=appendChildToAssembly(rows,0,r({categoria:"LAVORAZIONE TERZISTA A PEZZO",costo_unitario:5}));
    const x=calculateCyclePieCosts(c(rows));
    expect(x.fornitori).toBe(24); // 2 * 3 * 4
    expect(x.interne).toBeCloseTo(1.2); // 2 * 3 * 0.2
    expect(x.terzisti).toBe(10); // 2 * 5
    expect(x.totaleClassificato).toBeCloseTo(35.2);
    expect(x.nonClassificati).toBe(0);
    expect(x.totaleClassificato).toBeCloseTo(calcolaCostoStandard(calcolaBreakdown(c(rows))));
  });
  it("preserves historical priced assieme and ignores its legacy detail expansions",()=>{
    const rows=[
      r({categoria:"COMPONENTE/ASSIEME",costo_unitario:8,fornitore:"Ditta A"}),
      r({categoria:"LAVORAZIONE INTERNA",colpi_min:1,parent_idx:0}),
      r({categoria:"COMPONENTE",costo_unitario:4,fornitore:"Ditta B"}),
    ];
    const x=calculateCyclePieCosts(c(rows));
    expect(x.fornitori).toBe(12);
    expect(x.interne).toBe(0);
    expect(x.totaleClassificato).toBe(12);
  });
  it("handles no eligible costs and refuses invalid references or negative amounts",()=>{
    expect(calculateCyclePieCosts(c([r({costo_unitario:0})])).totaleClassificato).toBe(0);
    expect(()=>calculateCyclePieCosts(c([r({parent_idx:42})]))).toThrow(/Riferimento/);
    expect(()=>calculateCyclePieCosts(c([r({costo_unitario:-2,fornitore:"A"})]))).toThrow(/negativo/);
  });
});
