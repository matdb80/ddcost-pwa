import {describe, expect, it} from "vitest";
import {buildOneTimeQuotePrintHtml} from "./quote-pdf";

describe("customer PDF for one-time quotes",()=>{
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
    expect(html).toContain("A-101 · Maniglia");
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
});
