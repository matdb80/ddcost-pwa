import {describe,expect,it} from "vitest";
import {formatQuoteNumeric,parseQuoteNumericDraft,roundQuoteNumeric,validQuoteNumericDraft} from "./QuoteNumericInput";

describe("Preventivo Una Tantum: editable numeric fields",()=>{
  it("accepts keyboard input with decimal comma or dot (including incomplete drafts)",()=>{
    for(const raw of ["","0","100","12,","12,3","12,34",".5",",5","12.34"]){
      expect(validQuoteNumericDraft(raw,"euro"),raw).toBe(true);
    }
    expect(parseQuoteNumericDraft("12,50","euro")).toBeCloseTo(12.5);
    expect(parseQuoteNumericDraft("12.50","euro")).toBeCloseTo(12.5);
    expect(parseQuoteNumericDraft("0,05","euro")).toBeCloseTo(0.05);
    expect(parseQuoteNumericDraft("","euro")).toBeNull();
    expect(parseQuoteNumericDraft(",","euro")).toBeNull();
  });
  it("restricts amount fields to 2 decimal places without blocking cursor movement",()=>{
    for(const raw of ["1,234","1.234","1e5","-3", "2,1,5"]){
      expect(validQuoteNumericDraft(raw,"euro"),raw).toBe(false);
    }
    expect(formatQuoteNumeric(12.5,"euro")).toBe("12,50");
    expect(formatQuoteNumeric(50,"euro")).toBe("50,00");
    expect(roundQuoteNumeric(12.345,"euro")).toBeCloseTo(12.35);
  });
  it("allows maximum one decimal for quantities and hours",()=>{
    for(const raw of ["10","10,1","10.1","0,","",",5"]){
      expect(validQuoteNumericDraft(raw,"decimal"),raw).toBe(true);
    }
    for(const raw of ["10,12","1.234","1e3"]){
      expect(validQuoteNumericDraft(raw,"decimal"),raw).toBe(false);
    }
    expect(formatQuoteNumeric(12.5,"decimal")).toBe("12,5");
    expect(roundQuoteNumeric(3.16,"decimal")).toBe(3.2);
  });
  it("edits 75% and 20% explicitly while preserving 0.75 and 0.20 in stored formulas",()=>{
    expect(formatQuoteNumeric(0.75,"percent")).toBe("75");
    expect(parseQuoteNumericDraft("75,5","percent")).toBeCloseTo(0.755);
    expect(parseQuoteNumericDraft("20","percent")).toBeCloseTo(0.2);
    expect(validQuoteNumericDraft("75,51","percent")).toBe(false);
    expect(roundQuoteNumeric(0.7546,"percent")).toBeCloseTo(0.755);
  });
  it("preserves null optional selling price and refuses invalid text",()=>{
    expect(formatQuoteNumeric(null,"euro")).toBe("");
    expect(parseQuoteNumericDraft("abc","euro")).toBeNull();
    expect(parseQuoteNumericDraft("-1","euro")).toBeNull();
    expect(parseQuoteNumericDraft("Infinity","euro")).toBeNull();
  });
});
