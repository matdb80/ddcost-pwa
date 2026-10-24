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

const calculateZancate = (changes: Partial<BandellaVenetaRequest> = {}) => quoteBandellaVeneta({
  kind: "dritte-zancate",
  typology: "zanca-filo-legno",
  screwHoles: 5,
  quantity: 25,
  ...changes,
});

describe("Bandelle dritte zancate — immagine image(10).png del 24/10/2026", () => {
  it.each([
    [5, 25, 6.63, 165.75],
    [6, 15, 7.77, 116.55],
    [7, 35, 5.10, 178.50],
    [8, 50, 4.73, 236.50],
    [9, 70, 4.46, 312.20],
    [10, 90, 4.47, 402.30],
    [11, 4, 16.84, 67.36],
    [12, 20, 11.06, 221.20],
    [13, 100, 4.87, 487],
    [14, 60, 5.51, 330.60],
    [15, 81, 4.89, 396.09],
  ])("quota %i fori e %i pezzi a %f euro, totale %f", (screwHoles, quantity, unit, total) => {
    expect(calculateZancate({ screwHoles, quantity })).toMatchObject({ base: unit, supplements: 0, unit, total });
  });

  it.each(["zanca-filo-legno", "zanca-90-legno", "zanca-filo-pvc", "zanca-90-pvc"])("usa il listino zancate per %s", (typology) => {
    expect(calculateZancate({ typology })).toMatchObject({ typology, tier: "21–30", base: 6.63, unit: 6.63, total: 165.75 });
  });

  it.each([[1, 13.57], [2, 27.14], [3, 40.71]])("applica la fascia minima a %i pezzi, totale %f", (quantity, total) => {
    expect(calculateZancate({ quantity })).toMatchObject({ tier: "4–10", minimumTierApplied: true, unit: 13.57, total });
  });

  it("mantiene separati listini, tipologie e numeri di fori tra le categorie", () => {
    expect(calculateZancate().base).toBe(6.63);
    expect(calculateOverlap({ screwHoles: 5 }).base).toBe(5.90);
    expect(() => calculateZancate({ screwHoles: 4 })).toThrow(/numero di fori vite/);
    expect(() => calculateZancate({ typology: "occhio-zancato" })).toThrow(/tipologie ammesse/);
    expect(() => calculateOverlap({ typology: "zanca-filo-legno" })).toThrow(/tipologie ammesse/);
  });

  it("somma tutti i supplementi confermati al prezzo della tabella zancate", () => {
    const result = calculateZancate({ weldedEyes: true, extraThicknessMm: 0.5, reinforcement: true, nonStandardDiameter: true });
    expect(result).toMatchObject({ base: 6.63, supplements: 6.50, unit: 13.13, total: 328.25 });
    expect(result.additions.map((addition) => addition.euro)).toEqual([1.50, 1, 2, 2]);
  });

  it("rifiuta quantità e spessori non definiti", () => {
    expect(() => calculateZancate({ quantity: 101 })).toThrow(/quantità intera da 1 a 100/);
    expect(() => calculateZancate({ quantity: 0 })).toThrow(/quantità intera da 1 a 100/);
    expect(() => calculateZancate({ extraThicknessMm: 0.25 })).toThrow(/multiplo di 0,5 mm/);
  });
});

const calculateVicentineDritte = (changes: Partial<BandellaVenetaRequest> = {}) => quoteBandellaVeneta({
  kind: "vicentine-dritte",
  typology: "dritte-legno",
  screwHoles: 3,
  quantity: 25,
  ...changes,
});

