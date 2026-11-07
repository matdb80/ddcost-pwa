import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { parseF3InWorker } from "../lib/excel-import-worker-client";
import {
  applyOptionSelection,
  currentSetupState,
} from "../lib/excel-f3-letters";
import {
  asValidatedDraft,
  validateImportDraft,
} from "../lib/excel-import-validation";
import { compareImportCosts } from "../lib/excel-import-comparison";
import { buildValidatedPreview } from "../lib/excel-import-to-cycle";
import { saveImportDraft } from "../lib/excel-import-draft-storage";
import {
  applyApprovedF3,
  buildF3Template,
  clearF3Session,
  compatibleF3,
  editMapping,
  loadF3Session,
  mappingFor,
  productSheet,
  saveF3Session,
  setReusable,
  testF3Definition,
} from "../lib/excel-f3-workflow";
import type { ApprovedF3Template } from "../lib/excel-f3-workflow";
import type {
  ImportDraft,
  ImportPreview,
  ProductDraft,
  ImportTemplateStatus,
} from "../types/excel-import";
import { ImportRestorePanel } from "../components/excel/ImportRestorePanel";
import { MappingFieldEditor } from "../components/excel/MappingFieldEditor";
const STEPS = [
  "File",
  "Prodotto",
  "Mapping e finiture",
  "Politica",
  "Template",
  "Anteprima",
  "Copia",
];
const button = "rounded border px-3 py-2 disabled:opacity-40";
const primary = button + " bg-emerald-700 text-white";
function initial() {
  try {
    return { session: loadF3Session(), error: "" };
  } catch (e) {
    return {
      session: null,
      error: e instanceof Error ? e.message : "Bozza non recuperabile",
    };
  }
}
export default function CycleExcelImportWizardPage() {
  const [start] = useState(initial),
    nav = useNavigate(),
    active = useRef<AbortController | null>(null),
    mutationLock = useRef(false),
    copyId = useRef<string | null>(null);
  const [draft, setDraft] = useState<ImportDraft | undefined>(
      start.session?.draft
    ),
    [step, setStep] = useState(start.session?.step ?? 0),
    [message, setMessage] = useState(start.error),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(start.session?.name ?? ""),
    [scope, setScope] = useState<"file" | "template">(
      start.session?.scope ?? "file"
    ),
    [root, setRoot] = useState<{ rootId: number; version: number } | undefined>(
      start.session?.rootId
        ? { rootId: start.session.rootId, version: start.session.version! }
        : undefined
    ),
    [savedStatus, setSavedStatus] = useState<ImportTemplateStatus>(),
    [test, setTest] = useState<ReturnType<typeof testF3Definition>>(),
    [reviewed, setReviewed] = useState(false),
    [missingSetupAccepted, setMissingSetupAccepted] = useState(false),
    [candidates, setCandidates] = useState<ApprovedF3Template[]>([]);
  const capability = trpc.cycleImportCapability.get.useQuery();
  const approved = trpc.cycleImportTemplate.listApproved.useQuery(undefined, {
    enabled: capability.data?.templatesReady === true,
  });
  const templates = trpc.cycleImportTemplate.list.useQuery(undefined, {
    enabled: capability.data?.templatesReady === true && scope === "template",
  });
  const saveTemplate = trpc.cycleImportTemplate.save.useMutation();
  const product = draft?.products.find(p => p.selected),
    sheet = draft && product ? productSheet(draft, product) : undefined,
    mapping = draft && product ? mappingFor(draft, product) : undefined;
  const validation = useMemo(
    () => (draft ? validateImportDraft(draft) : undefined),
    [draft]
  );
  const preview = useMemo<ImportPreview | undefined>(() => {
    if (!draft || step < 5) return;
    try {
      return buildValidatedPreview(asValidatedDraft(draft));
    } catch {
      return;
    }
  }, [draft, step]);
  const comparison =
    draft && preview ? compareImportCosts(draft, preview) : undefined;
  const setup = currentSetupState(product),
    sourceStatus = capability.data;
  const definition = useMemo(() => {
    if (!draft || !product || !name.trim()) return;
    try {
      return buildF3Template(draft, name);
    } catch {
      return;
    }
  }, [draft, product, name]);
  const approvedCurrent =
    savedStatus === "approved" &&
    definition &&
    draft?.templateMatch &&
    JSON.stringify({
      ...draft.templateMatch.definition,
      verifiedCaseHashes: [],
    }) === JSON.stringify({ ...definition, verifiedCaseHashes: [] });
  const currentTest =
    test &&
    definition &&
    test.definition ===
      JSON.stringify({ ...definition, verifiedCaseHashes: [] }) &&
    test.workbookSha256 === draft?.workbook.sha256;
  const storageFailed = useRef(false);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!draft) return;
    try {
      saveF3Session({
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        step,
        draft,
        name,
        scope,
        ...root,
      });
      storageFailed.current = false;
    } catch (e) {
      if (!storageFailed.current) {
        storageFailed.current = true;
        setMessage(
          e instanceof Error ? e.message : "Impossibile conservare la bozza"
        );
      }
    }
  }, [draft, step, name, scope, root]);
  function change(next: ImportDraft) {
    setDraft(next);
    setReviewed(false);
    setMissingSetupAccepted(false);
    setTest(undefined);
    copyId.current = null;
    setMessage("");
  }
  function run(fn: () => void) {
    try {
      setMessage("");
      fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Operazione non riuscita");
    }
  }
  function select(p: ProductDraft) {
    if (!draft) return;
    const next = {
      ...draft,
      templateMatch: undefined,
      products: draft.products.map(x => ({ ...x, selected: x.key === p.key })),
    };
    next.mappings = [
      ...(next.mappings ?? []).filter(m => m.productKey !== p.key),
      mappingFor(next, p),
    ];
    change(next);
    setRoot(undefined);
    setSavedStatus(undefined);
    setScope("file");
    setName("");
    const available = (approved.data ?? [])
      .map(t => ({ ...t, rootId: t.rootId!, definition: t.definition }))
      .filter(t => compatibleF3(next, p, t).compatible);
    setCandidates(available);
    if (available.length === 1) {
      try {
        const applied = applyApprovedF3(next, p, available[0]);
        setDraft(applied);
        setRoot({ rootId: available[0].rootId, version: available[0].version });
        setSavedStatus("approved");
        setName(available[0].definition.name);
        setStep(3);
        setMessage(
          "Template approvato riutilizzato. Verificare prodotto, finiture e politica del nuovo file."
        );
        return;
      } catch (e) {
        setMessage(
          `Template da rivedere: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
    setStep(2);
  }
  function useCandidate(t: ApprovedF3Template) {
    if (!draft || !product) return;
    const next = applyApprovedF3(draft, product, t);
    change(next);
    setRoot({ rootId: t.rootId, version: t.version });
    setSavedStatus("approved");
    setName(t.definition.name);
    setStep(3);
    setCandidates([]);
  }
  async function load(file?: File) {
    if (!file) return;
    active.current?.abort();
    const ctl = new AbortController();
    active.current = ctl;
    setBusy(true);
    setMessage("");
    try {
      const d = await parseF3InWorker(file, ctl.signal);
      if (active.current !== ctl || ctl.signal.aborted) return;
      change(d);
      setStep(1);
      setRoot(undefined);
      setName("");
      setScope("file");
      setSavedStatus(undefined);
      setCandidates([]);
    } catch (e) {
      if (active.current === ctl && !ctl.signal.aborted)
        setMessage(e instanceof Error ? e.message : "File non leggibile");
    } finally {
      if (active.current === ctl) setBusy(false);
    }
  }
  function policy(field: string, value: unknown) {
    if (draft)
      change({
        ...draft,
        economicPolicy: { ...draft.economicPolicy, [field]: value },
      });
  }
  async function save(status: ImportTemplateStatus) {
    if (!draft || mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    try {
      const def = buildF3Template(draft, name);
      if (status !== "draft" && !currentTest)
        throw Error("Eseguire la prova del template dopo le ultime modifiche");
      if (status === "approved" && (!reviewed || savedStatus !== "tested"))
        throw Error("Salvare prima lo stato tested e confermare la revisione");
      const definition = {
        ...def,
        verifiedCaseHashes: status === "draft" ? [] : [test!.workbookSha256],
      };
      const result = await saveTemplate.mutateAsync({
        name: definition.name,
        status,
        definition,
        verifiedCases: definition.verifiedCaseHashes,
        ...(root ? { rootId: root.rootId, expectedVersion: root.version } : {}),
      });
      setRoot({ rootId: result.rootId, version: result.version });
      setSavedStatus(status);
      setMessage(`Template ${status} salvato, versione ${result.version}.`);
      await Promise.all([approved.refetch(), templates.refetch()]);
      if (status === "approved")
        setDraft(d =>
          d
            ? {
                ...d,
                templateMatch: {
                  templateId: result.id,
                  rootId: result.rootId,
                  version: result.version,
                  definition,
                  score: 1,
                  conflicts: [],
                },
                mappings: d.mappings?.map(m =>
                  m.productKey === product?.key
                    ? {
                        ...m,
                        template: {
                          rootId: result.rootId,
                          version: result.version,
                        },
                      }
                    : m
                ),
              }
            : d
        );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Salvataggio template fallito"
      );
    } finally {
      setBusy(false);
      mutationLock.current = false;
    }
  }
  function calculate() {
    if (!draft) return;
    run(() => {
      if (!draft.economicPolicy.name || !draft.economicPolicy.setupLotPolicy)
        throw Error("Scegliere politica economica e criterio del lotto setup");
      buildValidatedPreview(asValidatedDraft(draft));
      setStep(scope === "template" ? 4 : 5);
    });
  }
  function copy() {
    if (!preview || mutationLock.current) return;
    run(() => {
      if (!reviewed) throw Error("Confermare il riepilogo");
      if (setup?.status === "missing" && !missingSetupAccepted)
        throw Error("Confermare il dato setup mancante");
      if (sourceStatus?.idempotencyReady !== true)
        throw Error(
          "Salvataggio non disponibile: verificare lo schema con l’amministratore"
        );
      mutationLock.current = true;
      try {
        copyId.current ??= saveImportDraft(preview.model);
        clearF3Session();
        nav(`/cicli/new?importDraft=${encodeURIComponent(copyId.current)}`);
      } catch (e) {
        mutationLock.current = false;
        throw e;
      }
    });
  }
  function restoreTemplate(id: number) {
    if (!draft || !product) return;
    const t = templates.data?.find(t => t.id === id);
    if (!t) return;
    run(() => {
      const definition = JSON.parse(t.definitionJson);
      const candidate = {
        ...t,
        rootId: t.rootId!,
        definition,
        status: "approved",
      };
      const next = applyApprovedF3(draft, product, candidate);
      change(
        t.status === "approved"
          ? next
          : {
              ...next,
              templateMatch: undefined,
              mappings: next.mappings?.map(m => ({
                ...m,
                template: undefined,
              })),
            }
      );
      setName(t.name);
      setRoot({ rootId: t.rootId!, version: t.version });
      setSavedStatus(t.status);
      setStep(4);
      setMessage(
        "Versione caricata per revisione esplicita; non è un riuso automatico."
      );
    });
  }
  const updateOptions = (key: string, selected: boolean) => {
    if (draft && product)
      change({
        ...draft,
        products: draft.products.map(p =>
          p.key === product.key ? applyOptionSelection(p, key, selected) : p
        ),
      });
  };
  const options = product?.options?.length ? (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Finiture del nuovo ciclo</legend>
      {product.options.map(o => (
        <label key={o.key} className="flex gap-2 rounded border p-2">
          <input
            type="checkbox"
            checked={o.selected}
            disabled={o.required}
            onChange={e => updateOptions(o.key, e.target.checked)}
          />
          <span>
            {o.label} · storico:{" "}
            {o.historicalSelected ? "selezionata" : "non selezionata"}
            {o.required ? " · voce del prodotto" : ""}
          </span>
        </label>
      ))}
    </fieldset>
  ) : null;
  return (
    <main className="mx-auto max-w-6xl p-4 pb-16 space-y-4">
      <h1 className="text-2xl font-semibold">Importa ciclo da Excel</h1>
      <p>
        F3-LETTERE · i cicli vengono creati solo con il salvataggio nell’editor.
      </p>
      <ol className="grid grid-cols-2 md:grid-cols-7 gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            className={`p-2 rounded text-sm ${step === i ? "bg-emerald-700 text-white" : "bg-slate-100"}`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>
      {message && (
        <div
          role="alert"
          className="border border-amber-400 bg-amber-50 p-3 rounded break-words"
        >
          {message}
        </div>
      )}
      {capability.isError && (
        <p role="alert">
          Impossibile verificare i servizi. La lettura del file resta
          disponibile.{" "}
          <button
            onClick={() => void capability.refetch()}
            className="underline"
          >
            Riprova
          </button>
        </p>
      )}
      {sourceStatus && !sourceStatus.templatesReady && (
        <p className="text-amber-800">
          Archivio template non disponibile: completare le migrazioni 0004/0005.
        </p>
      )}
      {sourceStatus && !sourceStatus.idempotencyReady && (
        <p className="text-amber-800">
          La creazione di cicli richiede la migrazione 0006. È possibile
          analizzare il file.
        </p>
      )}
      {step > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              setStep(step === 5 && scope === "file" ? 3 : step - 1)
            }
          >
            Indietro
          </button>
          <button className={button} disabled={busy} onClick={() => setStep(0)}>
            Carica un altro file
          </button>
        </div>
      )}
      {step === 0 && (
        <section className="space-y-3">
          <label className="block">
            Workbook Excel
            <input
              className="block mt-2"
              type="file"
              accept=".xls,.xlsx"
              disabled={busy}
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void load(file);
              }}
            />
          </label>
          {busy && (
            <button className={button} onClick={() => active.current?.abort()}>
              Annulla lettura
            </button>
          )}
          {draft && (
            <button className={button} onClick={() => setStep(1)}>
              Riprendi il file {draft.workbook.fileName}
            </button>
          )}
        </section>
      )}
      {step === 1 && draft && (
        <section className="space-y-3">
          <h2 className="font-semibold">Fogli e prodotti rilevati</h2>
          {draft.workbook.sheets.map(s => (
            <div key={s.name} className="text-sm">
              {s.name} —{" "}
              {s.hidden
                ? "foglio nascosto, escluso"
                : draft.products.some(
                      p => productSheet(draft, p).name === s.name
                    )
                  ? "F3 riconosciuto"
                  : "nessun prodotto F3: non verrà importato"}
            </div>
          ))}
          {approved.isFetching && <p>Verifica dei template approvati…</p>}
          {approved.isError && (
            <p role="alert">
              Archivio template non leggibile: procedere con mapping manuale o
              riprovare.
            </p>
          )}
          {draft.products.map(p => (
            <button
              key={p.key}
              disabled={approved.isFetching || capability.isFetching}
              className="block w-full text-left rounded border p-3"
              onClick={() => select(p)}
            >
              <strong>{p.code || "Codice da confermare"}</strong> · {p.label} ·{" "}
              {p.rows.length} righe
            </button>
          ))}
          {!draft.products.length && (
            <p>Nessun prodotto riconosciuto. Il file non ha generato cicli.</p>
          )}
        </section>
      )}
      {step === 2 && draft && product && mapping && sheet && (
        <section className="space-y-4">
          <h2 className="font-semibold">Prodotto, fonti e mappatura</h2>
          {candidates.length > 1 && (
            <div className="rounded border border-amber-400 p-3">
              <p>
                Più template approvati sono compatibili. Scegliere
                esplicitamente oppure continuare con il mapping manuale.
              </p>
              {candidates.map(t => (
                <button
                  key={t.id}
                  className={button}
                  onClick={() => run(() => useCandidate(t))}
                >
                  {t.definition.name} · v{t.version}
                </button>
              ))}
              <button className={button} onClick={() => setCandidates([])}>
                Mapping manuale
              </button>
            </div>
          )}
          {mapping.fields
            .filter(f => f.rowKey === "$product")
            .map(f => (
              <MappingFieldEditor
                key={f.id}
                field={f}
                sheet={sheet}
                shared={scope === "template"}
                onChange={input =>
                  run(() => change(editMapping(draft, f.id, input)))
                }
                onReusable={v => change(setReusable(draft, f.id, v))}
              />
            ))}
          {options}
          <fieldset className="flex flex-wrap gap-4">
            <legend className="font-semibold">Ambito delle correzioni</legend>
            <label>
              <input
                type="radio"
                checked={scope === "file"}
                onChange={() => setScope("file")}
              />{" "}
              Solo questo file
            </label>
            <label>
              <input
                type="radio"
                checked={scope === "template"}
                onChange={() => setScope("template")}
              />{" "}
              Nuovo template / nuova versione
            </label>
          </fieldset>
          {product.rows.map(r => (
            <details
              key={r.key}
              className="rounded border p-3"
              open={
                r.problems.some(p => p.severity === "error" && !p.resolved) ||
                undefined
              }
            >
              <summary className="cursor-pointer font-semibold">
                Riga {r.excelRow}: {r.row.descrizione ?? "Da descrivere"} ·{" "}
                {r.kind === "setup"
                  ? "attrezzaggio"
                  : r.included
                    ? "inclusa"
                    : "opzione non scelta"}
              </summary>
              <div className="grid gap-3 mt-3 md:grid-cols-2">
                {mapping.fields
                  .filter(f => f.rowKey === r.key)
                  .map(f => (
                    <MappingFieldEditor
                      key={f.id}
                      field={f}
                      sheet={sheet}
                      shared={scope === "template"}
                      onChange={input =>
                        run(() => change(editMapping(draft, f.id, input)))
                      }
                      onReusable={v => change(setReusable(draft, f.id, v))}
                    />
                  ))}
              </div>
            </details>
          ))}
          <button className={primary} onClick={() => setStep(3)}>
            Continua
          </button>
        </section>
      )}
      {step === 4 && draft && product && (
        <section className="space-y-3">
          <h2 className="font-semibold">Template condiviso</h2>
          <p>
            Le regole del layout F3 e le correzioni marcate come riutilizzabili
            valgono per i file futuri. Valori economici, codice e scelte del
            singolo file restano da verificare.
          </p>
          <label className="block">
            Nome
            <input
              className="block w-full rounded border p-2"
              value={name}
              onChange={e => {
                setName(e.target.value);
                setReviewed(false);
                setTest(undefined);
              }}
            />
          </label>
          <label className="block">
            Versione da continuare
            <select
              className="block w-full border p-2"
              value=""
              onChange={e => restoreTemplate(Number(e.target.value))}
            >
              <option value="">
                Scegli una versione salvata (facoltativo)
              </option>
              {templates.data?.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} · v{t.version} · {t.status}
                </option>
              ))}
            </select>
          </label>
          <p>
            {root
              ? `Radice ${root.rootId} · ultima versione caricata ${root.version}`
              : "Nuova radice"}{" "}
            · {savedStatus ?? "non salvato"}
          </p>
          <details>
            <summary>Riepilogo delle regole</summary>
            <p>
              Firma relativa, controllo di righe/unità/finiture, inclusione
              VAL-003.
            </p>
            <ul>
              {definition?.f3Profile?.bindings.map((b, i) => (
                <li key={i}>
                  {b.target} ·{" "}
                  {b.rowOffset === null
                    ? "prodotto"
                    : `riga relativa ${b.rowOffset}`}{" "}
                  ·{" "}
                  {b.kind === "constant"
                    ? `costante ${b.value}`
                    : b.kind === "sheet-name"
                      ? "nome del foglio"
                      : `cella relativa ${b.sourceRow},${b.sourceColumn} · ${b.transform}`}
                </li>
              ))}
            </ul>
          </details>
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              disabled={busy || !sourceStatus?.templatesReady}
              onClick={() => void save("draft")}
            >
              Salva draft
            </button>
            <button
              className={button}
              onClick={() =>
                run(() => {
                  const def = buildF3Template(draft, name);
                  const outcome = testF3Definition(draft, def);
                  setTest(outcome);
                  setReviewed(false);
                  setMessage(
                    `Prova superata: ${outcome.rowCount} righe riprodotte dal file corrente.`
                  );
                })
              }
            >
              Prova sul file corrente
            </button>
            <button
              className={button}
              disabled={
                busy || !currentTest || !root || !sourceStatus?.templatesReady
              }
              onClick={() => void save("tested")}
            >
              Salva tested
            </button>
          </div>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={e => setReviewed(e.target.checked)}
            />
            Ho verificato fonti, trasformazioni e risultati della prova; approvo
            queste regole per i file compatibili.
          </label>
          <button
            className={primary}
            disabled={
              busy ||
              !currentTest ||
              savedStatus !== "tested" ||
              !reviewed ||
              !sourceStatus?.templatesReady
            }
            onClick={() => void save("approved")}
          >
            Approva template
          </button>
          <div className="flex gap-2">
            <button className={button} onClick={() => setStep(2)}>
              Modifica mapping
            </button>
            <button
              className={button}
              onClick={() => {
                setScope("file");
                setStep(5);
              }}
            >
              Continua solo per questo file
            </button>
            <button
              className={primary}
              disabled={scope === "template" && !approvedCurrent}
              onClick={() => setStep(5)}
            >
              Continua
            </button>
          </div>
        </section>
      )}
      {step === 3 && draft && product && (
        <section className="space-y-4">
          <h2 className="font-semibold">Politica economica del nuovo ciclo</h2>
          {draft.templateMatch && (
            <p className="text-emerald-800">
              Template approvato {draft.templateMatch.definition.name} · v
              {draft.templateMatch.version} applicato.
            </p>
          )}
          {options}
          <button className={button} onClick={() => setStep(2)}>
            Controlla o modifica mapping e identità
          </button>
          <label className="block">
            Politica
            <select
              className="block w-full border rounded p-2"
              value={draft.economicPolicy.name ?? ""}
              onChange={e => policy("name", e.target.value || undefined)}
            >
              <option value="">Scegli esplicitamente</option>
              <option value="historical-purchases-current-labour">
                Prezzi di acquisto e dati tecnici Excel; manodopera e setup alla
                tariffa unica scelta
              </option>
            </select>
          </label>
          <p className="text-sm">
            Il motore usa un’unica tariffa lavoro anche per i setup. Tariffe
            storiche diverse restano evidenze; non vengono forzati tempi o
            quantità. La colonna O resta costo storico. Valuta supportata in
            questo percorso: EUR.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  key: "labourEurPerMinute",
                  label: "Tariffa €/min",
                  factor: 1,
                },
                { key: "lot", label: "Lotto simulazione", factor: 1 },
                {
                  key: "overheadFraction",
                  label: "Spese generali %",
                  factor: 100,
                },
                {
                  key: "marginFraction",
                  label: "Margine netto %",
                  factor: 100,
                },
              ] as const
            ).map(f => (
              <label key={f.key}>
                {f.label}
                <input
                  className="block w-full border rounded p-2"
                  inputMode="decimal"
                  type="number"
                  step="any"
                  value={
                    draft.economicPolicy[f.key] === undefined
                      ? ""
                      : draft.economicPolicy[f.key]! * f.factor
                  }
                  onChange={e =>
                    policy(
                      f.key,
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value) / f.factor
                    )
                  }
                />
              </label>
            ))}
          </div>
          <p>
            Setup:{" "}
            {setup?.status === "missing"
              ? "dato mancante"
              : `${setup?.minutes ?? 0} minuti`}{" "}
            · lotto storico: {setup?.lot ?? "mancante"}
          </p>
          <label className="block">
            Ripartizione setup
            <select
              className="block w-full border rounded p-2"
              value={draft.economicPolicy.setupLotPolicy ?? ""}
              onChange={e =>
                policy("setupLotPolicy", e.target.value || undefined)
              }
            >
              <option value="">Scegli esplicitamente</option>
              <option value="simulation">
                Ripartisci sul lotto di questa simulazione
              </option>
              <option value="historic-minimum" disabled={!setup?.lot}>
                Rispetta il lotto storico minimo (usa il maggiore fra storico e
                simulazione)
              </option>
            </select>
          </label>
          <button className={primary} onClick={calculate}>
            Calcola anteprima
          </button>
        </section>
      )}
      {draft && step >= 2 && validation && (
        <details
          className="rounded border p-3"
          open={
            validation.draft.problems.some(
              p => p.severity === "error" && !p.resolved
            ) || undefined
          }
        >
          <summary>
            Errori e avvisi (
            {validation.draft.problems.filter(p => !p.resolved).length})
          </summary>
          <ul className="list-disc pl-5">
            {validation.draft.problems
              .filter(p => !p.resolved)
              .map((p, i) => (
                <li
                  key={`${p.id}:${i}`}
                  className={
                    p.severity === "error" ? "text-red-800" : "text-amber-800"
                  }
                >
                  {p.code}: {p.message}
                </li>
              ))}
          </ul>
        </details>
      )}
      {step === 5 && preview && draft && product && (
        <section className="space-y-3">
          <h2 className="font-semibold">Anteprima calcolata da DDCost</h2>
          <p>
            {preview.model.codice} · {preview.model.descrizione} · lotto{" "}
            {preview.model.lotto}
          </p>
          <table className="w-full text-sm">
            <tbody>
              {[
                [
                  "Storico originale: combinazione storica, senza setup",
                  comparison?.historicalOriginal,
                ],
                [
                  "Storico delle voci scelte: quantità/tariffe originali, senza setup",
                  comparison?.historicalCurrentRows,
                ],
                [
                  "DDCost delle voci scelte, senza setup",
                  comparison?.pwaWithoutSetup,
                ],
                [
                  "Scostamento sulle stesse voci, senza setup",
                  comparison?.likeForLikeDifference,
                ],
                [
                  "Incidenza setup DDCost sul lotto scelto",
                  comparison?.pwaSetup,
                ],
                [
                  comparison?.setupMissing
                    ? "DDCost costo noto (setup mancante)"
                    : "DDCost totale con setup",
                  comparison?.pwaWithSetup,
                ],
              ].map(([label, value]) => (
                <tr key={String(label)} className="border-b">
                  <th className="text-left py-2">{label}</th>
                  <td>{value ?? "non disponibile"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">
            Lo scostamento sulle stesse voci mostra l’effetto delle quantità,
            dei pesi e delle tariffe scelti. Le finiture alternative e il setup
            sono esposti separatamente; lo storico originale resta invariato.
          </p>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Riga</th>
                  <th>Voce</th>
                  <th>Tipo</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {product.rows.map(r => (
                  <tr key={r.key} className="border-t">
                    <td>{r.excelRow}</td>
                    <td>{r.row.descrizione}</td>
                    <td>{r.kind}</td>
                    <td>{r.included ? "Inclusa" : "Finitura non scelta"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className={primary}
            onClick={() => {
              setReviewed(false);
              setStep(6);
            }}
          >
            Conferma anteprima
          </button>
        </section>
      )}
      {step === 6 && preview && (
        <section className="space-y-3">
          <p>
            La copia apre un nuovo ciclo non salvato. Il salvataggio definitivo
            è un comando separato nell’editor; la bozza già presente viene
            protetta.
          </p>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={e => setReviewed(e.target.checked)}
            />
            Confermo prodotto, righe, finiture e politica economica
            dell’anteprima.
          </label>
          {setup?.status === "missing" && (
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={missingSetupAccepted}
                onChange={e => setMissingSetupAccepted(e.target.checked)}
              />
              Il setup non è disponibile: proseguo con costo senza setup,
              mantenendo il dato come mancante.
            </label>
          )}
          <button
            className={primary}
            disabled={
              !reviewed ||
              (setup?.status === "missing" && !missingSetupAccepted) ||
              sourceStatus?.idempotencyReady !== true
            }
            onClick={copy}
          >
            Copia nel nuovo ciclo
          </button>
        </section>
      )}
      {step === 0 && <ImportRestorePanel />}
    </main>
  );
}
