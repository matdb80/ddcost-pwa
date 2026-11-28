import { describe, expect, it } from "vitest";
import {
  RAL_PENDING_LABEL,
  quoteRalTypedCodeError,
  quoteRalTypedCodeIssues,
  ralPdfCodePreview,
  ralSupplementExclusion,
  ralSupplementExclusionLabel,
  ralTypedCodeIssue,
  ralTypedCodeWarning,
} from "./quote-ral-typed-code";

const smooth9010 = { color: "9010", textured: false };

describe("ralTypedCodeIssue", () => {
  it("rileva il caso DDC90020: codice digitato O7035 con RAL 9010 selezionato", () => {
    const issue = ralTypedCodeIssue(
      { prodotto_di_serie: true, codice: "VBCD091Z03IO7035" },
      smooth9010,
      1
    );
    expect(issue).toMatchObject({
      index: 1,
      code: "VBCD091Z03IO7035",
      typedRal: "7035",
      targetRal: "9010",
      standard: "VBCD091Z03IN",
      pdfCode: "VBCD091Z03IO9010",
    });
  });

  it("rileva anche il RAL digitato uguale a quello di testata", () => {
    const issue = ralTypedCodeIssue({ codice: "VBCD091Z03IO9010" }, smooth9010);
    expect(issue).toMatchObject({ typedRal: "9010", targetRal: "9010", standard: "VBCD091Z03IN" });
  });

  it("non segnala il codice con finitura standard", () => {
    expect(ralTypedCodeIssue({ codice: "VBCD091Z03IN" }, smooth9010)).toBeNull();
    expect(ralTypedCodeIssue({ codice: "FSP001012NIN" }, smooth9010)).toBeNull();
  });

  it("non segnala senza RAL di documento, su righe a forfait o documenti consolidati", () => {
    const row = { codice: "VBCD091Z03IO7035" };
    expect(ralTypedCodeIssue(row, null)).toBeNull();
    expect(ralTypedCodeIssue(row, { color: "xxx", textured: false })).toBeNull();
    expect(ralTypedCodeIssue({ ...row, a_forfait: true }, smooth9010)).toBeNull();
    expect(
      quoteRalTypedCodeIssues({
        verniciatura_ral: smooth9010,
        ral_consolidato: true,
        prodotti: [row],
      })
    ).toEqual([]);
  });

  it("non segnala i codici temporanei verniciati generati da DDCost (flusso di rigenerazione)", () => {
    const generated = { sequence: 1, family: "AM", material: "I", color: "9010", code: "TAM0000001IO9010" };
    expect(
      ralTypedCodeIssue({ codice: "TAM0000001IO9010", codice_temporaneo: generated }, smooth9010)
    ).toBeNull();
  });

  it("non segnala la famiglia QU (esclusa dalla verniciatura) né i grezzi/naturali", () => {
    expect(ralTypedCodeIssue({ codice: "TQU0000001IO7035" }, smooth9010)).toBeNull();
    expect(ralTypedCodeIssue({ codice: "TCS0000009I0" }, smooth9010)).toBeNull();
  });

  it("propone lo standard solo per il ferro (base di 11 caratteri, materiale I)", () => {
    expect(ralTypedCodeIssue({ codice: "VBCD091Z03XO7035" }, smooth9010))
      .toMatchObject({ typedRal: "7035", standard: null, pdfCode: null });
    expect(ralTypedCodeIssue({ codice: "ABC123O7035" }, smooth9010))
      .toMatchObject({ standard: null, pdfCode: null });
    expect(ralTypedCodeIssue({ codice: "FSP001012NIO7035" }, smooth9010))
      .toMatchObject({ standard: "FSP001012NIN", pdfCode: "FSP001012NIO9010" });
  });

  it("normalizza il maiuscolo/minuscolo", () => {
    expect(ralTypedCodeIssue({ codice: "vbcd091z03io7035" }, smooth9010))
      .toMatchObject({ code: "VBCD091Z03IO7035", standard: "VBCD091Z03IN" });
  });
});

describe("quoteRalTypedCodeError", () => {
  it("nomina la riga da correggere e resta nullo senza rilievi", () => {
    const doc = {
      verniciatura_ral: smooth9010,
      prodotti: [
        { prodotto_di_serie: true, codice: "FCA00504HBIN" },
        { prodotto_di_serie: true, codice: "VBCD091Z03IO7035" },
        { a_forfait: true, codice: "IGNORATO9010" },
        { codice: "VBCD091Z03XO6021" },
      ],
    };
    const error = quoteRalTypedCodeError(doc);
    expect(error).toContain(RAL_PENDING_LABEL);
    expect(error).toContain("riga 2 (VBCD091Z03IO7035)");
    expect(error).toContain("riga 4 (VBCD091Z03XO6021)");
    expect(error).not.toContain("riga 1");
    expect(error).not.toContain("riga 3");
    expect(quoteRalTypedCodeError({ verniciatura_ral: smooth9010, prodotti: [{ codice: "VBCD091Z03IN" }] })).toBeNull();
    expect(quoteRalTypedCodeError({ prodotti: [{ codice: "VBCD091Z03IO7035" }] })).toBeNull();
  });
});

