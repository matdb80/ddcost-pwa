// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ data: null as any, calls: [] as Array<{ path: string; input: any }> }));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/SalesHandoffPanel", () => ({ default: () => null }));
vi.mock("@/components/FormulaTooltip", () => ({ default: () => null }));
vi.mock("@/providers/trpc", () => {
  const utils = { offer: { list: { invalidate: async () => {} } }, cycle: { listGrouped: { invalidate: async () => {} }, get: { fetch: async () => null } } };
  const proxy = (path: string[]): any => new Proxy({}, { get: (_, key) => {
    if (key === "useUtils") return () => utils;
    if (key === "useQuery") return () => ({
      data: path.join(".") === "offer.get" ? state.data
        : path.join(".") === "offer.nextNumber" ? { number: "OF-TEST-0001" }
        : path.join(".") === "cycle.listGrouped" ? { groups: [], total: 0, page: 1 } : [],
      isLoading: false, isError: false, error: null, isFetching: false, refetch: async () => {},
    });
    if (key === "useMutation") return () => ({ isPending: false, mutateAsync: async (input: any) => {
      state.calls.push({ path: path.join("."), input: structuredClone(input) });
      return { id: 1 };
    }});
    return proxy([...path, String(key)]);
  }});
  return { trpc: proxy([]) };
});
import OffertaEditorPage from "./OffertaEditorPage";

const tempRow = {
  codice: "TRN0000037BZ",
  codice_temporaneo: { sequence: 37, family: "RN", material: "B", color: null, code: "TRN0000037BZ" },
  descrizione: "Ferma lastre", lotto: 100, listino: 100, tipo_listino: "Listino calcolato",
  sconto_base: "40+10%", extra: 0, netto_base: 0, netto: 0, sconto_finale: "40+10%",
  full_cost: null, prezzo_minimo: null, lotti_selezionati: [], lotti_aggiuntivi: [], prezzi_lotti: {},
};
const offerDoc = (row: Record<string, unknown>) => ({
  tmp_code_version: 3, nome: "OF-0001", cliente: "Cliente prova", riferimento: "",
  pagamento: "", trasporto: "", note: "", righe: [row],
});

function mount(doc: Record<string, any>) {
  state.data = { id: 1, name: doc.nome, client: doc.cliente, reference: doc.riferimento, notes: doc.note, dataJson: JSON.stringify(doc) };
  const router = createMemoryRouter([
    { path: "/offerte/:id", element: <OffertaEditorPage /> },
    { path: "/offerte", element: <div>Elenco offerte</div> },
  ], { initialEntries: ["/offerte/1"] });
  return render(<RouterProvider router={router} />);
}
beforeEach(() => {
  state.data = null; state.calls = [];
  window.localStorage.clear();
  vi.stubGlobal("alert", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Regola v8: il suffisso manuale (12° carattere) dei codici temporanei
// ottone/alluminio è convertito in maiuscolo anche sulla superficie «offerta
// standard», in digitazione e con incolla, e resta tale nel documento salvato,
// alla riapertura e nel PDF cliente.
it("offerta standard: suffisso maiuscolo in digitazione e incolla, conservato in salvataggio, riapertura e PDF", async () => {
  mount(offerDoc(tempRow));
  await screen.findByRole("heading", { name: "Offerta #1" });
  fireEvent.click(screen.getByRole("button", { name: "Modifica" }));
  const field = (await screen.findByRole("textbox", { name: "Codice articolo" })) as HTMLInputElement;
  expect(field.value).toBe("TRN0000037BZ");
  // digitazione minuscola → maiuscola immediata
  fireEvent.change(field, { target: { value: "TRN0000037Bz" } });
  expect(field.value).toBe("TRN0000037BZ");
  // incolla minuscolo → maiuscolo immediato
  fireEvent.change(field, { target: { value: "TRN0000037B" } });
  fireEvent.focus(field);
  fireEvent.paste(field, { clipboardData: { getData: () => "z" } });
  expect(field.value).toBe("TRN0000037BZ");
  // il documento va reso «modificato» con un campo reale: il codice è tornato al valore iniziale
  fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Cliente aggiornato" } });
  // salvataggio
  fireEvent.click(screen.getByRole("button", { name: "Salva offerta" }));
  await waitFor(() => expect(state.calls.some(c => c.path === "offer.update")).toBe(true));
  const saved = JSON.parse(state.calls.find(c => c.path === "offer.update")!.input.dataJson);
  expect(saved.righe[0].codice).toBe("TRN0000037BZ");
  expect(saved.righe[0].codice_temporaneo.code).toBe("TRN0000037BZ");
  // riapertura del documento salvato
  cleanup();
  mount(saved);
  const reopened = (await screen.findByRole("textbox", { name: "Codice articolo" })) as HTMLInputElement;
  expect(reopened.value).toBe("TRN0000037BZ");
  // PDF cliente dell'offerta riaperta
  const write = vi.fn();
  vi.spyOn(window, "open").mockReturnValue({ document: { open: vi.fn(), write, close: vi.fn() } } as unknown as Window);
  fireEvent.click(screen.getByRole("button", { name: "Esporta PDF cliente" }));
  expect(write).toHaveBeenCalledOnce();
  const html = write.mock.calls.map(call => call[0]).join("");
  expect(html).toContain("TRN0000037BZ");
  expect(html).not.toContain("TRN0000037Bz");
});
