import {describe,expect,it} from "vitest";
import {buildQuoteMailto,quoteEmailSubject,QUOTE_EMAIL_BODY} from "./quote-email";

describe("quote email (TKT-20261117-84210001)",()=>{
  it("builds the subject from the shared document number and the client",()=>{
    expect(quoteEmailSubject({numero_preventivo:"DDC00042/2026",cliente:"Rossi"})).toBe("Preventivo DDC00042/2026 - Rossi");
  });
  it("falls back to the legacy id, then to the reference, then to a generic subject",()=>{
    expect(quoteEmailSubject({cliente:"Rossi"},991)).toBe("Preventivo 991 - Rossi");
    expect(quoteEmailSubject({riferimento_preventivo:"RIF-1"})).toBe("Preventivo RIF-1");
    expect(quoteEmailSubject({})).toBe("Preventivo unatantum");
  });
  it("prefills the required default body",()=>{
    expect(QUOTE_EMAIL_BODY).toBe("Gentile Cliente,\nin allegato il preventivo richiesto, restiamo a disposizione per eventuali chiarimenti\n\nCordiali saluti");
  });
  it("builds a mailto URL with encoded subject and body",()=>{
    const url=buildQuoteMailto({numero_preventivo:"DDC00042/2026",cliente:"Rossi"});
    expect(url.startsWith("mailto:?subject=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Preventivo DDC00042/2026 - Rossi"));
    expect(url).toContain(encodeURIComponent(QUOTE_EMAIL_BODY));
    expect(decodeURIComponent(url)).toContain("restiamo a disposizione per eventuali chiarimenti");
  });
});
