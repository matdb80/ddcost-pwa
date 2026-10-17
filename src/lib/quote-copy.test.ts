import { describe, it, expect } from "vitest";
import { formatQuoteForCopy } from "./quote-copy";

describe("customer quote clipboard", () => {
  it("copies customer-facing fields and total without disclosing industrial costs", () => {
    const text = formatQuoteForCopy({
      cliente:"Cliente Rossi", riferimento_preventivo:"R-12",
      prodotti:[{codice:"ABC",descrizione:"Bandella a T",quantita:3,
        prezzo_netto_unitario_finale:10.35,full_cost:7.71,costo_primo_cad:5}],
      listino:{product_index_riferimento:0,sconto_riferimento:"40+10%",prezzo_listino_generato:19.17},
      totale_finale:31.05,note_cliente:"Consegna da definire",note_fornitori:"Non mostrare",
    });
    expect(text).toContain("Codice articolo: ABC");
    expect(text).toContain("Prezzo listino: € 19,17");
    expect(text).toContain("Sconto cliente: 40+10%");
    expect(text).toContain("Prezzo netto unitario: € 10,35");
    expect(text).toContain("Totale riga: € 31,05");
    expect(text).toContain("Totale documento: € 31,05");
    expect(text).toContain("Note cliente:");
    expect(text).not.toMatch(/full.cost|costo.primo|7,71|Non mostrare/);
  });
  it("omits unknown listino instead of applying it to all items", () => {
    const text = formatQuoteForCopy({
      prodotti:[{descrizione:"A",quantita:1,prezzo_netto_unitario_finale:10},
                {descrizione:"B",quantita:2,prezzo_netto_unitario_finale:5}],
      totale_finale:20,listino:{sconto_riferimento:"40%",prezzo_listino_generato:20},
    });
    expect(text).not.toContain("Prezzo listino:");
    expect(text).toContain("Totale documento: € 20,00");
  });
  it("copies the listino only to the selected product",()=>{
    const text = formatQuoteForCopy({
      prodotti:[{descrizione:"A",quantita:1,prezzo_netto_unitario_finale:9},
                {descrizione:"B",quantita:1,prezzo_netto_unitario_finale:12}],
      listino:{product_index_riferimento:1,sconto_riferimento:"40%",prezzo_listino_generato:20},
    });
    expect(text.match(/Prezzo listino:/g)).toHaveLength(1);
    expect(text.indexOf("Prezzo listino:")).toBeGreaterThan(text.indexOf("Articolo 2"));
  });
  it("refuses to copy invalid quantities",()=>{
    expect(()=>formatQuoteForCopy({prodotti:[{descrizione:"",quantita:0,prezzo_netto_unitario_finale:1}]})).toThrow();
  });
});