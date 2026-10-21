import { describe, expect, it } from "vitest";
import { nearestListedCollar, quoteBandellaT, type TRequest, PRICES, TIERS } from "./bandelle-t-listino";
const base: TRequest = {
  kind:"standard", quantity:20, collar:55,position:"centrale",
  diameterOther:false, reverseOffset:false, overlap:false,
  zancaLength:35,
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
  it("decentralized eye shares central price tier at every listed collar",()=>{
    const central = calculate({position:"centrale",collar:65});
    const decentralized = calculate({position:"decentrato",collar:65});
    expect(decentralized.base).toBe(central.base);
    expect(decentralized.unit).toBe(central.unit);
    expect(decentralized.total).toBe(central.total);
    expect(decentralized.notes.join(" ")).toMatch(/codice di riferimento del centrale/);
    expect(calculate({position:"decentrato",collar:55}).code).toBe("VBC00017BPIUGOFF");
  });
  it("maps a manually entered integer collar to the closest listino size",()=>{
    expect(calculate({collar:55,quantity:5}).base).toBe(6.934);
    expect(calculate({collar:65,quantity:5}).base).toBe(7.2);
    expect(nearestListedCollar("standard",56)).toBe(55);
    expect(nearestListedCollar("standard",60)).toBe(65);
    expect(nearestListedCollar("standard",80)).toBe(85);
    expect(nearestListedCollar("misura",150)).toBe(155);
    expect(nearestListedCollar("standard",54)).toBe(55);
    expect(nearestListedCollar("standard",500)).toBe(95);
    expect(nearestListedCollar("standard",0)).toBe(null);
    const middle=calculate({collar:60,quantity:5});
    expect(middle.requestedCollar).toBe(60);
    expect(middle.size).toBe(65);
    expect(middle.base).toBe(7.2);
    expect(middle.notes.join(" ")).toContain("Misura collo inserita: 60 mm; prezzo calcolato sul collo di listino più vicino: 65 mm.");
    expect(()=>calculate({collar:55.5,quantity:5})).toThrow(/misura intera/);
    expect(calculate({collar:150,quantity:5}).size).toBe(95);
    expect(calculate({kind:"zanca",collar:155,quantity:5}).size).toBe(115);
  });
  it("a misura: 155mm qty20 publishes price; qty21 does not",()=>{
    expect(calculate({kind:"misura",collar:155,quantity:20}).base).toBe(12.126);
    expect(()=>calculate({kind:"misura",collar:155,quantity:21})).toThrow(/non pubblica/);
  });
  it("zanca a filo: only whole millimeters 15 through 35 inclusive",()=>{
    expect(calculate({kind:"zanca",quantity:10,collar:115,zancaLength:15}).base).toBe(12.23);
    expect(calculate({kind:"zanca",quantity:10,collar:115,zancaLength:35}).base).toBe(12.23);
    expect(()=>calculate({kind:"zanca",quantity:10,collar:115,zancaLength:14})).toThrow(/15 a 35/);
    expect(()=>calculate({kind:"zanca",quantity:10,collar:115,zancaLength:36})).toThrow(/15 a 35/);
    expect(()=>calculate({kind:"zanca",quantity:10,collar:115,zancaLength:15.3})).toThrow(/15 a 35/);
  });
  it("zanca supplement sormonto differs from standard",()=>{
    expect(calculate({kind:"zanca",quantity:4,collar:55,overlap:true}).unit).toBe(11.66);
  });
  it("rejects unavailable quantities and flags collars outside the listino range",()=>{
    expect(()=>calculate({quantity:101})).toThrow(/4 a 100/);
    expect(()=>calculate({quantity:3})).toThrow(/4 a 100/);
    const outside=calculate({collar:500});
    expect(outside.size).toBe(95);
    expect(outside.notes.join(" ")).toMatch(/fuori dall'intervallo.*Verificare la quotazione/);
    expect(()=>calculate({collar:0})).toThrow(/maggiore di zero/);
  });
});
