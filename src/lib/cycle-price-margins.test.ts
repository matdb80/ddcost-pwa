import { describe, expect, it } from "vitest";
import { calculateSaleMargins, explainSalePrice, parseMarketPrice } from "./cycle-price-margins";

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
  it("explains each selling-price range with allocated 75% overhead in everyday Italian",()=>{
    const examples=[
      {price:0.90,scenario:"below-direct",message:"mancano € 0,10",covered:0},
      {price:1.00,scenario:"direct-only",message:"non contribuisci",covered:0},
      {price:1.30,scenario:"partial-overhead",message:"40% delle spese generali",covered:40},
      {price:1.75,scenario:"breakeven",message:"Sei in pareggio",covered:100},
      {price:2.00,scenario:"positive",message:"Ti restano € 0,25",covered:100},
    ] as const;
    for(const {price,scenario,message,covered} of examples){
      const text=explainSalePrice(price,1,1.75)!;
      expect(text.scenario).toBe(scenario);
      expect(text.message).toContain(message);
      expect(text.overheadCoveragePercent).toBeCloseTo(covered,5);
    }
    const loss=explainSalePrice(0.90,1,1.75)!;
    expect(loss.message).toContain("negativo di € 0,85");
    const partial=explainSalePrice(1.3,1,1.75)!;
    expect(partial.message).toContain("Restano da coprire € 0,45");
    expect(explainSalePrice(1.944444444,1,1.75)!.message).toContain("€ 0,1944");
  });
  it("does not call general expenses fixed costs or overstate after-tax profitability",()=>{
    for(const price of [0.90,1,1.3,1.75,2]){
      const explanation=explainSalePrice(price,1,1.75)!;
      expect(explanation.message).not.toMatch(/costi fissi/i);
      expect(explanation.message).not.toMatch(/utile netto/i);
    }
    expect(explainSalePrice(2,1,1.75)!.message).toContain("prima delle imposte");
  });
  it("handles no overhead and detects inconsistent input safely",()=>{
    expect(explainSalePrice(1,1,1)!.scenario).toBe("breakeven");
    expect(explainSalePrice(1,1,1)!.overheadCoveragePercent).toBeNull();
    expect(explainSalePrice(2,1,1)!.scenario).toBe("positive");
    expect(explainSalePrice(1.2,1.5,1)!.scenario).toBe("inconsistent");
    expect(explainSalePrice(0,1,1.75)).toBeNull();
    expect(explainSalePrice(-5,1,1.75)).toBeNull();
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