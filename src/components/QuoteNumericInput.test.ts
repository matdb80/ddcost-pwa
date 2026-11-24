import {describe,expect,it} from "vitest";
import {formatQuoteNumeric,parseQuoteNumericDraft,roundQuoteNumeric,validQuoteNumericDraft} from "./QuoteNumericInput";

describe("Preventivo Una Tantum: editable numeric fields",()=>{
  it("supports precise per-piece labor hours without changing standard numeric precision",()=>{
    expect(formatQuoteNumeric(100/105,"decimal",6)).toBe("0,952381");
    expect(parseQuoteNumericDraft("0,952381","decimal",6)).toBeCloseTo(0.952381,10);
    expect(validQuoteNumericDraft("0,952381","decimal")).toBe(false);
    expect(formatQuoteNumeric(12.345,"euro")).toBe("12,35");
  });
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
  // v20: «Consegna stimata (settimane)» — interi positivi, niente decimali,
  // segni, notazione scientifica o zero; il vuoto resta vuoto.
  it("integer kind accepts only positive whole numbers",()=>{
    for(const raw of ["","1","4","12","300"]){
      expect(validQuoteNumericDraft(raw,"integer"),raw).toBe(true);
    }
    for(const raw of ["1,5","1.5","-3","4,","2 3","1e3","abc","+4"]){
      expect(validQuoteNumericDraft(raw,"integer"),raw).toBe(false);
    }
    expect(parseQuoteNumericDraft("4","integer")).toBe(4);
    expect(parseQuoteNumericDraft("1","integer")).toBe(1);
    expect(parseQuoteNumericDraft("","integer")).toBeNull();
    expect(parseQuoteNumericDraft("0","integer")).toBeNull();
    expect(formatQuoteNumeric(4,"integer")).toBe("4");
    expect(formatQuoteNumeric(null,"integer")).toBe("");
    expect(roundQuoteNumeric(4,"integer")).toBe(4);
  });
});
