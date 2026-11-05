import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import type { TrpcContext } from "./context";
import { emptyRiga } from "../src/types/cycle";
import { prepareRawMaterialEditor } from "../src/lib/cycle-raw-material";
import { cycleMaterialDataJson } from "./cycle-material-input";

const state = vi.hoisted(() => ({ db: undefined as any, reads: [] as string[] }));
vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
import { cycleRouter } from "./cycle-router";
const user = { id: 1, role: "admin", commercialOnly: false };
const caller = (who: unknown = user) => cycleRouter.createCaller({ user: who } as TrpcContext);
const raw = () => ({ ...prepareRawMaterialEditor({ ...emptyRiga(), categoria: "MATERIA PRIMA DA TRASFORMARE" }, false), lunghezza: 1000, larghezza: 50, spessore: 2, costo_unitario: 3 });
beforeEach(() => {
  state.reads = [];
  const records: Record<string, any[]> = {
    cycles: [{ id: 12, rootId: 10, rev: 2, code: "A", description: "Ciclo", client: "", updatedAt: null, deleted: 0, dataJson: "{}" }],
    commercial_offers: [{ id: 1, name: "DDC00001/2026", client: "Cliente", reference: "Progetto", dataJson: JSON.stringify({ righe: [{ record_id: 12 }, { record_id: 12 }] }) }],
  };
  state.db = { select: () => {
    let table = "";
    const q = { from: (t: any) => { table = getTableName(t); state.reads.push(table); return q; },
      where: () => q, orderBy: async () => records[table] };
    return q;
  } };
});

describe("API elenco cicli e riferimenti offerte", () => {
  it("restituisce il conteggio deduplicato senza JSON tecnici delle offerte", async () => {
    const result = await caller().listGrouped({});
    expect(result.groups[0].linkedOffers).toHaveLength(1);
    expect(result.groups[0].latest.linkedOffers).toHaveLength(1);
    expect(result.groups[0].linkedOffers[0]).not.toHaveProperty("dataJson");
    expect(state.reads).toEqual(["cycles", "commercial_offers"]);
  });
  it("non carica le offerte quando la pagina non contiene cicli", async () => {
    expect((await caller().listGrouped({ search: "inesistente" })).groups).toEqual([]);
    expect(state.reads).toEqual(["cycles"]);
  });
  it.each([null, { ...user, commercialOnly: true }])("mantiene il controllo di accesso ai redattori", async who => {
    await expect(caller(who).listGrouped({})).rejects.toMatchObject({ code: who ? "FORBIDDEN" : "UNAUTHORIZED" });
    expect(state.reads).toEqual([]);
  });
});

describe("validazione salvataggio delle nuove materie prime", () => {
  it("accetta il calcolo nuovo valido e non riscrive i vecchi dati", () => {
    const text = JSON.stringify({ righe: [raw()] });
    expect(cycleMaterialDataJson.parse(text)).toBe(text);
    const legacy = JSON.stringify({ righe: [{ ...emptyRiga(), categoria: "MATERIA PRIMA DA TRASFORMARE", sfrido: 12 }] });
    expect(cycleMaterialDataJson.parse(legacy)).toBe(legacy);
  });
  it("rifiuta dati nuovi incompleti anche se il client invia un peso automatico salvato", () => {
    const text = JSON.stringify({ righe: [{ ...raw(), lunghezza: 0, peso_kg: 7 }] });
    expect(cycleMaterialDataJson.safeParse(text).success).toBe(false);
  });
  it("blocca le scritture prima di chiamare il database", async () => {
    const dataJson = JSON.stringify({ righe: [{ ...raw(), geometria_materia_prima: "tubo", diametro: 10, diametro_interno: 20 }] });
    const api = caller();
    for (const request of [
      () => api.create({ dataJson }), () => api.update({ id: 1, dataJson }),
      () => api.createRevision({ sourceId: 1, rootId: 1, dataJson }),
      () => api.overwriteLatest({ sourceId: 1, rootId: 1, expectedDataJson: null, confirmation: "SOVRASCRIVI DEFINITIVAMENTE", dataJson }),
    ]) await expect(request()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.reads).toEqual([]);
  });
});
