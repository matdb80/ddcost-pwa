import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
export function ImportRestorePanel() {
  const { data: user } = trpc.auth.me.useQuery();
  const restore = trpc.cycleImportRestore.restoreTemplates.useMutation();
  const [backup, setBackup] = useState<unknown>(),
    [filename, setFilename] = useState(""),
    [mode, setMode] = useState<"merge" | "replace">("merge"),
    [includeReceipts, setIncludeReceipts] = useState(true),
    [message, setMessage] = useState(""),
    [plan, setPlan] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  if (user?.role !== "admin") return null;
  async function load(file?: File) {
    if (!file) return;
    setPlan("");
    setBackup(undefined);
    setConfirmation("");
    try {
      if (file.size > 50 * 1024 * 1024) throw Error("Backup oltre 50 MiB");
      setBackup(JSON.parse(await file.text()));
      setFilename(file.name);
      setMessage("Backup caricato: verificare prima di ripristinare.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Backup non leggibile");
    }
  }
  async function submit(dryRun: boolean) {
    if (!backup || lock.current) return;
    if (!dryRun && (!plan || confirmation !== "RIPRISTINA TEMPLATE")) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await restore.mutateAsync({
        backup,
        mode,
        includeReceipts,
        dryRun,
      });
      if (dryRun) {
        if (result.skipped) {
          setMessage(
            "Il backup non contiene le tabelle opzionali selezionate: nessun dato da ripristinare."
          );
          setPlan("");
        } else if ("preview" in result && result.preview) {
          const p = result.preview;
          setPlan(
            `${p.templatesToInsert} template da inserire, ${p.templatesToDelete} da sostituire, ${p.receiptsToInsert} ricevute da aggiungere.`
          );
          setMessage("Verifica completata senza modificare i dati.");
        }
      } else {
        setPlan("");
        setConfirmation("");
        setMessage(
          `Ripristino completato: ${result.restored} template, ${result.receiptsRestored} ricevute.`
        );
      }
    } catch (e) {
      setPlan("");
      setMessage(e instanceof Error ? e.message : "Ripristino non riuscito");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="border rounded p-3">
      <summary className="font-semibold cursor-pointer">
        Amministrazione: backup e ripristino template
      </summary>
      <div className="space-y-3 mt-3">
        <p>
          Il ripristino riguarda template e ricevute. Utenti e cicli
          referenziati devono già essere presenti. Le tabelle opzionali assenti
          dal backup restano intatte.
        </p>
        <a href="/api/backup/download" className="underline">
          Scarica backup completo
        </a>
        <input
          aria-label="Backup JSON"
          type="file"
          accept=".json"
          disabled={busy}
          onChange={e => void load(e.target.files?.[0])}
        />
        {filename && <p>{filename}</p>}
        <label className="block">
          Modalità
          <select
            className="ml-2 border p-2"
            value={mode}
            disabled={busy}
            onChange={e => {
              setMode(e.target.value as "merge" | "replace");
              setPlan("");
              setConfirmation("");
            }}
          >
            <option value="merge">Unisci senza sovrascrivere</option>
            <option value="replace">Sostituisci i template condivisi</option>
          </select>
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={includeReceipts}
            disabled={busy}
            onChange={e => {
              setIncludeReceipts(e.target.checked);
              setPlan("");
              setConfirmation("");
            }}
          />
          Includi ricevute di creazione (sempre aggiuntive)
        </label>
        <button
          className="border rounded p-2"
          disabled={busy || !backup}
          onClick={() => void submit(true)}
        >
          Verifica backup
        </button>
        {message && <p role="status">{message}</p>}
        {plan && (
          <div className="rounded border border-amber-500 p-3 space-y-2">
            <p>{plan}</p>
            <label>
              Conferma scrivendo RIPRISTINA TEMPLATE
              <input
                className="block border p-2 w-full"
                value={confirmation}
                onChange={e => setConfirmation(e.target.value)}
              />
            </label>
            <button
              className="border rounded p-2 bg-amber-100"
              disabled={busy || confirmation !== "RIPRISTINA TEMPLATE"}
              onClick={() => void submit(false)}
            >
              Ripristina
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
