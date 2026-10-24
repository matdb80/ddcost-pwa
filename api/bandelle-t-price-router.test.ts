import { describe, expect, it, vi } from "vitest";
vi.mock("./bandelle-t-price-store", () => ({ readBandellePrices: vi.fn(async () => ({ revision: 1 })), listBandellePriceHistory: vi.fn(async () => []), saveBandellePrices: vi.fn(async () => ({ revision: 2 })) }));
import { bandelleTPriceRouter } from "./bandelle-t-price-router";
import type { TrpcContext } from "./context";
const caller = (role?: "admin" | "user") => bandelleTPriceRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), user: role ? { id: 1, name: "Matteo", role } as TrpcContext["user"] : undefined });
const input = { expectedRevision: 1, operations: [{ cellIds: ["t-standard:55:1"], basisPoints: 500 }] };
describe("Permessi listini bandelle a T", () => {
  it("richiede il login per leggere", async () => { await expect(caller().get()).rejects.toMatchObject({ code: "UNAUTHORIZED" }); });
  it("permette a tutti gli utenti autenticati di leggere", async () => { await expect(caller("user").get()).resolves.toEqual({ revision: 1 }); });
  it("impedisce modifiche e ripristini ai non amministratori", async () => {
    await expect(caller("user").save(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("user").restore({ expectedRevision: 2, restoreRevision: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("permette il salvataggio all'amministratore", async () => { await expect(caller("admin").save(input)).resolves.toEqual({ revision: 2 }); });
});
