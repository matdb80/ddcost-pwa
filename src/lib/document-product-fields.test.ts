import {expect,it} from "vitest";
import {documentProductCode,documentProductDescription,normalizeDocumentTemporaryCodes} from "./document-product-fields";
import {buildOneTimeQuotePrintHtml} from "./quote-pdf";
import {buildCommercialOfferPrintHtml} from "./commercial-offer-pdf";
import {formatQuoteForCopy,listinoProductIndex} from "./quote-copy";
import {salesDocument} from "./commercial-handoff";
import {blankProduct,blankQuote,calculateQuote} from "./quote-calculation";
const legacy=(material="6",sequence=5)=>({sequence,family:"BC",material,color:null,code:`TBC${String(sequence).padStart(7,"0")}${material}`});
const row=(material="6")=>({...blankProduct(),codice:legacy(material).code,codice_temporaneo:legacy(material),materiale_prodotto:material==="I"?"ferro":"inox",descrizione:"ANGOLARE INFERIORE SX",quantita:25,prezzo_netto_unitario_finale:61.8464,totale_finale:1546.16});
it.each([["I","n"],["X","P"],["6","P"]])("completes old %s codes without changing their issuance record",(material,suffix)=>{
  const input=row(material);const before=structuredClone(input);
  const doc={prodotti:[input],totale_finale:1546.16};
  expect(documentProductCode(input,doc)).toBe(input.codice+suffix);
  const normalized=normalizeDocumentTemporaryCodes(doc,"prodotti");
  expect(normalized.prodotti[0].codice).toBe(input.codice+suffix);
  expect(normalized.prodotti[0].codice_temporaneo).toEqual(before.codice_temporaneo);
  expect(normalized.totale_finale).toBe(doc.totale_finale);
  expect(normalizeDocumentTemporaryCodes(normalized,"prodotti")).toEqual(normalized);
  expect(input).toEqual(before);
});
it("recognizes legacy temporary-format codes without metadata only with a matching selected material",()=>{
  const input={codice:"TBC00000056",materiale_prodotto:"inox"};
  expect(documentProductCode(input,{})).toBe("TBC00000056P");
  for(const p of [{...input,materiale_prodotto:"ferro"},{...input,materiale_prodotto:""},{...input,codice:"FBC00000056"},{...input,codice:"TZZ00000056"},{...input,codice:"TBC00000006"}])
    expect(documentProductCode(p,{})).toBe(p.codice);
});
it("does not guess brass/aluminium finishes or modify RAL, forfait, edited or inconsistent codes",()=>{
  for(const material of ["B","A"]){const p=row(material);expect(documentProductCode(p,{})).toBe(p.codice);}
  for(const doc of [{verniciatura_ral:{color:"3000",textured:false}},{ral_consolidato:true}])expect(documentProductCode(row(),doc)).toBe(row().codice);
  for(const p of [{...row(),a_forfait:true},{...row(),codice:"CUSTOM"},{...row(),codice:"TBC00000056z"},
    {...row(),codice_temporaneo:{...legacy(),sequence:6}},{...row(),codice_temporaneo:{...legacy(),color:"3000"}}])
    expect(documentProductCode(p,{})).toBe(p.codice);
});
it.each([["ferro","FERRO"],["inox","INOX"],["ottone","OTTONE"],["alluminio","ALLUMINIO"]])("appends the selected material %s without modifying the saved 60-character description",(material,label)=>{
  const p={descrizione:"A ".repeat(29)+"AB",materiale_prodotto:material};
  expect(p.descrizione.length).toBe(60);
  expect(documentProductDescription(p)).toBe(p.descrizione+" — "+label);
  expect(p.descrizione.length).toBe(60);
  expect(documentProductDescription({...p,descrizione:"Lavorazione — "+label})).toBe("Lavorazione — "+label);
});
it("includes the recorded stainless grade, falling back to the selected generic material",()=>{
  expect(documentProductDescription(row())).toBe("ANGOLARE INFERIORE SX — INOX AISI 316");
  expect(documentProductDescription(row("X"))).toContain("INOX AISI 304");
  expect(documentProductDescription({...row(),codice:"ALTRO"})).toBe("ANGOLARE INFERIORE SX — INOX");
  expect(documentProductDescription({...row(),a_forfait:true})).toBe("ANGOLARE INFERIORE SX");
});
it("exports the reported old quote with P and material while preserving exact saved prices and mixed finishes",()=>{
  const input={cliente:"Prova",totale_finale:3113.44,prodotti:[row(),{...row(),codice:legacy("6",6).code,codice_temporaneo:legacy("6",6),nero_standard_goffrato:true}]};
  const before=JSON.stringify(input);
  const pdf=buildOneTimeQuotePrintHtml(input);
  expect(pdf).toContain("TBC00000056P · ANGOLARE INFERIORE SX — INOX AISI 316");
  expect(pdf).toContain("TBC00000066P");expect(pdf).toContain("€ 1546,16");expect(pdf).toContain("3113,44");
  expect(pdf).toContain("NERO RAL 9005 · LISCIO");expect(pdf).toContain("NERO RAL 9005 · GOFFRATO");
  const text=formatQuoteForCopy(input);expect(text).toContain("TBC00000056P");expect(text).toContain("INOX AISI 316");
  const sales=salesDocument("quote",JSON.stringify(input));expect(sales.rows[0].code).toBe("TBC00000056P");expect(sales.rows[0].description).toContain("INOX AISI 316");
  expect(JSON.stringify(input)).toBe(before);
});
it("keeps quote economics identical when completing the legacy fixed suffix",()=>{
  const a=calculateQuote({...blankQuote(),prodotti:[{...row(),materiale_cad:2.34}]});
  const b=calculateQuote({...blankQuote(),prodotti:[{...row(),codice:"TBC00000056P",materiale_cad:2.34}]});
  expect(a).toEqual(b);
});
it("uses the same code and material in both commercial PDF presentations",()=>{
  const offer={righe:[{...row(),lotto:25,listino:100,sconto_base:"0",netto:100,prezzo_netto_manuale:100}]};
  for(const mode of ["customer","internal"] as const){
    const html=buildCommercialOfferPrintHtml(offer,mode);
    expect(html).toContain("TBC00000056P");expect(html).toContain("ANGOLARE INFERIORE SX — INOX AISI 316");
  }
});

it("retains the historical list-price reference after completing a code",()=>{
  const second={...row(),codice:legacy("6",6).code,codice_temporaneo:legacy("6",6)};
  const input={prodotti:[row(),second],listino:{codice_riferimento:second.codice,prezzo_listino_generato:100,sconto_riferimento:"40"}};
  const normalized=normalizeDocumentTemporaryCodes(input,"prodotti");
  expect(listinoProductIndex(normalized)).toBe(1);
  const text=formatQuoteForCopy(normalized);
  expect(text.split("Articolo 1")[1].split("Articolo 2")[0]).not.toContain("Prezzo listino:");
  expect(text.split("Articolo 2")[1]).toContain("Prezzo listino: 100,00 €");
});
it("prints material selected in the generator when the offer has no separate material field",()=>{
  const p={...row(),materiale_prodotto:undefined};
  expect(documentProductDescription(p)).toBe("ANGOLARE INFERIORE SX — INOX AISI 316");
  expect(documentProductDescription({...p,codice:"OTHER"})).toBe("ANGOLARE INFERIORE SX");
});
