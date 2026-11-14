import {expect,it} from "vitest";
import {blankProduct,blankQuote,calculateQuote,moveQuoteProduct,movedProductIndex} from "./quote-calculation";
import {temporaryCode,calculateRal,temporaryCodeCopyOptions,manualTemporaryCodePrefix} from "./ral-pricing";
import {buildOneTimeQuotePrintHtml} from "./quote-pdf";
import {documentProductCode} from "./document-product-fields";
import {documentPrintFinish} from "./document-print-color";
import {prepareRalOffer} from "./ral-documents";
const ral={color:"6021",textured:false};
const row=(code:string)=>({...blankProduct(),descrizione:"Bandella",codice:code,materiale_cad:10,quantita:2});
it.each(["I","X","6","B","A"])("natural %s has suffix zero without changing existing finishes",material=>{
  const code=temporaryCode(1,"BC",material,null,undefined,true);
  expect(code).toBe(`TBC0000001${material}0`);expect(code).toHaveLength(12);
  expect(documentProductCode(row(code),{verniciatura_ral:ral})).toBe(code);
  expect(()=>temporaryCode(1,"BC",material,"6021",undefined,true)).toThrow(/Grezzo/);
  const summary=calculateRal([{code,net:10,quantity:2}],{...ral,textured:true});
  expect(summary.rows[0]).toMatchObject({natural:true,paintable:false,percent:0,net:10});
  expect(summary.fixed).toBe(0);expect(summary.total).toBe(20);
});
it("preserves natural, painted and manually edited suffixes when copying",()=>{
  const naturalBrass={sequence:1,family:"BC",material:"B",color:null,code:"TBC0000001B0"};
  expect(manualTemporaryCodePrefix(naturalBrass)).toBeNull();
  expect(()=>temporaryCodeCopyOptions(naturalBrass,"TBC0000001Bz")).toThrow(/non corrisponde/);
  expect(temporaryCodeCopyOptions({sequence:1,family:"BC",material:"6",color:null,code:"TBC000000160"},"TBC000000160")).toMatchObject({natural:true,material:"6",color:null});
  expect(temporaryCodeCopyOptions({sequence:1,family:"BC",material:"B",color:null,code:"TBC0000001Ba"},"TBC0000001Bz")).toMatchObject({natural:false,suffix:"z"});
  expect(temporaryCodeCopyOptions({sequence:1,family:"BC",material:"6",color:"6021",code:"TBC00000016O6021"},"TBC00000016O6021")).toMatchObject({color:"6021",natural:false});
  expect(()=>temporaryCodeCopyOptions({sequence:1,family:"BC",material:"6",color:null,code:"TBC00000016P"},"TBC000000160")).toThrow(/non corrisponde/);
});
it.each([false,true])("all-natural PDF contains no colour square or finish/paint labels, English=%s",english=>{
  const doc=calculateQuote({...blankQuote(),cliente:"Test",pdf_in_inglese:english,verniciatura_ral:ral,prodotti:[row("TBC000000160")]});
  const html=buildOneTimeQuotePrintHtml(doc);
  expect(html).toContain(english?"UNFINISHED / NATURAL":"GREZZO / NATURALE");
  expect(html).not.toMatch(/class="ral-swatch"|RAL 6021|RAL 9005|GOFFRATO|LISCIO|TEXTURED|SMOOTH/);
  expect(doc.ral_riepilogo.fixed).toBe(0);
  expect(doc.prodotti[0].ral_ricarico_cad).toBe(0);
});
it("a mixed PDF shows the swatch only for painted products and preserves the natural SKU",()=>{
  const doc=calculateQuote({...blankQuote(),cliente:"Test",verniciatura_ral:{...ral,textured:true},prodotti:[row("TBC000000160"),row("TBC0000002In")]});
  const html=buildOneTimeQuotePrintHtml(doc);
  const trs=html.match(/<tr>.*?<\/tr>/gs)!;
  const natural=trs.find(r=>r.includes("TBC000000160"))!,painted=trs.find(r=>r.includes("TBC0000002IO6021"))!;
  expect(natural).toContain("GREZZO / NATURALE");expect(natural).not.toMatch(/class="ral-swatch"|RAL 6021|GOFFRATO|LISCIO/);
  expect(painted).toContain('class="ral-swatch"');expect(painted).toContain("GOFFRATO");
  expect(doc.prodotti[0].ral_percentuale).toBe(0);expect(doc.prodotti[1].ral_percentuale).toBe(100);
  expect(doc.ral_riepilogo.fixed).toBe(100);expect(html).not.toContain("TBC000000160 (nylon)");
  expect(documentPrintFinish({},row("TBC000000160"))).toBe("GREZZO / NATURALE");
  expect(documentPrintFinish({},row("TBC0000002In"))).toBe("NERO RAL 9005 · LISCIO");
});
it("standard offers also exclude an explicitly natural temporary SKU from RAL",()=>{
  const offer:any=prepareRalOffer({verniciatura_ral:ral,righe:[{codice:"TBC000000160",listino:10,lotto:2}]});
  expect(offer.righe[0].netto).toBe(10);expect((offer.ral_riepilogo as any).fixed).toBe(0);
});
it("moving rows preserves their contents and keeps the selected price reference on the same item",()=>{
  const rows=[row("FIRST"),row("SECOND"),row("THIRD")];
  const moved=moveQuoteProduct(rows,1,-1);
  expect(moved.map(p=>p.codice)).toEqual(["SECOND","FIRST","THIRD"]);
  expect(moved[0]).toBe(rows[1]);expect(rows.map(p=>p.codice)).toEqual(["FIRST","SECOND","THIRD"]);
  expect([0,1,2].map(i=>movedProductIndex(i,1,-1))).toEqual([1,0,2]);
  expect(moveQuoteProduct(rows,0,-1)).toBe(rows);expect(moveQuoteProduct(rows,2,1)).toBe(rows);
});
