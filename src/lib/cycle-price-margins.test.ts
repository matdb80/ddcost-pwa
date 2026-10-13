import { describe, expect, it } from "vitest";
import { calculateSaleMargins, parseMarketPrice } from "./cycle-price-margins";

describe("DDCost Cicli - TKT-12060006/07 market price and margin",()=>{
  it("distinguishes markup from gross and net margin percentages",()=>{
    const result=calculateSaleMargins(10,6,7.5)!;
    expect(result.grossEuro).toBeCloseTo(4);
    expect(result.netEuro).toBeCloseTo(2.5);
    expect(result.overheadEuro).toBeCloseTo(1.5);
    expect(result.grossPercent).toBeCloseTo(40);
    expect(result.netPercent).toBeCloseTo(25);
  });
  it("minimum sale price reflects required net margin",()=>{
    const fullCost=7.5;
    const minimum=fullCost/(1-0.2);
    expect(calculateSaleMargins(minimum,6,fullCost)!.netPercent).toBeCloseTo(20);
  });
  it("shows losses as negative margins and handles zero-cost items",()=>{
    expect(calculateSaleMargins(5,6,7.5)!.grossPercent).toBeCloseTo(-20);
    expect(calculateSaleMargins(5,6,7.5)!.netPercent).toBeCloseTo(-50);
    expect(calculateSaleMargins(5,0,0)!.netPercent).toBe(100);
  });
  it("does not calculate invalid or zero prices",()=>{
    for(const price of [0,-1,NaN,Infinity]){
      expect(calculateSaleMargins(price,6,7.5)).toBeNull();
    }
    expect(calculateSaleMargins(5,-1,3)).toBeNull();
    expect(calculateSaleMargins(5,2,Infinity)).toBeNull();
  });
  it("accepts comma/dot decimal prices and rejects ambiguous or negative input",()=>{
    expect(parseMarketPrice(" 12,50 ")).toBe(12.5);
    expect(parseMarketPrice("12.50")).toBe(12.5);
    expect(parseMarketPrice("1000")).toBe(1000);
    for(const value of ["", " ", "0", "-1", "1.000,50", "1,2,3","abc","12,12345"]){
      expect(parseMarketPrice(value)).toBeNull();
    }
  });
});