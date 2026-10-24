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
    expect(() => calculate({ kind: "dritte-con-sormonto" })).toThrow(/tipologie ammesse/);
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

const calculateOverlap = (changes: Partial<BandellaVenetaRequest> = {}) => quoteBandellaVeneta({
  kind: "dritte-con-sormonto",
  typology: "occhio-decentrato",
  screwHoles: 3,
  quantity: 25,
  ...changes,
});

describe("Bandelle dritte con sormonto — immagine image(9).png del 24/10/2026", () => {
  it.each([
    [3, 25, 7.21, 180.25],
    [4, 15, 8.30, 124.50],
    [5, 35, 5.54, 193.90],
    [6, 50, 5.14, 257],
    [7, 70, 4.85, 339.50],
    [8, 90, 4.86, 437.40],
    [9, 4, 15.37, 61.48],
    [10, 20, 10.71, 214.20],
    [11, 100, 5.29, 529],
    [12, 60, 5.99, 359.40],
  ])("quota %i fori e %i pezzi a %f euro, totale %f", (screwHoles, quantity, unit, total) => {
    expect(calculateOverlap({ screwHoles, quantity })).toMatchObject({ base: unit, supplements: 0, unit, total });
  });

  it.each(["occhio-decentrato", "occhio-centrale", "occhio-zancato"])("usa il listino dedicato per %s", (typology) => {
    expect(calculateOverlap({ typology })).toMatchObject({ typology, tier: "21–30", base: 7.21, unit: 7.21, total: 180.25 });
  });

  it.each([[1, 13.05], [2, 26.10], [3, 39.15]])("applica la fascia minima a %i pezzi, totale %f", (quantity, total) => {
    expect(calculateOverlap({ quantity })).toMatchObject({ tier: "4–10", minimumTierApplied: true, unit: 13.05, total });
  });

  it("mantiene separati i listini e i numeri di fori delle due categorie", () => {
    expect(calculate().base).toBe(6.46);
    expect(calculateOverlap().base).toBe(7.21);
    expect(calculateOverlap({ screwHoles: 4 }).base).toBe(7.43);
    expect(() => calculate({ screwHoles: 4 })).toThrow(/numero di fori vite/);
    expect(calculate({ screwHoles: 2 }).base).toBe(6.27);
    expect(() => calculateOverlap({ screwHoles: 2 })).toThrow(/numero di fori vite/);
    expect(() => calculateOverlap({ typology: "occhio-decentrato-legno" })).toThrow(/tipologie ammesse/);
  });

  it("somma i quattro supplementi per pezzo al prezzo della tabella sormonto", () => {
    const result = calculateOverlap({ weldedEyes: true, extraThicknessMm: 0.5, reinforcement: true, nonStandardDiameter: true });
    expect(result).toMatchObject({ base: 7.21, supplements: 6.50, unit: 13.71, total: 342.75 });
    expect(result.additions.map((addition) => addition.euro)).toEqual([1.50, 1, 2, 2]);
  });

  it("calcola l'aumento dello spessore e gli occhi saldati anche sotto 4 pezzi", () => {
    expect(calculateOverlap({ quantity: 2, extraThicknessMm: 1, weldedEyes: true })).toMatchObject({ base: 13.05, supplements: 3.50, unit: 16.55, total: 33.10 });
  });

  it("rifiuta combinazioni senza prezzo e spessori non definiti", () => {
    expect(() => calculateOverlap({ screwHoles: 13 })).toThrow(/numero di fori vite/);
    expect(() => calculateOverlap({ screwHoles: 3.5 })).toThrow(/numero di fori vite/);
    expect(() => calculateOverlap({ quantity: 101 })).toThrow(/quantità intera da 1 a 100/);
    expect(() => calculateOverlap({ quantity: 0 })).toThrow(/quantità intera da 1 a 100/);
    expect(() => calculateOverlap({ extraThicknessMm: 0.25 })).toThrow(/multiplo di 0,5 mm/);
  });
});
