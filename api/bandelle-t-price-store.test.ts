import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialBandelleTPrices } from "../src/lib/bandelle-t-pricebook";
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), end: vi.fn() }));
vi.mock("mysql2/promise", () => ({ default: { createConnection: vi.fn(async () => db) } }));
import { saveBandellePrices, readBandellePrices, listBandellePriceHistory } from "./bandelle-t-price-store";
describe("Storico indipendente bandelle a T", () => {
  const original = initialBandelleTPrices();
  const current = { id: 1, dataJson: JSON.stringify(original), createdAt: "2026-10-24", createdByName: "Matteo", description: "Listino Smeralda" };
  const input = { expectedRevision: 1, operations: [{ cellIds: ["t-standard:55:1"], basisPoints: 500 }] };
  beforeEach(() => { vi.resetAllMocks(); db.query.mockResolvedValue([[current]]); db.execute.mockResolvedValue([{ affectedRows: 1 }]); });
  it("salva esclusivamente nella tabella Smeralda e conserva i millesimi", async () => {
    await expect(saveBandellePrices(input, { id: 1, name: "Matteo" })).resolves.toEqual({ revision: 2 });
    expect(db.query.mock.calls[0][0]).toContain("FROM bandelle_t_price_revisions");
    const [sql, values] = db.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO bandelle_t_price_revisions");
    expect(JSON.parse(values[1])["t-standard:55:1"]).toBe(6021);
  });
  it("legge dati e storico dalla sola tabella Smeralda", async () => {
    expect((await readBandellePrices()).prices).toEqual(original);
    expect(await listBandellePriceHistory()).toHaveLength(1);
    expect(db.query.mock.calls.every(([sql]) => sql.includes("FROM bandelle_t_price_revisions"))).toBe(true);
  });
  it("rifiuta bozze obsolete e collisioni tra salvataggi", async () => {
    await expect(saveBandellePrices({ ...input, expectedRevision: 2 }, { id: 1, name: "Matteo" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.execute).not.toHaveBeenCalled();
    db.execute.mockRejectedValue({ code: "ER_DUP_ENTRY" });
    await expect(saveBandellePrices(input, { id: 1, name: "Matteo" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("ripristina il vecchio snapshot con una nuova revisione", async () => {
    db.query.mockResolvedValueOnce([[{ ...current, id: 2, dataJson: JSON.stringify({ ...original, "t-standard:55:1": 6021 }) }]])
      .mockResolvedValueOnce([[current]]);
    await expect(saveBandellePrices({ expectedRevision: 2, restoreRevision: 1 }, { id: 1, name: "Matteo" })).resolves.toEqual({ revision: 3 });
    expect(JSON.parse(db.execute.mock.calls[0][1][1])).toEqual(original);
  });
});
