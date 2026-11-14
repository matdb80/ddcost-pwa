import { useEffect, useState } from "react";
import { useBlocker } from "react-router";
import Layout from "@/components/Layout";
import { AlertCircle, CheckCircle2, FileUp, ShieldCheck } from "lucide-react";

type Preview = {
  ok: boolean;
  dryRun: boolean;
  expectedCounts: Record<string, number>;
  sourceFilesVerified: number;
  originalSQLiteArchiveVerified: boolean;
};
type ImportResult = {
  ok: boolean;
  imported: boolean;
  counts: Record<string, number>;
};
const LABELS: Record<string, string> = {
  cycles: "Cicli standard",
  quotes: "Preventivi",
  cycle_simulations: "Simulazioni",
  commercial_offers: "Offerte commerciali",
};

export default function ImportaStorico() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const hasUnsavedInput=!done&&(Boolean(file)||Boolean(preview)||working);
  const blocker=useBlocker(({currentLocation,nextLocation})=>
    hasUnsavedInput && (currentLocation.pathname!==nextLocation.pathname || currentLocation.search!==nextLocation.search)
  );
  useEffect(()=>{
    if(!hasUnsavedInput)return;
    const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",handler);
    return()=>window.removeEventListener("beforeunload",handler);
  },[hasUnsavedInput]);

  async function submit(stage: "preview" | "commit") {
    if (!file || working) return;
    if (stage === "commit" && !window.confirm(
      "Confermi l'importazione permanente di tutti i 248 record storici in TiDB? " +
      "Verrà conservata anche una copia ZIP degli archivi originali."
    )) return;

    setError("");
    setWorking(true);
    try {
      const response = await fetch("/api/legacy-import/" + stage, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: file,
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || ("Errore HTTP " + response.status));
      }
      if (stage === "preview") {
        setPreview(result as Preview);
      } else {
        setDone(result as ImportResult);
        setPreview(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Layout>
      {blocker.state==="blocked" && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="import-leave-title" className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-2xl">
          <h2 id="import-leave-title" className="text-lg font-semibold text-slate-900">Vuoi uscire dall’importazione?</h2>
          <p className="text-sm text-slate-700">Il file selezionato e l’esito della verifica sono temporanei. {working?"L’operazione è in corso: resta qui per verificarne l’esito.":"Puoi restare oppure uscire e selezionare di nuovo il file."}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={working} onClick={()=>blocker.proceed()} className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 disabled:opacity-50">Esci senza salvare</button>
            <button type="button" onClick={()=>blocker.reset()} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Continua qui</button>
          </div>
        </div>
      </div>}
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Importa storico DDCost</h1>
          <p className="text-slate-600 mt-2">
            Importazione una tantum degli archivi SQLite originali. I dati rimangono
            sul tuo computer finché non selezioni il file e ne autorizzi il trasferimento.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-2 text-slate-700 font-medium">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            Controllo preliminare senza scritture
          </div>
          <p className="text-sm text-slate-600">
            Seleziona il file <strong>DDCost_migrazione_248.json</strong>.
            L'app controllerà SHA-256, 248 record, sei file sorgente e che le tabelle
            di destinazione siano ancora vuote. Nessuna informazione aziendale viene
            salvata su GitHub.
          </p>
          <input
            type="file"
            accept=".json,application/json"
            className="w-full border rounded-lg p-3 text-sm"
            disabled={working || Boolean(done)}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setDone(null);
              setError("");
            }}
          />
          <button
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg disabled:opacity-50"
            disabled={!file || working || Boolean(done)}
            onClick={() => submit("preview")}
          >
            <FileUp className="w-4 h-4" />
            {working ? "Controllo in corso..." : "Verifica archivio (senza importare)"}
          </button>

          {preview && (
            <div className="border border-emerald-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                Verifica superata: archivio pronto per l'importazione
              </div>
              <table className="text-sm w-full">
                <tbody>
                  {Object.entries(preview.expectedCounts).map(([name, count]) => (
                    <tr key={name} className="border-b last:border-0">
                      <td className="py-2">{LABELS[name] ?? name}</td>
                      <td className="py-2 text-right font-semibold">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-600">
                Il sistema conserverà la copia integrale degli SQLite originali e
                aumenterà la precisione degli importi a 18 decimali.
              </p>
              <button
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-lg disabled:opacity-50"
                disabled={working}
                onClick={() => submit("commit")}
              >
                {working ? "Importazione in corso..." : "Importa definitivamente i 248 record"}
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-4 bg-red-50 text-red-800 rounded-lg" role="alert">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}. Non ripetere l'operazione senza verificarne l'esito.</span>
            </div>
          )}
          {done && (
            <div className="rounded-xl border border-emerald-300 p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-6 h-6" />
                Importazione confermata e verificata!
              </div>
              <p>248 record importati, con controlli su ID, conteggi e JSON originali.</p>
              <p className="text-sm text-slate-600">
                Adesso scarica un nuovo file dalla voce <strong>Esporta backup</strong>
                nel menu laterale e verifica le liste dei cicli e preventivi.
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
