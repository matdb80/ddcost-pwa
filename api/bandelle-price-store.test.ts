import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialBandellePrices } from "../src/lib/bandelle-pricebook";
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), end: vi.fn() }));
vi.mock("mysql2/promise", () => ({ default: { createConnection: vi.fn(async () => db) } }));
import { saveBandellePrices } from "./bandelle-price-store";
describe("Salvataggio atomico del listino", () => {
  const original = initialBandellePrices();
  const current = { id: 3, dataJson: JSON.stringify(original), createdAt: "2026-10-24", createdByName: "Matteo", description: "Listino" };
  const input = { expectedRevision: 3, operations: [{ cellIds: ["dritte:3:2"], basisPoints: 1000 }] };
  beforeEach(() => { vi.resetAllMocks(); db.query.mockResolvedValue([[current]]); db.execute.mockResolvedValue([{ affectedRows: 1 }]); });
  it("salva una nuova fotografia completa con autore e operazioni", async () => {
    await expect(saveBandellePrices(input, { id: 1, name: "Matteo" })).resolves.toEqual({ revision: 4 });
    const [sql, values] = db.execute.mock.calls[0];
    expect(sql).toMatch(/^INSERT/);
    expect(values[0]).toBe(4);
    expect(JSON.parse(values[1])["dritte:3:2"]).toBe(711);
    expect(values[2]).toBe(1);
    expect(JSON.parse(values[5])).toEqual(input);
    expect(db.end).toHaveBeenCalledOnce();
  });
  it("blocca una bozza obsoleta prima di scrivere", async () => {
    await expect(saveBandellePrices({ ...input, expectedRevision: 2 }, { id: 1, name: "Matteo" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("tratta due salvataggi concorrenti come conflitto senza sovrascritture", async () => {
    db.execute.mockRejectedValue({ code: "ER_DUP_ENTRY" });
    await expect(saveBandellePrices(input, { id: 1, name: "Matteo" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.execute).toHaveBeenCalledOnce();
  });
  it("ripristina una revisione come nuovo snapshot", async () => {
    const previous = { ...original, "dritte:3:2": 600 };
    db.query.mockResolvedValueOnce([[current]]).mockResolvedValueOnce([[{ ...current, id: 1, dataJson: JSON.stringify(previous) }]]);
    await expect(saveBandellePrices({ expectedRevision: 3, restoreRevision: 1 }, { id: 1, name: "Matteo" })).resolves.toEqual({ revision: 4 });
    expect(JSON.parse(db.execute.mock.calls[0][1][1])).toEqual(previous);
  });
  it("propaga un errore DB e chiude la connessione senza dichiarare un successo", async () => {
    db.execute.mockRejectedValue(new Error("Database offline"));
    await expect(saveBandellePrices(input, { id: 1, name: "Matteo" })).rejects.toThrow("Database offline");
    expect(db.end).toHaveBeenCalledOnce();
  });
});
