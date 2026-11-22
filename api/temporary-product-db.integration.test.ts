/**
 * Prova di integrazione R1 (TKT-20261119-86210001) su DATABASE REALE DEDICATO.
 *
 * Esegue reserve → complete → duplicate del router di produzione e poi il
 * ciclo completo della bozza sul quote router di produzione:
 *   copia del prodotto → salvataggio bozza → riapertura (quote.get),
 * verificando che le due righe conservino i due codici temporanei VALIDI e
 * DISTINTI emessi dal contatore.
 *
 * SICUREZZA: il test esegue DELETE FROM temporary_product_codes. Per questo
 * gira SOLO se DDCOST_TEST_DATABASE_URL punta a un database dedicato su
 * localhost il cui nome contiene "test" (es. ddcost_test). In caso contrario
 * il beforeAll fallisce prima di toccare qualsiasi dato.
 *
 * Tabelle richieste nel database dedicato: temporary_product_sequence (riga
 * id=1), temporary_product_codes, quotes, product_groups, commercial_offers,
 * offer_number_sequence (riga id=1). Unica differenza dalla produzione: la
 * connessione locale non usa TLS; la SQL eseguita è quella dei router.
 *
 * Esecuzione: DDCOST_TEST_DATABASE_URL=mysql://user:pass@127.0.0.1:3306/ddcost_test \
 *   npx vitest run api/temporary-product-db.integration.test.ts
 * Senza la variabile il file viene saltato (skip), non fallisce.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_URL = process.env.DDCOST_TEST_DATABASE_URL;

/** Rifiuta qualsiasi URL che non sia chiaramente un database di test dedicato. */
function assertDedicatedTestDatabase(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DDCOST_TEST_DATABASE_URL non è un URL valido: test annullato");
  }
  const host = parsed.hostname;
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!["127.0.0.1", "localhost", "::1"].includes(host) || !/test/i.test(dbName))
    throw new Error(
      `Rifiutato: "${url}" non è un database di test dedicato su localhost (il nome deve contenere "test"). ` +
      "Il test esegue DELETE FROM temporary_product_codes e non deve toccare altri database.",
    );
}

vi.mock("./queries/connection", async () => {
  const { drizzle } = await import("drizzle-orm/mysql2");
  const schema = await import("@db/schema");
  const relations = await import("@db/relations");
  const db = drizzle({
    connection: { uri: process.env.DDCOST_TEST_DATABASE_URL },
    mode: "planetscale",
    schema: { ...schema, ...relations },
  });
  return { getDb: () => db };
});

import { sql } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { temporaryProductRouter } from "./temporary-product-router";
import { quoteRouter } from "./quote-router";
import { validateTemporaryProductDocument } from "./temporary-code-validation";
import { blankProduct, blankQuote } from "../src/lib/quote-calculation";
import { quoteCostCompleteness } from "../src/lib/quote-cost-completeness";
import type { TrpcContext } from "./context";

const ctx = (): TrpcContext => ({
  req: new Request("http://localhost"),
  resHeaders: new Headers(),
  user: { id: 1, name: "Test R1", role: "user" } as TrpcContext["user"],
});
const caller = () => temporaryProductRouter.createCaller(ctx());
const quoteCaller = () => quoteRouter.createCaller(ctx());

type Row = { sequence: number; code: string | null; requestKey: string };
const rows = async () => {
  const result = await getDb().execute(sql.raw(
    "SELECT sequence, code, requestKey FROM temporary_product_codes ORDER BY sequence"));
  return (result as unknown as Row[][])[0];
};

