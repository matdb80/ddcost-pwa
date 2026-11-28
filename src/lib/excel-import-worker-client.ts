import type { ImportDraft, WorkbookEvidence } from "../types/excel-import";
const TIMEOUT_MS = 25_000;
function parseInWorker<T>(
  file: File,
  signal: AbortSignal | undefined,
  mode: "workbook" | "f3"
): Promise<T> {
  if (signal?.aborted)
    return Promise.reject(
      new DOMException("Importazione annullata", "AbortError")
    );
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/excel-import.worker.ts", import.meta.url),
      { type: "module" }
    );
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (callback: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.removeEventListener("message", message);
      worker.removeEventListener("error", error);
      worker.removeEventListener("messageerror", error);
      worker.terminate();
      callback();
    };
    const abort = () =>
      finish(() =>
        reject(new DOMException("Importazione annullata", "AbortError"))
      );
    const error = () =>
      finish(() => reject(new Error("Errore del parser Excel isolato")));
    let id: string;
    const message = (event: MessageEvent) => {
      if (event.data?.id !== id) return;
      finish(() =>
        event.data.ok === true
          ? resolve(mode === "f3" ? event.data.draft : event.data.workbook)
          : reject(
              new Error(
                typeof event.data.error === "string"
                  ? event.data.error
                  : "Risposta del parser non valida"
              )
            )
      );
    };
    try {
      id = crypto.randomUUID();
      signal?.addEventListener("abort", abort, { once: true });
      worker.addEventListener("message", message);
      worker.addEventListener("error", error);
      worker.addEventListener("messageerror", error);
      timer = setTimeout(
        () =>
          finish(() =>
            reject(new Error("Tempo massimo di lettura Excel superato"))
          ),
        TIMEOUT_MS
      );
      if (signal?.aborted) {
        abort();
        return;
      }
      worker.postMessage({ id, file, mode });
    } catch (cause) {
      finish(() => reject(cause));
    }
  });
}

export const parseExcelInWorker = (file: File, signal?: AbortSignal) =>
  parseInWorker<WorkbookEvidence>(file, signal, "workbook");
export const parseF3InWorker = (file: File, signal?: AbortSignal) =>
  parseInWorker<ImportDraft>(file, signal, "f3");
