import {describe,expect,it} from "vitest";
import {TEMPORARY_FAMILIES,temporaryCode,temporaryCodePrefix,temporaryCodePreview,validTemporarySuffix} from "./ral-pricing";

describe("finitura codici temporanei",()=>{
  it.each([["I","N"],["X","P"],["6","P"],["B","z"],["A","7"]])("materiale %s", (material,suffix)=>{
    // ottone/alluminio: il suffisso digitato (anche minuscolo) è emesso maiuscolo
    expect(temporaryCode(42,"FP",material as never,null,suffix)).toBe(`TFP0000042${material}${suffix.toUpperCase()}`);
  });
  it("ferro naturale senza suffisso esplicito",()=>{
    expect(temporaryCode(42,"FP","I",null,undefined,true)).toBe("TFP0000042I0");
  });
  it("verniciato con RAL",()=>{
    expect(temporaryCode(42,"FP","I","9010")).toBe("TFP0000042IO9010");
  });
  it("ferro e inox accettano solo la finitura automatica, in qualunque caso",()=>{
    expect(temporaryCode(42,"FP","I",null,"N")).toBe("TFP0000042IN");
    expect(temporaryCode(42,"FP","I",null,"n")).toBe("TFP0000042IN");
    expect(()=>temporaryCode(42,"FP","X",null,"n")).toThrow();
  });
});

describe("tutte le famiglie: anteprima maiuscola e progressivo conservato",()=>{
  // La proprietà lato client dell'anteprima del dialogo; la coincidenza con il
  // codice emesso è provata contro il vero router in api/nov09-routers.test.ts.
  it.each(TEMPORARY_FAMILIES.map(f=>[f]))("famiglia %s",(family)=>{
    const prefix=temporaryCodePrefix(37,family,"I");
    expect(prefix).toBe(`T${family}0000037I`);            // progressivo e zeri iniziali conservati
    const anteprime=[
      temporaryCodePreview(37,family,"I",null,"",false,false),   // ferro: finitura automatica N
      temporaryCodePreview(37,family,"I",null,"",true,false),    // ferro naturale
      temporaryCodePreview(37,family,"B",null,"z",false,false),  // ottone: suffisso digitato minuscolo
      temporaryCodePreview(37,family,"A",null,"7",false,false),  // alluminio: suffisso digitato
      ...(family==="QU"?[]:[temporaryCodePreview(37,family,"I","9010","",false,true)]), // verniciato
    ];
    for(const anteprima of anteprime){
      expect(anteprima).toBe(anteprima.toUpperCase());           // interamente maiuscola
      expect(anteprima.startsWith(prefix.slice(0,-1))).toBe(true);
    }
    expect(anteprime[0]).toBe(`${prefix}N`);                     // ferro → N maiuscola
  });
});

describe("suffisso manuale: un solo carattere anche dopo il maiuscolo",()=>{
  // «ß» è un carattere solo, ma «ß».toUpperCase() è «SS»: senza il controllo il
  // router emetterebbe un codice di 13 caratteri. Stessa validazione condivisa
  // da digitazione, incolla, anteprima ed emissione.
  it("z → Z accettato, ß → SS rifiutato ovunque",()=>{
    expect(validTemporarySuffix("z")).toBe(true);
    expect(validTemporarySuffix("ß")).toBe(false);
    expect(temporaryCode(42,"FP","B",null,"z")).toBe("TFP0000042BZ");
    expect(()=>temporaryCode(42,"FP","B",null,"ß")).toThrow(/un solo carattere/);
    expect(temporaryCodePreview(42,"FP","B",null,"z",false,false)).toBe("TFP0000042BZ");
    expect(()=>temporaryCodePreview(42,"FP","B",null,"ß",false,false)).toThrow(/un solo carattere/);
  });
});
