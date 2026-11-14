import {describe,expect,it} from "vitest";
import {parseIncompleteQuote,quoteIsDraft} from "./quote-draft-state";

describe("TKT-20261015-14060005: incomplete quote draft support",()=>{
  it("permits unfinished product details without treating a draft as a finished quote",()=>{
    const quote=parseIncompleteQuote(JSON.stringify({
      cliente:"",prodotti:[{codice:"",descrizione:"",quantita:0,
        gruppo_merceologico:"",materiale_prodotto:""}],
      stato_preventivo:"bozza",
    }));
    expect(quote.prodotti).toHaveLength(1);
    expect(quoteIsDraft(JSON.stringify(quote))).toBe(true);
  });
  it("does not mislabel historical or completed quotes as draft",()=>{
    expect(quoteIsDraft(JSON.stringify({prodotti:[{}]}))).toBe(false);
    expect(quoteIsDraft(JSON.stringify({stato_preventivo:"completo"}))).toBe(false);
    expect(quoteIsDraft("not json")).toBe(false);
    expect(quoteIsDraft(null)).toBe(false);
  });
  it("rejects corrupt or structurally invalid draft documents",()=>{
    for(const bad of ["invalid","null","[]","{}",
      JSON.stringify({prodotti:[]}),
      JSON.stringify({prodotti:["a"]}),
      JSON.stringify({prodotti:[null]}),
    ])expect(()=>parseIncompleteQuote(bad),bad).toThrow();
  });
  it("does not require client, margin or treatment data to preserve an incomplete work",()=>{
    const result=parseIncompleteQuote('{"prodotti":[{}]}');
    expect(result).toEqual({prodotti:[{}]});
  });
});
