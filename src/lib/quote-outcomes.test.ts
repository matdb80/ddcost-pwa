import {describe,it,expect} from "vitest";
import {latestCompletedQuotePerRoot,readQuoteOutcome,summarizeQuoteOutcomes,type OutcomeInput} from "./quote-outcomes";
const q=(id:number,rootId:number|null,rev:number,price:string|null,outcome?:string,draft=false):OutcomeInput=>({
  id,rootId,rev,totalFinal:price,
  dataJson:JSON.stringify({stato_preventivo:draft?"bozza":"completo",...(outcome?{esito_commerciale:outcome}:{})}),
});
describe("TKT-20261015-16060003 quote outcome statistics",()=>{
  it("counts latest finalized revision once per logical quote, excludes drafts",()=>{
    const all=[q(10,10,1,"100","perso"),q(11,10,2,"125","vinto"),
      q(20,20,1,"200","perso"),q(30,30,1,"300"),
      q(40,40,1,null,undefined,true),q(12,10,3,null,undefined,true)];
    const rows=latestCompletedQuotePerRoot(all);
    expect(rows.map(x=>x.id)).toEqual([30,20,11]);
    const totals=summarizeQuoteOutcomes(all);
    expect(totals.vinto).toEqual({count:1,value:125,unpriced:0});
    expect(totals.perso).toEqual({count:1,value:200,unpriced:0});
    expect(totals.in_attesa).toEqual({count:1,value:300,unpriced:0});
    expect(totals.total).toEqual({count:3,value:625,unpriced:0});
  });
  it("reports missing or malformed prices instead of pretending the value is zero",()=>{
    const totals=summarizeQuoteOutcomes([q(1,1,1,null,"vinto"),q(2,2,1,"oops","perso"),q(3,3,1,"0","in_attesa")]);
    expect(totals.total).toEqual({count:3,value:0,unpriced:2});
    expect(totals.vinto.unpriced).toBe(1);
    expect(totals.in_attesa.unpriced).toBe(0);
  });
  it("ignores corrupt status and respects the highest revision even when IDs are reversed",()=>{
    const rows=[q(99,1,1,"100","vinto"),q(10,1,3,"120","invalid"),
      q(12,1,2,"110","perso")];
    expect(latestCompletedQuotePerRoot(rows)[0].id).toBe(10);
    expect(readQuoteOutcome("{")).toBe("in_attesa");
    expect(readQuoteOutcome(null)).toBe("in_attesa");
    expect(summarizeQuoteOutcomes(rows).in_attesa.value).toBe(120);
  });
});
