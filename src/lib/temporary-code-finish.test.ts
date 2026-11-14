import {expect,it} from "vitest";
import {temporaryCode,manualTemporaryCodePrefix,validManualTemporaryCode} from "./ral-pricing";
it.each([["I","n"],["X","P"],["6","P"],["B","z"],["A","7"]])("generates the exact twelfth character for %s",(material,suffix)=>{
  const code=temporaryCode(42,"FP",material,null,material==="B"||material==="A"?suffix:undefined);
  expect(code).toBe(`TFP0000042${material}${suffix}`);expect(code).toHaveLength(12);
});
it.each(["I","X","6","B","A"])("keeps the painted format unchanged for %s",material=>{
  expect(temporaryCode(42,"FP",material,"9010")).toBe(`TFP0000042${material}O9010`);
});
it("requires one visible custom character and rejects overriding automatic or RAL finishes",()=>{
  for(const suffix of [undefined,"","ab"," ","\n","\u200b"])
    expect(()=>temporaryCode(42,"FP","B",null,suffix)).toThrow();
  expect(temporaryCode(42,"FP","A",null,"-")).toBe("TFP0000042A-");
  expect(()=>temporaryCode(42,"FP","I",null,"N")).toThrow();
  expect(()=>temporaryCode(42,"FP","X",null,"n")).toThrow();
  expect(()=>temporaryCode(42,"FP","B","9010","z")).toThrow();
});
it("protects newly issued brass/aluminium prefixes and preserves legacy eleven-character codes",()=>{
  const issued={sequence:42,family:"FP",material:"B",color:null,code:"TFP0000042Bz"};
  const prefix=manualTemporaryCodePrefix(issued)!;
  expect(prefix).toBe("TFP0000042B");
  expect(validManualTemporaryCode(prefix+"5",prefix)).toBe(true);
  expect(validManualTemporaryCode(prefix,prefix)).toBe(false);
  expect(validManualTemporaryCode(prefix,prefix,true)).toBe(true);
  expect(validManualTemporaryCode("TFP0000043B5",prefix,true)).toBe(false);
  expect(manualTemporaryCodePrefix({...issued,code:prefix})).toBeNull();
  expect(manualTemporaryCodePrefix({...issued,code:prefix+"O9010",color:"9010"})).toBeNull();
});
