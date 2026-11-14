import {describe,expect,it} from "vitest";
import {calculateCostReductionTarget,categoryReductionTarget} from "./cycle-cost-reduction";

const calc=(marketPrice:number,directCost=1,overheadRate=0.75,targetNetMargin=0.10)=>calculateCostReductionTarget({
  marketPrice,directCost,fullCost:directCost*(1+overheadRate),
  overheadRate,targetNetMargin,
});

describe("DDCost Cicli - cost reduction to achieve target net margin",()=>{
  it("derives direct savings when actual margin is below the target",()=>{
    const x=calc(1.8)!;
    expect(x.actualMarginPercent).toBeCloseTo((1.8-1.75)/1.8*100);
    expect(x.targetMarginPercent).toBe(10);
    expect(x.targetFullCost).toBeCloseTo(1.62);
    expect(x.fullCostGap).toBeCloseTo(0.13);
    expect(x.targetDirectCost).toBeCloseTo(1.62/1.75);
    expect(x.directSavings).toBeCloseTo(0.13/1.75);
    expect(x.overallReductionPercent).toBeCloseTo(7.42857142857142);
    expect((1-x.directSavings)*(1+0.75)).toBeCloseTo(x.targetFullCost);
    expect((1.8-x.targetFullCost)/1.8*100).toBeCloseTo(10);
  });
  it("uses each category as an independent alternative and flags infeasible ones",()=>{
    const x=calc(1.8)!;
    const big=categoryReductionTarget(x,0.6)!;
    const small=categoryReductionTarget(x,0.02)!;
    expect(big.reductionPercent).toBeCloseTo(12.38095238095);
    expect(big.feasibleAlone).toBe(true);
    expect(big.remainingCost).toBeGreaterThan(0);
    expect(small.reductionPercent).toBeGreaterThan(100);
    expect(small.feasibleAlone).toBe(false);
    expect(categoryReductionTarget(x,0)).toBeNull();
    expect(categoryReductionTarget(x,-1)).toBeNull();
    expect(categoryReductionTarget(x,NaN)).toBeNull();
  });
  it("shows no reductions at or above target and keeps a margin already above goal",()=>{
    expect(calc(1.75/0.9)).toBeNull();
    expect(calc(2)).toBeNull();
  });
  it("handles grossly inadequate prices without implying a single category can solve them",()=>{
    const x=calc(0.8)!;
    expect(x.actualMarginPercent).toBeLessThan(0);
    const category=categoryReductionTarget(x,0.01)!;
    expect(category.feasibleAlone).toBe(false);
    expect(category.reductionPercent).toBeGreaterThan(100);
    expect(x.directSavings).toBeGreaterThan(0);
    expect(x.directSavings).toBeLessThanOrEqual(1);
  });
  it("does not confuse fixed allocated overhead with independent euro savings",()=>{
    const x=calc(1.8)!;
    // The full-cost gap is 0.13 euros, but the direct-cost reduction is smaller
    // because the 75% overhead loading shrinks along with the industrial cost.
    expect(x.fullCostGap).toBeCloseTo(0.13);
    expect(x.directSavings).toBeCloseTo(0.0742857142857143);
  });
  it("fails closed for invalid assumptions or stale historical cost values",()=>{
    const base={marketPrice:1.8,directCost:1,fullCost:1.75,overheadRate:0.75,targetNetMargin:0.1};
    expect(calculateCostReductionTarget({...base,fullCost:2})).toBeNull();
    expect(calculateCostReductionTarget({...base,marketPrice:0})).toBeNull();
    expect(calculateCostReductionTarget({...base,targetNetMargin:1})).toBeNull();
    expect(calculateCostReductionTarget({...base,targetNetMargin:-0.1})).toBeNull();
    expect(calculateCostReductionTarget({...base,overheadRate:-0.1})).toBeNull();
    expect(calculateCostReductionTarget({...base,directCost:NaN})).toBeNull();
  });
  it("allows no-overhead reductions with identical direct and full costs",()=>{
    const x=calc(0.95,1,0,0.10)!;
    expect(x.targetDirectCost).toBeCloseTo(0.855);
    expect(x.directSavings).toBeCloseTo(0.145);
    expect(x.overallReductionPercent).toBeCloseTo(14.5);
  });
});