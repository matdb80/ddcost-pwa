import {describe, expect, it, vi} from "vitest";
import {buildOneTimeQuotePrintHtml} from "./quote-pdf";

describe("customer PDF for one-time quotes",()=>{
  it("shows the saved shared document number while retaining the legacy ID fallback",()=>{
    const document={numero_preventivo:"DDC00042/2026",prodotti:[]};
    expect(buildOneTimeQuotePrintHtml(document,991)).toContain("<b>Numero preventivo</b>DDC00042/2026");
    expect(buildOneTimeQuotePrintHtml({prodotti:[]},991)).toContain("<b>Numero preventivo</b>991");
  });
  it("prints customer prices and customer notes while excluding internal data",()=>{
    const html=buildOneTimeQuotePrintHtml({
      titolo_preventivo:"Offerta cliente",
      cliente:"Cliente Uno",
      riferimento_preventivo:"RIF-123",
      note_cliente:"Consegna da concordare",
      note_generali:"INTERNAL-GENERAL-SECRET",
      note_fornitori:"INTERNAL-SUPPLIER-SECRET",
      costo_progettazione_ora:987.65,
      margine_netto_complessivo_perc:73.21,
      prodotti:[{
        codice:"A-101",
        descrizione:"Maniglia",
        quantita:10,
        prezzo_netto_unitario_finale:12.34,
        totale_finale:123.4,
        costo_primo_cad:7.89,
        full_cost:13.4,
      }],
      totale_finale:123.4,
    },4330015);

    expect(html).toContain("Cliente Uno");
    expect(html).toContain("RIF-123");
    expect(html).toContain("<strong class=\"special-product\">* A-101</strong> · Maniglia");
    expect(html).toContain("€ 12,34");
    expect(html).toContain("€ 123,40");
    expect(html).toContain("Consegna da concordare");
    expect(html).not.toContain("INTERNAL-GENERAL-SECRET");
    expect(html).not.toContain("INTERNAL-SUPPLIER-SECRET");
    expect(html).not.toContain("987,65");
    expect(html).not.toContain("73,21");
    expect(html).not.toContain("7,89");
    expect(html).not.toContain("13,40");
  });

  it("escapes customer-provided text and the logo URL before inserting it into HTML",()=>{
    const html=buildOneTimeQuotePrintHtml({
      cliente:"<script>alert('x')</script>",
      note_cliente:"A & B < C",
      prodotti:[{descrizione:"<img src=x onerror=alert(1)>",quantita:1,prezzo_netto_unitario_finale:2,totale_finale:2}],
      totale_finale:2,
    },undefined,"/logo?name=<x>");

    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(html).toContain("A &amp; B &lt; C");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("/logo?name=&lt;x&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("can omit the document total while keeping each product line total",()=>{
    const html=buildOneTimeQuotePrintHtml({
      prodotti:[{
        codice:"A-101",
        descrizione:"Maniglia",
        quantita:10,
        prezzo_netto_unitario_finale:12.34,
        totale_finale:123.4,
      }],
      totale_finale:123.4,
    },4330015,undefined,{hideDocumentTotal:true});

    expect(html).not.toContain("Totale netto preventivo:");
    expect(html).toContain("<th class=\"num\">Totale netto</th>");
    expect(html).toContain("<td class=\"num\">€ 123,40</td>");
  });
});

it('marks only non-series products, with or without a code, and shows a single legend at the foot',()=>{
  const doc={prodotti:[
    {codice:'TBC0000042In',descrizione:'Speciale',quantita:1,prezzo_netto_unitario_finale:10},
    {descrizione:'Senza codice',quantita:1,prezzo_netto_unitario_finale:20},
    {prodotto_di_serie:true,codice:'FCA00504HBIN',descrizione:'Serie',quantita:1,prezzo_serie:3,prezzo_netto_unitario_finale:3},
    {a_forfait:true,codice:'HIDDEN',descrizione:'Forfait',valore_forfait:4},
  ]};
  const html=buildOneTimeQuotePrintHtml(doc);
  expect(html).toContain('<strong class="special-product">* TBC0000042In</strong>');
  expect(html).toContain('<strong class="special-product">*</strong> Senza codice');
  expect(html).toContain('<strong>FCA00504HBIN</strong>');
  expect(html).not.toContain('* FCA00504HBIN');expect(html).not.toContain('HIDDEN');
  expect(html).toContain('<strong class="special-product">*</strong> Forfait');
  expect(html.match(/PRODOTTO SPECIALE REALIZZATO SU DISEGNO/g)).toHaveLength(1);
  expect(html).toContain('color: #005eb8');
  const seriesOnly=buildOneTimeQuotePrintHtml({prodotti:[doc.prodotti[2]]});
  expect(seriesOnly).not.toContain('PRODOTTO SPECIALE REALIZZATO SU DISEGNO');
});

it('prints English labels, RAL categories, colour sample, finish and legend without translating customer input or changing prices',async()=>{
  const {calculateQuote,blankQuote,blankProduct}=await import('./quote-calculation');
  const {ralColors}=await import('./ral-pricing');
  const doc=calculateQuote({...blankQuote(),pdf_in_inglese:true,cliente:'Cliente originale',note_cliente:'Nota originale',verniciatura_ral:{color:'6021',textured:false},prodotti:[
    {...blankProduct(),codice:'TBC0000042In',descrizione:'Descrizione originale',materiale_prodotto:'ferro',quantita:2,materiale_cad:10},
    {...blankProduct(),prodotto_di_serie:true,codice:'FSP001012NIN',descrizione:'Serie',quantita:2,prezzo_serie:10,sconto_serie:'10%'},
    {...blankProduct(),a_forfait:true,descrizione:'Forfait',valore_forfait:3},
  ]});
  const before=structuredClone(doc),html=buildOneTimeQuotePrintHtml(doc);
  for(const phrase of ['lang="en"','One-time quotation','Quotation number','Customer','Reference','Colour','Products and net prices','Net unit price','Quantity','Net total','Total net quotation','Notes','Unit price','Discount','Net price including RAL','pcs','lump sum/to be defined','SPECIAL PRODUCT MADE TO DRAWING','VAT / Tax ID','BL Companies Register','Italy','RAL surcharge summary','Category','Amount','Colour change (once per order)','Espagnolette hardware (Standard)','Strap hinges or hinges','Pale green','SMOOTH','IRON'])expect(html).toContain(phrase);
  for(const phrase of ['Riepilogo supplementi RAL','Colore:','LISCIO','GOFFRATO','Prezzo netto','Quantità','una volta per ordine','a forfait/da definire','Registro Imprese','valore indicativo','soggetto a conferma'])expect(html).not.toContain(phrase);
  for(const phrase of ['Cliente originale','Nota originale','Descrizione originale'])expect(html).toContain(phrase);
  expect(html).toContain('aria-label="RAL 6021"');expect(html).toContain(`fill="${ralColors.find(c=>c.code==='6021')!.hex}"`);
  expect(html).toContain('<strong class="special-product">* TBC0000042IO6021</strong>');
  expect(html).toContain('€ '+doc.totale_finale.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}));
  expect(doc).toEqual(before);
  const italian=buildOneTimeQuotePrintHtml({...doc,pdf_in_inglese:false});
  expect(italian).toContain('PRODOTTO SPECIALE REALIZZATO SU DISEGNO');expect(italian).toContain('Spagnolette (Standard)');
  expect(italian).not.toContain('valore indicativo');expect(italian).not.toContain('soggetto a conferma');
});

