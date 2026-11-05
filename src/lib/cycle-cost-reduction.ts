/**
 * Non-persistent reverse pricing simulation.
 * Target a net INDUSTRIAL sale margin while general expenses remain a fixed
 * multiplier of the adjusted direct/industrial cost.
 *
 * At fixed market selling price P, target margin m and overhead rate h:
 *   max full cost = P*(1-m)
 *   target direct cost = P*(1-m)/(1+h)
 *   required saving on direct cost = current direct - target direct.
 *
 * Per-category percentages are INDEPENDENT alternative scenarios: each
 * assumes that one category alone absorbs the entire required saving.
 * They are not additive, and a value >100% is impossible with just that
 * category. Does not change cost data, percentages or revisions.
 */
export interface CostReductionTarget {
  targetMarginPercent: number;
  actualMarginPercent: number;
  marketPrice: number;
  currentDirectCost: number;
  currentFullCost: number;
  targetFullCost: number;
  targetDirectCost: number;
  directSavings: number;
  fullCostGap: number;
  overallReductionPercent: number;
}

export function calculateCostReductionTarget(args: {
  marketPrice: number;
  directCost: number;
  fullCost: number;
  overheadRate: number;
  targetNetMargin: number;
}): CostReductionTarget | null {
  const { marketPrice, directCost, fullCost, overheadRate, targetNetMargin }=args;
  if (![marketPrice,directCost,fullCost,overheadRate,targetNetMargin].every(Number.isFinite) ||
      marketPrice<=0 || directCost<0 || fullCost<0 || overheadRate<0 ||
      targetNetMargin<0 || targetNetMargin>=1) return null;

  // Avoid showing a misleading target if the stored historical full cost is
  // inconsistent with the current overhead rule. The result must be based on
  // the values the user actually sees in the editor.
  const expectedFullCost=directCost*(1+overheadRate);
  const tolerance=1e-7*Math.max(1,fullCost,expectedFullCost);
  if (Math.abs(fullCost-expectedFullCost)>tolerance) return null;

  const actualMarginPercent=100*(marketPrice-fullCost)/marketPrice;
  const targetMarginPercent=100*targetNetMargin;
  const targetFullCost=marketPrice*(1-targetNetMargin);
  const targetDirectCost=targetFullCost/(1+overheadRate);
  const rawSavings=directCost-targetDirectCost;
  if(rawSavings<=tolerance)return null;

  return {
    targetMarginPercent,actualMarginPercent,marketPrice,
    currentDirectCost:directCost,currentFullCost:fullCost,
    targetFullCost,targetDirectCost,
    directSavings:rawSavings,
    fullCostGap:fullCost-targetFullCost,
    overallReductionPercent:directCost>0?100*rawSavings/directCost:0,
  };
}

export interface CategoryReduction {
  reductionPercent: number;
  savingsNeeded: number;
  feasibleAlone: boolean;
  remainingCost: number;
}

export function categoryReductionTarget(
  target: CostReductionTarget, categoryCost: number
): CategoryReduction|null {
  if (!Number.isFinite(categoryCost) || categoryCost<=0) return null;
  const reductionPercent=100*target.directSavings/categoryCost;
  const epsilon=1e-8;
  return {
    reductionPercent,
    savingsNeeded:target.directSavings,
    feasibleAlone:reductionPercent<=100+epsilon,
    remainingCost:categoryCost-target.directSavings,
  };
}