describe("Bandelle vicentine dritte — immagine image(20261024-071349).png", () => {
  it.each([
    [2, 25, 3.97, 99.25],
    [3, 25, 4.01, 100.25],
    [4, 35, 3.17, 110.95],
    [5, 90, 2.79, 251.10],
  ])("quota %i fori e %i pezzi a %f euro, totale %f", (screwHoles, quantity, unit, total) => {
    expect(calculateVicentineDritte({ screwHoles, quantity })).toMatchObject({ base: unit, supplements: 0, unit, total });
  });

  it.each([
    [4, 13.79, "4–10"], [10, 13.79, "4–10"],
    [11, 6.97, "11–20"], [20, 6.97, "11–20"],
    [21, 4.01, "21–30"], [30, 4.01, "21–30"],
    [31, 3.07, "31–40"], [40, 3.07, "31–40"],
    [41, 2.70, "41–60"], [60, 2.70, "41–60"],
    [61, 2.47, "61–80"], [80, 2.47, "61–80"],
    [81, 2.25, "81–100"], [100, 2.25, "81–100"],
  ] as const)("a %i pezzi applica %f euro nella fascia %s", (quantity, unit, tier) => {
    expect(calculateVicentineDritte({ quantity })).toMatchObject({ unit, tier, minimumTierApplied: false });
  });

  it.each(["dritte-legno", "dritte-pvc", "dritte-sormonto-pvc-alluminio"])("usa la tabella vicentine per %s", (typology) => {
    expect(calculateVicentineDritte({ typology })).toMatchObject({ typology, base: 4.01, total: 100.25 });
  });

  it.each([[1, 13.79], [2, 27.58], [3, 41.37]])("per %i pezzi usa la fascia minima e totalizza %f", (quantity, total) => {
    expect(calculateVicentineDritte({ quantity })).toMatchObject({ tier: "4–10", minimumTierApplied: true, unit: 13.79, total });
  });

  it("applica i quattro supplementi a ogni pezzo del lotto", () => {
    const result = calculateVicentineDritte({ weldedEyes: true, extraThicknessMm: 0.5, reinforcement: true, nonStandardDiameter: true });
    expect(result).toMatchObject({ base: 4.01, supplements: 6.50, unit: 10.51, total: 262.75 });
    expect(result.additions.map((addition) => addition.euro)).toEqual([1.50, 1, 2, 2]);
  });

  it("non mescola i prezzi con le dritte o il sormonto", () => {
    expect(calculateVicentineDritte().base).toBe(4.01);
    expect(calculate().base).toBe(6.46);
    expect(calculateOverlap().base).toBe(7.21);
    expect(() => calculateVicentineDritte({ typology: "occhio-decentrato" })).toThrow(/tipologie ammesse/);
  });

  it("rifiuta fori, lotti e spessori per i quali manca un prezzo definito", () => {
    expect(() => calculateVicentineDritte({ screwHoles: 6 })).toThrow(/numero di fori vite/);
    expect(() => calculateVicentineDritte({ quantity: 101 })).toThrow(/quantità intera da 1 a 100/);
    expect(() => calculateVicentineDritte({ extraThicknessMm: 0.25 })).toThrow(/multiplo di 0,5 mm/);
  });
});

const calculateVicentineDoppie = (changes: Partial<BandellaVenetaRequest> = {}) => quoteBandellaVeneta({
  kind: "vicentine-doppie",
  typology: "normale",
  holesFirst: 2,
  holesSecond: 2,
  screwHoles: 4,
  quantity: 25,
  ...changes,
});