it('translates the default black textured finish and optional summary exclusions',async()=>{
  const {ralPrintSummary}=await import('./ral-print-summary');
  const {calculateRal}=await import('./ral-pricing');
  const html=buildOneTimeQuotePrintHtml({pdf_in_inglese:true,prodotti:[{descrizione:'Test',materiale_prodotto:'inox',inox_aisi:'316',nero_standard_goffrato:true}]});
  expect(html).toContain('BLACK RAL 9005 · TEXTURED');expect(html).toContain('STAINLESS STEEL AISI 316');
  expect(html).toContain('aria-label="RAL 9005"');
  const summary=ralPrintSummary(calculateRal([
    {code:'FSP001012NXP',quantity:1,net:2},{code:'FSP001012NIO9005',quantity:1,net:2},
    {code:'FQU0000042IN',quantity:1,net:2},{code:'FZZ0000042IN',quantity:1,net:null},
  ],{color:'6021',textured:false}),undefined,true,'en');
  for(const phrase of ['Stainless steel','already RAL','excluded category','Other items (ZZ)','On request','The batches are alternatives','Items excluded from the surcharge'])expect(summary).toContain(phrase);
});

it.each([false,true])('prints the selected revision in the header in English=%s',english=>{
  const doc={numero_preventivo:'DDC90007/2026',rev:2,pdf_in_inglese:english,prodotti:[]};
  const label=english?'Revision':'Revisione';
  const html=buildOneTimeQuotePrintHtml(doc,123,undefined,{revision:3});
  expect(html).toContain(`DDC90007/2026 <span class="quote-revision">— ${label} 3</span>`);
  expect(doc.rev).toBe(2);
  expect(buildOneTimeQuotePrintHtml(doc)).toContain(`— ${label} 2</span>`);
  for(const rev of [undefined,null,0,-1,1.5,'wrong','<script>',true]){
    const historic=buildOneTimeQuotePrintHtml({...doc,rev});
    expect(historic).toContain(`— ${label} —</span>`);
  }
});

it.each([false,true])('suggests the required PDF filename, independently of the printed title and English=%s',english=>{
  vi.useFakeTimers();
  try{
    vi.setSystemTime(new Date('2026-11-12T10:00:00Z'));
    const doc={numero_preventivo:'DDC90007/2026',rev:7,titolo_preventivo:'PERSIANE RAL 6021',pdf_in_inglese:english,prodotti:[]};
    const html=buildOneTimeQuotePrintHtml(doc,123,undefined,{revision:1});
    expect(html).toContain('<title>2026_DDC90007_REV.1.pdf</title>');
    expect(html).toContain('<h1>PERSIANE RAL 6021</h1>');
    expect(html).toContain(`— ${english?'Revision':'Revisione'} 1</span>`);
    expect(doc.rev).toBe(7);
    expect(buildOneTimeQuotePrintHtml({...doc,numero_preventivo:'DDC00007/2025',rev:12})).toContain('<title>2026_DDC00007_REV.12.pdf</title>');
  }finally{vi.useRealTimers();}
});
it('uses the current calendar year in Italy even when the saved quote belongs to an earlier year',()=>{
  vi.useFakeTimers();
  try{
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z'));
    expect(buildOneTimeQuotePrintHtml({numero_preventivo:'DDC90007/2025',rev:2,prodotti:[]})).toContain('<title>2027_DDC90007_REV.2.pdf</title>');
  }finally{vi.useRealTimers();}
});
