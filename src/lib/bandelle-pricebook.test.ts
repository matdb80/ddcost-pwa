import { describe, expect, it } from "vitest";
import { initialBandellePrices, applyBandellePriceOperations, bandelleRowsWithPrices, validateBandellePrices } from "./bandelle-pricebook";
import { quoteBandellaVeneta } from "./bandelle-veneta";
describe("Revisioni listini Giotto Plus", () => {
  const original = initialBandellePrices();
  it("aumenta tutte le tabelle mantenendo l'originale", () => {
    const prices = applyBandellePriceOperations(original, [{ cellIds: Object.keys(original), basisPoints: 1000 }]);
    expect(prices["dritte:3:2"]).toBe(711);
    expect(prices["snodate-zancate:8+7:2"]).toBe(972);
    expect(original["dritte:3:2"]).toBe(646);
    expect(Object.keys(prices)).toHaveLength(931);
  });
  it("varia solo le celle selezionate e deduplica le selezioni", () => {
    const prices = applyBandellePriceOperations(original, [{ cellIds: ["dritte:3:2", "dritte:3:2"], basisPoints: 500 }]);
    expect(prices["dritte:3:2"]).toBe(678);
    expect(Object.keys(prices).filter(id => prices[id] !== original[id])).toEqual(["dritte:3:2"]);
  });
  it("gestisce riduzioni, mezzo centesimo e variazioni successive", () => {
    expect(applyBandellePriceOperations(original, [{ cellIds: ["dritte:3:0"], basisPoints: 5000 }])["dritte:3:0"]).toBe(1550);
    const next = applyBandellePriceOperations(original, [
      { cellIds: ["dritte:3:2"], basisPoints: 1000 }, { cellIds: ["dritte:3:2"], basisPoints: -1000 },
    ]);
    expect(next["dritte:3:2"]).toBe(640);
  });
  it("il calcolatore usa il listino salvato e mantiene separati i supplementi", () => {
    const next = applyBandellePriceOperations(original, [{ cellIds: ["dritte:3:2"], basisPoints: 1000 }]);
    expect(quoteBandellaVeneta({ kind: "dritte", typology: "occhio-decentrato-legno", screwHoles: 3, quantity: 25, weldedEyes: true }, bandelleRowsWithPrices("dritte", next)))
      .toMatchObject({ base: 7.11, supplements: 1.50, unit: 8.61, total: 215.25 });
  });
  it("ricalcola l'interpolazione delle vicentine dai due prezzi aggiornati", () => {
    const next = applyBandellePriceOperations(original, [{ cellIds: ["vicentine-doppie:4:2"], basisPoints: 1000 }]);
    expect(quoteBandellaVeneta({ kind: "vicentine-doppie", typology: "normale", screwHoles: 5, holesFirst: 2, holesSecond: 3, quantity: 25 }, bandelleRowsWithPrices("vicentine-doppie", next)).base).toBe(5.90);
  });
  it("rifiuta dati incompleti, identificativi inventati e variazioni fuori limite", () => {
    expect(() => validateBandellePrices({})).toThrow();
    expect(() => applyBandellePriceOperations(original, [{ cellIds: ["inesistente"], basisPoints: 500 }])).toThrow();
    expect(() => applyBandellePriceOperations(original, [{ cellIds: [], basisPoints: 500 }])).toThrow();
    for (const basisPoints of [NaN, Infinity, 0, -10000, 100001, 1.5]) {
      expect(() => applyBandellePriceOperations(original, [{ cellIds: ["dritte:3:2"], basisPoints }])).toThrow();
    }
    expect(() => applyBandellePriceOperations(original, [{ cellIds: ["dritte:3:2"], basisPoints: -9999 }])).toThrow(/fuori limite/);
  });
});
