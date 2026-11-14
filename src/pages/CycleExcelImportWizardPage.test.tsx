// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router";
import type { ReactNode } from "react";
import { emptyCicloEditorModel } from "../types/cycle";
import { buildF3Template, editMapping } from "../lib/excel-f3-workflow";
import { act } from "@testing-library/react";
import { TooltipProvider } from "../components/ui/tooltip";
import { f3Workbook } from "../test-fixtures/f3-workbook";
import { extractF3Letters } from "../lib/excel-f3-letters";
import { extractCycleWorkbook } from "../lib/excel-cycle-extractor";
import { legacyKgMinWorkbook } from "../test-fixtures/legacy-kg-min-workbook";
import { readWorkbookEvidence } from "../lib/excel-workbook-reader";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  loadImportDraft,
  saveImportDraft,
} from "../lib/excel-import-draft-storage";
const state = vi.hoisted(() => ({
  draft: null as any,
  templates: [] as any[],
  cycles: [] as any[],
  calls: [] as any[],
  lostResponse: false,
  receipts: new Map<string, any>(),
  role: "user",
}));
vi.mock("../lib/excel-import-worker-client", () => ({
  parseF3InWorker: vi.fn(async () => structuredClone(state.draft)),
}));
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/CycleCostPie", () => ({ default: () => null }));
const emptyRefetch = async () => ({ data: undefined });
vi.mock("@/providers/trpc", () => {
  const query = (path: string, input: any) =>
    path === "auth.me"
      ? { id: 7, role: state.role }
      : path === "cycleImportCapability.get"
        ? { templatesReady: true, idempotencyReady: true }
        : path === "cycleImportTemplate.listApproved"
          ? state.templates
              .filter(t => t.status === "approved")
              .map(t => ({ ...t, definition: JSON.parse(t.definitionJson) }))
          : path === "cycleImportTemplate.list"
            ? state.templates
            : path === "cycle.get"
              ? state.cycles.find(c => c.id === input?.id)
              : path === "cycle.latestForSource" && input?.id
                ? { id: input.id, rootId: input.id, rev: 1 }
                : undefined;
  async function mutation(path: string, input: any) {
    state.calls.push({ path, input: structuredClone(input) });
    if (path === "cycleImportTemplate.save") {
      const { saveTemplateSchema } =
        await import("../lib/excel-import-template-schema");
      saveTemplateSchema.parse(input);
      const id = state.templates.length + 1,
        rootId = input.rootId ?? id,
        version = (input.expectedVersion ?? 0) + 1;
      state.templates.push({
        id,
        rootId,
        version,
        name: input.name,
        status: input.status,
        family: input.definition.family,
        definitionJson: JSON.stringify(input.definition),
        verifiedCasesJson: JSON.stringify(input.verifiedCases),
        validatedBy: 7,
        validatedAt: new Date(),
        updatedAt: new Date(),
      });
      return { id, rootId, version };
    }
    if (path === "cycleImportRestore.restoreTemplates")
      return input.dryRun
        ? {
            skipped: false,
            preview: {
              templatesToInsert: 1,
              templatesToDelete: 0,
              receiptsToInsert: 0,
            },
          }
        : { restored: 1, receiptsRestored: 0, skipped: false };
    if (path === "cycle.create") {
      let result = state.receipts.get(input.idempotencyKey);
      if (!result) {
        const id = state.cycles.length + 1;
        state.cycles.push({ ...input, id, rootId: id, rev: 1, deleted: 0 });
        result = { id };
        state.receipts.set(input.idempotencyKey, result);
      }
      if (state.lostResponse) {
        state.lostResponse = false;
        throw Error("Risposta persa dopo il salvataggio simulato");
      }
      return result;
    }
    throw Error("Unexpected mutation " + path);
  }
  const utils = {
    invalidate: async () => {},
    cycle: {
      get: {
        fetch: async ({ id }: { id: number }) =>
          state.cycles.find(c => c.id === id),
      },
    },
  };
  const proxy = (path: string[]): any =>
    new Proxy(() => {}, {
      get: (_t, key) =>
        key === "useQuery"
          ? (input: any) => ({
              data: query(path.join("."), input),
              isLoading: false,
              isFetching: false,
              isError: false,
              refetch: emptyRefetch,
            })
          : key === "useMutation"
            ? (options: any = {}) => ({
                isPending: false,
                mutateAsync: async (input: any) => {
                  try {
                    const r = await mutation(path.join("."), input);
                    await options.onSuccess?.(r);
                    return r;
                  } catch (e) {
                    options.onError?.(e);
                    throw e;
                  }
                },
                mutate: (input: any) => {
                  void mutation(path.join("."), input).then(
                    r => options.onSuccess?.(r),
                    e => options.onError?.(e)
                  );
                },
              })
            : key === "useUtils"
              ? () => utils
              : proxy([...path, String(key)]),
    });
  return { trpc: proxy([]) };
});
import Wizard from "./CycleExcelImportWizardPage";
import Editor from "./CicloEditorPage";
function Archive() {
  const nav = useNavigate();
  return (
    <div>
      <h1>Archivio cicli di prova</h1>
      <button onClick={() => nav("/cicli/1")}>Riapri ciclo salvato</button>
    </div>
  );
}
function mount(path = "/import-test") {
  const router = createMemoryRouter(
    [
      { path: "/import-test", element: <Wizard /> },
      { path: "/cicli/new", element: <Editor /> },
      { path: "/cicli/:id", element: <Editor /> },
      { path: "/cicli", element: <Archive /> },
    ],
    { initialEntries: [path] }
  );
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
  return router;
}
async function upload() {
  fireEvent.change(screen.getByLabelText("Workbook Excel"), {
    target: { files: [new File(["fixture"], state.draft.workbook.fileName)] },
  });
  await screen.findByRole("heading", { name: "Fogli e prodotti rilevati" });
  fireEvent.click(screen.getByRole("button", { name: /Codice da confermare/ }));
}
function fillPolicy() {
  fireEvent.change(screen.getByLabelText("Politica"), {
    target: { value: "historical-purchases-current-labour" },
  });
  for (const [name, value] of [
    ["Tariffa €/min", "0.3"],
    ["Lotto simulazione", "200"],
    ["Spese generali %", "0"],
    ["Margine netto %", "0"],
  ])
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
  fireEvent.change(screen.getByLabelText("Ripartizione setup"), {
    target: { value: "simulation" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Calcola anteprima" }));
}
beforeEach(() => {
  state.draft = extractF3Letters(f3Workbook());
  state.templates = [];
  state.cycles = [];
  state.calls = [];
  state.receipts.clear();
  state.lostResponse = false;
  state.role = "user";
  sessionStorage.clear();
  vi.spyOn(window, "alert").mockImplementation(() => {});
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Actual React wizard/editor flow in simulated DOM, services simulated", () => {
  async function runKgMinFlow() {
    const router = mount();
    fireEvent.change(screen.getByLabelText("Workbook Excel"), {
      target: {
        files: [
          new File(
            ["worker response simulated"],
            state.draft.workbook.fileName
          ),
        ],
      },
    });
    await screen.findByRole("heading", { name: "Fogli e prodotti rilevati" });
    expect(
      screen.getAllByText(/layout storico kg\/min riconosciuto/).length
    ).toBeGreaterThan(0);
    const selected = state.draft.products[0];
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`Codice da confermare.*${selected.label}`),
      })
    );
    const code = screen.getByTestId("mapping-cycle.code");
    fireEvent.change(within(code).getByLabelText("Valore Codice prodotto"), {
      target: { value: "LOCAL-UI-TEST" },
    });
    fireEvent.click(
      within(code).getByRole("button", { name: "Applica valore" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
    fillPolicy();
    await screen.findByRole("heading", {
      name: "Anteprima calcolata da DDCost",
    });
    fireEvent.click(screen.getByRole("button", { name: "Conferma anteprima" }));
    fireEvent.click(screen.getByLabelText(/Confermo prodotto/));
    expect(
      (
        screen.getByRole("button", {
          name: "Copia nel nuovo ciclo",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(screen.getByLabelText(/Il setup non è disponibile/));
    fireEvent.click(
      screen.getByRole("button", { name: "Copia nel nuovo ciclo" })
    );
    await screen.findByRole("button", { name: "Salva" });
    expect(state.cycles).toHaveLength(0);
    const id = new URLSearchParams(router.state.location.search).get(
      "importDraft"
    )!;
    const copied = loadImportDraft(id);
    expect(copied.righe).toHaveLength(selected.rows.length);
    expect(copied.righe[0].peso_kg).toBe(selected.rows[0].row.peso_kg);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await screen.findByRole("heading", { name: "Archivio cicli di prova" });
    const data = JSON.parse(state.cycles[0].dataJson);
    expect(data.provenienza_import_excel.setupState.status).toBe("missing");
    expect(data.provenienza_import_excel.decisions).toContain("LEGACY-KG-MIN");
    fireEvent.click(
      screen.getByRole("button", { name: "Riapri ciclo salvato" })
    );
    await screen.findByDisplayValue("LOCAL-UI-TEST");
  }
  it("takes a kg/min draft through mapping, missing-setup acknowledgement, editor, explicit save and reopening", async () => {
    const w = legacyKgMinWorkbook();
    delete w.sheets[0].cells.A3;
    state.draft = extractCycleWorkbook(w);
    await runKgMinFlow();
  }, 20000);
  it.skipIf(!process.env.DDCOST_IMPORT_WORKBOOK)(
    "takes the supplied real XLS through the React wizard and editor with simulated services",
    async () => {
      const path = process.env.DDCOST_IMPORT_WORKBOOK!;
      const bytes = await readFile(path);
      const file = new File([Uint8Array.from(bytes)], basename(path));
      // jsdom File has no arrayBuffer(): provide bytes in the DOM realm,
      // as a browser File would, rather than a Node-realm ArrayBuffer.
      Object.defineProperty(file, "arrayBuffer", {
        value: async () => Uint8Array.from(bytes).buffer,
      });
      const w = await readWorkbookEvidence(file);
      expect(w.sheets.length).toBeGreaterThan(1);
      state.draft = extractCycleWorkbook(w);
      await runKgMinFlow();
    },
    20000
  );
  it("maps, saves draft/tested/approved, transfers to editor, explicitly saves and reopens", async () => {
    const router = mount();
    await upload();
    fireEvent.click(
      screen.getByRole("button", { name: "Usa il nome del foglio come codice" })
    );
    fireEvent.click(screen.getByLabelText("Nuovo template / nuova versione"));
    fireEvent.click(
      within(screen.getByTestId("mapping-cycle.code")).getByRole("checkbox")
    );
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
    fillPolicy();
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Template UI sintetico" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva draft" }));
    await waitFor(() => expect(state.templates).toHaveLength(1));
    fireEvent.click(
      screen.getByRole("button", { name: "Prova sul file corrente" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Salva tested" }));
    await waitFor(() => expect(state.templates).toHaveLength(2));
    fireEvent.click(screen.getByLabelText(/Ho verificato fonti/));
    fireEvent.click(screen.getByRole("button", { name: "Approva template" }));
    await waitFor(() => expect(state.templates).toHaveLength(3));
    expect(state.templates.map(t => t.status)).toEqual([
      "draft",
      "tested",
      "approved",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
    fireEvent.click(screen.getByRole("button", { name: "Conferma anteprima" }));
    fireEvent.click(screen.getByLabelText(/Confermo prodotto/));
    fireEvent.click(
      screen.getByRole("button", { name: "Copia nel nuovo ciclo" })
    );
    await screen.findByRole("button", { name: "Salva" });
    expect(state.cycles).toHaveLength(0);
    const id = new URLSearchParams(router.state.location.search).get(
      "importDraft"
    )!;
    expect(loadImportDraft(id).codice).toBe("TEST-A");
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await screen.findByRole("heading", { name: "Archivio cicli di prova" });
    expect(state.cycles).toHaveLength(1);
    expect(state.cycles[0].idempotencyKey).toBe(id);
    expect(() => loadImportDraft(id)).toThrow();
    const data = JSON.parse(state.cycles[0].dataJson);
    expect(data.provenienza_import_excel.template).toEqual({
      rootId: 1,
      version: 3,
    });
    expect(data.provenienza_import_excel.mapping.fields.length).toBeGreaterThan(
      0
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Riapri ciclo salvato" })
    );
    await waitFor(() =>
      expect(
        (screen.getByDisplayValue("TEST-A") as HTMLInputElement).disabled
      ).toBe(true)
    );
    cleanup();
    state.draft = extractF3Letters(f3Workbook("TEST-B", 7));
    mount();
    await upload();
    await screen.findByRole("heading", {
      name: "Politica economica del nuovo ciclo",
    });
    expect(
      screen.queryByRole("heading", { name: "Prodotto, fonti e mappatura" })
    ).toBeNull();
    fillPolicy();
    await screen.findByRole("heading", {
      name: "Anteprima calcolata da DDCost",
    });
    expect(
      state.calls.filter(c => c.path === "cycleImportTemplate.save")
    ).toHaveLength(3);
  });
  it("file-only corrections never save templates and retry after refresh keeps import key", async () => {
    const router = mount();
    await upload();
    fireEvent.click(
      screen.getByRole("button", { name: "Usa il nome del foglio come codice" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
    fillPolicy();
    fireEvent.click(screen.getByRole("button", { name: "Conferma anteprima" }));
    fireEvent.click(screen.getByLabelText(/Confermo prodotto/));
    fireEvent.click(
      screen.getByRole("button", { name: "Copia nel nuovo ciclo" })
    );
    await screen.findByRole("button", { name: "Salva" });
    const url = router.state.location.pathname + router.state.location.search;
    state.lostResponse = true;
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(state.cycles).toHaveLength(1);
    cleanup();
    mount(url);
    await screen.findByDisplayValue("TEST-A");
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await screen.findByRole("heading", { name: "Archivio cicli di prova" });
    const calls = state.calls.filter(c => c.path === "cycle.create");
    expect(calls).toHaveLength(2);
    expect(calls[0].input).toEqual(calls[1].input);
    expect(state.cycles).toHaveLength(1);
    expect(state.calls.some(c => c.path === "cycleImportTemplate.save")).toBe(
      false
    );
  });
  it("restores a mapping correction after the wizard is remounted", async () => {
    mount();
    await upload();
    fireEvent.click(
      screen.getByRole("button", { name: "Usa il nome del foglio come codice" })
    );
    const section = screen.getAllByTestId("mapping-nr_componenti")[0];
    fireEvent.change(
      within(section).getByRole("textbox", { name: "Valore Quantità" }),
      { target: { value: "2" } }
    );
    fireEvent.click(
      within(section).getByRole("button", { name: "Applica valore" })
    );
    cleanup();
    mount();
    expect(
      within(screen.getAllByTestId("mapping-nr_componenti")[0]).getByRole(
        "textbox",
        { name: "Valore Quantità" }
      )
    ).toHaveProperty("value", "2");
  });
  it("requires explicit selection when multiple approved candidates match", async () => {
    let d = structuredClone(state.draft);
    d.products[0].selected = true;
    d = editMapping(d, "$product:cycle.code", {
      sheetName: true,
      reusable: true,
    });
    state.templates = ["A", "B"].map((name, i) => {
      const def = buildF3Template(d, name);
      return {
        id: i + 1,
        rootId: i + 1,
        version: 3,
        status: "approved",
        definitionJson: JSON.stringify({
          ...def,
          verifiedCaseHashes: [d.workbook.sha256],
        }),
      };
    });
    mount();
    await upload();
    expect(screen.getByText(/Più template approvati/)).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "Politica economica del nuovo ciclo",
      })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "B · v3" }));
    await screen.findByRole("heading", {
      name: "Politica economica del nuovo ciclo",
    });
    expect(screen.getByText(/Template approvato B/)).toBeTruthy();
  });
  it("preserves the current unsaved editor when replacement is refused", async () => {
    const a = { ...emptyCicloEditorModel(), codice: "DRAFT-A" },
      b = { ...emptyCicloEditorModel(), codice: "DRAFT-B" };
    const aId = saveImportDraft(a),
      bId = saveImportDraft(b);
    const router = mount(`/cicli/new?importDraft=${aId}`);
    await screen.findByDisplayValue("DRAFT-A");
    vi.mocked(window.confirm).mockReturnValue(false);
    await act(async () => {
      await router.navigate(`/cicli/new?importDraft=${bId}`);
    });
    expect(
      screen.getByRole("dialog", {
        name: "Ci sono modifiche al ciclo non salvate",
      })
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Continua a compilare" })
    );
    expect(screen.getByDisplayValue("DRAFT-A")).toBeTruthy();
    await act(async () => {
      await router.navigate(`/cicli/new?importDraft=${bId}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "Esci senza salvare" }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(screen.getByDisplayValue("DRAFT-A")).toBeTruthy();
    expect(loadImportDraft(bId).codice).toBe("DRAFT-B");
    expect(state.cycles).toHaveLength(0);
  });
  it("admin restore previews first and requires the explicit confirmation phrase", async () => {
    state.role = "admin";
    mount();
    const file = { name: "backup-test.json", size: 2, text: async () => "{}" };
    fireEvent.change(screen.getByLabelText("Backup JSON"), {
      target: { files: [file] },
    });
    await screen.findByText("backup-test.json");
    fireEvent.click(screen.getByRole("button", { name: "Verifica backup" }));
    await screen.findByText(/1 template da inserire/);
    expect(state.calls.at(-1).input.dryRun).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Ripristina" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.change(
      screen.getByLabelText("Conferma scrivendo RIPRISTINA TEMPLATE"),
      { target: { value: "RIPRISTINA TEMPLATE" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Ripristina" }));
    await screen.findByText("Ripristino completato: 1 template, 0 ricevute.");
    expect(state.calls.at(-1).input.dryRun).toBe(false);
  });
});
