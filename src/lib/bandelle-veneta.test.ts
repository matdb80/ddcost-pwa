import { describe, expect, it } from "vitest";
import { quoteBandellaVeneta, type BandellaVenetaRequest } from "./bandelle-veneta";

const base: BandellaVenetaRequest = {
  kind: "dritte",
  typology: "occhio-decentrato-legno",
  screwHoles: 3,
  quantity: 25,
};
const calculate = (changes: Partial<BandellaVenetaRequest> = {}) => quoteBandellaVeneta({ ...base, ...changes });

describe("Bandelle dritte Giotto Plus — tabella e supplementi del 24/10/2026", () => {
  it("riproduce l'esempio: 3 fori, 25 pezzi, 6,46 euro per pezzo", () => {
    expect(calculate()).toMatchObject({ screwHoles: 3, quantity: 25, tier: "21–30", base: 6.46, supplements: 0, unit: 6.46, total: 161.50 });
  });

  it.each([
    [4, 10.33, "4–10"], [10, 10.33, "4–10"],
    [11, 7.68, "11–20"], [20, 7.68, "11–20"],
    [21, 6.46, "21–30"], [30, 6.46, "21–30"],
    [31, 5.71, "31–40"], [40, 5.71, "31–40"],
    [41, 4.31, "41–60"], [60, 4.31, "41–60"],
    [61, 4.20, "61–80"], [80, 4.20, "61–80"],
    [81, 3.33, "81–100"], [100, 3.33, "81–100"],
  ] as const)("per %i pezzi usa %f euro e la fascia %s, estremi inclusi", (quantity, unit, tier) => {
    expect(calculate({ quantity })).toMatchObject({ unit, tier, minimumTierApplied: false });
  });

  it.each([[1, 10.33], [2, 20.66], [3, 30.99]])("per %i pezzi usa il prezzo dei 4 pezzi e addebita il totale %f", (quantity, total) => {
    expect(calculate({ quantity })).toMatchObject({ quantity, tier: "4–10", minimumTierApplied: true, unit: 10.33, total });
  });

  it("applica il prezzo della fascia a tutto il lotto e calcola il totale in centesimi", () => {
    expect(calculate({ screwHoles: 2, quantity: 7 })).toMatchObject({ unit: 10.03, total: 70.21 });
    expect(calculate({ screwHoles: 15, quantity: 100 })).toMatchObject({ unit: 4.73, total: 473 });
  });

  it("conserva il valore esatto a 8 fori senza correggerlo rispetto ai 3 fori", () => {
    expect(calculate({ screwHoles: 8 })).toMatchObject({ unit: 5.13, total: 128.25 });
  });

  it.each([
    "occhio-decentrato-legno", "occhio-centrale-legno", "occhio-decentrato-pvc",
  ])("usa la tabella per la tipologia ammessa %s", (typology) => {
    expect(calculate({ typology }).unit).toBe(6.46);
  });

  it.each([4, 5, 6, 7, 0, 1, 16, 2.5, NaN, Infinity])("non inventa prezzi per %s fori", (screwHoles) => {
    expect(() => calculate({ screwHoles })).toThrow(/numero di fori vite/);
  });

  it.each([-1, 0, 1.5, 100.5, 101, NaN, Infinity])("rifiuta il lotto non coperto %s", (quantity) => {
    expect(() => calculate({ quantity })).toThrow(/quantità intera da 1 a 100/);
  });

  it("non applica il listino delle dritte ad altre famiglie o tipologie", () => {
    expect(() => calculate({ kind: "snodate" })).toThrow(/listino.*non è ancora definito/);
    expect(() => calculate({ kind: "dritte-con-sormonto" })).toThrow(/listino.*non è ancora definito/);
    expect(() => calculate({ typology: "occhio-centrale-pvc" })).toThrow(/tipologie ammesse/);
    expect(() => calculate({ typology: "" })).toThrow(/tipologie ammesse/);
  });

  it.each([
    [{ weldedEyes: true }, 1.50, 7.96],
    [{ reinforcement: true }, 2, 8.46],
    [{ nonStandardDiameter: true }, 2, 8.46],
    [{ extraThicknessMm: 0.5 }, 1, 7.46],
    [{ extraThicknessMm: 1 }, 2, 8.46],
    [{ extraThicknessMm: 1.5 }, 3, 9.46],
  ] as const)("applica il supplemento per pezzo %j", (changes, supplements, unit) => {
    const result = calculate(changes);
    expect(result).toMatchObject({ base: 6.46, supplements, unit });
    expect(result.additions).toHaveLength(1);
  });

  it("somma tutti i supplementi e li applica a ogni pezzo del lotto", () => {
    const result = calculate({ weldedEyes: true, extraThicknessMm: 0.5, reinforcement: true, nonStandardDiameter: true });
    expect(result).toMatchObject({ base: 6.46, supplements: 6.50, unit: 12.96, total: 324 });
    expect(result.additions).toHaveLength(4);
  });

  it("calcola anche i supplementi sulla quantità effettiva nei lotti sotto 4 pezzi", () => {
    expect(calculate({ quantity: 2, weldedEyes: true, extraThicknessMm: 1 })).toMatchObject({ base: 10.33, supplements: 3.50, unit: 13.83, total: 27.66 });
  });

  it.each([-0.5, 0.25, 0.75, NaN, Infinity])("rifiuta aumenti di spessore non definiti: %s mm", (extraThicknessMm) => {
    expect(() => calculate({ extraThicknessMm })).toThrow(/zero o un multiplo di 0,5 mm/);
  });
});
