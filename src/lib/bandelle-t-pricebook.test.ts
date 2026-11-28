import { describe, it, expect } from "vitest";
import { initialBandelleTPrices, applyBandelleTPriceOperations, validateBandelleTPrices, bandelleTRowsWithPrices, T_PRICE_TYPES } from "./bandelle-t-pricebook";
import { initialBandellePrices } from "./bandelle-pricebook";
import { PRICE_LIST_CATALOGS, selectablePriceCells } from "./price-list-catalog";
import { PRICES, TIERS, quoteBandellaT, type TRequest } from "./bandelle-t-listino";
const request: TRequest = { kind: "standard", quantity: 20, collar: 55, position: "centrale", diameterOther: false, reverseOffset: false, overlap: false, zancaLength: 35 };
describe("Gestione listini bandelle a T", () => {
  const original = initialBandelleTPrices();
  it("conserva tutti i 131 prezzi pubblicati esatti, senza applicare un altro 4,5%", () => {
    expect(Object.keys(original)).toHaveLength(131);
    for (const { value } of T_PRICE_TYPES) expect(bandelleTRowsWithPrices(value, original)).toEqual(PRICES[value]);
    expect(original["t-standard:55:1"]).toBe(5734);
    expect(original["t-standard:95:0"]).toBe(8001);
  });
  it("espone matrici con collo e lotto e 30 celle non selezionabili", () => {
    const rows = PRICE_LIST_CATALOGS.t.tables.flatMap(t => t.rows);
    expect(rows).toHaveLength(23);
    expect(rows.flatMap(r => r.cellIds).filter(id => id === null)).toHaveLength(30);
    expect(rows.flatMap(selectablePriceCells).sort()).toEqual(Object.keys(original).sort());
    expect(PRICE_LIST_CATALOGS.veneta.tables.flatMap(t => t.rows.flatMap(selectablePriceCells)).sort()).toEqual(Object.keys(initialBandellePrices()).sort());
    expect(PRICE_LIST_CATALOGS.t.decimals).toBe(3);
    expect(PRICE_LIST_CATALOGS.veneta.decimals).toBe(2);
  });
  it("applica +5% a tutte le tabelle, arrotondando al millesimo", () => {
    const next = applyBandelleTPriceOperations(original, [{ cellIds: Object.keys(original), basisPoints: 500 }]);
    expect(next["t-standard:55:1"]).toBe(6021);
    expect(next["t-misura:55:0"]).toBe(8401);
    expect(next["t-zanca:55:0"]).toBe(10143);
    expect(original["t-standard:55:1"]).toBe(5734);
  });
  it("arrotonda mezzo millesimo verso l'alto e varia solo le celle selezionate", () => {
    const next = applyBandelleTPriceOperations(original, [{ cellIds: ["t-standard:95:0", "t-standard:95:0"], basisPoints: 5000 }]);
    expect(next["t-standard:95:0"]).toBe(12002);
    expect(Object.keys(next).filter(id => next[id] !== original[id])).toEqual(["t-standard:95:0"]);
  });
  it("ricalcola con il prezzo salvato e mantiene i supplementi separati", () => {
    const next = applyBandelleTPriceOperations(original, [{ cellIds: ["t-standard:55:1"], basisPoints: 500 }]);
    expect(quoteBandellaT({ ...request, diameterOther: true, overlap: true }, bandelleTRowsWithPrices("standard", next)))
      .toMatchObject({ base: 6.021, unit: 11.521, total: 230.42 });
    expect(quoteBandellaT({ ...request, position: "decentrato" }, bandelleTRowsWithPrices("standard", next)).base).toBe(6.021);
  });
  it("mantiene la ricerca del collo più vicino e tutte le fasce di quantità", () => {
    for (const { value } of T_PRICE_TYPES) {
      for (const row of PRICES[value]) {
        TIERS.forEach((tier, index) => {
          const calculate = () => quoteBandellaT({ ...request, kind: value, collar: row.collo, quantity: tier.min }, bandelleTRowsWithPrices(value, original));
          if (row.prices[index] === null) expect(calculate).toThrow(/non pubblica un prezzo/);
          else expect(calculate().base).toBe(row.prices[index]);
        });
      }
    }
    expect(quoteBandellaT({ ...request, collar: 60 }, bandelleTRowsWithPrices("standard", original))).toMatchObject({ size: 65, base: 6 });
  });
  it("rifiuta celle non pubblicate, prezzi di altre famiglie e listini incompleti", () => {
    expect(() => applyBandelleTPriceOperations(original, [{ cellIds: ["t-misura:115:2"], basisPoints: 500 }])).toThrow();
    expect(() => applyBandelleTPriceOperations(original, [{ cellIds: ["dritte:3:2"], basisPoints: 500 }])).toThrow();
    expect(() => validateBandelleTPrices(initialBandellePrices())).toThrow();
    expect(() => validateBandelleTPrices({ ...original, "t-misura:115:2": 5000 })).toThrow();
    expect(() => bandelleTRowsWithPrices("standard", {})).toThrow(/mancante/);
  });
});
