import { describe, expect, it } from "vitest";
import { serializeCycleDataJson } from "@/types/cycle";
import { copyCycleAsNamedDraft, copyCycleAsNewDraft } from "./cycle-copy";

describe("copy cycle as a new draft", () => {
  it("keeps cycle data while removing the source identity and revision metadata", () => {
    const sourceRows = [
      { categoria: "COMPONENTE", codice_articolo: "MP-01", costo_unitario: 1.2, considera: true },
      { categoria: "LAVORAZIONE INTERNA", codice_articolo: "OP-01", attrezzaggio_min: 20, lotto_voce: 100 },
    ];
    const source = {
      id: 92,
      rootId: 70,
      rev: 4,
      code: "CIC-70",
      description: "Bandella simile",
      client: "Cliente storico",
      lot: "250",
      standardCost: "1.76",
      minimumPrice: "2.20",
      dataJson: JSON.stringify({
        tipo: "ciclo_standard",
        codice: "CIC-70",
        descrizione: "Bandella simile",
        cliente: "Cliente storico",
        lotto: "250",
        rev: 4,
        root_id: 70,
        created_at: "2024-02-03T10:00:00.000Z",
        custom_legacy_field: { source: "import storico" },
        righe: sourceRows,
        lotti_personalizzati: [25, 250, 1000],
        note_generali: "Nota di processo",
      }),
    };

    const draft = copyCycleAsNewDraft(source);
    const serialized = serializeCycleDataJson(draft);

    expect(draft.id).toBeUndefined();
    expect(draft.rootId).toBeUndefined();
    expect(draft.rev).toBeUndefined();
    expect(draft.codice).toBe("");
    expect(draft.descrizione).toBe("Bandella simile");
    expect(draft.cliente).toBe("Cliente storico");
    expect(draft.lotto).toBe("250");
    expect(draft.righe).toHaveLength(2);
    expect(draft.righe[1].attrezzaggio_min).toBe(20);
    expect(draft.lotti_personalizzati).toEqual([25, 250, 1000]);
    expect(draft.note_generali).toBe("Nota di processo");
    expect(draft._extra.custom_legacy_field).toEqual({ source: "import storico" });
    expect(serialized).not.toHaveProperty("root_id");
    expect(serialized).not.toHaveProperty("rootId");
    expect(serialized).not.toHaveProperty("rev");
    expect(serialized).not.toHaveProperty("created_at");
    expect(source.dataJson).toContain('"root_id":70');
    expect(draft.righe[0]).not.toBe(sourceRows[0]);
  });

  it("prepares an independent duplicate with the requested new code and description",()=>{
    const source={
      id:12,rootId:10,rev:3,code:"CIC-10",description:"Ciclo originale",client:"Cliente",
      lot:"100",dataJson:JSON.stringify({codice:"CIC-10",descrizione:"Ciclo originale",rev:3,rootId:10,righe:[]}),
    };
    const draft=copyCycleAsNamedDraft(source,"  CIC-10-COPIA  ","  Ciclo duplicato  ");
    const serialized=serializeCycleDataJson(draft);
    expect(draft.codice).toBe("CIC-10-COPIA");
    expect(draft.descrizione).toBe("Ciclo duplicato");
    expect(draft.id).toBeUndefined();
    expect(draft.rootId).toBeUndefined();
    expect(draft.rev).toBeUndefined();
    expect(serialized).not.toHaveProperty("rootId");
    expect(serialized).not.toHaveProperty("rev");
    expect(()=>copyCycleAsNamedDraft(source," ","Duplicato")).toThrow(/codice e una nuova descrizione/);
  });
});