describe("ralTypedCodeWarning", () => {
  it("usa la dicitura richiesta, invariata", () => {
    const issue = ralTypedCodeIssue({ codice: "VBCD091Z03IO7035" }, smooth9010)!;
    expect(ralTypedCodeWarning(issue)).toBe(
      "Il codice inserito è già in RAL 7035. Inserisci il codice con finitura standard. DDCost lo convertirà in RAL 9010 e calcolerà il relativo supplemento"
    );
  });
});

describe("ralPdfCodePreview", () => {
  it("mostra il codice convertito solo quando la conversione avviene davvero", () => {
    expect(ralPdfCodePreview({ codice: "VBCD091Z03IN" }, smooth9010)).toBe("VBCD091Z03IO9010");
    expect(ralPdfCodePreview({ codice: "VBCD091Z03IO7035" }, smooth9010)).toBeNull();
    expect(ralPdfCodePreview({ codice: "" }, smooth9010)).toBeNull();
    expect(ralPdfCodePreview({ codice: "VBCD091Z03IN" }, null)).toBeNull();
    expect(ralPdfCodePreview({ a_forfait: true, codice: "VBCD091Z03IN" }, smooth9010)).toBeNull();
  });
});

// v24: esclusione del materiale prioritaria sul controllo (nylon), pulsante
// «Usa …» solo quando la conversione è effettiva, motivi di esclusione sotto
// la riga al posto del solo «+0%».
describe("v24 — nylon, proposta non convertibile e motivi di esclusione", () => {
  it("nylon (materiale N in 11ª posizione): nessun rilievo, nessun blocco, motivo «nylon»", () => {
    const row = { prodotto_di_serie: true, codice: "LRNG211605NO7035" };
    // Il motore applica correttamente lo 0%: l'esclusione del materiale ha la
    // precedenza sul controllo del codice digitato.
    expect(ralTypedCodeIssue(row, smooth9010)).toBeNull();
    expect(quoteRalTypedCodeError({ verniciatura_ral: smooth9010, prodotti: [row] })).toBeNull();
    expect(ralSupplementExclusion(row, smooth9010)).toBe("nylon");
    expect(ralSupplementExclusionLabel("nylon")).toBe("Supplemento RAL non applicabile: nylon");
  });

  it("codice con trattino: rilievo bloccante senza proposta né anteprima PDF", () => {
    // «VBCD091-03IN» conterrebbe un trattino: il motore lo tarifferebbe ma NON
    // lo convertirebbe nel PDF. Nessun pulsante — inserimento manuale.
    const issue = ralTypedCodeIssue({ codice: "VBCD091-03IO7035" }, smooth9010);
    expect(issue).toMatchObject({
      code: "VBCD091-03IO7035",
      typedRal: "7035",
      targetRal: "9010",
      standard: null,
      pdfCode: null,
    });
    expect(quoteRalTypedCodeError({ verniciatura_ral: smooth9010, prodotti: [{ codice: "VBCD091-03IO7035" }] }))
      .toContain("riga 1 (VBCD091-03IO7035)");
  });

  it("la proposta resta invariata per i codici validi (conversione effettiva)", () => {
    expect(ralTypedCodeIssue({ codice: "VBCD091Z03IO7035" }, smooth9010))
      .toMatchObject({ standard: "VBCD091Z03IN", pdfCode: "VBCD091Z03IO9010" });
    expect(ralTypedCodeIssue({ codice: "FSP001012NIO7035" }, smooth9010))
      .toMatchObject({ standard: "FSP001012NIN", pdfCode: "FSP001012NIO9010" });
  });

  it("motivi di esclusione: forfait, famiglia QU e grezzo/naturale, con le diciture richieste", () => {
    expect(ralSupplementExclusion({ a_forfait: true, descrizione: "Gestione ordine", prezzo_netto_unitario_finale: 100 }, smooth9010)).toBe("forfait");
    expect(ralSupplementExclusionLabel("forfait")).toBe("Supplemento RAL non applicabile: riga a forfait");
    expect(ralSupplementExclusion({ codice: "TQU0000001IO7035" }, smooth9010)).toBe("qu");
    expect(ralSupplementExclusionLabel("qu")).toBe("Supplemento RAL non applicabile: famiglia QU");
    expect(ralSupplementExclusion({ codice: "TCS0000009I0" }, smooth9010)).toBe("naturale");
    expect(ralSupplementExclusionLabel("naturale")).toBe("Supplemento RAL non applicabile: grezzo/naturale");
  });

  it("nessuna esclusione per righe verniciabili, codici da correggere, RAL assente o codice vuoto", () => {
    expect(ralSupplementExclusion({ codice: "VBCD091Z03IN" }, smooth9010)).toBeNull();
    // Codice con RAL «cotto» da correggere: lo gestisce ralTypedCodeIssue, non è un'esclusione.
    expect(ralSupplementExclusion({ codice: "VBCD091Z03IO7035" }, smooth9010)).toBeNull();
    expect(ralSupplementExclusion({ codice: "LRNG211605NO7035" }, null)).toBeNull();
    expect(ralSupplementExclusion({ codice: "LRNG211605NO7035" }, { color: "xxx", textured: false })).toBeNull();
    expect(ralSupplementExclusion({ codice: "" }, smooth9010)).toBeNull();
    expect(ralSupplementExclusion(null, smooth9010)).toBeNull();
  });
});
