import {describe,it,expect} from "vitest";
import {calculateMaterialByWeight,MATERIAL_DENSITY_G_CM3} from "./quote-material-weight";
import {blankProduct,blankQuote,calculateQuote} from "./quote-calculation";

describe("TKT-20261015-18060001: preventivo una tantum, costo materiale per peso",()=>{
  it("starts with the cost-known checkbox checked and the direct €/piece model",()=>{
    const p=blankProduct();
    expect(p.costo_materiale_noto).toBe(true);
    const q=calculateQuote({...blankQuote(),prodotti:[{...p,materiale_prodotto:"ferro",materiale_cad:1.57,quantita:10}]});
    expect(q.prodotti[0].materiale_tot).toBeCloseTo(15.7,10);
    expect(q.prodotti[0].materiale_calcolato_cad).toBeCloseTo(1.57);
  });
  it("calculates the theoretical blank mass in kg from mm dimensions and density",()=>{
    // 100 mm × 50 mm × 2 mm of steel = 10 cm3 × 7.85 g/cm3 = 78.5 g
    const a=calculateMaterialByWeight({
      material:"ferro",lengthMm:100,widthMm:50,thicknessMm:2,euroPerKg:4,
    });
    expect(a.theoreticalWeightKg).toBeCloseTo(0.0785,10);
    expect(a.materialCostPerPiece).toBeCloseTo(0.314,10);
    expect(MATERIAL_DENSITY_G_CM3.inox).toBe(8);
    expect(MATERIAL_DENSITY_G_CM3.ottone).toBe(8.5);
  });
  it("uses automatically computed cost, not stored inactive €/piece, for full cost and margin",()=>{
    const d=blankQuote();
    d.prodotti=[{...blankProduct(),materiale_prodotto:"ferro",quantita:10,
      costo_materiale_noto:false,materiale_cad:100,
      lunghezza_mm:100,larghezza_mm:50,spessore_mm:2,costo_materiale_kg:4}];
    const original=JSON.stringify(d);
    const q=calculateQuote(d);
    expect(q.prodotti[0].materiale_calcolato_cad).toBeCloseTo(0.314,10);
    expect(q.prodotti[0].peso_teorico_kg).toBeCloseTo(0.0785,10);
    expect(q.prodotti[0].materiale_tot).toBeCloseTo(3.14,10);
    expect(q.prodotti[0].costo_primo_cad).toBeCloseTo(0.314,10);
    expect(q.prodotti[0].full_cost).toBeCloseTo(0.314*1.75,10);
    expect(q.prodotti[0].prezzo_netto_unitario_finale).toBeCloseTo(0.314*1.75/0.8,10);
    expect(JSON.stringify(d)).toBe(original); // never mutate the original quote
  });
  it("turning the checkbox back on restores manually entered €/piece without mixing alternatives",()=>{
    const p={...blankProduct(),materiale_prodotto:"inox",quantita:3,
      costo_materiale_noto:false,materiale_cad:2.11,
      lunghezza_mm:100,larghezza_mm:50,spessore_mm:2,costo_materiale_kg:10};
    const weight=calculateQuote({...blankQuote(),prodotti:[p]});
    const manual=calculateQuote({...blankQuote(),prodotti:[{...p,costo_materiale_noto:true}]});
    expect(weight.prodotti[0].materiale_calcolato_cad).toBeCloseTo(0.8,10);
    expect(manual.prodotti[0].materiale_calcolato_cad).toBeCloseTo(2.11,10);
    expect(manual.prodotti[0].peso_teorico_kg).toBeNull();
  });
  it("accepts old saved quotes without the checkbox and preserves their stored costs",()=>{
    const p=blankProduct();
    delete p.costo_materiale_noto;
    const old={...blankQuote(),prodotti:[{...p,materiale_prodotto:"ferro",quantita:12,materiale_cad:4.25}]};
    const res=calculateQuote(old);
    expect(res.prodotti[0].materiale_calcolato_cad).toBe(4.25);
    expect(res.prodotti[0].materiale_tot).toBe(51);
  });
  it("requires valid selected material, nonzero dimensions and valid cost when unchecked",()=>{
    const base={...blankProduct(),costo_materiale_noto:false,materiale_prodotto:"ferro",
      lunghezza_mm:100,larghezza_mm:50,spessore_mm:2,costo_materiale_kg:4};
    for(const invalid of [{lunghezza_mm:0},{larghezza_mm:0},{spessore_mm:0},
      {costo_materiale_kg:-1},{costo_materiale_kg:Infinity}]){
      expect(()=>calculateQuote({...blankQuote(),prodotti:[{...base,...invalid}]})).toThrow();
    }
    expect(()=>calculateQuote({...blankQuote(),prodotti:[{...base,materiale_prodotto:""}]})).toThrow("Seleziona ferro");
  });
});
