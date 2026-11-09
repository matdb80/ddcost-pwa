import {calculateOfferLotPrice,withOfferLotTerms,generateListinoFromNet} from "./commercial-offer-pricing";
import { describe, expect, it } from "vitest";
import { calculateRal, ralCodeInfo, ralColors, ralRate, temporaryCode, TEMPORARY_FAMILIES, TEMPORARY_MATERIALS } from "./ral-pricing";
import { blankQuote, blankProduct, calculateQuote } from "./quote-calculation";
import { prepareRalOffer } from "./ral-documents";
import { buildCommercialOfferPrintHtml } from "./commercial-offer-pdf";
import { buildOneTimeQuotePrintHtml } from "./quote-pdf";
import { buildDistributorOffer } from "./commercial-offer-split";
import { salesDocument } from "./commercial-handoff";
const smooth = { color: "9010", textured: false };
const examples = [
  { code: "LAS9000020IW", net: 4.2, quantity: 10 },
  { code: "FFP0105XN8XP", net: 12.5, quantity: 4 },
  { code: "FVBM4008DC", net: .08, quantity: 100 },
  { code: "XCA00A886ZIT", net: 3, quantity: 8 },
  { code: "LRNG211605N4", net: .3, quantity: 20 },
];
describe("RAL rules supplied on 2026-11-09", () => {
  it("loads exactly the supplied 213 unique classic colors", () => {
    expect(ralColors).toHaveLength(213); expect(new Set(ralColors.map(c => c.code)).size).toBe(213);
    expect(ralColors.find(c => c.code === "9010")?.name).toBe("Bianco puro");
  });
  it("reproduces the 270 euro smooth and 283 euro textured examples", () => {
    const a = calculateRal(examples, smooth);
    expect(a.rows.map(r => r.percent)).toEqual([100,40,200,50,0]);
    expect(a.rows.map(r => r.total)).toEqual([84,70,24,36,6]);
    expect(a.fixed).toBe(50); expect(a.total).toBe(270);
    const b = calculateRal(examples.filter((_, i) => i !== 1), { ...smooth, textured: true });
    expect(b.rows.map(r => r.total)).toEqual([105,24,48,6]);
    expect(b.fixed).toBe(100); expect(b.total).toBe(283);
  });
  it.each(TEMPORARY_FAMILIES)("builds 16 characters in family %s for all materials", family => {
    for (const material of Object.keys(TEMPORARY_MATERIALS)) {
      const code = temporaryCode(1, family, material, "9006");
      expect(code).toHaveLength(16); expect(code.slice(1,3)).toBe(family);
      expect(code.slice(3,10)).toBe("0000001"); expect(code[10]).toBe(material);
      expect(code.slice(11)).toBe("O9006"); expect(ralCodeInfo(code).paintable).toBe(false);
    }
    expect(temporaryCode(9999999, family, "I")).toHaveLength(11);
  });
  it("uses the actual eleventh character, not a marketing group", () => {
    for (const material of ["1","2","3","6","X"]) expect(ralRate(`TFP0000001${material}`, false).percent).toBe(40);
    expect(ralRate("TAM0000001B", false).percent).toBe(50);
    expect(ralRate("TAM0000001X", false).percent).toBe(35);
    expect(ralCodeInfo("KASSECA001M07004IU").family).toBe("as");
    expect(ralCodeInfo("FVBT4030CCIQ7047").paintable).toBe(true);
  });
  it("rejects stainless in textured orders even if it is already painted", () => {
    expect(() => calculateRal(examples, {...smooth,textured:true})).toThrow(/inox/);
    expect(() => calculateRal([{code:"TFP0000001XO9010",net:10,quantity:1}], {...smooth,textured:true})).toThrow(/inox/);
  });
  it("charges only 50 for screws in a textured order and zero for already painted/nylon", () => {
    expect(calculateRal([examples[2]], {...smooth,textured:true}).fixed).toBe(50);
    const r = calculateRal([{code:"TAM0000001IO9006",net:10,quantity:2},examples[4]],smooth);
    expect(r.fixed).toBe(0); expect(r.total).toBe(26);
  });
  it("rounds the surcharge to four decimals before rounding line totals to cents", () => {
    const r=calculateRal([{code:"TAM0000001X",net:1.2345,quantity:17}],smooth);
    expect(r.rows[0].surcharge).toBe(.4321); expect(r.rows[0].total).toBe(28.33);
    expect(r.total).toBe(78.33);
  });
  it("keeps a missing net on request instead of assigning zero", () => {
    const r=calculateRal([{code:"TAM0000001I",net:null,quantity:10}],smooth);
    expect(r.rows[0].net).toBeNull(); expect(r.rows[0].total).toBeNull(); expect(r.total).toBeNull(); expect(r.fixed).toBe(50);
  });
  it("rejects invalid sequence, material, family and color", () => {
    for(const seq of [0,-1,1.2,10000000])expect(()=>temporaryCode(seq,"AM","I","9010")).toThrow();
    expect(()=>temporaryCode(1,"ZZ","I","9010")).toThrow();
    expect(()=>temporaryCode(1,"AM","constructor","9010")).toThrow();
    expect(()=>temporaryCode(1,"AM","I","9999")).toThrow();
  });
});
describe("document integration and no double charging", () => {
  const generated={sequence:1,family:"AM",material:"I",color:"9010",code:"TAM0000001IO9010"};
  it("prices a newly generated painted code once and preserves it on recalculation/reopen", () => {
    const doc={...blankQuote(),cliente:"Prova",verniciatura_ral:smooth,prodotti:[{...blankProduct(),codice:generated.code,codice_temporaneo:generated,descrizione:"Bandella",quantita:10,prezzo_manuale:10}]};
    const a=calculateQuote(doc), b=calculateQuote(JSON.parse(JSON.stringify(a)));
    expect(a.prodotti[0].prezzo_netto_unitario_finale).toBe(15); expect(a.totale_finale).toBe(200);
    expect(b).toEqual(a); expect(doc.prodotti[0].prezzo_manuale).toBe(10);
    expect(buildOneTimeQuotePrintHtml(a)).toContain("Cambio colore (una volta): € 50,00");
    const handoff=salesDocument("quote",JSON.stringify(a));
    expect(handoff.rows).toHaveLength(2); expect(handoff.rows[1].netPrice).toBe("50,00");
    expect(()=>calculateQuote({...doc,verniciatura_ral:{color:"9006",textured:false}})).toThrow(/RAL diverso/);
    expect(()=>calculateQuote({...doc,verniciatura_ral:null})).toThrow(/richiedono/);
  });
  it("does not surcharge a bare already-painted code and applies target before RAL", () => {
    const base={...blankQuote(),verniciatura_ral:smooth,target_totale:100,prodotti:[{...blankProduct(),codice:"TAM0000001IO9010",quantita:10,prezzo_manuale:10}]};
    expect(calculateQuote(base).totale_finale).toBe(100);
    const fresh=calculateQuote({...base,prodotti:[{...base.prodotti[0],codice_temporaneo:generated}]});
    expect(fresh.totale_finale).toBe(200); expect(fresh.rettifica_totale).toBe(0);
  });
  it("uses discounted customer net on commercial rows, carries one fee into PDF and distributor copy", () => {
    const offer={verniciatura_ral:smooth,righe:[{codice:generated.code,codice_temporaneo:generated,descrizione:"Test",listino:20,sconto_base:"50",extra:0,lotto:10}]};
    const a=prepareRalOffer(offer) as any, b=prepareRalOffer(JSON.parse(JSON.stringify(a)));
    expect(a.righe[0].netto).toBe(15); expect(a.ral_riepilogo.total).toBe(200); expect(b).toEqual(a);
    for(const presentation of ["netto","listino_sconto"] as const) {
      const html=buildCommercialOfferPrintHtml(a,"customer",presentation);
      expect(html).toContain("200,00"); expect(html).toContain("15,0000");
      expect(html.match(/Cambio colore \(una volta per ordine\)/g)).toHaveLength(1);
    }
    const distributor=buildDistributorOffer(a,"Distributore",20) as any;
    expect(distributor.righe[0].netto).toBe(12.5);
    expect(distributor.ral_riepilogo.fixed).toBeCloseTo(50/1.2);
    expect(buildCommercialOfferPrintHtml(distributor,"customer")).toContain("166,67");
  });
  it("renders missing commercial net as on request", () => {
    const offer={verniciatura_ral:smooth,righe:[{codice:"TAM0000001I",descrizione:"Test",listino:null,sconto_base:"0",lotto:10}]};
    const html=buildCommercialOfferPrintHtml(offer,"customer");
    expect(html).toContain("Su richiesta"); expect(html).toContain("Totale su richiesta");
  });
});

