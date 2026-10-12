import { describe, expect, it } from "vitest";
import { quoteBandellaT, type TRequest, PRICES, TIERS } from "./bandelle-t-listino";
const base: TRequest = {
  kind:"standard", quantity:20, collar:55,position:"centrale",
  diameterOther:false, reverseOffset:false, overlap:false,
  zancaLength:35,reinforcedApproved:false,
};
const calculate = (rest: Partial<TRequest> = {}) => quoteBandellaT({...base,...rest});
describe("Bandelle a T — workbook Smeralda (2026 updated values)",()=>{
  it("retains all published prices and unsupported cells",()=>{
    expect(PRICES.standard).toHaveLength(5);
    expect(PRICES.misura).toHaveLength(11);
    expect(PRICES.zanca).toHaveLength(7);
    for(const rows of Object.values(PRICES)){
      for(const r of rows) expect(r.prices).toHaveLength(TIERS.length);
    }
    expect(PRICES.misura[6].prices.slice(2)).toEqual([null,null,null,null,null]);
  });
  it("looks up exact 55 mm, 11-20 pcs from standard sheet E14",()=>{
    expect(calculate().base).toBe(5.734);
    expect(calculate().total).toBe(114.68);
  });
  it("uses 95 mm 81-100 pcs cell J18 without adding 4.5%",()=>{
    expect(calculate({quantity:100,collar:95}).base).toBe(3.466);
  });
  it("standard 55mm decentralized uses code and optional reverse offset",()=>{
    const r=calculate({position:"decentrato",reverseOffset:true,diameterOther:true,overlap:true});
    expect(r.code).toBe("VBC00017BPIUGOFF");
    expect(r.unit).toBe(12.234);
    expect(r.total).toBe(244.68);
  });
  it("refuses unlisted standard decentralized code at other collars",()=>{
    expect(()=>calculate({position:"decentrato",collar:65})).toThrow(/non codificato/);
  });
  it("snaps between table collars and informs the user",()=>{
    const r=calculate({collar:60,quantity:5});
    expect(r.size).toBe(55);
    expect(r.base).toBe(6.934);
    expect(r.notes.join(" ")).toMatch(/arrotondato/);
  });
  it("a misura: 155mm qty20 publishes price; qty21 does not",()=>{
    expect(calculate({kind:"misura",collar:155,quantity:20}).base).toBe(12.126);
    expect(()=>calculate({kind:"misura",collar:155,quantity:21})).toThrow(/non pubblica/);
  });
  it("zanca: conditional >35 mm reinforcement is not automatic",()=>{
    const normal=calculate({kind:"zanca",quantity:10,collar:115,zancaLength:40});
    expect(normal.base).toBe(12.23);
    expect(normal.unit).toBe(12.23);
    expect(normal.notes.join(" ")).toMatch(/NON è incluso/);
    const approved=calculate({kind:"zanca",quantity:10,collar:115,zancaLength:40,reinforcedApproved:true});
    expect(approved.unit).toBe(14.23);
  });
  it("zanca supplement sormonto differs from standard",()=>{
    expect(calculate({kind:"zanca",quantity:4,collar:55,overlap:true}).unit).toBe(11.66);
  });
  it("never silently extrapolates beyond available quantity or collar",()=>{
    expect(()=>calculate({quantity:101})).toThrow(/4 a 100/);
    expect(()=>calculate({quantity:3})).toThrow(/4 a 100/);
    expect(()=>calculate({collar:500})).toThrow(/Collo fuori/);
  });
});