describe("Bandelle vicentine doppie — somma fori e listino image(20261024-072132).png", () => {
  it.each([
    [2, 2, 25, 5.54, 138.50],
    [3, 3, 15, 7.84, 117.60],
    [4, 4, 35, 5.42, 189.70],
    [5, 5, 50, 5.20, 260],
    [6, 6, 90, 4.67, 420.30],
  ])("usa la riga esplicita %i+%i per %i pezzi: %f euro, totale %f", (holesFirst, holesSecond, quantity, unit, total) => {
    expect(calculateVicentineDoppie({ holesFirst, holesSecond, screwHoles: holesFirst + holesSecond, quantity }))
      .toMatchObject({ holePair: [holesFirst, holesSecond], screwHoles: holesFirst + holesSecond, base: unit, unit, total });
  });

  it.each([
    [2, 4, 6, 5.71], [4, 2, 6, 5.71], [2, 6, 8, 5.90], [3, 5, 8, 5.90],
  ])("per %i+%i prende la riga del totale %i: %f euro", (holesFirst, holesSecond, screwHoles, base) => {
    expect(calculateVicentineDoppie({ holesFirst, holesSecond, screwHoles })).toMatchObject({ base, interpolatedFrom: undefined });
  });

  it.each([
    [2, 3, 5, 5.63, [4, 6]], [3, 2, 5, 5.63, [4, 6]],
    [3, 4, 7, 5.81, [6, 8]],
    [4, 5, 9, 5.99, [8, 10]],
    [5, 6, 11, 6.19, [10, 12]],
  ])("per %i+%i interpola il totale %i tra le righe %j", (holesFirst, holesSecond, screwHoles, base, interpolatedFrom) => {
    expect(calculateVicentineDoppie({ holesFirst, holesSecond, screwHoles })).toMatchObject({ base, interpolatedFrom });
  });

  it.each([
    [4, 13.72, "4–10"], [11, 7.76, "11–20"], [21, 5.63, "21–30"],
    [31, 5.15, "31–40"], [41, 4.75, "41–60"], [61, 4.33, "61–80"], [81, 4.01, "81–100"],
  ] as const)("per 2+3 e lotto %i applica %f euro nella fascia %s", (quantity, base, tier) => {
    expect(calculateVicentineDoppie({ holesFirst: 2, holesSecond: 3, screwHoles: 5, quantity }))
      .toMatchObject({ base, tier, interpolatedFrom: [4, 6] });
  });

  it.each(["normale", "zancate", "sormonto", "zancate-con-sormonto", "per-pvc"])("applica il listino %s", (typology) => {
    expect(calculateVicentineDoppie({ typology })).toMatchObject({ typology, base: 5.54 });
  });

  it.each([[1, 13.64], [2, 27.28], [3, 40.92]])("per %i pezzi usa la fascia minima e totalizza %f", (quantity, total) => {
    expect(calculateVicentineDoppie({ quantity })).toMatchObject({ minimumTierApplied: true, tier: "4–10", base: 13.64, total });
  });

  it("applica i supplementi anche al prezzo interpolato per ogni pezzo", () => {
    expect(calculateVicentineDoppie({ holesFirst: 2, holesSecond: 3, screwHoles: 5,
      weldedEyes: true, extraThicknessMm: 0.5, reinforcement: true, nonStandardDiameter: true,
    })).toMatchObject({ base: 5.63, supplements: 6.50, unit: 12.13, total: 303.25 });
  });

  it("non ammette mai una metà con un solo foro", () => {
    expect(() => calculateVicentineDoppie({ holesFirst: 1, holesSecond: 2, screwHoles: 3 })).toThrow(/da 2 a 6 per lato/);
    expect(() => calculateVicentineDoppie({ holesFirst: 2, holesSecond: 1, screwHoles: 3 })).toThrow(/da 2 a 6 per lato/);
    expect(() => calculateVicentineDoppie({ holesFirst: 1, holesSecond: 3, screwHoles: 4 })).toThrow(/da 2 a 6 per lato/);
  });

  it("rifiuta coppie mancanti, incoerenti o fuori limite", () => {
    expect(() => calculateVicentineDoppie({ holesFirst: undefined })).toThrow(/fori delle due metà/);
    expect(() => calculateVicentineDoppie({ holesFirst: 3, screwHoles: 4 })).toThrow(/deve essere la loro somma/);
    expect(() => calculateVicentineDoppie({ holesFirst: 1.5, holesSecond: 2, screwHoles: 3.5 })).toThrow(/fori delle due metà/);
    expect(() => calculateVicentineDoppie({ holesFirst: 7, holesSecond: 2, screwHoles: 9 })).toThrow(/fori delle due metà/);
    expect(() => calculateVicentineDoppie({ holesFirst: 1, holesSecond: 1, screwHoles: 2 })).toThrow(/da 2 a 6 per lato/);
  });
});