describe.skipIf(!TEST_URL)("temporaryProduct + bozza su database reale dedicato (R1, TKT-20261119-86210001)", () => {
  beforeAll(async () => {
    assertDedicatedTestDatabase(TEST_URL!);
    const db = getDb();
    await db.execute(sql.raw("DELETE FROM temporary_product_codes"));
    await db.execute(sql.raw("UPDATE temporary_product_sequence SET lastNumber = 0 WHERE id = 1"));
  });

  it("reserve → complete → duplicate ×2: ogni copia riceve un codice valido e distinto", async () => {
    const api = caller();
    const reservation = await api.reserve({ requestKey: crypto.randomUUID(), family: "BC" });
    expect(reservation.sequence).toBe(1);
    const issued = await api.complete({
      requestKey: reservation.requestKey, family: "BC", material: "6", color: null, natural: false,
    });
    expect(issued.code).toMatch(/^TBC\d{7}6/);

    const copy1 = await api.duplicate({
      requestKey: crypto.randomUUID(), sourceCode: issued.code, currentCode: issued.code,
    });
    const copy2 = await api.duplicate({
      requestKey: crypto.randomUUID(), sourceCode: issued.code, currentCode: issued.code,
    });
    expect(copy1.code).toMatch(/^TBC\d{7}6/);
    expect(copy2.code).toMatch(/^TBC\d{7}6/);
    // ogni nuovo codice emesso dal server è interamente maiuscolo (finitura N inclusa)
    for (const emitted of [issued.code, copy1.code, copy2.code]) expect(emitted).toBe(emitted.toUpperCase());
    expect(new Set([issued.code, copy1.code, copy2.code]).size).toBe(3);
    expect(copy1.sequence).toBeGreaterThan(issued.sequence);
    expect(copy2.sequence).toBeGreaterThan(copy1.sequence);

    // Le tre emissioni sono persistite: la riga copiata sul client riceve
    // esattamente il codice restituito da duplicate (vedi test jsdom editor).
    const list = await rows();
    expect(list.map(r => r.code)).toEqual([issued.code, copy1.code, copy2.code]);
  });

  it("copia, salvataggio bozza e riapertura conservano due codici distinti", async () => {
    const api = caller();
    // 1. prodotto originale con codice temporaneo emesso dal contatore
    const reservation = await api.reserve({ requestKey: crypto.randomUUID(), family: "BC" });
    const original = await api.complete({
      requestKey: reservation.requestKey, family: "BC", material: "I", color: null, natural: false,
    });
    // 2. copia della riga: secondo codice distinto, come fa l'editor
    const copy = await api.duplicate({
      requestKey: crypto.randomUUID(), sourceCode: original.code, currentCode: original.code,
    });
    expect(copy.code).not.toBe(original.code);
    expect(copy.code).toMatch(/^TBC\d{7}I/);
    // ferro: la finitura automatica è N maiuscola sia sull'originale sia sulla copia
    expect(original.code).toBe(original.code.toUpperCase());
    expect(copy.code).toBe(copy.code.toUpperCase());

    const toRow = (
      issued: { sequence: number; family: string; material: string | null; color: string | null; code: string | null },
      descrizione: string,
    ) => ({
      ...blankProduct(),
      codice: String(issued.code),
      codice_temporaneo: {
        sequence: issued.sequence, family: issued.family,
        material: issued.material, color: issued.color ?? null, code: String(issued.code),
      },
      materiale_prodotto: "ferro",
      descrizione,
    });
    const document = {
      ...blankQuote(),
      cliente: "Cliente prova R1",
      prodotti: [toRow(original, "Prodotto originale"), toRow(copy, "Copia del prodotto")],
    };
    // 3. salvataggio della bozza sul router di produzione
    const saved = await quoteCaller().saveDraft({
      client: "Cliente prova R1", reference: "RIF-R1", dataJson: JSON.stringify(document),
    });
    expect(saved.id).toBeGreaterThan(0);
    expect(saved.isDraft).toBe(true);

    // 4. riapertura: i due codici sono ancora quelli emessi, validi e distinti
    const reopened = await quoteCaller().get({ id: saved.id });
    expect(reopened).not.toBeNull();
    const parsed = JSON.parse(String(reopened!.dataJson));
    const codes = (parsed.prodotti as Array<Record<string, any>>).map(p => String(p.codice));
    expect(codes).toEqual([original.code, copy.code]);
    expect(new Set(codes).size).toBe(2);
    const metadata = (parsed.prodotti as Array<Record<string, any>>).map(p => p.codice_temporaneo?.code);
    expect(metadata).toEqual([original.code, copy.code]);

    // e i record del contatore restano intatti dopo salvataggio e riapertura
    const persisted = (await rows()).map(r => r.code);
    expect(persisted).toContain(original.code);
    expect(persisted).toContain(copy.code);
  });

  it("caso storico TRN0000037I/TRN0000037In: copia, salvataggio bozza, riapertura e validazione da definitivo", async () => {
    const api = caller();
    const db = getDb();
    // record di emissione storico a 11 caratteri, precedente alla regola maiuscola
    await db.execute(sql.raw(
      `INSERT INTO temporary_product_codes (sequence, requestKey, userId, family, material, color, code)
       VALUES (37, '${crypto.randomUUID()}', 1, 'RN', 'I', NULL, 'TRN0000037I')`));
    // la riga originale contiene la finitura minuscola; la copia riceve un nuovo progressivo maiuscolo
    const copy = await api.duplicate({
      requestKey: crypto.randomUUID(), sourceCode: "TRN0000037I", currentCode: "TRN0000037In",
    });
    expect(copy.code).toMatch(/^TRN\d{7}IN$/);
    expect(copy.sequence).not.toBe(37);
    const originalRecord = { sequence: 37, family: "RN", material: "I", color: null, code: "TRN0000037I" };
    // gruppo merceologico presente nel catalogo condiviso: serve al completamento
    await db.execute(sql.raw("INSERT IGNORE INTO product_groups (name, createdBy) VALUES ('Cerniere', 1)"));
    const toRow = (codice: string, metadata: Record<string, unknown>, descrizione: string) => ({
      ...blankProduct(), codice, codice_temporaneo: metadata, materiale_prodotto: "ferro", descrizione,
      gruppo_merceologico: "Cerniere", oggetto_modifica: ["occhio"],
    });
    const document = {
      ...blankQuote(), cliente: "Cliente caso storico",
      prodotti: [toRow("TRN0000037In", originalRecord, "Riga storica"), toRow(String(copy.code), copy as unknown as Record<string, unknown>, "Copia")],
    };
    // bozza: salvataggio sul router di produzione e riapertura dal database
    const saved = await quoteCaller().saveDraft({
      client: "Cliente caso storico", reference: "RIF-STORICO", dataJson: JSON.stringify(document),
    });
    const reopened = await quoteCaller().get({ id: saved.id });
    const parsed = JSON.parse(String(reopened!.dataJson));
    // la riga storica conserva il suo codice con la «n» minuscola; il documento non cambia
    expect((parsed.prodotti as Array<Record<string, any>>).map(p => String(p.codice))).toEqual(["TRN0000037In", copy.code]);
    // definitivo: la bozza viene completata dal router (validazione finale sul
    // database reale) e il documento viene riletto una seconda volta. I costi
    // del documento di prova sono volutamente vuoti: come nel flusso reale,
    // il completamento richiede la conferma esplicita dell'attribuzione.
    const toFinalize = JSON.parse(String(reopened!.dataJson)) as Record<string, unknown>;
    toFinalize.costi_incompleti_conferma = quoteCostCompleteness(toFinalize).signature;
    await quoteCaller().finalizeDraft({
      draftId: saved.id, client: "Cliente caso storico", reference: "RIF-STORICO",
      dataJson: JSON.stringify(toFinalize),
    });
    const finalized = await quoteCaller().get({ id: saved.id });
    const finalDoc = JSON.parse(String(finalized!.dataJson)) as Record<string, any>;
    expect(finalDoc.stato_preventivo).toBe("completo");
    // dopo la seconda riapertura entrambi i codici sono immutati: la «n»
    // minuscola della riga storica e il nuovo progressivo della copia con finale IN
    expect((finalDoc.prodotti as Array<Record<string, any>>).map(p => String(p.codice))).toEqual(["TRN0000037In", copy.code]);
    expect(String(copy.code)).toMatch(/IN$/);
    // la stessa validazione in modalità non-bozza accetta entrambe le righe
    await expect(validateTemporaryProductDocument(String(finalized!.dataJson), "prodotti", false)).resolves.toBeUndefined();
    // i record di emissione restano intatti
    const persisted = (await rows()).map(r => r.code);
    expect(persisted).toContain("TRN0000037I");
    expect(persisted).toContain(copy.code);
  });

  it("duplicate con la stessa requestKey è idempotente: stesso codice, nessuna riga nuova", async () => {
    const api = caller();
    const src = await api.reserve({ requestKey: crypto.randomUUID(), family: "BC" });
    const done = await api.complete({
      requestKey: src.requestKey, family: "BC", material: "I", color: null, natural: false,
    });
    const before = (await rows()).length;
    const key = crypto.randomUUID();
    const a = await api.duplicate({ requestKey: key, sourceCode: done.code, currentCode: done.code });
    const b = await api.duplicate({ requestKey: key, sourceCode: done.code, currentCode: done.code });
    expect(b.code).toBe(a.code);
    expect(b.sequence).toBe(a.sequence);
    expect((await rows()).length).toBe(before + 1);
  });

  it("rifiuta sorgente inesistente (NOT_FOUND) e codice corrente non corrispondente (BAD_REQUEST)", async () => {
    const api = caller();
    await expect(api.duplicate({
      requestKey: crypto.randomUUID(), sourceCode: "TBC99999996P0", currentCode: "TBC99999996P0",
    })).rejects.toThrow(/non trovato/i);
    const src = await api.reserve({ requestKey: crypto.randomUUID(), family: "BC" });
    const done = await api.complete({
      requestKey: src.requestKey, family: "BC", material: "I", color: null, natural: false,
    });
    await expect(api.duplicate({
      requestKey: crypto.randomUUID(), sourceCode: done.code, currentCode: "TBC00000016P0",
    })).rejects.toThrow(/non corrisponde/i);
  });

  it("il guardrail rifiuta database non dedicati", () => {
    expect(() => assertDedicatedTestDatabase("mysql://u:p@db.azienda.it:3306/ddcost_produzione")).toThrow(/dedicato/);
    expect(() => assertDedicatedTestDatabase("mysql://u:p@127.0.0.1:3306/ddcost_produzione")).toThrow(/dedicato/);
    expect(() => assertDedicatedTestDatabase("mysql://u:p@127.0.0.1:3306/ddcost_test")).not.toThrow();
  });
});
