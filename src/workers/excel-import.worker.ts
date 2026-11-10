/// <reference lib="webworker" />
import { readWorkbookEvidence } from "../lib/excel-workbook-reader";

import { extractCycleWorkbook } from "../lib/excel-cycle-extractor";
type Request = { id: string; file: File; mode?: "workbook" | "f3" };
type Response =
  | {
      id: string;
      ok: true;
      workbook: Awaited<ReturnType<typeof readWorkbookEvidence>>;
    }
  | { id: string; ok: false; error: string };
self.addEventListener("message", async (event: MessageEvent<Request>) => {
  const { id, file, mode } = event.data;
  try {
    const workbook = await readWorkbookEvidence(file);
    if (mode === "f3")
      self.postMessage({ id, ok: true, draft: extractCycleWorkbook(workbook) });
    else self.postMessage({ id, ok: true, workbook } satisfies Response);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Workbook non leggibile",
    } satisfies Response);
  }
});