it("keeps the discounted base net for cycle offers when generating the painted list price and reopening",()=>{
  const options={color:"9010",textured:false};
  const row={codice:"TFP0000042X",descrizione:"Fermapersiana",lotto:10,listino:20,sconto_base:"50",extra:0,verniciatura_ral:options,
    data:{dataJson:JSON.stringify({codice:"TFP0000042X",lotto:"10",costo_lavoro_min:.34,ricarico_spese:0,margine_minimo:0,righe:[{categoria:"COMPONENTE",nr_componenti:1,costo_unitario:4,considera:true}]})}};
  const p=calculateOfferLotPrice(row,10);
  expect(p.baseNetPrice).toBe(10);expect(p.netPrice).toBe(14);
  const generated=generateListinoFromNet(p.netPrice,"50");
  const saved=withOfferLotTerms(row,10,{listino:generated.listino,listino_generato_per_netto:p.netPrice,listino_generato_sconto:"50",netto_prima_ral_generato:p.baseNetPrice});
  const reopened=JSON.parse(JSON.stringify(saved));
  expect(calculateOfferLotPrice(reopened,10).netPrice).toBe(14);
  const offer=prepareRalOffer({verniciatura_ral:options,righe:[reopened]}) as any;
  expect(offer.ral_riepilogo.total).toBe(190);
  expect(prepareRalOffer(offer)).toEqual(offer);
  const distributor=buildDistributorOffer(offer,"Distributore",25) as any;
  expect(calculateOfferLotPrice(distributor.righe[0],10).netPrice).toBe(11.2);
  expect(buildCommercialOfferPrintHtml(distributor,"customer")).toContain("152,00");
});

it("keeps cost-derived RAL prices dynamic after generating a list price",()=>{
  const row={codice:"TAM0000008I",lotto:10,sconto_base:"50",verniciatura_ral:{color:"9010",textured:false},
    data:{dataJson:JSON.stringify({codice:"TAM0000008I",lotto:"10",costo_lavoro_min:.34,ricarico_spese:0,margine_minimo:0,righe:[{categoria:"COMPONENTE",nr_componenti:1,costo_unitario:4,considera:true}]})}};
  const p=calculateOfferLotPrice(row,10);expect(p.netPrice).toBe(6);expect(p.baseNetFromCustomerList).toBe(false);
  const saved=withOfferLotTerms(row,10,{listino:12,listino_generato_per_netto:6,listino_generato_sconto:"50",netto_prima_ral_generato:p.baseNetFromCustomerList?p.baseNetPrice:undefined});
  expect(calculateOfferLotPrice({...saved,margine_netto_desiderato_pct:50},10).netPrice).toBe(12);
});
