import { describe, it, expect } from "vitest";
import { emptyCicloEditorModel, emptyRiga, parseCycleRow, serializeCycleDataJson } from "@/types/cycle";
import { ricalcolaCiclo } from "./cycle-calculator";
import { orderedHierarchy } from "./cycle-hierarchy";

describe("Large cycle capacity — no ten-row limit",()=>{
  for(const count of [10, 11, 40, 41, 100, 150]){
    it("calculates and JSON round-trips exactly "+count+" distinct cycle rows",()=>{
      const cycle=emptyCicloEditorModel();
      cycle.codice="TEST-CAP-"+count;
      cycle.lotto="100";
      cycle.righe=Array.from({length:count},(_,i)=>({
        ...emptyRiga(),
        categoria:"COMPONENTE" as const,
        codice_articolo:"CAP-"+String(i+1).padStart(3,"0"),
        descrizione:"Componente individuale "+(i+1),
        nr_componenti:1,costo_unitario:0.25,
        note:"Test integrità dati su cicli di produzione. ".repeat(count>=100?20:2),
      }));
      const calculated=ricalcolaCiclo(cycle);
      expect(calculated.costo_standard).toBeCloseTo(count*0.25,10);
      expect(calculated.simulazioni[0].costo_standard).toBeCloseTo(count*0.25,10);
      const data=JSON.stringify(serializeCycleDataJson(calculated));
      const reopened=parseCycleRow({
        id:990000+count,code:cycle.codice,lot:"100",
        standardCost:String(calculated.costo_standard),
        minimumPrice:String(calculated.prezzo_minimo),
        dataJson:data,
      });
      expect(reopened.righe).toHaveLength(count);
      expect(reopened.righe.map(r=>r.codice_articolo)).toEqual(cycle.righe.map(r=>r.codice_articolo));
      expect(reopened.righe[count-1].descrizione).toBe("Componente individuale "+count);
      expect(reopened.costo_standard).toBeCloseTo(count*0.25,10);
      expect(orderedHierarchy(reopened.righe)).toHaveLength(count);
      // The parser derives lotti_personalizzati from simulations; that extra
      // metadata is intentional. Only business row bytes must round-trip unchanged.
      const reopenedJson = serializeCycleDataJson(reopened);
      const originalJson = JSON.parse(data);
      expect(reopenedJson.righe).toEqual(originalJson.righe);
      expect(reopenedJson.breakdown).toEqual(originalJson.breakdown);
      expect(reopenedJson.simulazioni).toEqual(originalJson.simulazioni);
      if(count===150) expect(Buffer.byteLength(data,"utf8")).toBeGreaterThan(65535);
    });
  }
});
