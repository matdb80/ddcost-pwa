import {expect,it} from "vitest";
import {buildOneTimeQuotePrintHtml} from "./quote-pdf";
import {buildCommercialOfferPrintHtml} from "./commercial-offer-pdf";
import {buildDistributorOffer} from "./commercial-offer-split";
import {blankQuote,blankProduct,calculateQuote} from "./quote-calculation";
import {prepareRalOffer} from "./ral-documents";
const rows=[{codice:"TFP0000042In",descrizione:"Prova",quantita:10,lotto:10,listino:10,netto:10,sconto_base:"0",prezzo_netto_unitario_finale:10,totale_finale:100}];
const exporters=[
  (doc:Record<string,unknown>)=>buildOneTimeQuotePrintHtml({...doc,prodotti:rows,totale_finale:100}),
  (doc:Record<string,unknown>)=>buildCommercialOfferPrintHtml({...doc,righe:rows},"customer"),
  (doc:Record<string,unknown>)=>buildCommercialOfferPrintHtml({...doc,righe:rows},"internal"),
];
it.each(exporters)("always prints black by default, ignoring an inactive stale RAL summary",exporter=>{
  const html=exporter({verniciatura_ral:null,ral_riepilogo:{color:"9010",fixed:50}});
  expect(html).toContain("<b>Colore</b>");expect(html).toContain("NERO RAL 9005");
  expect(html).not.toContain("RAL 9010");expect(html).not.toContain("Cambio colore");
});
it.each(exporters)("prints the selected colour rather than the black fallback",exporter=>{
  const html=exporter({verniciatura_ral:{color:"9006",textured:false}});
  expect(html).toContain("<b>Colore</b>");expect(html).toContain("RAL 9006");expect(html).not.toContain("NERO RAL 9005");
});
it("retains the selected colour in a distributor copy with already-consolidated RAL prices",()=>{
  const original={verniciatura_ral:{color:"9010",textured:false},righe:rows};
  const distributor=buildDistributorOffer(original,"Distributore",10,"netto");
  const html=buildCommercialOfferPrintHtml(distributor,"customer");
  expect(html).toContain("RAL 9010");expect(html).not.toContain("NERO RAL 9005");
});
it("prints the standard black finish on every quote position with no price surcharge",()=>{
  const original={...blankQuote(),prodotti:[false,true].map(nero_standard_goffrato=>({...blankProduct(),codice:"TFP0000042In",materiale_cad:10,quantita:2,nero_standard_goffrato}))};
  const saved=calculateQuote(original);
  const smooth=calculateQuote({...original,prodotti:original.prodotti.map(p=>({...p,nero_standard_goffrato:false}))});
  expect(saved.totale_finale).toBe(smooth.totale_finale);
  const html=buildOneTimeQuotePrintHtml(JSON.parse(JSON.stringify(saved)));
  expect(html.match(/<strong>Colore: NERO RAL 9005 · LISCIO<\/strong>/g)).toHaveLength(1);
  expect(html.match(/<strong>Colore: NERO RAL 9005 · GOFFRATO<\/strong>/g)).toHaveLength(1);
  expect(html).not.toContain("Cambio colore");
});
it.each(["customer","internal"] as const)("prints each standard-offer position's black finish in %s mode",mode=>{
  const offer={righe:[false,true].map(nero_standard_goffrato=>({...rows[0],nero_standard_goffrato}))};
  expect(prepareRalOffer(offer)).toEqual(offer);
  const html=buildCommercialOfferPrintHtml(offer,mode);
  expect(html.match(/<strong>Colore: NERO RAL 9005 · LISCIO<\/strong>/g)).toHaveLength(1);
  expect(html.match(/<strong>Colore: NERO RAL 9005 · GOFFRATO<\/strong>/g)).toHaveLength(1);
  expect(html).not.toContain("Cambio colore");
});
it("prints the selected RAL finish instead of an inactive black finish on every position",()=>{
  const offer={verniciatura_ral:{color:"9010",textured:false},righe:[{...rows[0],nero_standard_goffrato:true}]};
  expect(buildCommercialOfferPrintHtml(offer,"customer")).toContain("<strong>Colore: RAL 9010 · LISCIO</strong>");
  expect(buildCommercialOfferPrintHtml({...offer,verniciatura_ral:{color:"9010",textured:true}},"customer")).toContain("<strong>Colore: RAL 9010 · GOFFRATO</strong>");
});
