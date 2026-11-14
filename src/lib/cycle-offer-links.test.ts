import { describe, expect, it } from "vitest";
import { groupCycleDirectory } from "./cycle-directory-groups";
import { linkOffersToCycleGroups, type OfferLinkSource } from "./cycle-offer-links";

const rows = [
  { id: 11, rootId: 10, rev: 1, code: "A", description: "Prodotto A", client: "", updatedAt: null },
  { id: 12, rootId: 10, rev: 2, code: "A", description: "Prodotto A", client: "", updatedAt: null },
  { id: 21, rootId: 20, rev: 1, code: "B", description: "Prodotto B", client: "", updatedAt: null },
];
const offer = (id: number, righe: unknown[]): OfferLinkSource => ({ id, name: `DDC0000${id}/2026`, client: "Cliente", reference: "Progetto", dataJson: JSON.stringify({ righe }) });
const link = (offers: OfferLinkSource[]) => linkOffersToCycleGroups(groupCycleDirectory(rows, "", 1, 25).groups, offers).find(g => g.latest.code === "A")!;

describe("offerte collegate ai cicli", () => {
  it("conta una sola offerta per più righe/lotti dello stesso ciclo", () => {
    const result = link([offer(1, [{ record_id: 11, lotto: 100 }, { record_id: 11, lotto: 500 }])]);
    expect(result.linkedOffers).toHaveLength(1);
    expect(result.linkedOffers[0]).toMatchObject({ id: 1, name: "DDC00001/2026", revisions: [1] });
    expect(result.latest.linkedOffers).toEqual([]);
    expect(result.revisions.find(r => r.id === 11)?.linkedOffers).toHaveLength(1);
  });
  it("raggruppa più revisioni nella stessa offerta e distingue le offerte", () => {
    const result = link([offer(2, [{ record_id: 12, rev: 2 }]), offer(1, [{ record_id: 12, rev: 2 }, { record_id: 11, rev: 1 }])]);
    expect(result.linkedOffers.map(o => o.id)).toEqual([2, 1]);
    expect(result.linkedOffers[1].revisions).toEqual([1, 2]);
    expect(result.latest.linkedOffers).toHaveLength(2);
  });
  it("mostra l'offerta anche se usa una revisione eliminata, tramite radice persistita", () => {
    const result = link([offer(1, [{ record_id: 10, root_id: 10, rev: 1 }])]);
    expect(result.linkedOffers).toHaveLength(1);
    expect(result.revisions.every(r => r.linkedOffers.length === 0)).toBe(true);
  });
  it("legge i riferimenti dentro lo snapshot e gli ID numerici storici in stringa", () => {
    expect(link([offer(1, [{ data: { record_id: "12", root_id: "10", rev: "2" } }])]).latest.linkedOffers).toHaveLength(1);
  });
  it("non attribuisce al ciclo una riga manuale che ha soltanto lo stesso codice", () => {
    expect(link([offer(1, [{ codice: "A", descrizione: "Prodotto A" }])]).linkedOffers).toEqual([]);
  });
  it("gli ID esatti hanno precedenza su una radice incoerente nello snapshot", () => {
    expect(link([offer(1, [{ record_id: 21, root_id: 10 }])]).linkedOffers).toEqual([]);
  });
  it("supporta la radice e revisione storica senza ID del record", () => {
    expect(link([offer(1, [{ root_id: 10, rev: 2 }])]).latest.linkedOffers).toHaveLength(1);
  });
  it("ignora JSON malformato e righe prive di riferimenti validi", () => {
    const malformed = ["{broken", "null", "[]", '{"righe":null}'].map((dataJson, i) => ({ ...offer(i + 1, []), dataJson }));
    expect(link([...malformed, offer(8, [null, "A", 2, { record_id: true }, { record_id: -1 }, { root_id: "NaN" }])]).linkedOffers).toEqual([]);
  });
  it("non modifica gli snapshot e restituisce solo i metadati necessari", () => {
    const source = [offer(1, [{ record_id: 11, data: { costo_segreto: 9 } }])];
    const before = structuredClone(source);
    const result = link(source);
    expect(source).toEqual(before);
    expect(JSON.stringify(result.linkedOffers)).not.toContain("costo_segreto");
    expect(result.linkedOffers[0]).not.toHaveProperty("dataJson");
  });
  it("rispetta i gruppi paginati e non aggrega i cicli privi di codice", () => {
    const directory = groupCycleDirectory([
      { ...rows[0], rootId: null, code: null }, { ...rows[1], rootId: 0, code: null },
    ], "", 1, 25);
    const result = linkOffersToCycleGroups(directory.groups, [offer(1, [{ record_id: 11 }])]);
    expect(result.find(g => g.latest.id === 11)?.linkedOffers).toHaveLength(1);
    expect(result.find(g => g.latest.id === 12)?.linkedOffers).toHaveLength(0);
  });
});
